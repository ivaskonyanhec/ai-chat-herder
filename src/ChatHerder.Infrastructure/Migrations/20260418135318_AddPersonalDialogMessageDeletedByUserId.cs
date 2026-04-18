using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ChatHerder.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPersonalDialogMessageDeletedByUserId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByUserId",
                table: "PersonalDialogMessages",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PersonalDialogMessages_DeletedByUserId",
                table: "PersonalDialogMessages",
                column: "DeletedByUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_PersonalDialogMessages_Users_DeletedByUserId",
                table: "PersonalDialogMessages",
                column: "DeletedByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PersonalDialogMessages_Users_DeletedByUserId",
                table: "PersonalDialogMessages");

            migrationBuilder.DropIndex(
                name: "IX_PersonalDialogMessages_DeletedByUserId",
                table: "PersonalDialogMessages");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                table: "PersonalDialogMessages");
        }
    }
}
