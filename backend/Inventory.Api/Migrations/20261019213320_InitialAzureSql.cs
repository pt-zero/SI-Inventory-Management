using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Inventory.Api.Migrations
{
    /// <inheritdoc />
    public partial class InitialAzureSql : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "locations",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    code = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    type = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_locations", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "vendors",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    contact_name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    email = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: false),
                    status = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_vendors", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "inventory",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    sku = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    title = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    category = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    quantity = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    status = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false, defaultValue: "In Stock"),
                    vendor_id = table.Column<long>(type: "bigint", nullable: true),
                    location_id = table.Column<long>(type: "bigint", nullable: true),
                    intake_date = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    shipment_status = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false, defaultValue: "Not Started"),
                    notes = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_inventory", x => x.id);
                    table.ForeignKey(
                        name: "FK_inventory_locations_location_id",
                        column: x => x.location_id,
                        principalTable: "locations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_inventory_vendors_vendor_id",
                        column: x => x.vendor_id,
                        principalTable: "vendors",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    email = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: false),
                    role = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false, defaultValue: "vendor"),
                    vendor_id = table.Column<long>(type: "bigint", nullable: true),
                    firebase_uid = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_users", x => x.id);
                    table.CheckConstraint("CK_users_role", "[role] IN ('admin','vendor')");
                    table.ForeignKey(
                        name: "FK_users_vendors_vendor_id",
                        column: x => x.vendor_id,
                        principalTable: "vendors",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_inventory_location_id",
                table: "inventory",
                column: "location_id");

            migrationBuilder.CreateIndex(
                name: "IX_inventory_sku",
                table: "inventory",
                column: "sku",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_inventory_vendor_id",
                table: "inventory",
                column: "vendor_id");

            migrationBuilder.CreateIndex(
                name: "IX_locations_code",
                table: "locations",
                column: "code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_users_email",
                table: "users",
                column: "email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_users_firebase_uid",
                table: "users",
                column: "firebase_uid",
                unique: true,
                filter: "[firebase_uid] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_users_vendor_id",
                table: "users",
                column: "vendor_id");

            migrationBuilder.CreateIndex(
                name: "IX_vendors_email",
                table: "vendors",
                column: "email",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "inventory");

            migrationBuilder.DropTable(
                name: "users");

            migrationBuilder.DropTable(
                name: "locations");

            migrationBuilder.DropTable(
                name: "vendors");
        }
    }
}
