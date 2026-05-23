using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class OrderChargeInvoiceStock : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "FulfilledAt",
                table: "Orders",
                newName: "ChargeInvoiceIssuedAt");

            migrationBuilder.AddColumn<string>(
                name: "ChargeInvoiceNumber",
                table: "Orders",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ChargeInvoiceNumber",
                table: "Orders");

            migrationBuilder.RenameColumn(
                name: "ChargeInvoiceIssuedAt",
                table: "Orders",
                newName: "FulfilledAt");
        }
    }
}
