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
            if (linkedUser.Role == "vendor"
                && !string.Equals(linkedUser.Vendor?.Status, "active", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }
            return mapper.Map<InventoryUserResponse>(linkedUser);
        }

        var account = db.Users.Include(user => user.Vendor)
            .SingleOrDefault(user => user.Email.ToLower() == email.ToLower());
        if (account is null || account.FirebaseUid is not null)
        {
            return null;
        }
        if (account.Role == "vendor"
            && !string.Equals(account.Vendor?.Status, "active", StringComparison.OrdinalIgnoreCase))
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

    public (int Active, int Paused) GetVendorStatusCounts()
    {
        var counts = db.Vendors
            .AsNoTracking()
            .GroupBy(vendor => vendor.Status)
            .Select(group => new { Status = group.Key, Count = group.Count() })
            .ToList();

        return (
            counts.Where(item => string.Equals(item.Status, "active", StringComparison.OrdinalIgnoreCase)).Sum(item => item.Count),
            counts.Where(item => string.Equals(item.Status, "paused", StringComparison.OrdinalIgnoreCase)).Sum(item => item.Count));
    }

    public VendorResponse? GetVendor(long id)
    {
        var vendor = db.Vendors.AsNoTracking().SingleOrDefault(item => item.Id == id);
        return vendor is null ? null : mapper.Map<VendorResponse>(vendor);
    }

    public IReadOnlyList<LocationResponse> GetLocations()
    {
        return db.Locations.AsNoTracking().OrderBy(location => location.Name)
            .ToList()
            .Select(location => mapper.Map<LocationResponse>(location))
            .ToList();
    }

    public long AddVendor(string name, string contactName, string email, string status, string firebaseUid)
    {
        var vendor = new Vendor
        {
            Name = name,
            ContactName = contactName,
            Email = email,
            Status = status,
        };
        vendor.Users.Add(new UserAccount
        {
            Name = contactName,
            Email = email,
            Role = "vendor",
            FirebaseUid = firebaseUid,
            Vendor = vendor,
        });
        db.Vendors.Add(vendor);
        db.SaveChanges();
        return vendor.Id;
    }

    public (string Status, string? FirebaseUid)? GetVendorStatusAndFirebaseUid(long id)
    {
        var vendor = db.Vendors
            .AsNoTracking()
            .Where(item => item.Id == id)
            .Select(item => new
            {
                item.Status,
                FirebaseUid = item.Users
                    .Where(user => user.FirebaseUid != null)
                    .Select(user => user.FirebaseUid)
                    .FirstOrDefault(),
            })
            .SingleOrDefault();

        return vendor is null ? null : (vendor.Status, vendor.FirebaseUid);
    }

    public VendorContactState? GetVendorContactState(long id)
    {
        var vendor = db.Vendors
            .Include(item => item.Users)
            .SingleOrDefault(item => item.Id == id);
        if (vendor is null) return null;

        var account = vendor.Users.FirstOrDefault(user => user.Role == "vendor" && user.FirebaseUid is not null)
            ?? vendor.Users.FirstOrDefault(user => user.Role == "vendor");
        return new VendorContactState(
            vendor.ContactName,
            vendor.Email,
            account?.Id,
            account?.FirebaseUid);
    }

    public bool IsVendorContactEmailInUse(long vendorId, long userId, string email) =>
        db.Vendors.Any(vendor => vendor.Id != vendorId && vendor.Email == email)
        || db.Users.Any(user => user.Id != userId && user.Email == email);

    public void UpdateVendorContact(long vendorId, long userId, string contactName, string email)
    {
        var vendor = db.Vendors.Single(item => item.Id == vendorId);
        var account = db.Users.Single(user => user.Id == userId && user.VendorId == vendorId);
        vendor.ContactName = contactName;
        vendor.Email = email;
        account.Name = contactName;
        account.Email = email;
        db.SaveChanges();
    }

    public sealed record VendorContactState(
        string ContactName,
        string Email,
        long? UserId,
        string? FirebaseUid);

    public bool UpdateVendorStatus(long id, string status)
    {
        var vendor = db.Vendors.SingleOrDefault(item => item.Id == id);
        if (vendor is null) return false;

        vendor.Status = status;
        db.SaveChanges();
        return true;
    }

    public VendorDeleteResult DeleteVendor(long id)
    {
        var vendor = db.Vendors
            .Include(item => item.Users)
            .SingleOrDefault(item => item.Id == id);
        if (vendor is null) return new VendorDeleteResult(false, false, []);
        if (db.Inventory.Any(item => item.VendorId == id))
        {
            return new VendorDeleteResult(true, true, []);
        }

        var firebaseUids = vendor.Users
            .Where(user => user.FirebaseUid is not null)
            .Select(user => user.FirebaseUid!)
            .ToArray();
        db.Users.RemoveRange(vendor.Users);
        db.Vendors.Remove(vendor);
        db.SaveChanges();

        return new VendorDeleteResult(true, false, firebaseUids);
    }

    public long AddLocation(string name, string code, string type)
    {
        var location = new Location { Name = name, Code = code, Type = type };
        db.Locations.Add(location);
        db.SaveChanges();
        return location.Id;
    }

    public bool UpdateLocation(long id, string name, string code, string type)
    {
        var location = db.Locations.SingleOrDefault(item => item.Id == id);
        if (location is null) return false;

        location.Name = name;
        location.Code = code;
        location.Type = type;
        db.SaveChanges();
        return true;
    }

    public LocationDeleteResult DeleteLocation(long id)
    {
        var location = db.Locations.SingleOrDefault(item => item.Id == id);
        if (location is null) return new LocationDeleteResult(false, false);
        if (db.Inventory.Any(item => item.LocationId == id))
        {
            return new LocationDeleteResult(true, true);
        }

        db.Locations.Remove(location);
        db.SaveChanges();
        return new LocationDeleteResult(true, false);
    }

    public sealed record VendorDeleteResult(bool Found, bool HasInventory, IReadOnlyList<string> FirebaseUids);
    public sealed record LocationDeleteResult(bool Found, bool HasInventory);

    public long AddInventoryItem(InventoryInput input, long? vendorId, long? locationId)
    {
        var item = new InventoryItem
        {
            Sku = input.Sku!,
            Title = input.Title!,
            Category = input.Category!,
            Quantity = input.Quantity!.Value,
            Status = input.Quantity!.Value < 10 ? "Low Stock" : input.Status ?? "In Stock",
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
        if (item.Quantity < 10)
        {
            item.Status = "Low Stock";
        }
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
