using AutoMapper;

namespace Inventory.Api;

public sealed class InventoryMappingProfile : Profile
{
    public InventoryMappingProfile()
    {
        CreateMap<UserAccount, InventoryUserResponse>()
            .ForMember(response => response.VendorName, options =>
                options.MapFrom(user => user.Vendor == null ? null : user.Vendor.Name))
            .ForMember(response => response.CreatedByName, options =>
                options.MapFrom(user => user.CreatedByUser == null ? null : user.CreatedByUser.Name));

        CreateMap<InventoryItem, InventoryItemResponse>()
            .ForMember(response => response.Status, options =>
                options.MapFrom(item => item.Quantity < 10 ? "Low Stock" : item.Status))
            .ForMember(response => response.VendorName, options =>
                options.MapFrom(item => item.Vendor == null ? null : item.Vendor.Name))
            .ForMember(response => response.LocationName, options =>
                options.MapFrom(item => item.Location == null ? null : item.Location.Name))
            .ForMember(response => response.CreatedByName, options =>
                options.MapFrom(item => item.CreatedByUser == null ? null : item.CreatedByUser.Name));

        CreateMap<Vendor, VendorResponse>()
            .ForMember(response => response.LocationIds, options =>
                options.MapFrom(vendor => vendor.VendorLocations.Select(mapping => mapping.LocationId)))
            .ForMember(response => response.LocationNames, options =>
                options.MapFrom(vendor => vendor.VendorLocations.Select(mapping => mapping.Location.Name)));
        CreateMap<Location, LocationResponse>()
            .ForMember(response => response.VendorIds, options =>
                options.MapFrom(location => location.VendorLocations.Select(mapping => mapping.VendorId)))
            .ForMember(response => response.VendorNames, options =>
                options.MapFrom(location => location.VendorLocations.Select(mapping => mapping.Vendor.Name)));
    }
}
