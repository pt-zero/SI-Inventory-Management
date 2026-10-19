using DotNetEnv;
using FirebaseAdmin;
using FirebaseAdmin.Auth;
using Google.Apis.Auth.OAuth2;
using Inventory.Api;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.FileProviders;

var dotenvDirectory = new DirectoryInfo(Directory.GetCurrentDirectory());
while (dotenvDirectory is not null && !File.Exists(Path.Combine(dotenvDirectory.FullName, ".env")))
{
    dotenvDirectory = dotenvDirectory.Parent;
}
if (dotenvDirectory is not null)
{
    Env.Load(Path.Combine(dotenvDirectory.FullName, ".env"));
}

var builder = WebApplication.CreateBuilder(args);
var port = builder.Configuration["PORT"] ?? "3001";
builder.WebHost.UseUrls(builder.Configuration["ASPNETCORE_URLS"] ?? $"http://0.0.0.0:{port}");
var projectId = builder.Configuration["FIREBASE_PROJECT_ID"];
if (string.IsNullOrWhiteSpace(projectId))
{
    throw new InvalidOperationException("FIREBASE_PROJECT_ID must be configured to verify Firebase Authentication tokens.");
}

var databasePath = builder.Configuration["INVENTORY_DB_PATH"];
if (string.IsNullOrWhiteSpace(databasePath))
{
    var localDatabasePath = Path.Combine(builder.Environment.ContentRootPath, "server", "inventory.db");
    databasePath = Directory.Exists(Path.GetDirectoryName(localDatabasePath))
        ? localDatabasePath
        : Path.Combine(builder.Environment.ContentRootPath, "inventory.db");
}

var firebaseApp = FirebaseApp.Create(new AppOptions
{
    Credential = GoogleCredential.GetApplicationDefault(),
    ProjectId = projectId,
}, "inventory-api");

builder.Services.AddSingleton(FirebaseAuth.GetAuth(firebaseApp));
builder.Services.AddSingleton(new InventoryDatabase(databasePath));
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

var app = builder.Build();

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

app.MapGet("/api/health", () => Results.Ok(new { ok = true, timestamp = DateTimeOffset.UtcNow }));
var api = app.MapGroup("/api").WithMetadata(new FirebaseAuthRequiredMetadata());

api.MapGet("/me", (HttpContext context) =>
{
    var user = CurrentUser(context);
    return Results.Ok(new
    {
        user = new
        {
            id = user.Id,
            name = user.Name,
            email = user.Email,
            role = user.Role,
            vendor_id = user.VendorId,
            vendor_name = user.VendorName,
        },
    });
});

api.MapGet("/dashboard", (HttpContext context, InventoryDatabase database) =>
{
    var user = CurrentUser(context);
    var inventory = database.GetInventory(user.Role == "vendor" ? user.VendorId : null);
    var summary = new
    {
        totalItems = inventory.Count,
        lowStock = inventory.Count(item => Convert.ToInt32(item["quantity"]) <= 10),
        inTransit = inventory.Count(item => string.Equals(item["shipment_status"]?.ToString(), "In Transit", StringComparison.Ordinal)),
        activeVendors = inventory
            .Where(item => item["vendor_id"] is not null)
            .Select(item => Convert.ToInt64(item["vendor_id"]))
            .Distinct()
            .Count(),
    };
    return Results.Ok(new { summary, inventory });
});

api.MapGet("/vendors", (HttpContext context, InventoryDatabase database) =>
{
    var user = CurrentUser(context);
    return Results.Ok(database.GetVendors(user.Role == "vendor" ? user.VendorId : null));
});

api.MapPost("/vendors", (HttpContext context, VendorInput input, InventoryDatabase database) =>
{
    if (!IsAdmin(context))
    {
        return Results.Json(new { message = "You do not have access to this resource." }, statusCode: StatusCodes.Status403Forbidden);
    }
    if (string.IsNullOrWhiteSpace(input.Name) || string.IsNullOrWhiteSpace(input.ContactName) || string.IsNullOrWhiteSpace(input.Email))
    {
        return Results.BadRequest(new { message = "Vendor details are required." });
    }

    try
    {
        var id = database.AddVendor(input.Name, input.ContactName, input.Email, input.Status ?? "active");
        return Results.Json(new { id, message = "Vendor created." }, statusCode: StatusCodes.Status201Created);
    }
    catch (SqliteException)
    {
        return Results.BadRequest(new { message = "Vendor already exists or the email is invalid." });
    }
}).Accepts<VendorInput>("application/json");

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

    try
    {
        var id = database.AddLocation(input.Name, input.Code, input.Type ?? "Warehouse");
        return Results.Json(new { id, message = "Location created." }, statusCode: StatusCodes.Status201Created);
    }
    catch (SqliteException)
    {
        return Results.BadRequest(new { message = "Location code already exists." });
    }
}).Accepts<LocationInput>("application/json");

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
    if (vendorId is null or <= 0)
    {
        return Results.BadRequest(new { message = "Inventory must be assigned to a vendor." });
    }

    try
    {
        var id = database.AddInventoryItem(input, vendorId.Value, locationId);
        return Results.Json(new { id, message = "Record created successfully." }, statusCode: StatusCodes.Status201Created);
    }
    catch (SqliteException)
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
    if (user.Role == "vendor" && Convert.ToInt64(current["vendor_id"]) != user.VendorId)
    {
        return Results.Json(new { message = "Vendor accounts can only edit assigned inventory." }, statusCode: StatusCodes.Status403Forbidden);
    }

    try
    {
        database.UpdateInventoryItem(id, current, input, user.Role == "vendor" ? user.VendorId : null);
        return Results.Ok(new { message = "Inventory record updated." });
    }
    catch (FormatException)
    {
        return Results.BadRequest(new { message = "Vendor and location IDs must be numeric." });
    }
    catch (SqliteException)
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
    if (user.Role == "vendor" && Convert.ToInt64(current["vendor_id"]) != user.VendorId)
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

static InventoryUser CurrentUser(HttpContext context)
{
    return context.Items[FirebaseAuthenticationMiddleware.UserItemKey] as InventoryUser
        ?? throw new InvalidOperationException("Authenticated inventory user is missing.");
}

static bool IsAdmin(HttpContext context) => CurrentUser(context).Role == "admin";

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
