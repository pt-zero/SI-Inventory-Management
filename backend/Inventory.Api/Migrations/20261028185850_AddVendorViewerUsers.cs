using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Inventory.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddVendorViewerUsers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_users_role",
                table: "users");

            migrationBuilder.AddColumn<long>(
                name: "created_by_user_id",
                table: "users",
                type: "bigint",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_users_created_by_user_id",
                table: "users",
                column: "created_by_user_id");

            migrationBuilder.AddCheckConstraint(
                name: "CK_users_role",
                table: "users",
                sql: "[role] IN ('admin','vendor','viewer')");

            migrationBuilder.AddForeignKey(
                name: "FK_users_users_created_by_user_id",
                table: "users",
                column: "created_by_user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_users_users_created_by_user_id",
                table: "users");

            migrationBuilder.DropIndex(
                name: "IX_users_created_by_user_id",
                table: "users");

            migrationBuilder.DropCheckConstraint(
                name: "CK_users_role",
                table: "users");

            migrationBuilder.DropColumn(
                name: "created_by_user_id",
                table: "users");

            migrationBuilder.AddCheckConstraint(
                name: "CK_users_role",
                table: "users",
                sql: "[role] IN ('admin','vendor')");
        }
    }
}
