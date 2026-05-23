using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class DualWarehousesAndOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Warehouses_TenantId_IsDefault",
                table: "Warehouses");

            migrationBuilder.AddColumn<int>(
                name: "Kind",
                table: "Warehouses",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // One tenant may have duplicate legacy "Main" rows — fix before unique (TenantId, Kind).
            migrationBuilder.Sql(
                """
                WITH ranked AS (
                    SELECT "Id", "TenantId",
                           ROW_NUMBER() OVER (PARTITION BY "TenantId" ORDER BY "IsDefault" DESC, "Id") AS rn,
                           COUNT(*) OVER (PARTITION BY "TenantId") AS cnt
                    FROM "Warehouses"
                )
                UPDATE "Warehouses" w
                SET "Kind" = CASE
                        WHEN r.cnt = 1 THEN 1
                        WHEN r.rn = 1 THEN 1
                        ELSE 0
                    END,
                    "Name" = CASE
                        WHEN r.cnt = 1 THEN 'Склад готовых изделий'
                        WHEN r.rn = 1 THEN 'Склад готовых изделий'
                        ELSE 'Склад комплектующих'
                    END,
                    "IsDefault" = (r.rn = 1)
                FROM ranked r
                WHERE w."Id" = r."Id";

                UPDATE "StockBalances" sb
                SET "WarehouseId" = CASE
                        WHEN p."ProductType" IN (1, 4) THEN fg."Id"
                        ELSE cp."Id"
                    END
                FROM "Products" p,
                     LATERAL (
                         SELECT w."Id"
                         FROM "Warehouses" w
                         WHERE w."TenantId" = p."TenantId" AND w."Kind" = 1
                         ORDER BY w."IsDefault" DESC, w."Id"
                         LIMIT 1
                     ) fg,
                     LATERAL (
                         SELECT w."Id"
                         FROM "Warehouses" w
                         WHERE w."TenantId" = p."TenantId" AND w."Kind" = 0
                         ORDER BY w."Id"
                         LIMIT 1
                     ) cp
                WHERE sb."ProductId" = p."Id"
                  AND sb."WarehouseId" NOT IN (fg."Id", cp."Id");

                DELETE FROM "Warehouses" w
                WHERE w."Id" NOT IN (
                    SELECT DISTINCT ON ("TenantId", "Kind") "Id"
                    FROM "Warehouses"
                    ORDER BY "TenantId", "Kind", "IsDefault" DESC, "Id"
                );
                """);

            migrationBuilder.CreateTable(
                name: "Orders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderNumber = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    FulfilledAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    StockDeducted = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Orders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Orders_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OrderLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    LineTotal = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrderLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OrderLines_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OrderLines_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Warehouses_TenantId_Kind",
                table: "Warehouses",
                columns: new[] { "TenantId", "Kind" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OrderLines_OrderId",
                table: "OrderLines",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_OrderLines_ProductId",
                table: "OrderLines",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_Orders_CustomerId",
                table: "Orders",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_Orders_TenantId_OrderNumber",
                table: "Orders",
                columns: new[] { "TenantId", "OrderNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Orders_TenantId_Status",
                table: "Orders",
                columns: new[] { "TenantId", "Status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OrderLines");

            migrationBuilder.DropTable(
                name: "Orders");

            migrationBuilder.DropIndex(
                name: "IX_Warehouses_TenantId_Kind",
                table: "Warehouses");

            migrationBuilder.DropColumn(
                name: "Kind",
                table: "Warehouses");

            migrationBuilder.CreateIndex(
                name: "IX_Warehouses_TenantId_IsDefault",
                table: "Warehouses",
                columns: new[] { "TenantId", "IsDefault" });
        }
    }
}
