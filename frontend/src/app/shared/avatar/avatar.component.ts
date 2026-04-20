// frontend/src/app/shared/avatar/avatar.component.ts
import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';
import { FilesApiService } from '../../core/files/files-api.service';

const PALETTE = ['#7c3aed','#2563eb','#0891b2','#16a34a','#ca8a04','#dc2626','#db2777','#9333ea'];

function hashColor(str: string): string {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return PALETTE[h % PALETTE.length];
}

@Component({
  selector: 'app-avatar',
  standalone: true,
  templateUrl: './avatar.component.html',
})
export class AvatarComponent {
  private readonly filesApi = inject(FilesApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly avatarUrl = input<string | null>(null);
  readonly username = input<string>('?');
  // Pixel size — avoids Tailwind dynamic class purging
  readonly sizePx = input<number>(32);

  readonly objectUrl = signal<string | null>(null);
  private blobUrl: string | null = null;

  readonly mode = computed<'initials' | 'icon' | 'blob' | 'img'>(() => {
    const url = this.avatarUrl();
    if (!url) return 'initials';
    if (url.startsWith('icon:')) return 'icon';
    if (url.startsWith('/api/files/')) return 'blob';
    return 'img';
  });

  readonly iconName = computed(() => this.avatarUrl()?.startsWith('icon:') ? this.avatarUrl()!.slice(5) : '');
  readonly initials = computed(() => (this.username()[0] ?? '?').toUpperCase());
  readonly bgColor = computed(() => hashColor(this.username()));
  readonly textSizePx = computed(() => Math.max(10, Math.round(this.sizePx() * 0.44)));

  constructor() {
    toObservable(this.avatarUrl)
      .pipe(
        switchMap(url => {
          this.revoke();
          if (!url?.startsWith('/api/files/')) return of(null);
          const id = url.slice('/api/files/'.length);
          return this.filesApi.getFileBlob(id).pipe(
            catchError(() => of(null)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(blob => {
        if (blob) {
          this.blobUrl = URL.createObjectURL(blob);
          this.objectUrl.set(this.blobUrl);
        } else {
          this.objectUrl.set(null);
        }
      });
    this.destroyRef.onDestroy(() => this.revoke());
  }

  private revoke(): void {
    if (!this.blobUrl) return;
    URL.revokeObjectURL(this.blobUrl);
    this.blobUrl = null;
    this.objectUrl.set(null);
  }
}
