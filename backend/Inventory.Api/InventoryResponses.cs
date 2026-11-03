using System.Text.Json.Serialization;

namespace Inventory.Api;

public sealed class InventoryUserResponse
{
    public long Id { get; init; }
    public string Name { get; init; } = "";
    public string Email { get; init; } = "";
    public string Role { get; init; } = "";

    [JsonPropertyName("vendor_id")]
    public long? VendorId { get; init; }

    [JsonPropertyName("vendor_name")]
    public string? VendorName { get; init; }

    [JsonPropertyName("created_by_user_id")]
    public long? CreatedByUserId { get; init; }

    [JsonPropertyName("created_by_name")]
    public string? CreatedByName { get; init; }
}

public sealed class InventoryItemResponse
{
    public long Id { get; init; }
    public string Sku { get; init; } = "";
    public string Title { get; init; } = "";
    public string Category { get; init; } = "";
    public int Quantity { get; init; }
    public string Status { get; init; } = "";

    [JsonPropertyName("vendor_id")]
    public long? VendorId { get; init; }

    [JsonPropertyName("location_id")]
    public long? LocationId { get; init; }

    [JsonPropertyName("intake_date")]
    public string IntakeDate { get; init; } = "";

    [JsonPropertyName("shipment_status")]
    public string ShipmentStatus { get; init; } = "";

    public string? Notes { get; init; }

    [JsonPropertyName("created_at")]
    public DateTime CreatedAt { get; init; }

    [JsonPropertyName("vendor_name")]
    public string? VendorName { get; init; }

    [JsonPropertyName("location_name")]
    public string? LocationName { get; init; }

    [JsonPropertyName("created_by_user_id")]
    public long? CreatedByUserId { get; init; }

    [JsonPropertyName("created_by_name")]
    public string? CreatedByName { get; init; }
}

public sealed class VendorResponse
{
    public long Id { get; init; }
    public string Name { get; init; } = "";

    [JsonPropertyName("contact_name")]
    public string ContactName { get; init; } = "";

    public string Email { get; init; } = "";
    public string Status { get; init; } = "";

    [JsonPropertyName("created_at")]
    public DateTime CreatedAt { get; init; }

    [JsonPropertyName("location_ids")]
    public IReadOnlyList<long> LocationIds { get; init; } = [];

    [JsonPropertyName("location_names")]
    public IReadOnlyList<string> LocationNames { get; init; } = [];
}

public sealed class LocationResponse
{
    public long Id { get; init; }
    public string Name { get; init; } = "";
    public string Code { get; init; } = "";
    public string Type { get; init; } = "";

    [JsonPropertyName("created_at")]
    public DateTime CreatedAt { get; init; }

    [JsonPropertyName("vendor_ids")]
    public IReadOnlyList<long> VendorIds { get; init; } = [];

    [JsonPropertyName("vendor_names")]
    public IReadOnlyList<string> VendorNames { get; init; } = [];
}
