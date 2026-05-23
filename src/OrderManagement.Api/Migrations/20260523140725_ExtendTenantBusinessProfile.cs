using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class ExtendTenantBusinessProfile : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "Phone",
                table: "Tenants",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "BankName",
                table: "Tenants",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "BankBranch",
                table: "Tenants",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "BankAccountNumber",
                table: "Tenants",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BankAba",
                table: "Tenants",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BankCode",
                table: "Tenants",
                type: "character varying(8)",
                maxLength: 8,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BankIban",
                table: "Tenants",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BankSwift",
                table: "Tenants",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BusinessCategory",
                table: "Tenants",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BusinessField",
                table: "Tenants",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BusinessNickname",
                table: "Tenants",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "City",
                table: "Tenants",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Fax",
                table: "Tenants",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MobilePhone",
                table: "Tenants",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "ShowBankOnDocuments",
                table: "Tenants",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "Website",
                table: "Tenants",
                type: "character varying(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ZipCode",
                table: "Tenants",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BankAba",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "BankCode",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "BankIban",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "BankSwift",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "BusinessCategory",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "BusinessField",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "BusinessNickname",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "City",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "Fax",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "MobilePhone",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "ShowBankOnDocuments",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "Website",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "ZipCode",
                table: "Tenants");

            migrationBuilder.AlterColumn<string>(
                name: "Phone",
                table: "Tenants",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(64)",
                oldMaxLength: 64,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "BankName",
                table: "Tenants",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(128)",
                oldMaxLength: 128,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "BankBranch",
                table: "Tenants",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(32)",
                oldMaxLength: 32,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "BankAccountNumber",
                table: "Tenants",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(32)",
                oldMaxLength: 32,
                oldNullable: true);
        }
    }
}
