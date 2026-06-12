using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddQuoteClientOrderFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ClientOrderFileName",
                table: "BusinessDocuments",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ClientOrderFilePath",
                table: "BusinessDocuments",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ClientOrderReceivedAt",
                table: "BusinessDocuments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ClientOrderReference",
                table: "BusinessDocuments",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ClientOrderFileName",
                table: "BusinessDocuments");

            migrationBuilder.DropColumn(
                name: "ClientOrderFilePath",
                table: "BusinessDocuments");

            migrationBuilder.DropColumn(
                name: "ClientOrderReceivedAt",
                table: "BusinessDocuments");

            migrationBuilder.DropColumn(
                name: "ClientOrderReference",
                table: "BusinessDocuments");
        }
    }
}
