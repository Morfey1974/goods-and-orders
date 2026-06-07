using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPurchaseReceiptDocuments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PurchaseReceiptDocuments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PurchaseReceiptId = table.Column<Guid>(type: "uuid", nullable: false),
                    FilePath = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    FileName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseReceiptDocuments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PurchaseReceiptDocuments_PurchaseReceipts_PurchaseReceiptId",
                        column: x => x.PurchaseReceiptId,
                        principalTable: "PurchaseReceipts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseReceiptDocuments_PurchaseReceiptId",
                table: "PurchaseReceiptDocuments",
                column: "PurchaseReceiptId");

            migrationBuilder.Sql("""
                INSERT INTO "PurchaseReceiptDocuments" ("Id", "PurchaseReceiptId", "FilePath", "FileName", "ContentType", "SortOrder", "CreatedAt")
                SELECT gen_random_uuid(), "Id", "DocumentPath", COALESCE("DocumentFileName", 'document'), COALESCE("DocumentContentType", 'application/octet-stream'), 0, "UpdatedAt"
                FROM "PurchaseReceipts"
                WHERE "DocumentPath" IS NOT NULL AND "DocumentPath" <> '';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PurchaseReceiptDocuments");
        }
    }
}
