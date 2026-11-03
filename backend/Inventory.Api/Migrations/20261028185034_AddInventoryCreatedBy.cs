using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Inventory.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddInventoryCreatedBy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "created_by_user_id",
                table: "inventory",
                type: "bigint",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_inventory_created_by_user_id",
                table: "inventory",
                column: "created_by_user_id");

            migrationBuilder.AddForeignKey(
                name: "FK_inventory_users_created_by_user_id",
                table: "inventory",
                column: "created_by_user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_inventory_users_created_by_user_id",
                table: "inventory");

            migrationBuilder.DropIndex(
                name: "IX_inventory_created_by_user_id",
                table: "inventory");

            migrationBuilder.DropColumn(
                name: "created_by_user_id",
                table: "inventory");
        }
    }
}
