using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class DocumentNumberByTypeAndPlainNumbers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_BusinessDocuments_TenantId_DocumentNumber",
                table: "BusinessDocuments");

            // Plain numbers without prefix (377 instead of Q-00377), like legacy YeshInvoice.
            migrationBuilder.Sql("""
                UPDATE "BusinessDocuments"
                SET "DocumentNumber" = CAST(
                    CAST(NULLIF(regexp_replace("DocumentNumber", '^[A-Z]+-', ''), '') AS INTEGER) AS TEXT)
                WHERE "DocumentNumber" ~ '^[A-Z]+-[0-9]';

                UPDATE "Orders"
                SET "OrderNumber" = CAST(
                    CAST(NULLIF(regexp_replace("OrderNumber", '^[A-Z]+-', ''), '') AS INTEGER) AS TEXT)
                WHERE "OrderNumber" ~ '^[A-Z]+-[0-9]';

                UPDATE "Orders"
                SET "ChargeInvoiceNumber" = CAST(
                    CAST(NULLIF(regexp_replace("ChargeInvoiceNumber", '^[A-Z]+-', ''), '') AS INTEGER) AS TEXT)
                WHERE "ChargeInvoiceNumber" IS NOT NULL
                  AND "ChargeInvoiceNumber" ~ '^[A-Z]+-[0-9]';
                """);

            migrationBuilder.CreateIndex(
                name: "IX_BusinessDocuments_TenantId_DocumentType_DocumentNumber",
                table: "BusinessDocuments",
                columns: new[] { "TenantId", "DocumentType", "DocumentNumber" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_BusinessDocuments_TenantId_DocumentType_DocumentNumber",
                table: "BusinessDocuments");

            migrationBuilder.CreateIndex(
                name: "IX_BusinessDocuments_TenantId_DocumentNumber",
                table: "BusinessDocuments",
                columns: new[] { "TenantId", "DocumentNumber" },
                unique: true);
        }
    }
}
