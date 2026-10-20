using AutoMapper;
using Microsoft.EntityFrameworkCore;

namespace Inventory.Api;

public sealed class InventoryDatabase(InventoryDbContext db, IMapper mapper)
{
    public InventoryUserResponse? LinkFirebaseUser(string uid, string email)
    {
        var linkedUser = db.Users.Include(user => user.Vendor).SingleOrDefault(user => user.FirebaseUid == uid);
        if (linkedUser is not null)
        {
            return mapper.Map<InventoryUserResponse>(linkedUser);
        }

        var account = db.Users.Include(user => user.Vendor)
            .SingleOrDefault(user => user.Email.ToLower() == email.ToLower());
        if (account is null || account.FirebaseUid is not null)
        {
            return null;
        }

        account.FirebaseUid = uid;
        db.SaveChanges();
        return mapper.Map<InventoryUserResponse>(account);
    }

    public IReadOnlyList<InventoryItemResponse> GetInventory(long? vendorId = null)
    {
        var query = db.Inventory
            .Include(item => item.Vendor)
            .Include(item => item.Location)
            .AsNoTracking();

        if (vendorId.HasValue)
        {
            query = query.Where(item => item.VendorId == vendorId.Value);
        }

        return query.OrderByDescending(item => item.CreatedAt)
            .ToList()
            .Select(item => mapper.Map<InventoryItemResponse>(item))
            .ToList();
    }

    public InventoryItemResponse? GetInventoryItem(long id)
    {
        var item = db.Inventory
            .Include(item => item.Vendor)
            .Include(item => item.Location)
            .AsNoTracking()
            .SingleOrDefault(item => item.Id == id);
        return item is null ? null : mapper.Map<InventoryItemResponse>(item);
    }

    public IReadOnlyList<VendorResponse> GetVendors(long? vendorId = null)
    {
        var query = db.Vendors.AsNoTracking();
        if (vendorId.HasValue)
        {
            query = query.Where(vendor => vendor.Id == vendorId.Value);
        }
        return query.OrderBy(vendor => vendor.Name)
            .ToList()
            .Select(vendor => mapper.Map<VendorResponse>(vendor))
            .ToList();
    }

    public IReadOnlyList<LocationResponse> GetLocations()
    {
        return db.Locations.AsNoTracking().OrderBy(location => location.Name)
            .ToList()
            .Select(location => mapper.Map<LocationResponse>(location))
            .ToList();
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

}
