using Microsoft.EntityFrameworkCore;

namespace Inventory.Api;

public sealed class InventoryDbContext(DbContextOptions<InventoryDbContext> options) : DbContext(options)
{
    public DbSet<Vendor> Vendors => Set<Vendor>();
    public DbSet<Location> Locations => Set<Location>();
    public DbSet<UserAccount> Users => Set<UserAccount>();
    public DbSet<InventoryItem> Inventory => Set<InventoryItem>();
    public DbSet<VendorLocation> VendorLocations => Set<VendorLocation>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Vendor>(entity =>
        {
            entity.ToTable("vendors");
            entity.HasKey(vendor => vendor.Id);
            entity.Property(vendor => vendor.Id).HasColumnName("id").UseIdentityColumn();
            entity.Property(vendor => vendor.Name).HasColumnName("name").HasMaxLength(200).IsRequired();
            entity.Property(vendor => vendor.ContactName).HasColumnName("contact_name").HasMaxLength(200).IsRequired();
            entity.Property(vendor => vendor.Email).HasColumnName("email").HasMaxLength(320).IsRequired();
            entity.Property(vendor => vendor.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(vendor => vendor.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("SYSUTCDATETIME()");
            entity.HasIndex(vendor => vendor.Email).IsUnique();
        });

        modelBuilder.Entity<Location>(entity =>
        {
            entity.ToTable("locations");
            entity.HasKey(location => location.Id);
            entity.Property(location => location.Id).HasColumnName("id").UseIdentityColumn();
            entity.Property(location => location.Name).HasColumnName("name").HasMaxLength(200).IsRequired();
            entity.Property(location => location.Code).HasColumnName("code").HasMaxLength(80).IsRequired();
            entity.Property(location => location.Type).HasColumnName("type").HasMaxLength(80).IsRequired();
            entity.Property(location => location.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("SYSUTCDATETIME()");
            entity.HasIndex(location => location.Code).IsUnique();
        });

        modelBuilder.Entity<VendorLocation>(entity =>
        {
            entity.ToTable("vendor_locations");
            entity.HasKey(mapping => new { mapping.VendorId, mapping.LocationId });
            entity.Property(mapping => mapping.VendorId).HasColumnName("vendor_id");
            entity.Property(mapping => mapping.LocationId).HasColumnName("location_id");
            entity.HasOne(mapping => mapping.Vendor)
                .WithMany(vendor => vendor.VendorLocations)
                .HasForeignKey(mapping => mapping.VendorId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(mapping => mapping.Location)
                .WithMany(location => location.VendorLocations)
                .HasForeignKey(mapping => mapping.LocationId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<UserAccount>(entity =>
        {
            entity.ToTable("users", table => table.HasCheckConstraint("CK_users_role", "[role] IN ('admin','vendor','viewer')"));
            entity.HasKey(user => user.Id);
            entity.Property(user => user.Id).HasColumnName("id").UseIdentityColumn();
            entity.Property(user => user.Name).HasColumnName("name").HasMaxLength(200).IsRequired();
            entity.Property(user => user.Email).HasColumnName("email").HasMaxLength(320).IsRequired();
            entity.Property(user => user.Role).HasColumnName("role").HasMaxLength(20).HasDefaultValue("vendor").IsRequired();
            entity.Property(user => user.VendorId).HasColumnName("vendor_id");
            entity.Property(user => user.FirebaseUid).HasColumnName("firebase_uid").HasMaxLength(128);
            entity.Property(user => user.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("SYSUTCDATETIME()");
            entity.Property(user => user.CreatedByUserId).HasColumnName("created_by_user_id");
            entity.HasIndex(user => user.Email).IsUnique();
            entity.HasIndex(user => user.FirebaseUid).IsUnique();
            entity.HasOne(user => user.Vendor)
                .WithMany(vendor => vendor.Users)
                .HasForeignKey(user => user.VendorId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(user => user.CreatedByUser)
                .WithMany(creator => creator.CreatedUsers)
                .HasForeignKey(user => user.CreatedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<InventoryItem>(entity =>
        {
            entity.ToTable("inventory");
            entity.HasKey(item => item.Id);
            entity.Property(item => item.Id).HasColumnName("id").UseIdentityColumn();
            entity.Property(item => item.Sku).HasColumnName("sku").HasMaxLength(100).IsRequired();
            entity.Property(item => item.Title).HasColumnName("title").HasMaxLength(300).IsRequired();
            entity.Property(item => item.Category).HasColumnName("category").HasMaxLength(120).IsRequired();
            entity.Property(item => item.Quantity).HasColumnName("quantity").HasDefaultValue(0);
            entity.Property(item => item.Status).HasColumnName("status").HasMaxLength(60).HasDefaultValue("In Stock").IsRequired();
            entity.Property(item => item.VendorId).HasColumnName("vendor_id");
            entity.Property(item => item.LocationId).HasColumnName("location_id");
            entity.Property(item => item.IntakeDate).HasColumnName("intake_date").HasMaxLength(32).IsRequired();
            entity.Property(item => item.ShipmentStatus).HasColumnName("shipment_status").HasMaxLength(60).HasDefaultValue("Not Started").IsRequired();
            entity.Property(item => item.Notes).HasColumnName("notes").HasMaxLength(4000);
            entity.Property(item => item.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("SYSUTCDATETIME()");
            entity.Property(item => item.CreatedByUserId).HasColumnName("created_by_user_id");
            entity.HasIndex(item => item.Sku).IsUnique();
            entity.HasOne(item => item.Vendor)
                .WithMany(vendor => vendor.Inventory)
                .HasForeignKey(item => item.VendorId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.Location)
                .WithMany(location => location.Inventory)
                .HasForeignKey(item => item.LocationId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CreatedByUser)
                .WithMany(user => user.CreatedInventory)
                .HasForeignKey(item => item.CreatedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
