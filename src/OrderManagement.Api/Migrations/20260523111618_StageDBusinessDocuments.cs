using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class StageDBusinessDocuments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BusinessDocuments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    DocumentType = table.Column<int>(type: "integer", nullable: false),
                    DocumentNumber = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: true),
                    ParentDocumentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    Description = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    IssueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TotalAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    PaymentMethod = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BusinessDocuments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BusinessDocuments_BusinessDocuments_ParentDocumentId",
                        column: x => x.ParentDocumentId,
                        principalTable: "BusinessDocuments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_BusinessDocuments_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_BusinessDocuments_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "BusinessDocumentLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DocumentId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: true),
                    Description = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    LineTotal = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BusinessDocumentLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BusinessDocumentLines_BusinessDocuments_DocumentId",
                        column: x => x.DocumentId,
                        principalTable: "BusinessDocuments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BusinessDocumentLines_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BusinessDocumentLines_DocumentId",
                table: "BusinessDocumentLines",
                column: "DocumentId");

            migrationBuilder.CreateIndex(
                name: "IX_BusinessDocumentLines_ProductId",
                table: "BusinessDocumentLines",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_BusinessDocuments_CustomerId",
                table: "BusinessDocuments",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_BusinessDocuments_OrderId",
                table: "BusinessDocuments",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_BusinessDocuments_ParentDocumentId",
                table: "BusinessDocuments",
                column: "ParentDocumentId");

            migrationBuilder.CreateIndex(
                name: "IX_BusinessDocuments_TenantId_DocumentNumber",
                table: "BusinessDocuments",
                columns: new[] { "TenantId", "DocumentNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BusinessDocuments_TenantId_DocumentType_Status",
                table: "BusinessDocuments",
                columns: new[] { "TenantId", "DocumentType", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_BusinessDocuments_TenantId_IssueDate",
                table: "BusinessDocuments",
                columns: new[] { "TenantId", "IssueDate" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BusinessDocumentLines");

            migrationBuilder.DropTable(
                name: "BusinessDocuments");
        }
    }
}
