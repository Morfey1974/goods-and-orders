using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantBackupFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BackupHostPath",
                table: "Tenants",
                type: "character varying(512)",
                maxLength: 512,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LastBackupError",
                table: "Tenants",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LastBackupFileName",
                table: "Tenants",
                type: "character varying(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "LastBackupSizeBytes",
                table: "Tenants",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastBackupUtc",
                table: "Tenants",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BackupHostPath",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "LastBackupError",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "LastBackupFileName",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "LastBackupSizeBytes",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "LastBackupUtc",
                table: "Tenants");
        }
    }
}
