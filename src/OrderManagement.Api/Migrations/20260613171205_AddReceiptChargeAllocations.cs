using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddReceiptChargeAllocations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ReceiptChargeAllocations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ReceiptId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChargeInvoiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    AllocatedAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReceiptChargeAllocations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReceiptChargeAllocations_BusinessDocuments_ChargeInvoiceId",
                        column: x => x.ChargeInvoiceId,
                        principalTable: "BusinessDocuments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ReceiptChargeAllocations_BusinessDocuments_ReceiptId",
                        column: x => x.ReceiptId,
                        principalTable: "BusinessDocuments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ReceiptChargeAllocations_ChargeInvoiceId",
                table: "ReceiptChargeAllocations",
                column: "ChargeInvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_ReceiptChargeAllocations_ReceiptId",
                table: "ReceiptChargeAllocations",
                column: "ReceiptId");

            migrationBuilder.Sql("""
                INSERT INTO "ReceiptChargeAllocations" ("Id", "ReceiptId", "ChargeInvoiceId", "AllocatedAmount")
                SELECT gen_random_uuid(), r."Id", r."ParentDocumentId",
                    CASE WHEN r."TotalAmount" > 0 THEN r."TotalAmount" ELSE c."TotalAmount" END
                FROM "BusinessDocuments" r
                INNER JOIN "BusinessDocuments" c ON c."Id" = r."ParentDocumentId"
                WHERE r."DocumentType" = 3 AND r."ParentDocumentId" IS NOT NULL
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReceiptChargeAllocations");
        }
    }
}
