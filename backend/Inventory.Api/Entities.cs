namespace Inventory.Api;

public sealed class Vendor
{
    public long Id { get; set; }
    public required string Name { get; set; }
    public required string ContactName { get; set; }
    public required string Email { get; set; }
    public required string Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public ICollection<UserAccount> Users { get; } = new List<UserAccount>();
    public ICollection<InventoryItem> Inventory { get; } = new List<InventoryItem>();
}

public sealed class Location
{
    public long Id { get; set; }
    public required string Name { get; set; }
    public required string Code { get; set; }
    public required string Type { get; set; }
    public DateTime CreatedAt { get; set; }
    public ICollection<InventoryItem> Inventory { get; } = new List<InventoryItem>();
}

public sealed class UserAccount
{
    public long Id { get; set; }
    public required string Name { get; set; }
    public required string Email { get; set; }
    public required string Role { get; set; }
    public long? VendorId { get; set; }
    public string? FirebaseUid { get; set; }
    public DateTime CreatedAt { get; set; }
    public Vendor? Vendor { get; set; }
}

public sealed class InventoryItem
{
    public long Id { get; set; }
    public required string Sku { get; set; }
    public required string Title { get; set; }
    public required string Category { get; set; }
    public int Quantity { get; set; }
    public required string Status { get; set; }
    public long? VendorId { get; set; }
    public long? LocationId { get; set; }
    public required string IntakeDate { get; set; }
    public required string ShipmentStatus { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public Vendor? Vendor { get; set; }
    public Location? Location { get; set; }
}

public sealed record InventoryUser(long Id, string Name, string Email, string Role, long? VendorId, string? VendorName);
