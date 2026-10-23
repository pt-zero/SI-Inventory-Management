using AutoMapper;
using DotNetEnv;
using FirebaseAdmin;
using FirebaseAdmin.Auth;
using Google.Apis.Auth.OAuth2;
using Inventory.Api;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using System.Net.Mail;

var dotenvDirectory = new DirectoryInfo(Directory.GetCurrentDirectory());
while (dotenvDirectory is not null && !File.Exists(Path.Combine(dotenvDirectory.FullName, ".env")))
{
    dotenvDirectory = dotenvDirectory.Parent;
}
if (dotenvDirectory is not null)
{
    Env.Load(Path.Combine(dotenvDirectory.FullName, ".env"), new LoadOptions(clobberExistingVars: false));
}

var builder = WebApplication.CreateBuilder(args);
var port = builder.Configuration["PORT"] ?? "3001";
builder.WebHost.UseUrls(builder.Configuration["ASPNETCORE_URLS"] ?? $"http://0.0.0.0:{port}");
var projectId = builder.Configuration["FIREBASE_PROJECT_ID"];
if (string.IsNullOrWhiteSpace(projectId))
{
    throw new InvalidOperationException("FIREBASE_PROJECT_ID must be configured to verify Firebase Authentication tokens.");
}

var connectionString = builder.Configuration["AZURE_SQL_CONNECTION_STRING"];
if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException("AZURE_SQL_CONNECTION_STRING must be configured to connect to Azure SQL.");
}

builder.Services.AddAutoMapper(configuration =>
{
    var licenseKey = builder.Configuration["AUTOMAPPER_LICENSE_KEY"];
    if (!string.IsNullOrWhiteSpace(licenseKey))
    {
        configuration.LicenseKey = licenseKey;
    }
}, typeof(InventoryMappingProfile));
builder.Services.AddDbContext<InventoryDbContext>(options =>
    options.UseSqlServer(connectionString, sqlServerOptions => sqlServerOptions.EnableRetryOnFailure()));
builder.Services.AddScoped<InventoryDatabase>();
builder.Services.AddSingleton(_ =>
{
    var firebaseApp = FirebaseApp.Create(new AppOptions
    {
        Credential = GoogleCredential.GetApplicationDefault(),
        ProjectId = projectId,
    }, "inventory-api");
    return FirebaseAuth.GetAuth(firebaseApp);
});
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

var app = builder.Build();
app.Services.GetRequiredService<AutoMapper.IConfigurationProvider>().AssertConfigurationIsValid();
await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
    await db.Database.MigrateAsync();
    await SeedDatabase(db);
}

app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (Exception exception)
    {
        var badRequest = exception as BadHttpRequestException;
        if (badRequest is null)
        {
            app.Logger.LogError(exception, "Unhandled API error.");
        }
        else
        {
            app.Logger.LogInformation("Invalid request body: {Message}", badRequest.Message);
        }

        if (!context.Response.HasStarted)
        {
            context.Response.StatusCode = badRequest?.StatusCode ?? StatusCodes.Status500InternalServerError;
            var message = badRequest is null ? "An unexpected server error occurred." : "Invalid request body.";
            await context.Response.WriteAsJsonAsync(new { message });
        }
    }
});

app.UseCors();
app.UseMiddleware<FirebaseAuthenticationMiddleware>();

app.MapGet("/api/health", async (InventoryDbContext db, CancellationToken cancellationToken) =>
{
    var canConnect = await db.Database.CanConnectAsync(cancellationToken);
    return canConnect
        ? Results.Ok(new { ok = true, timestamp = DateTimeOffset.UtcNow })
        : Results.Json(new { ok = false, timestamp = DateTimeOffset.UtcNow }, statusCode: StatusCodes.Status503ServiceUnavailable);
});
var api = app.MapGroup("/api").WithMetadata(new FirebaseAuthRequiredMetadata());

api.MapGet("/me", (HttpContext context) =>
{
    var user = CurrentUser(context);
    return Results.Ok(new { user });
});

api.MapGet("/dashboard", (HttpContext context, InventoryDatabase database) =>
{
    var user = CurrentUser(context);
    var inventory = database.GetInventory(user.Role == "vendor" ? user.VendorId : null);
    var vendorCounts = user.Role == "admin"
        ? database.GetVendorStatusCounts()
        : (Active: 0, Paused: 0);
    var summary = new
    {
        totalItems = inventory.Count,
        lowStock = inventory.Count(item => string.Equals(item.Status, "Low Stock", StringComparison.OrdinalIgnoreCase)),
        inTransit = inventory.Count(item => string.Equals(item.ShipmentStatus, "In Transit", StringComparison.Ordinal)),
        activeVendors = vendorCounts.Active,
        pausedVendors = vendorCounts.Paused,
    };
    return Results.Ok(new { summary, inventory });
});

api.MapGet("/vendors", (HttpContext context, InventoryDatabase database) =>
{
    var user = CurrentUser(context);
    return Results.Ok(database.GetVendors(user.Role == "vendor" ? user.VendorId : null));
});

api.MapPost("/vendors", async (
    HttpContext context,
    VendorInput input,
    InventoryDatabase database,
    FirebaseAuth firebaseAuth,
    ILogger<Program> logger,
    CancellationToken cancellationToken) =>
{
    cancellationToken.ThrowIfCancellationRequested();
    if (!IsAdmin(context))
    {
        return Results.Json(new { message = "You do not have access to this resource." }, statusCode: StatusCodes.Status403Forbidden);
    }
    var email = input.Email?.Trim().ToLowerInvariant();
    var status = input.Status?.Trim().ToLowerInvariant() ?? "active";
    if (string.IsNullOrWhiteSpace(input.Name)
        || string.IsNullOrWhiteSpace(input.ContactName)
        || string.IsNullOrWhiteSpace(email)
        || string.IsNullOrWhiteSpace(input.Password))
    {
        return Results.BadRequest(new { message = "Vendor details, email, and an initial password are required." });
    }
    if (input.Name.Trim().Length > 200
        || input.ContactName.Trim().Length > 200
        || email.Length > 320)
    {
        return Results.BadRequest(new { message = "Vendor name and contact name must be 200 characters or fewer, and email must be 320 characters or fewer." });
    }
    if (!IsValidEmail(email))
    {
        return Results.BadRequest(new { message = "Enter a valid vendor email address." });
    }
    if (input.Password.Length < 6 || input.Password.Length > 128)
    {
        return Results.BadRequest(new { message = "The initial password must be between 6 and 128 characters." });
    }
    if (status is not ("active" or "paused"))
    {
        return Results.BadRequest(new { message = "Vendor status must be active or paused." });
    }

    UserRecord firebaseUser;
    try
    {
        firebaseUser = await firebaseAuth.CreateUserAsync(new UserRecordArgs
        {
            Email = email,
            Password = input.Password,
            DisplayName = input.ContactName.Trim(),
            Disabled = status == "paused",
        }, cancellationToken);
    }
    catch (FirebaseAuthException exception) when (exception.AuthErrorCode == AuthErrorCode.EmailAlreadyExists)
    {
        return Results.Conflict(new { message = "A Firebase account already exists for this email address." });
    }
    catch (FirebaseAuthException exception)
    {
        logger.LogError(exception, "Unable to create Firebase account for vendor email {Email}.", email);
        return Results.Problem(
            title: "Unable to create vendor account.",
            detail: $"Firebase Authentication rejected account creation (code: {exception.AuthErrorCode}). Verify that Email/Password sign-in is enabled, the API service account has Firebase Authentication Admin permissions, the Firebase project IDs match, and the password meets the project's policy.",
            statusCode: StatusCodes.Status502BadGateway);
    }
    catch (Exception exception)
    {
        logger.LogError(exception, "Firebase account creation failed for vendor email {Email}.", email);
        return Results.Problem(
            title: "Unable to create vendor account.",
            detail: "The API could not provision the Firebase account. Verify its Application Default Credentials, Firebase project ID, and service-account permissions; check the API logs for details.",
            statusCode: StatusCodes.Status502BadGateway);
    }

    try
    {
        var id = database.AddVendor(
            input.Name.Trim(),
            input.ContactName.Trim(),
            email,
            status,
            firebaseUser.Uid);
        return Results.Created($"/api/vendors/{id}", new { id, message = "Vendor and Firebase account created." });
    }
    catch (DbUpdateException exception) when (IsUniqueConstraint(exception))
    {
        try
        {
            await firebaseAuth.DeleteUserAsync(firebaseUser.Uid, CancellationToken.None);
        }
        catch (Exception cleanupException)
        {
            logger.LogError(cleanupException, "Unable to remove orphaned Firebase account {FirebaseUid} after vendor creation failed.", firebaseUser.Uid);
            return Results.Problem(
                title: "Vendor creation failed.",
                detail: "The email is already registered in the inventory system. Firebase account cleanup also failed; contact an administrator.",
                statusCode: StatusCodes.Status500InternalServerError);
        }

        return Results.Conflict(new { message = "A vendor or user account already exists for this email address." });
    }
    catch (Exception exception)
    {
        logger.LogError(exception, "Unable to save vendor account for email {Email}.", email);
        var firebaseCleanupFailed = false;
        try
        {
            await firebaseAuth.DeleteUserAsync(firebaseUser.Uid, CancellationToken.None);
        }
        catch (Exception cleanupException)
        {
            firebaseCleanupFailed = true;
            logger.LogError(cleanupException, "Unable to remove orphaned Firebase account {FirebaseUid} after vendor creation failed.", firebaseUser.Uid);
        }

        return Results.Problem(
            title: "Vendor creation failed.",
            detail: firebaseCleanupFailed
                ? "The vendor could not be saved and its Firebase account could not be removed. Contact an administrator."
                : "The Firebase account was created but removed because the vendor could not be saved. Check the API logs for the database error.",
            statusCode: StatusCodes.Status500InternalServerError);
    }
}).Accepts<VendorInput>("application/json");

api.MapGet("/vendors/{id:long}", (
    long id,
    HttpContext context,
    InventoryDatabase database,
    CancellationToken cancellationToken) =>
{
    cancellationToken.ThrowIfCancellationRequested();
    var user = CurrentUser(context);
    if (user.Role == "vendor" && user.VendorId != id)
    {
        return Results.NotFound(new { message = "Vendor not found." });
    }

    var vendor = database.GetVendor(id);
    return vendor is null ? Results.NotFound(new { message = "Vendor not found." }) : Results.Ok(vendor);
});

api.MapPut("/vendors/{id:long}/contact", async (
    long id,
    HttpContext context,
    VendorContactInput input,
    InventoryDatabase database,
    FirebaseAuth firebaseAuth,
    ILogger<Program> logger,
    CancellationToken cancellationToken) =>
{
    if (!IsAdmin(context))
    {
        return Results.Json(new { message = "You do not have access to this resource." }, statusCode: StatusCodes.Status403Forbidden);
    }

    var contactName = input.ContactName?.Trim();
    var email = input.Email?.Trim().ToLowerInvariant();
    if (string.IsNullOrWhiteSpace(contactName) || string.IsNullOrWhiteSpace(email))
    {
        return Results.BadRequest(new { message = "Contact name and email are required." });
    }
    if (contactName.Length > 200 || email.Length > 320)
    {
        return Results.BadRequest(new { message = "Contact name must be 200 characters or fewer and email must be 320 characters or fewer." });
    }
    if (!IsValidEmail(email))
    {
        return Results.BadRequest(new { message = "Enter a valid contact email address." });
    }
    if (!string.IsNullOrEmpty(input.Password) && (input.Password.Length < 6 || input.Password.Length > 128))
    {
        return Results.BadRequest(new { message = "The password must be between 6 and 128 characters." });
    }

    var current = database.GetVendorContactState(id);
    if (current is null) return Results.NotFound(new { message = "Vendor not found." });
    if (current.UserId is not { } userId || current.FirebaseUid is not { } firebaseUid)
    {
        return Results.Conflict(new
        {
            message = "This vendor has no linked Firebase login account, so its contact email cannot be changed.",
        });
    }
    if (database.IsVendorContactEmailInUse(id, userId, email))
    {
        return Results.Conflict(new { message = "That email address is already assigned to another vendor or user." });
    }

    try
    {
        await firebaseAuth.UpdateUserAsync(new UserRecordArgs
        {
            Uid = firebaseUid,
            Email = email,
            DisplayName = contactName,
        }, cancellationToken);
    }
    catch (FirebaseAuthException exception) when (exception.AuthErrorCode == AuthErrorCode.EmailAlreadyExists)
    {
        return Results.Conflict(new { message = "A Firebase account already exists for that email address." });
    }
    catch (Exception exception)
    {
        logger.LogError(exception, "Unable to update Firebase contact details for vendor {VendorId}.", id);
        return Results.Problem(
            title: "Unable to update vendor contact.",
            detail: "Firebase could not update the vendor login email or display name. No vendor contact details were changed.",
            statusCode: StatusCodes.Status502BadGateway);
    }

    try
    {
        database.UpdateVendorContact(id, userId, contactName, email);
    }
    catch (DbUpdateException exception) when (IsUniqueConstraint(exception))
    {
        logger.LogInformation(exception, "Vendor {VendorId} contact update conflicted with a duplicate email.", id);
        var restored = await RestoreFirebaseVendorContactAsync(
            firebaseAuth, firebaseUid, current.Email, current.ContactName, logger, id);
        return restored
            ? Results.Conflict(new { message = "That email address is already assigned to another vendor or user." })
            : Results.Problem(
                title: "Vendor contact update failed.",
                detail: "The email was not saved because it is already in use, and Firebase could not be restored to its previous email. Contact an administrator.",
                statusCode: StatusCodes.Status500InternalServerError);
    }
    catch (Exception exception)
    {
        logger.LogError(exception, "Unable to save contact details for vendor {VendorId}.", id);
        var restored = await RestoreFirebaseVendorContactAsync(
            firebaseAuth, firebaseUid, current.Email, current.ContactName, logger, id);
        return Results.Problem(
            title: "Vendor contact update failed.",
            detail: restored
                ? "The database could not save the updated contact details. Firebase was restored to the previous login email."
                : "The database could not save the updated contact details, and Firebase could not be restored. Contact an administrator.",
            statusCode: StatusCodes.Status500InternalServerError);
    }

    if (!string.IsNullOrEmpty(input.Password))
    {
        try
        {
            await firebaseAuth.UpdateUserAsync(new UserRecordArgs
            {
                Uid = firebaseUid,
                Password = input.Password,
            }, cancellationToken);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Unable to update Firebase password for vendor {VendorId}.", id);
            try
            {
                database.UpdateVendorContact(id, userId, current.ContactName, current.Email);
            }
            catch (Exception rollbackException)
            {
                logger.LogError(rollbackException, "Unable to restore database contact details for vendor {VendorId} after password update failed.", id);
                return Results.Problem(
                    title: "Vendor password update failed.",
                    detail: "Firebase rejected or could not confirm the password update, and the previous contact details could not be restored in the database. Contact an administrator.",
                    statusCode: StatusCodes.Status500InternalServerError);
            }

            var firebaseRestored = await RestoreFirebaseVendorContactAsync(
                firebaseAuth, firebaseUid, current.Email, current.ContactName, logger, id);
            return Results.Problem(
                title: "Vendor password update failed.",
                detail: firebaseRestored
                    ? "The contact changes were rolled back because Firebase could not update the password. Retry the update; if Firebase reported a network error, verify the vendor’s password before retrying."
                    : "The contact changes were rolled back in the database, but Firebase could not be restored to the previous email and contact name. Contact an administrator.",
                statusCode: firebaseRestored ? StatusCodes.Status502BadGateway : StatusCodes.Status500InternalServerError);
        }
    }

    return Results.Ok(new
    {
        contact_name = contactName,
        email,
        password_updated = !string.IsNullOrEmpty(input.Password),
    });
}).Accepts<VendorContactInput>("application/json");

api.MapPut("/vendors/{id:long}/status", async (
    long id,
    HttpContext context,
    VendorStatusInput input,
    InventoryDatabase database,
    FirebaseAuth firebaseAuth,
    ILogger<Program> logger,
    CancellationToken cancellationToken) =>
{
    if (!IsAdmin(context))
    {
        return Results.Json(new { message = "You do not have access to this resource." }, statusCode: StatusCodes.Status403Forbidden);
    }

    var status = input.Status?.Trim().ToLowerInvariant();
    if (status is not ("active" or "paused"))
    {
        return Results.BadRequest(new { message = "Vendor status must be active or paused." });
    }

    var current = database.GetVendorStatusAndFirebaseUid(id);
    if (current is null) return Results.NotFound(new { message = "Vendor not found." });

    var shouldDisable = status == "paused";
    if (current.Value.FirebaseUid is { } firebaseUid)
    {
        try
        {
            await firebaseAuth.UpdateUserAsync(new UserRecordArgs
            {
                Uid = firebaseUid,
                Disabled = shouldDisable,
            }, cancellationToken);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Unable to update Firebase access for vendor {VendorId}.", id);
            return Results.Problem(
                title: "Unable to update vendor access.",
                detail: "The vendor status was not changed because Firebase account access could not be updated.",
                statusCode: StatusCodes.Status502BadGateway);
        }
    }

    try
    {
        database.UpdateVendorStatus(id, status);
        return Results.Ok(new { message = "Vendor status updated.", status });
    }
    catch (Exception exception)
    {
        logger.LogError(exception, "Unable to update status for vendor {VendorId}.", id);
        if (current.Value.FirebaseUid is { } rollbackFirebaseUid)
        {
            try
            {
                await firebaseAuth.UpdateUserAsync(new UserRecordArgs
                {
                    Uid = rollbackFirebaseUid,
                    Disabled = !string.Equals(current.Value.Status, "active", StringComparison.OrdinalIgnoreCase),
                }, CancellationToken.None);
            }
            catch (Exception rollbackException)
            {
                logger.LogError(rollbackException, "Unable to restore Firebase access for vendor {VendorId} after status update failed.", id);
                return Results.Problem(
                    title: "Vendor status update failed.",
                    detail: "The database update failed and Firebase access could not be restored. Contact an administrator.",
                    statusCode: StatusCodes.Status500InternalServerError);
            }
        }

        return Results.Problem(title: "Vendor status update failed.", statusCode: StatusCodes.Status500InternalServerError);
    }
});

api.MapDelete("/vendors/{id:long}", async (
    long id,
    HttpContext context,
    InventoryDatabase database,
    FirebaseAuth firebaseAuth,
    ILogger<Program> logger,
    CancellationToken cancellationToken) =>
{
    cancellationToken.ThrowIfCancellationRequested();
    if (!IsAdmin(context))
    {
        return Results.Json(new { message = "You do not have access to this resource." }, statusCode: StatusCodes.Status403Forbidden);
    }

    var deletion = database.DeleteVendor(id);
    if (!deletion.Found) return Results.NotFound(new { message = "Vendor not found." });
    if (deletion.HasInventory)
    {
        return Results.Conflict(new { message = "Reassign or remove this vendor's inventory before deleting the vendor." });
    }

    var failedAccountCleanup = false;
    foreach (var firebaseUid in deletion.FirebaseUids)
    {
        try
        {
            await firebaseAuth.DeleteUserAsync(firebaseUid, CancellationToken.None);
        }
        catch (FirebaseAuthException exception) when (exception.AuthErrorCode == AuthErrorCode.UserNotFound)
        {
        }
        catch (Exception exception)
        {
            failedAccountCleanup = true;
            logger.LogError(exception, "Vendor {VendorId} was deleted but Firebase account {FirebaseUid} could not be removed.", id, firebaseUid);
        }
    }

    return failedAccountCleanup
        ? Results.Ok(new
        {
            message = "Vendor deleted, but one or more Firebase accounts could not be removed. Contact an administrator.",
            cleanupWarning = true,
        })
        : Results.NoContent();
});

api.MapGet("/locations", (InventoryDatabase database) => Results.Ok(database.GetLocations()));

api.MapPost("/locations", (HttpContext context, LocationInput input, InventoryDatabase database) =>
{
    if (!IsAdmin(context))
    {
        return Results.Json(new { message = "You do not have access to this resource." }, statusCode: StatusCodes.Status403Forbidden);
    }
    if (string.IsNullOrWhiteSpace(input.Name) || string.IsNullOrWhiteSpace(input.Code))
    {
        return Results.BadRequest(new { message = "Location name and code are required." });
    }
    var name = input.Name.Trim();
    var code = input.Code.Trim();
    var type = string.IsNullOrWhiteSpace(input.Type) ? "Warehouse" : input.Type.Trim();
    if (name.Length > 200 || code.Length > 80 || string.IsNullOrWhiteSpace(type) || type.Length > 80)
    {
        return Results.BadRequest(new { message = "Location name must be 200 characters or fewer; code and type must be 80 characters or fewer." });
    }

    try
    {
        var id = database.AddLocation(name, code, type);
        return Results.Json(new { id, message = "Location created." }, statusCode: StatusCodes.Status201Created);
    }
    catch (DbUpdateException exception) when (IsUniqueConstraint(exception))
    {
        return Results.Conflict(new { message = "Location code already exists." });
    }
}).Accepts<LocationInput>("application/json");

api.MapPut("/locations/{id:long}", (long id, HttpContext context, LocationInput input, InventoryDatabase database) =>
{
    if (!IsAdmin(context))
    {
        return Results.Json(new { message = "You do not have access to this resource." }, statusCode: StatusCodes.Status403Forbidden);
    }
    if (string.IsNullOrWhiteSpace(input.Name) || string.IsNullOrWhiteSpace(input.Code))
    {
        return Results.BadRequest(new { message = "Location name and code are required." });
    }

    var name = input.Name.Trim();
    var code = input.Code.Trim();
    var type = string.IsNullOrWhiteSpace(input.Type) ? "Warehouse" : input.Type.Trim();
    if (name.Length > 200 || code.Length > 80 || string.IsNullOrWhiteSpace(type) || type.Length > 80)
    {
        return Results.BadRequest(new { message = "Location name must be 200 characters or fewer; code and type must be 80 characters or fewer." });
    }

    try
    {
        return database.UpdateLocation(id, name, code, type)
            ? Results.Ok(new { id, message = "Location updated." })
            : Results.NotFound(new { message = "Location not found." });
    }
    catch (DbUpdateException exception) when (IsUniqueConstraint(exception))
    {
        return Results.Conflict(new { message = "Location code already exists." });
    }
}).Accepts<LocationInput>("application/json");

api.MapDelete("/locations/{id:long}", (long id, HttpContext context, InventoryDatabase database) =>
{
    if (!IsAdmin(context))
    {
        return Results.Json(new { message = "You do not have access to this resource." }, statusCode: StatusCodes.Status403Forbidden);
    }

    InventoryDatabase.LocationDeleteResult deletion;
    try
    {
        deletion = database.DeleteLocation(id);
    }
    catch (DbUpdateException exception) when (IsForeignKeyConstraint(exception))
    {
        return Results.Conflict(new { message = "Reassign or remove inventory assigned to this location before deleting it." });
    }

    if (!deletion.Found) return Results.NotFound(new { message = "Location not found." });
    if (deletion.HasInventory)
    {
        return Results.Conflict(new { message = "Reassign or remove inventory assigned to this location before deleting it." });
    }

    return Results.NoContent();
});

api.MapGet("/inventory", (HttpContext context, InventoryDatabase database) =>
{
    var user = CurrentUser(context);
    return Results.Ok(database.GetInventory(user.Role == "vendor" ? user.VendorId : null));
});

api.MapPost("/inventory", (HttpContext context, InventoryInput input, InventoryDatabase database) =>
{
    var user = CurrentUser(context);
    if (string.IsNullOrWhiteSpace(input.Sku)
        || string.IsNullOrWhiteSpace(input.Title)
        || string.IsNullOrWhiteSpace(input.Category)
        || input.Quantity is null or <= 0
        || string.IsNullOrWhiteSpace(input.IntakeDate))
    {
        return Results.BadRequest(new { message = "Required fields are missing." });
    }

    long? requestedVendorId;
    long? locationId;
    try
    {
        requestedVendorId = InventoryDatabase.ParseNullableLong(input.VendorId);
        locationId = InventoryDatabase.ParseNullableLong(input.LocationId);
    }
    catch (FormatException)
    {
        return Results.BadRequest(new { message = "Vendor and location IDs must be numeric." });
    }

    var vendorId = user.Role == "vendor" ? user.VendorId : requestedVendorId;
    if (vendorId is <= 0 || (user.Role == "vendor" && vendorId is null))
    {
        return Results.BadRequest(new { message = "A valid vendor assignment is required." });
    }

    try
    {
        var id = database.AddInventoryItem(input, vendorId, locationId);
        return Results.Json(new { id, message = "Record created successfully." }, statusCode: StatusCodes.Status201Created);
    }
    catch (DbUpdateException exception) when (IsUniqueConstraint(exception))
    {
        return Results.BadRequest(new { message = "This SKU already exists." });
    }
});

api.MapPut("/inventory/{id:long}", (long id, HttpContext context, InventoryInput input, InventoryDatabase database) =>
{
    var user = CurrentUser(context);
    var current = database.GetInventoryItem(id);
    if (current is null)
    {
        return Results.NotFound(new { message = "Inventory record not found." });
    }
    if (user.Role == "vendor" && current.VendorId != user.VendorId)
    {
        return Results.Json(new { message = "Vendor accounts can only edit assigned inventory." }, statusCode: StatusCodes.Status403Forbidden);
    }

    try
    {
        database.UpdateInventoryItem(id, input, user.Role == "vendor" ? user.VendorId : null);
        return Results.Ok(new { message = "Inventory record updated." });
    }
    catch (FormatException)
    {
        return Results.BadRequest(new { message = "Vendor and location IDs must be numeric." });
    }
    catch (DbUpdateException exception) when (IsUniqueConstraint(exception))
    {
        return Results.BadRequest(new { message = "Unable to update inventory record." });
    }
});

api.MapDelete("/inventory/{id:long}", (long id, HttpContext context, InventoryDatabase database) =>
{
    var user = CurrentUser(context);
    var current = database.GetInventoryItem(id);
    if (current is null)
    {
        return Results.NotFound(new { message = "Inventory record not found." });
    }
    if (user.Role == "vendor" && current.VendorId != user.VendorId)
    {
        return Results.Json(new { message = "Vendor accounts can only delete assigned inventory." }, statusCode: StatusCodes.Status403Forbidden);
    }

    database.DeleteInventoryItem(id);
    return Results.Ok(new { message = "Inventory record removed." });
});

var distPath = FindDirectory(app.Environment.ContentRootPath, "dist");
var indexPath = distPath is null ? null : Path.Combine(distPath, "index.html");
if (distPath is not null && File.Exists(indexPath))
{
    app.UseStaticFiles(new StaticFileOptions { FileProvider = new PhysicalFileProvider(distPath) });
    app.MapFallback(async context =>
    {
        if (context.Request.Path.StartsWithSegments("/api"))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }
        await context.Response.SendFileAsync(indexPath);
    });
}

app.Run();

static InventoryUserResponse CurrentUser(HttpContext context)
{
    return context.Items[FirebaseAuthenticationMiddleware.UserItemKey] as InventoryUserResponse
        ?? throw new InvalidOperationException("Authenticated inventory user is missing.");
}

static bool IsAdmin(HttpContext context) => CurrentUser(context).Role == "admin";

static bool IsValidEmail(string email)
{
    try
    {
        return string.Equals(new MailAddress(email).Address, email, StringComparison.OrdinalIgnoreCase);
    }
    catch (FormatException)
    {
        return false;
    }
}

static async Task<bool> RestoreFirebaseVendorContactAsync(
    FirebaseAuth firebaseAuth,
    string firebaseUid,
    string email,
    string displayName,
    ILogger<Program> logger,
    long vendorId)
{
    try
    {
        await firebaseAuth.UpdateUserAsync(new UserRecordArgs
        {
            Uid = firebaseUid,
            Email = email,
            DisplayName = displayName,
        }, CancellationToken.None);
        return true;
    }
    catch (Exception exception)
    {
        logger.LogError(exception, "Unable to restore Firebase contact details for vendor {VendorId}.", vendorId);
        return false;
    }
}

static bool IsUniqueConstraint(DbUpdateException exception) =>
    exception.InnerException is SqlException sqlException
    && sqlException.Number is 2601 or 2627;

static bool IsForeignKeyConstraint(DbUpdateException exception) =>
    exception.InnerException is SqlException sqlException
    && sqlException.Number == 547;

static string? FindDirectory(string startPath, string directoryName)
{
    var current = new DirectoryInfo(startPath);
    while (current is not null)
    {
        var candidate = Path.Combine(current.FullName, directoryName);
        if (Directory.Exists(candidate))
        {
            return candidate;
        }
        current = current.Parent;
    }
    return null;
}

static async Task SeedDatabase(InventoryDbContext db)
{
    if (!await db.Locations.AnyAsync())
    {
        db.Locations.AddRange(
            new Location { Name = "Dallas Distribution Hub", Code = "DAL-01", Type = "Warehouse" },
            new Location { Name = "Phoenix Sort Center", Code = "PHX-02", Type = "Carrier Hub" },
            new Location { Name = "Seattle Returns Dock", Code = "SEA-03", Type = "Returns" });
        await db.SaveChangesAsync();
    }

    if (!await db.Users.AnyAsync(user => user.Email == "admin@si.co"))
    {
        db.Users.Add(new UserAccount { Name = "Savage Admin", Email = "admin@si.co", Role = "admin" });
    }

    await db.SaveChangesAsync();

    if (!await db.Inventory.AnyAsync())
    {
        var location = await db.Locations.OrderBy(item => item.Id).FirstAsync();
        db.Inventory.AddRange(
            new InventoryItem
            {
                Sku = "SKU-1001", Title = "Rivet Gun Kit", Category = "Hardware", Quantity = 16,
                Status = "In Stock", LocationId = location.Id,
                IntakeDate = "2026-03-02", ShipmentStatus = "In Transit",
                Notes = "Assigned to engineering maintenance team.",
            },
            new InventoryItem
            {
                Sku = "SKU-1002", Title = "Industrial Sensor Array", Category = "Electronics", Quantity = 42,
                Status = "In Stock", LocationId = location.Id,
                IntakeDate = "2026-03-11", ShipmentStatus = "Received",
                Notes = "Replacement units for outbound assembly line.",
            },
            new InventoryItem
            {
                Sku = "SKU-1007", Title = "Safety Harness Set", Category = "Safety", Quantity = 8,
                Status = "Low Stock", LocationId = location.Id,
                IntakeDate = "2026-03-18", ShipmentStatus = "Pending",
                Notes = "Reserved for field technician onboarding.",
            },
            new InventoryItem
            {
                Sku = "SKU-1014", Title = "Forklift Battery Pack", Category = "Equipment", Quantity = 3,
                Status = "Low Stock", LocationId = location.Id,
                IntakeDate = "2026-04-02", ShipmentStatus = "In Transit",
                Notes = "Battery shipment scheduled for cross-dock transfer.",
            });
        await db.SaveChangesAsync();
    }
}
