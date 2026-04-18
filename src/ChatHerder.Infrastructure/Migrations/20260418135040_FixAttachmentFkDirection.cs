using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ChatHerder.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FixAttachmentFkDirection : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Messages_Attachments_AttachmentId",
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
                name: "IX_Attachments_MessageId",
                table: "Attachments");

            migrationBuilder.DropIndex(
                name: "IX_Attachments_PersonalDialogMessageId",
                table: "Attachments");

            migrationBuilder.DropColumn(
                name: "AttachmentId",
                table: "PersonalDialogMessages");

            migrationBuilder.DropColumn(
                name: "AttachmentId",
                table: "Messages");

            migrationBuilder.CreateIndex(
                name: "IX_Attachments_MessageId",
                table: "Attachments",
                column: "MessageId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Attachments_PersonalDialogMessageId",
                table: "Attachments",
                column: "PersonalDialogMessageId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Attachments_MessageId",
                table: "Attachments");

            migrationBuilder.DropIndex(
                name: "IX_Attachments_PersonalDialogMessageId",
                table: "Attachments");

            migrationBuilder.AddColumn<Guid>(
                name: "AttachmentId",
                table: "PersonalDialogMessages",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "AttachmentId",
                table: "Messages",
                type: "uuid",
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
                name: "IX_Attachments_MessageId",
                table: "Attachments",
                column: "MessageId");

            migrationBuilder.CreateIndex(
                name: "IX_Attachments_PersonalDialogMessageId",
                table: "Attachments",
                column: "PersonalDialogMessageId");

            migrationBuilder.AddForeignKey(
                name: "FK_Messages_Attachments_AttachmentId",
                table: "Messages",
                column: "AttachmentId",
                principalTable: "Attachments",
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
    }
}
