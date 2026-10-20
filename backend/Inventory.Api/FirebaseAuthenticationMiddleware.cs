using FirebaseAdmin.Auth;

namespace Inventory.Api;

public sealed class FirebaseAuthRequiredMetadata
{
}

public sealed class FirebaseAuthenticationMiddleware(
    RequestDelegate next,
    FirebaseAuth firebaseAuth,
    ILogger<FirebaseAuthenticationMiddleware> logger)
{
    public static readonly object UserItemKey = new();

    public async Task InvokeAsync(HttpContext context, InventoryDatabase database)
    {
        if (context.GetEndpoint()?.Metadata.GetMetadata<FirebaseAuthRequiredMetadata>() is null)
        {
            await next(context);
            return;
        }

        var authorization = context.Request.Headers.Authorization.ToString();
        if (!authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            await WriteError(context, StatusCodes.Status401Unauthorized, "Authentication required.");
            return;
        }

        FirebaseToken identity;
        try
        {
            identity = await firebaseAuth.VerifyIdTokenAsync(authorization["Bearer ".Length..]);
        }
        catch (FirebaseAuthException exception)
        {
            logger.LogInformation("Firebase ID token was rejected: {Message}", exception.Message);
            await WriteError(context, StatusCodes.Status401Unauthorized, "Invalid or expired Firebase ID token.");
            return;
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Unable to verify Firebase ID token.");
            await WriteError(context, StatusCodes.Status500InternalServerError, "Unable to verify Firebase ID token.");
            return;
        }

        if (!identity.Claims.TryGetValue("email", out var emailValue)
            || emailValue is not string email
            || string.IsNullOrWhiteSpace(email))
        {
            await WriteError(context, StatusCodes.Status403Forbidden, "A Firebase account email is required.");
            return;
        }

        InventoryUserResponse? user;
        try
        {
            user = database.LinkFirebaseUser(identity.Uid, email);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Unable to link Firebase user {FirebaseUid} to an inventory account.", identity.Uid);
            await WriteError(context, StatusCodes.Status500InternalServerError, "Unable to authorize this Firebase account.");
            return;
        }

        if (user is null)
        {
            await WriteError(context, StatusCodes.Status403Forbidden, "This Firebase account is not authorized for inventory access.");
            return;
        }

        context.Items[UserItemKey] = user;
        await next(context);
    }

    private static Task WriteError(HttpContext context, int statusCode, string message)
    {
        context.Response.StatusCode = statusCode;
        return context.Response.WriteAsJsonAsync(new { message });
    }
}
