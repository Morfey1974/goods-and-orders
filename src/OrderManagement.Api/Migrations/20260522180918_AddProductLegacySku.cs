using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddProductLegacySku : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "LegacySku",
                table: "Products",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Products_TenantId_LegacySku",
                table: "Products",
                columns: new[] { "TenantId", "LegacySku" },
                unique: true,
                filter: "\"LegacySku\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Products_TenantId_LegacySku",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "LegacySku",
                table: "Products");
        }
    }
}
