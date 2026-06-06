using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class SetTrackInventoryDefaultFalse : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE "Products" SET "TrackInventory" = false;
                ALTER TABLE "Products" ALTER COLUMN "TrackInventory" SET DEFAULT false;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE "Products" ALTER COLUMN "TrackInventory" SET DEFAULT true;
                """);
        }
    }
}
