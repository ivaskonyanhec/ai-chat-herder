using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ChatHerder.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddMessageEditDeleteFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "AttachmentId",
                table: "PersonalDialogMessages",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "EditedAt",
                table: "PersonalDialogMessages",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "AttachmentId",
                table: "Messages",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByUserId",
                table: "Messages",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "EditedAt",
                table: "Messages",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PersonalDialogMessages_AttachmentId",
                table: "PersonalDialogMessages",
                column: "AttachmentId");

            migrationBuilder.CreateIndex(
                name: "IX_Messages_AttachmentId",
                table: "Messages",
                column: "AttachmentId");

            migrationBuilder.CreateIndex(
                name: "IX_Messages_DeletedByUserId",
                table: "Messages",
                column: "DeletedByUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Messages_Attachments_AttachmentId",
                table: "Messages",
                column: "AttachmentId",
                principalTable: "Attachments",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Messages_Users_DeletedByUserId",
                table: "Messages",
                column: "DeletedByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_PersonalDialogMessages_Attachments_AttachmentId",
                table: "PersonalDialogMessages",
                column: "AttachmentId",
                principalTable: "Attachments",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Messages_Attachments_AttachmentId",
                table: "Messages");

            migrationBuilder.DropForeignKey(
                name: "FK_Messages_Users_DeletedByUserId",
                table: "Messages");

            migrationBuilder.DropForeignKey(
                name: "FK_PersonalDialogMessages_Attachments_AttachmentId",
                table: "PersonalDialogMessages");

            migrationBuilder.DropIndex(
                name: "IX_PersonalDialogMessages_AttachmentId",
                table: "PersonalDialogMessages");

            migrationBuilder.DropIndex(
                name: "IX_Messages_AttachmentId",
                table: "Messages");

            migrationBuilder.DropIndex(
                name: "IX_Messages_DeletedByUserId",
                table: "Messages");

            migrationBuilder.DropColumn(
                name: "AttachmentId",
                table: "PersonalDialogMessages");

            migrationBuilder.DropColumn(
                name: "EditedAt",
                table: "PersonalDialogMessages");

            migrationBuilder.DropColumn(
                name: "AttachmentId",
                table: "Messages");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                table: "Messages");

            migrationBuilder.DropColumn(
                name: "EditedAt",
                table: "Messages");
        }
    }
}
