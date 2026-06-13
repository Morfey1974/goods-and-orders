using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddStockAssembly : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AssemblyRecipeLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ParentProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    ComponentProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssemblyRecipeLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AssemblyRecipeLines_Products_ComponentProductId",
                        column: x => x.ComponentProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AssemblyRecipeLines_Products_ParentProductId",
                        column: x => x.ParentProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StockAssemblies",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssemblyNumber = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    AssemblyDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    OutputProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    OutputWarehouseId = table.Column<Guid>(type: "uuid", nullable: false),
                    OutputQuantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    AdditionalCostIls = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    PostedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    OutputLotId = table.Column<Guid>(type: "uuid", nullable: true),
                    OutputMovementId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockAssemblies", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StockAssemblies_Products_OutputProductId",
                        column: x => x.OutputProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockAssemblies_Warehouses_OutputWarehouseId",
                        column: x => x.OutputWarehouseId,
                        principalTable: "Warehouses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StockAssemblyLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StockAssemblyId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IssueMovementId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockAssemblyLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StockAssemblyLines_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockAssemblyLines_StockAssemblies_StockAssemblyId",
                        column: x => x.StockAssemblyId,
                        principalTable: "StockAssemblies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AssemblyRecipeLines_ComponentProductId",
                table: "AssemblyRecipeLines",
                column: "ComponentProductId");

            migrationBuilder.CreateIndex(
                name: "IX_AssemblyRecipeLines_ParentProductId",
                table: "AssemblyRecipeLines",
                column: "ParentProductId");

            migrationBuilder.CreateIndex(
                name: "IX_StockAssemblies_OutputProductId",
                table: "StockAssemblies",
                column: "OutputProductId");

            migrationBuilder.CreateIndex(
                name: "IX_StockAssemblies_OutputWarehouseId",
                table: "StockAssemblies",
                column: "OutputWarehouseId");

            migrationBuilder.CreateIndex(
                name: "IX_StockAssemblies_TenantId_AssemblyNumber",
                table: "StockAssemblies",
                columns: new[] { "TenantId", "AssemblyNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StockAssemblyLines_ProductId",
                table: "StockAssemblyLines",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_StockAssemblyLines_StockAssemblyId",
                table: "StockAssemblyLines",
                column: "StockAssemblyId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AssemblyRecipeLines");

            migrationBuilder.DropTable(
                name: "StockAssemblyLines");

            migrationBuilder.DropTable(
                name: "StockAssemblies");
        }
    }
}
