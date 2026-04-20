// frontend/src/app/shared/avatar/avatar.component.spec.ts
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AvatarComponent } from './avatar.component';
import { FilesApiService } from '../../core/files/files-api.service';

describe('AvatarComponent', () => {
  const mockFiles = { getFileBlob: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFiles.getFileBlob.mockReturnValue(of(new Blob(['x'], { type: 'image/png' })));
    TestBed.configureTestingModule({
      imports: [AvatarComponent],
      providers: [{ provide: FilesApiService, useValue: mockFiles }],
    });
  });

  it('shows initials when avatarUrl is null', async () => {
    const fixture = TestBed.createComponent(AvatarComponent);
    fixture.componentRef.setInput('avatarUrl', null);
    fixture.componentRef.setInput('username', 'Alice');
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement.querySelector('[data-testid="avatar-initials"]');
    expect(el).toBeTruthy();
    expect(el.textContent.trim()).toBe('A');
  });

  it('shows Material Symbol when avatarUrl is icon:star', async () => {
    const fixture = TestBed.createComponent(AvatarComponent);
    fixture.componentRef.setInput('avatarUrl', 'icon:star');
    fixture.componentRef.setInput('username', 'Bob');
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement.querySelector('[data-testid="avatar-icon"]');
    expect(el).toBeTruthy();
    expect(el.textContent.trim()).toBe('star');
  });

  it('calls FilesApiService.getFileBlob for /api/files/* URL', async () => {
    mockFiles.getFileBlob.mockReturnValue(of(new Blob()));
    const fixture = TestBed.createComponent(AvatarComponent);
    fixture.componentRef.setInput('avatarUrl', '/api/files/abc-123');
    fixture.componentRef.setInput('username', 'Charlie');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(mockFiles.getFileBlob).toHaveBeenCalledWith('abc-123');
  });

  it('renders <img> for a plain external URL', async () => {
    const fixture = TestBed.createComponent(AvatarComponent);
    fixture.componentRef.setInput('avatarUrl', 'https://example.com/pic.png');
    fixture.componentRef.setInput('username', 'Dave');
    fixture.detectChanges();
    await fixture.whenStable();
    const img = fixture.nativeElement.querySelector('[data-testid="avatar-img"]') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toContain('example.com');
  });

  it('falls back to initials while blob is loading', () => {
    mockFiles.getFileBlob.mockReturnValue(new Promise(() => {})); // never resolves
    const fixture = TestBed.createComponent(AvatarComponent);
    fixture.componentRef.setInput('avatarUrl', '/api/files/xyz');
    fixture.componentRef.setInput('username', 'Eve');
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="avatar-initials"]');
    expect(el).toBeTruthy();
  });
});
