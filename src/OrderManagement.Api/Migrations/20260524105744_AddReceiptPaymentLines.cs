using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddReceiptPaymentLines : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ReceiptPaymentLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DocumentId = table.Column<Guid>(type: "uuid", nullable: false),
                    PaymentType = table.Column<int>(type: "integer", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    LineDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    GeneralDetail = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    DetailsJson = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReceiptPaymentLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReceiptPaymentLines_BusinessDocuments_DocumentId",
                        column: x => x.DocumentId,
                        principalTable: "BusinessDocuments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ReceiptPaymentLines_DocumentId",
                table: "ReceiptPaymentLines",
                column: "DocumentId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReceiptPaymentLines");
        }
    }
}
