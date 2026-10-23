using AutoMapper;

namespace Inventory.Api;

public sealed class InventoryMappingProfile : Profile
{
    public InventoryMappingProfile()
    {
        CreateMap<UserAccount, InventoryUserResponse>()
            .ForMember(response => response.VendorName, options =>
                options.MapFrom(user => user.Vendor == null ? null : user.Vendor.Name));

        CreateMap<InventoryItem, InventoryItemResponse>()
            .ForMember(response => response.Status, options =>
                options.MapFrom(item => item.Quantity < 10 ? "Low Stock" : item.Status))
            .ForMember(response => response.VendorName, options =>
                options.MapFrom(item => item.Vendor == null ? null : item.Vendor.Name))
            .ForMember(response => response.LocationName, options =>
                options.MapFrom(item => item.Location == null ? null : item.Location.Name));

        CreateMap<Vendor, VendorResponse>();
        CreateMap<Location, LocationResponse>();
    }
}
