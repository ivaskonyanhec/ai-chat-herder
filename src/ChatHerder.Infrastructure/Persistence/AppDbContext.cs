using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.Infrastructure.Persistence;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Session> Sessions => Set<Session>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();
    public DbSet<PlatformBan> PlatformBans => Set<PlatformBan>();
    public DbSet<Room> Rooms => Set<Room>();
    public DbSet<RoomMembership> RoomMemberships => Set<RoomMembership>();
    public DbSet<RoomBan> RoomBans => Set<RoomBan>();
    public DbSet<RoomInvitation> RoomInvitations => Set<RoomInvitation>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<Attachment> Attachments => Set<Attachment>();
    public DbSet<PersonalDialog> PersonalDialogs => Set<PersonalDialog>();
    public DbSet<PersonalDialogMessage> PersonalDialogMessages => Set<PersonalDialogMessage>();
    public DbSet<FriendRequest> FriendRequests => Set<FriendRequest>();
    public DbSet<Friendship> Friendships => Set<Friendship>();
    public DbSet<UserBlock> UserBlocks => Set<UserBlock>();
    public DbSet<ReadMarker> ReadMarkers => Set<ReadMarker>();
    public DbSet<ContextSequences> ContextSequences => Set<ContextSequences>();
    public DbSet<ActivityLog> ActivityLogs => Set<ActivityLog>();
    public DbSet<MessageReaction> MessageReactions => Set<MessageReaction>();

    protected override void OnModelCreating(ModelBuilder m)
    {
        // ── Users ──────────────────────────────────────────────────────────────
        m.Entity<User>(e =>
        {
            e.HasKey(u => u.Id);
            e.HasIndex(u => u.Username).IsUnique();
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.Username).HasMaxLength(32).IsRequired();
            e.Property(u => u.Email).HasMaxLength(254).IsRequired();
            e.Property(u => u.PasswordHash).HasMaxLength(512).IsRequired();
            e.Property(u => u.AvatarUrl).HasMaxLength(2048);
        });

        // ── Sessions ───────────────────────────────────────────────────────────
        m.Entity<Session>(e =>
        {
            e.HasKey(s => s.Id);
            e.HasIndex(s => s.RefreshToken).IsUnique();
            e.Property(s => s.RefreshToken).HasMaxLength(128).IsRequired();
            e.Property(s => s.UserAgent).HasMaxLength(512).IsRequired();
            e.Property(s => s.IpAddress).HasMaxLength(45).IsRequired();
            e.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── PasswordResetTokens ────────────────────────────────────────────────
        m.Entity<PasswordResetToken>(e =>
        {
            e.HasKey(t => t.Id);
            e.HasIndex(t => t.TokenHash).IsUnique();
            e.Property(t => t.TokenHash).HasMaxLength(64).IsRequired();
            e.HasOne(t => t.User).WithMany().HasForeignKey(t => t.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── PlatformBans ───────────────────────────────────────────────────────
        m.Entity<PlatformBan>(e =>
        {
            e.HasKey(b => b.Id);
            e.Property(b => b.Reason).HasMaxLength(1024).IsRequired();
            e.HasOne(b => b.User).WithMany().HasForeignKey(b => b.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(b => b.IssuedByAdmin).WithMany().HasForeignKey(b => b.IssuedByAdminId).OnDelete(DeleteBehavior.Restrict);
        });

        // ── Rooms ──────────────────────────────────────────────────────────────
        m.Entity<Room>(e =>
        {
            e.HasKey(r => r.Id);
            e.HasIndex(r => r.Name).IsUnique();
            e.Property(r => r.Name).HasMaxLength(64).IsRequired();
            e.Property(r => r.Description).HasMaxLength(512);
            e.Property(r => r.Visibility).HasConversion<string>().HasMaxLength(16).IsRequired();
            e.HasOne(r => r.Owner).WithMany().HasForeignKey(r => r.OwnerId).OnDelete(DeleteBehavior.Restrict);
        });

        // ── RoomMemberships ────────────────────────────────────────────────────
        m.Entity<RoomMembership>(e =>
        {
            e.HasKey(rm => rm.Id);
            e.HasIndex(rm => new { rm.RoomId, rm.UserId }).IsUnique();
            e.Property(rm => rm.Role).HasConversion<string>().HasMaxLength(16).IsRequired();
            e.HasOne(rm => rm.Room).WithMany().HasForeignKey(rm => rm.RoomId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(rm => rm.User).WithMany().HasForeignKey(rm => rm.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── RoomBans ───────────────────────────────────────────────────────────
        m.Entity<RoomBan>(e =>
        {
            e.HasKey(b => b.Id);
            e.HasIndex(b => new { b.RoomId, b.BannedUserId }).IsUnique().HasFilter("\"RevokedAt\" IS NULL");
            e.Property(b => b.Reason).HasMaxLength(500);
            e.HasOne(b => b.Room).WithMany().HasForeignKey(b => b.RoomId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(b => b.BannedUser).WithMany().HasForeignKey(b => b.BannedUserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(b => b.BannedByUser).WithMany().HasForeignKey(b => b.BannedByUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<User>().WithMany().HasForeignKey(b => b.RevokedByUserId).OnDelete(DeleteBehavior.SetNull);
        });

        // ── RoomInvitations ────────────────────────────────────────────────────
        m.Entity<RoomInvitation>(e =>
        {
            e.HasKey(i => i.Id);
            e.Property(i => i.Status).HasConversion<string>().HasMaxLength(16).IsRequired();
            e.HasOne(i => i.Room).WithMany().HasForeignKey(i => i.RoomId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(i => i.InvitedUser).WithMany().HasForeignKey(i => i.InvitedUserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(i => i.InvitedByUser).WithMany().HasForeignKey(i => i.InvitedByUserId).OnDelete(DeleteBehavior.Restrict);
        });

        // ── Messages ───────────────────────────────────────────────────────────
        m.Entity<Message>(e =>
        {
            e.HasKey(msg => msg.Id);
            e.HasIndex(msg => new { msg.RoomId, msg.SequenceNumber }).IsUnique(); // gap-detection invariant
            e.Property(msg => msg.Content).HasMaxLength(3072).IsRequired();       // 3 KB limit
            e.Property(msg => msg.EditedAt);
            e.Property(msg => msg.DeletedByUserId);
            e.HasOne(msg => msg.Room).WithMany().HasForeignKey(msg => msg.RoomId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(msg => msg.Author).WithMany().HasForeignKey(msg => msg.AuthorId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(msg => msg.ReplyToMessage).WithMany().HasForeignKey(msg => msg.ReplyToMessageId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne<User>().WithMany().HasForeignKey(msg => msg.DeletedByUserId).OnDelete(DeleteBehavior.SetNull);
        });

        // ── Attachments ────────────────────────────────────────────────────────
        m.Entity<Attachment>(e =>
        {
            e.HasKey(a => a.Id);
            e.Property(a => a.StoragePath).HasMaxLength(1024).IsRequired();
            e.Property(a => a.FileName).HasMaxLength(255).IsRequired();
            e.Property(a => a.ContentType).HasMaxLength(255).IsRequired();
            e.Property(a => a.Comment).HasMaxLength(512);
            e.HasOne(a => a.Message).WithOne(msg => msg.Attachment).HasForeignKey<Attachment>(a => a.MessageId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(a => a.PersonalDialogMessage).WithOne(dm => dm.Attachment).HasForeignKey<Attachment>(a => a.PersonalDialogMessageId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(a => a.UploadedByUser).WithMany().HasForeignKey(a => a.UploadedByUserId).OnDelete(DeleteBehavior.Restrict);
        });

        // ── PersonalDialogs ────────────────────────────────────────────────────
        m.Entity<PersonalDialog>(e =>
        {
            e.HasKey(d => d.Id);
            e.HasIndex(d => new { d.User1Id, d.User2Id }).IsUnique(); // User1Id < User2Id enforced in app layer
            e.HasOne(d => d.User1).WithMany().HasForeignKey(d => d.User1Id).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(d => d.User2).WithMany().HasForeignKey(d => d.User2Id).OnDelete(DeleteBehavior.Restrict);
        });

        // ── PersonalDialogMessages ─────────────────────────────────────────────
        m.Entity<PersonalDialogMessage>(e =>
        {
            e.HasKey(dm => dm.Id);
            e.HasIndex(dm => new { dm.DialogId, dm.SequenceNumber }).IsUnique();
            e.Property(dm => dm.Content).HasMaxLength(3072).IsRequired();
            e.Property(dm => dm.EditedAt);
            e.Property(dm => dm.DeletedByUserId);
            e.HasOne<User>().WithMany().HasForeignKey(dm => dm.DeletedByUserId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(dm => dm.Dialog).WithMany().HasForeignKey(dm => dm.DialogId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(dm => dm.Author).WithMany().HasForeignKey(dm => dm.AuthorId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(dm => dm.ReplyToMessage).WithMany().HasForeignKey(dm => dm.ReplyToMessageId).OnDelete(DeleteBehavior.SetNull);
        });

        // ── FriendRequests ─────────────────────────────────────────────────────
        m.Entity<FriendRequest>(e =>
        {
            e.HasKey(fr => fr.Id);
            e.Property(fr => fr.Status).HasConversion<string>().HasMaxLength(16).IsRequired();
            e.Property(fr => fr.Message).HasMaxLength(280);
            e.HasOne(fr => fr.Sender).WithMany().HasForeignKey(fr => fr.SenderId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(fr => fr.Receiver).WithMany().HasForeignKey(fr => fr.ReceiverId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── Friendships ────────────────────────────────────────────────────────
        m.Entity<Friendship>(e =>
        {
            e.HasKey(f => f.Id);
            e.HasIndex(f => new { f.User1Id, f.User2Id }).IsUnique();
            e.HasOne(f => f.User1).WithMany().HasForeignKey(f => f.User1Id).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(f => f.User2).WithMany().HasForeignKey(f => f.User2Id).OnDelete(DeleteBehavior.Cascade);
        });

        // ── UserBlocks ─────────────────────────────────────────────────────────
        m.Entity<UserBlock>(e =>
        {
            e.HasKey(ub => ub.Id);
            e.HasIndex(ub => new { ub.BlockerId, ub.BlockedUserId }).IsUnique();
            e.HasIndex(ub => ub.BlockedUserId);  // reverse lookup: "who blocked me?"
            e.HasOne(ub => ub.Blocker).WithMany().HasForeignKey(ub => ub.BlockerId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(ub => ub.BlockedUser).WithMany().HasForeignKey(ub => ub.BlockedUserId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── ReadMarkers ────────────────────────────────────────────────────────
        m.Entity<ReadMarker>(e =>
        {
            e.HasKey(r => r.Id);
            e.HasIndex(r => new { r.UserId, r.ContextType, r.ContextId }).IsUnique();
            e.Property(r => r.ContextType).HasMaxLength(10).IsRequired();
            e.HasOne(r => r.User).WithMany().HasForeignKey(r => r.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── ContextSequences ───────────────────────────────────────────────────
        m.Entity<ContextSequences>(e =>
        {
            e.HasKey(cs => new { cs.ContextType, cs.ContextId }); // composite PK
            e.Property(cs => cs.ContextType).HasConversion<string>().HasMaxLength(8).IsRequired();
        });

        // ── ActivityLogs ───────────────────────────────────────────────────────
        m.Entity<ActivityLog>(e =>
        {
            e.HasKey(al => al.Id);
            e.HasIndex(al => al.EventType);
            e.Property(al => al.EventType).HasMaxLength(64).IsRequired();
            e.Property(al => al.Payload).HasColumnType("jsonb").IsRequired();
        });

        // ── MessageReactions ───────────────────────────────────────────────────
        m.Entity<MessageReaction>(e =>
        {
            e.HasKey(r => r.Id);
            e.HasIndex(r => new { r.MessageId, r.UserId, r.Emoji }).IsUnique();
            e.HasIndex(r => r.MessageId);
            e.Property(r => r.Emoji).HasMaxLength(16).IsRequired();
            e.HasOne(r => r.Message).WithMany().HasForeignKey(r => r.MessageId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(r => r.User).WithMany().HasForeignKey(r => r.UserId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
