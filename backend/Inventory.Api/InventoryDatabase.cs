using Microsoft.EntityFrameworkCore;

namespace Inventory.Api;

public sealed class InventoryDatabase(InventoryDbContext db)
{
    public InventoryUser? LinkFirebaseUser(string uid, string email)
    {
        var linkedUser = db.Users.Include(user => user.Vendor).SingleOrDefault(user => user.FirebaseUid == uid);
        if (linkedUser is not null)
        {
            return ToInventoryUser(linkedUser);
        }

        var account = db.Users.Include(user => user.Vendor)
            .SingleOrDefault(user => user.Email.ToLower() == email.ToLower());
        if (account is null || account.FirebaseUid is not null)
        {
            return null;
        }

        account.FirebaseUid = uid;
        db.SaveChanges();
        return ToInventoryUser(account);
    }

    public IReadOnlyList<Dictionary<string, object?>> GetInventory(long? vendorId = null)
    {
        var query =
            from item in db.Inventory.AsNoTracking()
            join vendor in db.Vendors.AsNoTracking() on item.VendorId equals vendor.Id into vendors
            from vendor in vendors.DefaultIfEmpty()
            join location in db.Locations.AsNoTracking() on item.LocationId equals location.Id into locations
            from location in locations.DefaultIfEmpty()
            select new { Item = item, VendorName = vendor == null ? null : vendor.Name, LocationName = location == null ? null : location.Name };

        if (vendorId.HasValue)
        {
            query = query.Where(record => record.Item.VendorId == vendorId.Value);
        }

        return query.OrderByDescending(record => record.Item.CreatedAt)
            .Select(record => ToInventoryRow(record.Item, record.VendorName, record.LocationName))
            .ToList();
    }

    public Dictionary<string, object?>? GetInventoryItem(long id)
    {
        var item = db.Inventory.AsNoTracking().SingleOrDefault(item => item.Id == id);
        return item is null ? null : ToInventoryRow(item, item.Vendor?.Name, item.Location?.Name);
    }

    public IReadOnlyList<Dictionary<string, object?>> GetVendors(long? vendorId = null)
    {
        var query = db.Vendors.AsNoTracking();
        if (vendorId.HasValue)
        {
            query = query.Where(vendor => vendor.Id == vendorId.Value);
        }
        return query.OrderBy(vendor => vendor.Name).Select(ToVendorRow).ToList();
    }

    public IReadOnlyList<Dictionary<string, object?>> GetLocations()
    {
        return db.Locations.AsNoTracking().OrderBy(location => location.Name).Select(ToLocationRow).ToList();
    }

    public long AddVendor(string name, string contactName, string email, string status)
    {
        var vendor = new Vendor
        {
            Name = name,
            ContactName = contactName,
            Email = email,
            Status = status,
        };
        db.Vendors.Add(vendor);
        db.SaveChanges();
        return vendor.Id;
    }

    public long AddLocation(string name, string code, string type)
    {
        var location = new Location { Name = name, Code = code, Type = type };
        db.Locations.Add(location);
        db.SaveChanges();
        return location.Id;
    }

    public long AddInventoryItem(InventoryInput input, long vendorId, long? locationId)
    {
        var item = new InventoryItem
        {
            Sku = input.Sku!,
            Title = input.Title!,
            Category = input.Category!,
            Quantity = input.Quantity!.Value,
            Status = input.Status ?? "In Stock",
            VendorId = vendorId,
            LocationId = locationId,
            IntakeDate = input.IntakeDate!,
            ShipmentStatus = input.ShipmentStatus ?? "Not Started",
            Notes = input.Notes ?? "",
        };
        db.Inventory.Add(item);
        db.SaveChanges();
        return item.Id;
    }

    public void UpdateInventoryItem(long id, InventoryInput input, long? actorVendorId)
    {
        var item = db.Inventory.Single(found => found.Id == id);
        item.Sku = string.IsNullOrEmpty(input.Sku) ? item.Sku : input.Sku;
        item.Title = string.IsNullOrEmpty(input.Title) ? item.Title : input.Title;
        item.Category = string.IsNullOrEmpty(input.Category) ? item.Category : input.Category;
        item.Quantity = input.Quantity ?? item.Quantity;
        item.VendorId = actorVendorId ?? ParseStoredLong(input.VendorId) ?? item.VendorId;
        item.LocationId = input.LocationId.ValueKind == System.Text.Json.JsonValueKind.Undefined
            ? item.LocationId
            : ParseNullableLong(input.LocationId);
        item.IntakeDate = string.IsNullOrEmpty(input.IntakeDate) ? item.IntakeDate : input.IntakeDate;
        item.Status = string.IsNullOrEmpty(input.Status) ? item.Status : input.Status;
        item.ShipmentStatus = string.IsNullOrEmpty(input.ShipmentStatus) ? item.ShipmentStatus : input.ShipmentStatus;
        item.Notes = input.Notes ?? item.Notes;
        db.SaveChanges();
    }

    public void DeleteInventoryItem(long id)
    {
        var item = db.Inventory.Single(found => found.Id == id);
        db.Inventory.Remove(item);
        db.SaveChanges();
    }

    public static long? ParseNullableLong(System.Text.Json.JsonElement element)
    {
        if (element.ValueKind is System.Text.Json.JsonValueKind.Undefined or System.Text.Json.JsonValueKind.Null)
        {
            return null;
        }
        if (element.ValueKind == System.Text.Json.JsonValueKind.String
            && string.IsNullOrWhiteSpace(element.GetString()))
        {
            return null;
        }

        if (element.ValueKind == System.Text.Json.JsonValueKind.Number && element.TryGetInt64(out var number))
        {
            return number;
        }

        if (element.ValueKind == System.Text.Json.JsonValueKind.String
            && long.TryParse(element.GetString(), out number))
        {
            return number;
        }

        throw new FormatException("Expected a numeric ID.");
    }

    private static long? ParseStoredLong(System.Text.Json.JsonElement element) =>
        element.ValueKind == System.Text.Json.JsonValueKind.Undefined ? null : ParseNullableLong(element);

    private static InventoryUser ToInventoryUser(UserAccount user) =>
        new(user.Id, user.Name, user.Email, user.Role, user.VendorId, user.Vendor?.Name);

    private static Dictionary<string, object?> ToInventoryRow(InventoryItem item, string? vendorName, string? locationName) =>
        new(StringComparer.Ordinal)
        {
            ["id"] = item.Id,
            ["sku"] = item.Sku,
            ["title"] = item.Title,
            ["category"] = item.Category,
            ["quantity"] = item.Quantity,
            ["status"] = item.Status,
            ["vendor_id"] = item.VendorId,
            ["location_id"] = item.LocationId,
            ["intake_date"] = item.IntakeDate,
            ["shipment_status"] = item.ShipmentStatus,
            ["notes"] = item.Notes,
            ["created_at"] = item.CreatedAt,
            ["vendor_name"] = vendorName,
            ["location_name"] = locationName,
        };

    private static Dictionary<string, object?> ToVendorRow(Vendor vendor) =>
        new(StringComparer.Ordinal)
        {
            ["id"] = vendor.Id,
            ["name"] = vendor.Name,
            ["contact_name"] = vendor.ContactName,
            ["email"] = vendor.Email,
            ["status"] = vendor.Status,
            ["created_at"] = vendor.CreatedAt,
        };

    private static Dictionary<string, object?> ToLocationRow(Location location) =>
        new(StringComparer.Ordinal)
        {
            ["id"] = location.Id,
            ["name"] = location.Name,
            ["code"] = location.Code,
            ["type"] = location.Type,
            ["created_at"] = location.CreatedAt,
        };
}
