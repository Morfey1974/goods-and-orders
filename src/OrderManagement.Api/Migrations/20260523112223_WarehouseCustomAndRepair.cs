using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class WarehouseCustomAndRepair : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Warehouses_TenantId_Kind",
                table: "Warehouses");

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "Warehouses",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "Warehouses",
                type: "character varying(512)",
                maxLength: 512,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "Warehouses",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.Sql(
                """
                UPDATE "Warehouses"
                SET "IsActive" = true,
                    "CreatedAt" = NOW() AT TIME ZONE 'utc',
                    "Description" = COALESCE("Description", "Name")
                WHERE "CreatedAt" = '-infinity'::timestamptz OR "CreatedAt" < '2000-01-01'::timestamptz;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Warehouses_TenantId_Name",
                table: "Warehouses",
                columns: new[] { "TenantId", "Name" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Warehouses_TenantId_Name",
                table: "Warehouses");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "Warehouses");

            migrationBuilder.DropColumn(
                name: "Description",
                table: "Warehouses");

            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "Warehouses");

            migrationBuilder.CreateIndex(
                name: "IX_Warehouses_TenantId_Kind",
                table: "Warehouses",
                columns: new[] { "TenantId", "Kind" },
                unique: true);
        }
    }
}
