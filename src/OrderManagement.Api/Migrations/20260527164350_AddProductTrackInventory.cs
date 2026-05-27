using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddProductTrackInventory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "TrackInventory",
                table: "Products",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            // ProductType: ComponentPart=0, FinishedGood=1, Bundle=4, Spare=5
            migrationBuilder.Sql(
                """
                UPDATE "Products"
                SET "TrackInventory" = "ProductType" IN (0, 1, 4, 5);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TrackInventory",
                table: "Products");
        }
    }
}
