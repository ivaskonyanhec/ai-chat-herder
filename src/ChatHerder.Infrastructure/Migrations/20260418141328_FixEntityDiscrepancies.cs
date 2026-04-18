using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ChatHerder.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FixEntityDiscrepancies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_RoomBans_Users_UserId",
                table: "RoomBans");

            migrationBuilder.DropIndex(
                name: "IX_RoomBans_RoomId",
                table: "RoomBans");

            migrationBuilder.DropColumn(
                name: "LastReadSequenceNumber",
                table: "ReadMarkers");

            migrationBuilder.RenameColumn(
                name: "UserId",
                table: "RoomBans",
                newName: "BannedUserId");

            migrationBuilder.RenameIndex(
                name: "IX_RoomBans_UserId",
                table: "RoomBans",
                newName: "IX_RoomBans_BannedUserId");

            migrationBuilder.RenameColumn(
                name: "UpdatedAt",
                table: "ReadMarkers",
                newName: "LastReadAt");

            migrationBuilder.AlterColumn<string>(
                name: "Reason",
                table: "RoomBans",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(1024)",
                oldMaxLength: 1024);

            migrationBuilder.AddColumn<Guid>(
                name: "RevokedByUserId",
                table: "RoomBans",
                type: "uuid",
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "ContextType",
                table: "ReadMarkers",
                type: "character varying(10)",
                maxLength: 10,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(8)",
                oldMaxLength: 8);

            migrationBuilder.AddColumn<Guid>(
                name: "LastReadMessageId",
                table: "ReadMarkers",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_RoomBans_RevokedByUserId",
                table: "RoomBans",
                column: "RevokedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_RoomBans_RoomId_BannedUserId",
                table: "RoomBans",
                columns: new[] { "RoomId", "BannedUserId" },
                filter: "\"RevokedAt\" IS NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_RoomBans_Users_BannedUserId",
                table: "RoomBans",
                column: "BannedUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_RoomBans_Users_RevokedByUserId",
                table: "RoomBans",
                column: "RevokedByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_RoomBans_Users_BannedUserId",
                table: "RoomBans");

            migrationBuilder.DropForeignKey(
                name: "FK_RoomBans_Users_RevokedByUserId",
                table: "RoomBans");

            migrationBuilder.DropIndex(
                name: "IX_RoomBans_RevokedByUserId",
                table: "RoomBans");

            migrationBuilder.DropIndex(
                name: "IX_RoomBans_RoomId_BannedUserId",
                table: "RoomBans");

            migrationBuilder.DropColumn(
                name: "RevokedByUserId",
                table: "RoomBans");

            migrationBuilder.DropColumn(
                name: "LastReadMessageId",
                table: "ReadMarkers");

            migrationBuilder.RenameColumn(
                name: "BannedUserId",
                table: "RoomBans",
                newName: "UserId");

            migrationBuilder.RenameIndex(
                name: "IX_RoomBans_BannedUserId",
                table: "RoomBans",
                newName: "IX_RoomBans_UserId");

            migrationBuilder.RenameColumn(
                name: "LastReadAt",
                table: "ReadMarkers",
                newName: "UpdatedAt");

            migrationBuilder.AlterColumn<string>(
                name: "Reason",
                table: "RoomBans",
                type: "character varying(1024)",
                maxLength: 1024,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "character varying(500)",
                oldMaxLength: 500,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "ContextType",
                table: "ReadMarkers",
                type: "character varying(8)",
                maxLength: 8,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(10)",
                oldMaxLength: 10);

            migrationBuilder.AddColumn<long>(
                name: "LastReadSequenceNumber",
                table: "ReadMarkers",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.CreateIndex(
                name: "IX_RoomBans_RoomId",
                table: "RoomBans",
                column: "RoomId");

            migrationBuilder.AddForeignKey(
                name: "FK_RoomBans_Users_UserId",
                table: "RoomBans",
                column: "UserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
