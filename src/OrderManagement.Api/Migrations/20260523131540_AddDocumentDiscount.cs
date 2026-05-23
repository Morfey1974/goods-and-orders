using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddDocumentDiscount : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "DiscountAmount",
                table: "BusinessDocuments",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "DiscountPercent",
                table: "BusinessDocuments",
                type: "numeric",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DiscountAmount",
                table: "BusinessDocuments");

            migrationBuilder.DropColumn(
                name: "DiscountPercent",
                table: "BusinessDocuments");
        }
    }
}
