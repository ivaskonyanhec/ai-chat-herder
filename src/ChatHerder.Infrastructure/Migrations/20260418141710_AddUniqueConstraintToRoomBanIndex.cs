using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ChatHerder.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddUniqueConstraintToRoomBanIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_RoomBans_RoomId_BannedUserId",
                table: "RoomBans");

            migrationBuilder.CreateIndex(
                name: "IX_RoomBans_RoomId_BannedUserId",
                table: "RoomBans",
                columns: new[] { "RoomId", "BannedUserId" },
                unique: true,
                filter: "\"RevokedAt\" IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_RoomBans_RoomId_BannedUserId",
                table: "RoomBans");

            migrationBuilder.CreateIndex(
                name: "IX_RoomBans_RoomId_BannedUserId",
                table: "RoomBans",
                columns: new[] { "RoomId", "BannedUserId" },
                filter: "\"RevokedAt\" IS NULL");
        }
    }
}
