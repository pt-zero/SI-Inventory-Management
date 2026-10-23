using System.Text.Json;
using System.Text.Json.Serialization;

namespace Inventory.Api;

public sealed class VendorInput
{
    [JsonPropertyName("name")]
    public string? Name { get; init; }

    [JsonPropertyName("contact_name")]
    public string? ContactName { get; init; }

    [JsonPropertyName("email")]
    public string? Email { get; init; }

    [JsonPropertyName("status")]
    public string? Status { get; init; }

    [JsonPropertyName("password")]
    public string? Password { get; init; }
}

public sealed class VendorStatusInput
{
    [JsonPropertyName("status")]
    public string? Status { get; init; }
}

public sealed class VendorContactInput
{
    [JsonPropertyName("contact_name")]
    public string? ContactName { get; init; }

    [JsonPropertyName("email")]
    public string? Email { get; init; }

    [JsonPropertyName("password")]
    public string? Password { get; init; }
}

public sealed class LocationInput
{
    [JsonPropertyName("name")]
    public string? Name { get; init; }

    [JsonPropertyName("code")]
    public string? Code { get; init; }

    [JsonPropertyName("type")]
    public string? Type { get; init; }
}

public sealed class InventoryInput
{
    [JsonPropertyName("sku")]
    public string? Sku { get; init; }

    [JsonPropertyName("title")]
    public string? Title { get; init; }

    [JsonPropertyName("category")]
    public string? Category { get; init; }

    [JsonPropertyName("quantity")]
    public int? Quantity { get; init; }

    [JsonPropertyName("status")]
    public string? Status { get; init; }

    [JsonPropertyName("vendor_id")]
    public JsonElement VendorId { get; init; }

    [JsonPropertyName("location_id")]
    public JsonElement LocationId { get; init; }

    [JsonPropertyName("intake_date")]
    public string? IntakeDate { get; init; }

    [JsonPropertyName("shipment_status")]
    public string? ShipmentStatus { get; init; }

    [JsonPropertyName("notes")]
    public string? Notes { get; init; }
}
