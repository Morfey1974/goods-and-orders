using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFixedAssetInstancesAndProductTypes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "DefaultBusinessUsePercent",
                table: "Products",
                type: "numeric(8,2)",
                precision: 8,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DepreciationCategory",
                table: "Products",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PurchaseReceiptLineId",
                table: "BusinessExpenses",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "FixedAssetInstances",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    Description = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    PurchaseReceiptId = table.Column<Guid>(type: "uuid", nullable: true),
                    PurchaseReceiptLineId = table.Column<Guid>(type: "uuid", nullable: true),
                    AcquisitionDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    InServiceDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    OriginalCostIls = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    ChangesCostIls = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Category = table.Column<int>(type: "integer", nullable: false),
                    AnnualDepreciationPercent = table.Column<decimal>(type: "numeric(10,4)", precision: 10, scale: 4, nullable: false),
                    BusinessUsePercent = table.Column<decimal>(type: "numeric(8,2)", precision: 8, scale: 2, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    DisposedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    VendorName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    InvoiceReference = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FixedAssetInstances", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FixedAssetInstances_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_FixedAssetInstances_PurchaseReceiptLines_PurchaseReceiptLin~",
                        column: x => x.PurchaseReceiptLineId,
                        principalTable: "PurchaseReceiptLines",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_FixedAssetInstances_PurchaseReceipts_PurchaseReceiptId",
                        column: x => x.PurchaseReceiptId,
                        principalTable: "PurchaseReceipts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BusinessExpenses_PurchaseReceiptLineId",
                table: "BusinessExpenses",
                column: "PurchaseReceiptLineId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssetInstances_ProductId",
                table: "FixedAssetInstances",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssetInstances_PurchaseReceiptId",
                table: "FixedAssetInstances",
                column: "PurchaseReceiptId");

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssetInstances_PurchaseReceiptLineId",
                table: "FixedAssetInstances",
                column: "PurchaseReceiptLineId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssetInstances_TenantId_AcquisitionDate",
                table: "FixedAssetInstances",
                columns: new[] { "TenantId", "AcquisitionDate" });

            migrationBuilder.Sql("""
                INSERT INTO "FixedAssetInstances" (
                    "Id", "TenantId", "ProductId", "Name", "Description",
                    "PurchaseReceiptId", "PurchaseReceiptLineId",
                    "AcquisitionDate", "InServiceDate",
                    "OriginalCostIls", "ChangesCostIls",
                    "Category", "AnnualDepreciationPercent", "BusinessUsePercent",
                    "Status", "DisposedAt", "VendorName", "InvoiceReference", "Notes",
                    "CreatedAt", "UpdatedAt")
                SELECT
                    "Id", "TenantId", NULL, "Name", "Description",
                    NULL, NULL,
                    "PurchaseDate", "PurchaseDate",
                    "CostIls", 0,
                    "Category", "AnnualDepreciationPercent", 100,
                    CASE WHEN "IsDisposed" THEN 2 ELSE 0 END,
                    "DisposedAt", "VendorName", "InvoiceReference", "Notes",
                    "CreatedAt", "UpdatedAt"
                FROM "FixedAssets";
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FixedAssetInstances");

            migrationBuilder.DropIndex(
                name: "IX_BusinessExpenses_PurchaseReceiptLineId",
                table: "BusinessExpenses");

            migrationBuilder.DropColumn(
                name: "DefaultBusinessUsePercent",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "DepreciationCategory",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "PurchaseReceiptLineId",
                table: "BusinessExpenses");
        }
    }
}
