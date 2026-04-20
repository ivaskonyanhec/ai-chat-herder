import { Component, signal, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { finalize } from 'rxjs';
import { AvatarComponent } from '../../../shared/avatar/avatar.component';
import { BlocksApiService } from '../../../core/blocks/blocks-api.service';
import type { BlockDto } from '../../../core/blocks/blocks.models';

@Component({
  selector: 'app-blocked-users',
  standalone: true,
  imports: [DatePipe, AvatarComponent],
  templateUrl: './blocked-users.html',
  host: { class: 'block flex-1 min-h-0 overflow-hidden' },
})
export class BlockedUsersComponent {
  private readonly blocksApi = inject(BlocksApiService);

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly blocks = signal<BlockDto[]>([]);
  readonly unblockingId = signal<string | null>(null);

  constructor() {
    this.loadBlocks();
  }

  unblock(userId: string): void {
    if (this.unblockingId()) return;
    this.unblockingId.set(userId);
    this.blocksApi.unblockUser(userId)
      .pipe(finalize(() => this.unblockingId.set(null)))
      .subscribe({
        next: () => this.blocks.update(list => list.filter(b => b.blockedUserId !== userId)),
        error: () => this.errorMessage.set('Unable to unblock user right now.'),
      });
  }

  private loadBlocks(): void {
    this.isLoading.set(true);
    this.blocksApi.getBlocks()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: blocks => this.blocks.set(blocks),
        error: () => this.errorMessage.set('Unable to load blocked users.'),
      });
  }
}
