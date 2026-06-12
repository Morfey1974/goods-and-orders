using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class ReclassifyQuoteSentAsOpen : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Quote (0): Sent (1) → Open (2) until email delivery marks the document as sent.
            migrationBuilder.Sql(
                """
                UPDATE "BusinessDocuments"
                SET "Status" = 2
                WHERE "DocumentType" = 0 AND "Status" = 1;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
