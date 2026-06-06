using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddInventoryCosting : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "InventoryCostMethod",
                table: "Tenants",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "MovementDate",
                table: "StockMovements",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<decimal>(
                name: "TotalCost",
                table: "StockMovements",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "UnitCost",
                table: "StockMovements",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "UnitCostIls",
                table: "PurchaseReceiptLines",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "InventoryAverageCosts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitCostIls = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryAverageCosts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InventoryAverageCosts_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryAverageCosts_Warehouses_WarehouseId",
                        column: x => x.WarehouseId,
                        principalTable: "Warehouses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InventoryLots",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uuid", nullable: false),
                    QuantityRemaining = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    UnitCostIls = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    ReceivedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    SourceType = table.Column<int>(type: "integer", nullable: false),
                    SourceId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryLots", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InventoryLots_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryLots_Warehouses_WarehouseId",
                        column: x => x.WarehouseId,
                        principalTable: "Warehouses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InventoryLotAllocations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    StockMovementId = table.Column<Guid>(type: "uuid", nullable: false),
                    InventoryLotId = table.Column<Guid>(type: "uuid", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    UnitCostIls = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    TotalCostIls = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryLotAllocations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InventoryLotAllocations_InventoryLots_InventoryLotId",
                        column: x => x.InventoryLotId,
                        principalTable: "InventoryLots",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryLotAllocations_StockMovements_StockMovementId",
                        column: x => x.StockMovementId,
                        principalTable: "StockMovements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StockMovements_TenantId_MovementDate",
                table: "StockMovements",
                columns: new[] { "TenantId", "MovementDate" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryAverageCosts_ProductId",
                table: "InventoryAverageCosts",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryAverageCosts_TenantId_ProductId_WarehouseId",
                table: "InventoryAverageCosts",
                columns: new[] { "TenantId", "ProductId", "WarehouseId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InventoryAverageCosts_WarehouseId",
                table: "InventoryAverageCosts",
                column: "WarehouseId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryLotAllocations_InventoryLotId",
                table: "InventoryLotAllocations",
                column: "InventoryLotId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryLotAllocations_StockMovementId",
                table: "InventoryLotAllocations",
                column: "StockMovementId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryLots_ProductId",
                table: "InventoryLots",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryLots_TenantId_ProductId_WarehouseId_ReceivedAt",
                table: "InventoryLots",
                columns: new[] { "TenantId", "ProductId", "WarehouseId", "ReceivedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryLots_WarehouseId",
                table: "InventoryLots",
                column: "WarehouseId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InventoryAverageCosts");

            migrationBuilder.DropTable(
                name: "InventoryLotAllocations");

            migrationBuilder.DropTable(
                name: "InventoryLots");

            migrationBuilder.DropIndex(
                name: "IX_StockMovements_TenantId_MovementDate",
                table: "StockMovements");

            migrationBuilder.DropColumn(
                name: "InventoryCostMethod",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "MovementDate",
                table: "StockMovements");

            migrationBuilder.DropColumn(
                name: "TotalCost",
                table: "StockMovements");

            migrationBuilder.DropColumn(
                name: "UnitCost",
                table: "StockMovements");

            migrationBuilder.DropColumn(
                name: "UnitCostIls",
                table: "PurchaseReceiptLines");
        }
    }
}
