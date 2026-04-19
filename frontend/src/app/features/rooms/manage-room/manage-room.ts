import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { RoomsApiService } from '../../../core/rooms/rooms-api.service';
import { RoomsAdminApiService } from '../../../core/rooms/rooms-admin-api.service';
import type { RoomDto, RoomMemberDto, RoomBanDto, RoomInvitationDto } from '../../../core/rooms/rooms.models';

type Tab = 'members' | 'admins' | 'banned' | 'invitations' | 'settings';

@Component({
  selector: 'app-manage-room',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './manage-room.html',
  styleUrl: './manage-room.scss',
})
export class ManageRoomComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authSession = inject(AuthSessionService);
  private readonly roomsApi = inject(RoomsApiService);
  private readonly adminApi = inject(RoomsAdminApiService);

  readonly user = this.authSession.user;
  readonly roomId = this.route.snapshot.params['id'] as string;

  readonly activeTab = signal<Tab>('members');
  readonly room = signal<RoomDto | null>(null);
  readonly members = signal<RoomMemberDto[]>([]);
  readonly bans = signal<RoomBanDto[]>([]);
  readonly invitations = signal<RoomInvitationDto[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  readonly admins = computed(() => this.members().filter(m => m.role === 'Admin'));

  editName = '';
  editDescription = '';
  editVisibility: 'Public' | 'Private' = 'Public';
  inviteUsername = '';

  ngOnInit(): void {
    this.roomsApi.getRoom(this.roomId).subscribe({
      next: room => {
        this.room.set(room);
        this.editName = room.name;
        this.editDescription = room.description ?? '';
        this.editVisibility = room.visibility;
      },
    });
    this.loadMembers();
  }

  switchTab(tab: Tab): void {
    this.activeTab.set(tab);
    this.errorMessage.set('');
    if (tab === 'banned' && this.bans().length === 0) this.loadBans();
    if (tab === 'invitations' && this.invitations().length === 0) this.loadInvitations();
  }

  banMember(userId: string): void {
    this.adminApi.banMember(this.roomId, userId, 'Removed by admin').subscribe({
      next: () => this.loadMembers(),
      error: () => this.errorMessage.set('Failed to ban member.'),
    });
  }

  unbanMember(userId: string): void {
    this.adminApi.unbanMember(this.roomId, userId).subscribe({
      next: () => { this.loadBans(); this.loadMembers(); },
      error: () => this.errorMessage.set('Failed to unban member.'),
    });
  }

  makeAdmin(userId: string): void {
    this.adminApi.makeAdmin(this.roomId, userId).subscribe({
      next: () => this.loadMembers(),
      error: () => this.errorMessage.set('Failed to make admin.'),
    });
  }

  demoteAdmin(userId: string): void {
    this.adminApi.demoteAdmin(this.roomId, userId).subscribe({
      next: () => this.loadMembers(),
      error: () => this.errorMessage.set('Failed to demote admin.'),
    });
  }

  sendInvitation(): void {
    if (!this.inviteUsername.trim()) return;
    this.adminApi.sendInvitation(this.roomId, this.inviteUsername.trim()).subscribe({
      next: () => {
        this.inviteUsername = '';
        this.loadInvitations();
      },
      error: () => this.errorMessage.set('Failed to send invitation. Check the username.'),
    });
  }

  saveSettings(): void {
    this.adminApi.updateRoom(this.roomId, {
      name:        this.editName.trim() || null,
      description: this.editDescription.trim() || null,
      visibility:  this.editVisibility,
    }).subscribe({
      next: room => this.room.set(room),
      error: () => this.errorMessage.set('Failed to save settings.'),
    });
  }

  deleteRoom(): void {
    if (!confirm(`Delete room "${this.room()?.name}"? This cannot be undone.`)) return;
    this.adminApi.deleteRoom(this.roomId).subscribe({
      next: () => void this.router.navigateByUrl('/app/rooms'),
      error: () => this.errorMessage.set('Failed to delete room.'),
    });
  }

  close(): void {
    void this.router.navigateByUrl(`/app/rooms/${this.roomId}`);
  }

  private loadMembers(): void {
    this.isLoading.set(true);
    this.roomsApi.getMembers(this.roomId)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({ next: m => this.members.set(m) });
  }

  private loadBans(): void {
    this.adminApi.getBans(this.roomId).subscribe({ next: b => this.bans.set(b) });
  }

  private loadInvitations(): void {
    this.adminApi.getInvitations(this.roomId).subscribe({ next: i => this.invitations.set(i) });
  }
}
