# UI Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement collapsible sidebar (icon strip), WYSIWYG composer (bold/italic/code), reply/citation UI, persisted message reactions (backend + frontend), and favicon/title update.

**Architecture:** Frontend-first features (favicon, sidebar, composer, reply) are pure Angular Signals + Tailwind with no new backend. Reactions add a `MessageReactions` table, a toggle endpoint on `/api/messages/{id}/reactions`, a `ReactionToggled` SignalR event through the existing ChatHub group, and a reactions emoji picker + pill UI in `RoomChatComponent`. A shared `parseInlineMarkdown` / `serializeToMarkdown` utility handles the marker ↔ HTML conversion used by both the composer and message display.

**Tech Stack:** Angular 21 (Signals, ViewChild, contenteditable), Tailwind v4, .NET 10 + EF Core (SQLite for unit tests), SignalR, Vitest (Angular), xUnit + NSubstitute + SQLite in-memory (.NET).

**Spec:** `docs/superpowers/specs/2026-04-19-ui-enhancements-design.md`

---

## File Map

### Create
| File | Purpose |
|---|---|
| `frontend/public/favicon.svg` | SVG chat-bubble favicon |
| `frontend/src/app/shared/utils/inline-markdown.ts` | `parseInlineMarkdown`, `serializeToMarkdown`, `markersToHtml` |
| `frontend/src/app/shared/utils/inline-markdown.spec.ts` | Vitest unit tests for the utility |
| `frontend/src/app/shared/utils/reaction-emojis.ts` | `REACTION_EMOJIS` categories + `EMOJI_NAMES` lookup map |
| `frontend/src/app/core/reactions/reactions-api.service.ts` | `toggleReaction(messageId, emoji)` HTTP call |
| `src/ChatHerder.Domain/Entities/MessageReaction.cs` | EF Core entity |
| `tests/ChatHerder.Unit.Tests/Endpoints/ReactionEndpointsTests.cs` | xUnit tests for the toggle endpoint |

### Modify
| File | Change |
|---|---|
| `frontend/src/index.html` | Title → "AI Chat Herder"; SVG favicon link |
| `frontend/src/app/app.ts` | Inject `Title` service, call `setTitle` |
| `frontend/src/app/features/workspace/workspace-shell.component.ts` | Add `sidebarCollapsed` signal + toggle/localStorage methods |
| `frontend/src/app/features/workspace/workspace-shell.component.html` | Full sidebar collapse UI (icon strip vs expanded) |
| `frontend/src/app/features/workspace/workspace-shell.component.spec.ts` | Sidebar collapse unit tests |
| `frontend/src/app/features/rooms/room-chat/room-chat.ts` | Replace textarea with contenteditable, add `replyingTo`, `reactionPickerMsgId`, `toggleReaction` |
| `frontend/src/app/features/rooms/room-chat/room-chat.html` | Contenteditable composer, action bar, reply banner, reaction pills, emoji picker |
| `frontend/src/app/features/rooms/room-chat/room-chat.spec.ts` | Composer, reply, reaction tests |
| `frontend/src/app/features/dialogs/direct-messages/direct-messages.ts` | Contenteditable + replyingTo (same pattern) |
| `frontend/src/app/features/dialogs/direct-messages/direct-messages.html` | DM composer + action bar + reply banner |
| `frontend/src/app/core/signalr/hub.models.ts` | Add `ReactionSummaryDto`, `ReactionToggledEvent`; extend `MessageDto.reactions`; extend `RoomChatEvent` union |
| `frontend/src/app/core/signalr/chat.service.ts` | Register `ReactionToggled` handler |
| `src/ChatHerder.Infrastructure/Persistence/AppDbContext.cs` | Add `DbSet<MessageReaction>` + `OnModelCreating` config |
| `src/ChatHerder.Application/DTOs/MessageDtos.cs` | Add `ReactionSummaryDto` record; add `Reactions` param to `MessageDto` |
| `src/ChatHerder.API/Endpoints/MessageEndpoints.cs` | Add `ToggleReaction` endpoint + `ToggleReactionRequest` DTO |
| `src/ChatHerder.API/Endpoints/RoomEndpoints.cs` | Update `ToDto` + `GetMessages` to include reactions |

---

## Task 1: Favicon + App Title

**Files:**
- Modify: `frontend/src/index.html`
- Create: `frontend/public/favicon.svg`
- Modify: `frontend/src/app/app.ts`

- [ ] **Step 1: Create SVG favicon**

Create `frontend/public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <!-- Speech bubble body -->
  <rect x="2" y="2" width="28" height="22" rx="5" ry="5" fill="#545f73"/>
  <!-- Tail (bottom-left pointer) -->
  <path d="M6 24 L2 30 L12 24 Z" fill="#545f73"/>
  <!-- Three ellipsis dots -->
  <circle cx="10" cy="13" r="2.5" fill="white"/>
  <circle cx="16" cy="13" r="2.5" fill="white"/>
  <circle cx="22" cy="13" r="2.5" fill="white"/>
</svg>
```

- [ ] **Step 2: Update index.html**

Replace `frontend/src/index.html` with:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>AI Chat Herder</title>
  <base href="/">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="icon" href="favicon.ico" sizes="any">
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" rel="stylesheet">
</head>
<body>
  <app-root></app-root>
</body>
</html>
```

- [ ] **Step 3: Set title via Angular Title service**

Replace `frontend/src/app/app.ts` with:

```typescript
import { Component, inject, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly title = inject(Title);

  ngOnInit(): void {
    this.title.setTitle('AI Chat Herder');
  }
}
```

- [ ] **Step 4: Verify in browser**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

Open the app. Browser tab should read "AI Chat Herder" and the favicon should show the slate chat bubble.

- [ ] **Step 5: Commit**

```bash
git add frontend/public/favicon.svg frontend/src/index.html frontend/src/app/app.ts
git commit -m "feat: add AI Chat Herder favicon and title"
```

---

## Task 2: Inline Markdown Utility (TDD)

**Files:**
- Create: `frontend/src/app/shared/utils/inline-markdown.ts`
- Create: `frontend/src/app/shared/utils/inline-markdown.spec.ts`

- [ ] **Step 1: Create the shared/utils directory and write failing tests**

Create `frontend/src/app/shared/utils/inline-markdown.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseInlineMarkdown, serializeToMarkdown, markersToHtml } from './inline-markdown';

describe('parseInlineMarkdown', () => {
  it('converts **text** to <strong>', () => {
    expect(parseInlineMarkdown('hello **world**')).toBe('hello <strong>world</strong>');
  });

  it('converts _text_ to <em>', () => {
    expect(parseInlineMarkdown('hello _world_')).toBe('hello <em>world</em>');
  });

  it('converts `text` to <code>', () => {
    expect(parseInlineMarkdown('run `npm install`')).toBe('run <code>npm install</code>');
  });

  it('escapes HTML before rendering to prevent XSS', () => {
    expect(parseInlineMarkdown('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });

  it('handles plain text unchanged', () => {
    expect(parseInlineMarkdown('hello world')).toBe('hello world');
  });

  it('handles mixed formatting', () => {
    expect(parseInlineMarkdown('**bold** and _italic_ and `code`')).toBe(
      '<strong>bold</strong> and <em>italic</em> and <code>code</code>'
    );
  });
});

describe('serializeToMarkdown', () => {
  it('converts <strong> to **markers**', () => {
    expect(serializeToMarkdown('<strong>bold</strong>')).toBe('**bold**');
  });

  it('converts <b> to **markers**', () => {
    expect(serializeToMarkdown('<b>bold</b>')).toBe('**bold**');
  });

  it('converts <em> to _markers_', () => {
    expect(serializeToMarkdown('<em>italic</em>')).toBe('_italic_');
  });

  it('converts <i> to _markers_', () => {
    expect(serializeToMarkdown('<i>italic</i>')).toBe('_italic_');
  });

  it('converts <code> to backtick markers', () => {
    expect(serializeToMarkdown('<code>npm install</code>')).toBe('`npm install`');
  });

  it('converts <div> to newline', () => {
    expect(serializeToMarkdown('line1<div>line2</div>')).toBe('line1\nline2');
  });

  it('strips unknown tags', () => {
    expect(serializeToMarkdown('<span>text</span>')).toBe('text');
  });

  it('decodes HTML entities', () => {
    expect(serializeToMarkdown('&amp;lt;&gt;')).toBe('&lt;>');
  });
});

describe('markersToHtml', () => {
  it('converts **markers** to <strong>', () => {
    expect(markersToHtml('**bold**')).toBe('<strong>bold</strong>');
  });

  it('converts _markers_ to <em>', () => {
    expect(markersToHtml('_italic_')).toBe('<em>italic</em>');
  });

  it('converts backtick markers to <code>', () => {
    expect(markersToHtml('`code`')).toBe('<code>code</code>');
  });

  it('converts newlines to <br>', () => {
    expect(markersToHtml('line1\nline2')).toBe('line1<br>line2');
  });
});
```

- [ ] **Step 2: Run to confirm RED**

```bash
cd frontend && npx vitest run src/app/shared/utils/inline-markdown.spec.ts 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the utility**

Create `frontend/src/app/shared/utils/inline-markdown.ts`:

```typescript
/** Escape HTML special chars to prevent XSS before applying marker rendering. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Parse stored marker syntax (subset of Markdown) into safe HTML for display.
 * Input: plain text with **bold**, _italic_, `code` markers.
 * Output: HTML string safe to bind via [innerHTML] after DomSanitizer.
 */
export function parseInlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

/**
 * Serialize contenteditable innerHTML back to marker syntax for storage.
 * Strips all tags except the formatted ones, decodes HTML entities.
 */
export function serializeToMarkdown(html: string): string {
  return html
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '_$1_')
    .replace(/<i>(.*?)<\/i>/gi, '_$1_')
    .replace(/<code>(.*?)<\/code>/gi, '`$1`')
    .replace(/<div>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * Convert stored marker syntax to HTML for loading into a contenteditable (edit mode).
 * Does NOT escape HTML — the caller is populating a trusted editor element.
 */
export function markersToHtml(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}
```

- [ ] **Step 4: Run to confirm GREEN**

```bash
cd frontend && npx vitest run src/app/shared/utils/inline-markdown.spec.ts 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/utils/
git commit -m "feat: add inline-markdown utility (parse, serialize, markersToHtml)"
```

---

## Task 3: Sidebar Collapse (TDD)

**Files:**
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.ts`
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.html`
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.spec.ts`

- [ ] **Step 1: Write failing unit tests**

Open `frontend/src/app/features/workspace/workspace-shell.component.spec.ts` and add at the end of the existing `describe` block (after existing tests, before the closing `}`):

```typescript
describe('sidebar collapse', () => {
  it('starts expanded (sidebarCollapsed = false)', () => {
    expect(component.sidebarCollapsed()).toBe(false);
  });

  it('toggleSidebar flips sidebarCollapsed', () => {
    component.toggleSidebar();
    expect(component.sidebarCollapsed()).toBe(true);
    component.toggleSidebar();
    expect(component.sidebarCollapsed()).toBe(false);
  });

  it('reads initial state from localStorage', () => {
    localStorage.setItem('sidebar_collapsed', 'true');
    // Re-create component to trigger constructor read
    const fresh = TestBed.createComponent(WorkspaceShellComponent).componentInstance;
    expect(fresh.sidebarCollapsed()).toBe(true);
    localStorage.removeItem('sidebar_collapsed');
  });

  it('writes to localStorage on toggle', () => {
    component.toggleSidebar();
    expect(localStorage.getItem('sidebar_collapsed')).toBe('true');
    component.toggleSidebar();
    expect(localStorage.getItem('sidebar_collapsed')).toBe('false');
  });
});
```

- [ ] **Step 2: Run to confirm RED**

```bash
cd frontend && npx vitest run src/app/features/workspace/workspace-shell.component.spec.ts 2>&1 | tail -15
```

Expected: FAIL — `sidebarCollapsed` and `toggleSidebar` not found.

- [ ] **Step 3: Add state + toggle to the TypeScript**

In `frontend/src/app/features/workspace/workspace-shell.component.ts`, add after `readonly sidebarOpen = signal(false);`:

```typescript
readonly sidebarCollapsed = signal<boolean>(
  localStorage.getItem('sidebar_collapsed') === 'true'
);

toggleSidebar(): void {
  this.sidebarCollapsed.update(v => {
    const next = !v;
    localStorage.setItem('sidebar_collapsed', String(next));
    return next;
  });
}
```

- [ ] **Step 4: Run to confirm GREEN**

```bash
cd frontend && npx vitest run src/app/features/workspace/workspace-shell.component.spec.ts 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 5: Update the sidebar HTML**

Replace the opening `<aside ...>` tag and its immediate header in `frontend/src/app/features/workspace/workspace-shell.component.html` with the following (this covers the entire sidebar — replace the full `<aside>` element):

```html
<aside
  class="workspace-sidebar bg-surface-container shrink-0 h-full overflow-y-auto flex flex-col transition-[width] duration-200 ease-in-out overflow-hidden relative"
  [class.w-72]="!sidebarCollapsed()"
  [class.w-12]="sidebarCollapsed()"
  [class.workspace-sidebar--open]="sidebarOpen()"
  data-testid="sidebar-collapsed">

  <!-- Toggle chevron button -->
  <button
    type="button"
    class="absolute top-3 right-2 z-10 w-6 h-6 flex items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container-high transition-colors"
    data-testid="sidebar-toggle"
    [title]="sidebarCollapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
    (click)="toggleSidebar()">
    <span class="material-symbols-outlined text-sm">
      {{ sidebarCollapsed() ? 'chevron_right' : 'chevron_left' }}
    </span>
  </button>

  <!-- ── Expanded header ───────────────────────────────────── -->
  @if (!sidebarCollapsed()) {
    <div class="flex items-center gap-3 mb-8 px-4 pt-4">
      <div class="w-10 h-10 bg-primary rounded-lg flex items-center justify-center shrink-0">
        <span class="material-symbols-outlined text-on-primary">corporate_fare</span>
      </div>
      <div>
        <h2 class="text-xl font-bold text-on-surface tracking-normal">Workspace</h2>
        <p class="text-[10px] text-on-surface-variant tracking-wider">Active Session</p>
      </div>
    </div>

    <!-- Search bar -->
    <div class="bg-surface-container-high p-2 rounded-lg mb-6 mx-4 flex items-center gap-2 text-sm text-on-surface-variant">
      <span class="material-symbols-outlined text-sm">search</span>
      <input class="bg-transparent border-none focus:outline-none p-0 text-sm w-full placeholder-on-surface-variant"
             placeholder="Search workspace..." type="text" />
    </div>
  }

  <!-- ── Collapsed header (icon only) ─────────────────────── -->
  @if (sidebarCollapsed()) {
    <div class="flex flex-col items-center gap-2 pt-4 pb-2">
      <div class="w-8 h-8 bg-primary rounded-lg flex items-center justify-center" title="Workspace">
        <span class="material-symbols-outlined text-on-primary text-sm">corporate_fare</span>
      </div>
      <button type="button"
              class="w-8 h-8 flex items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container-high"
              title="Search workspace"
              (click)="toggleSidebar()">
        <span class="material-symbols-outlined text-sm">search</span>
      </button>
    </div>
  }

  <!-- ── Public rooms ──────────────────────────────────────── -->
  <div class="space-y-1" [class.px-4]="!sidebarCollapsed()">
    @if (!sidebarCollapsed()) {
      <div class="flex items-center justify-between p-2 cursor-pointer text-on-surface-variant hover:bg-surface-container-high rounded-lg"
           (click)="publicRoomsExpanded.update(v => !v)">
        <div class="flex items-center gap-3">
          <span class="material-symbols-outlined">forum</span>
          <span class="text-on-surface font-bold text-sm">Public Rooms</span>
        </div>
        <span class="material-symbols-outlined text-sm">{{ publicRoomsExpanded() ? 'keyboard_arrow_down' : 'keyboard_arrow_right' }}</span>
      </div>
    }
    @if (!sidebarCollapsed() && publicRoomsExpanded()) {
      <div class="pl-9 space-y-1" data-testid="public-rooms-section">
        @for (room of publicRooms(); track room.id) {
          <a [routerLink]="['/app/rooms', room.id]"
             routerLinkActive="bg-surface-container-lowest text-on-surface font-bold"
             class="flex items-center justify-between gap-2 p-2 bg-surface-container/40 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface cursor-pointer text-sm rounded-lg"
             [title]="room.name">
            <span class="flex items-center gap-2 min-w-0">
              <span class="material-symbols-outlined text-[17px] text-primary shrink-0">public</span>
              <span class="truncate">{{ room.name }}</span>
            </span>
            @let count = getUnreadCount('room', room.id);
            @if (count > 0) {
              <span class="ml-1 shrink-0 min-w-[1.25rem] h-5 px-1 bg-primary text-on-primary text-[10px] font-black rounded-full">{{ count }}</span>
            }
          </a>
        }
      </div>
    }
    @if (sidebarCollapsed()) {
      <div class="flex flex-col items-center gap-1 py-1" data-testid="public-rooms-section">
        @for (room of publicRooms(); track room.id) {
          <a [routerLink]="['/app/rooms', room.id]"
             routerLinkActive="border-l-2 border-primary bg-surface-container-lowest"
             class="relative w-9 h-9 flex items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container-high transition-colors"
             [title]="room.name">
            <span class="material-symbols-outlined text-[17px] text-primary">public</span>
            @let count = getUnreadCount('room', room.id);
            @if (count > 0) {
              <span class="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-primary"></span>
            }
          </a>
        }
      </div>
    }
  </div>

  <!-- ── Private rooms ─────────────────────────────────────── -->
  <div class="mt-4 space-y-1" [class.px-4]="!sidebarCollapsed()">
    @if (!sidebarCollapsed()) {
      <div class="flex items-center justify-between p-2 cursor-pointer text-on-surface-variant hover:bg-surface-container-high rounded-lg"
           (click)="privateRoomsExpanded.update(v => !v)">
        <div class="flex items-center gap-3">
          <span class="material-symbols-outlined">lock</span>
          <span class="text-on-surface font-bold text-sm">Private Rooms</span>
        </div>
        <span class="material-symbols-outlined text-sm">{{ privateRoomsExpanded() ? 'keyboard_arrow_down' : 'keyboard_arrow_right' }}</span>
      </div>
    }
    @if (!sidebarCollapsed() && privateRoomsExpanded()) {
      <div class="pl-9 space-y-1" data-testid="private-rooms-section">
        @for (room of privateRooms(); track room.id) {
          <a [routerLink]="['/app/rooms', room.id]"
             routerLinkActive="bg-surface-container-lowest text-on-surface font-bold"
             class="flex items-center justify-between gap-2 p-2 bg-surface-container/40 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface cursor-pointer text-sm rounded-lg"
             [title]="room.name">
            <span class="flex items-center gap-2 min-w-0">
              <span class="material-symbols-outlined text-[17px] text-primary shrink-0">lock</span>
              <span class="truncate">{{ room.name }}</span>
            </span>
            @let count = getUnreadCount('room', room.id);
            @if (count > 0) {
              <span class="ml-1 shrink-0 min-w-[1.25rem] h-5 px-1 bg-primary text-on-primary text-[10px] font-black rounded-full">{{ count }}</span>
            }
          </a>
        }
      </div>
    }
    @if (sidebarCollapsed()) {
      <div class="flex flex-col items-center gap-1 py-1" data-testid="private-rooms-section">
        @for (room of privateRooms(); track room.id) {
          <a [routerLink]="['/app/rooms', room.id]"
             routerLinkActive="border-l-2 border-primary bg-surface-container-lowest"
             class="relative w-9 h-9 flex items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container-high transition-colors"
             [title]="room.name">
            <span class="material-symbols-outlined text-[17px] text-primary">lock</span>
            @let count = getUnreadCount('room', room.id);
            @if (count > 0) {
              <span class="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-primary"></span>
            }
          </a>
        }
      </div>
    }
  </div>

  <!-- ── Contacts ───────────────────────────────────────────── -->
  <div class="mt-4 space-y-1" [class.px-4]="!sidebarCollapsed()">
    @if (!sidebarCollapsed()) {
      <div class="flex items-center justify-between p-2 cursor-pointer text-on-surface-variant hover:bg-surface-container-high rounded-lg">
        <div class="flex items-center gap-3">
          <span class="material-symbols-outlined">person</span>
          <span class="text-on-surface font-bold text-sm">Contacts</span>
        </div>
        <span class="material-symbols-outlined text-sm">keyboard_arrow_down</span>
      </div>
      <div class="pl-9 space-y-1" data-testid="sidebar-contacts">
        @for (friend of friends(); track friend.userId) {
          <a [routerLink]="['/app/messages', friend.userId]"
             class="flex items-center gap-2 p-2 text-on-surface-variant hover:text-on-surface cursor-pointer text-sm rounded-lg">
            <div class="relative shrink-0">
              @if (friend.avatarUrl) {
                <img [src]="friend.avatarUrl" [alt]="friend.username" class="w-6 h-6 rounded-full object-cover" />
              } @else {
                <div class="w-6 h-6 rounded-full bg-surface-container flex items-center justify-center">
                  <span class="text-xs font-bold text-on-surface-variant">{{ friend.username[0].toUpperCase() }}</span>
                </div>
              }
              <span class="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-surface-container"
                    [class.bg-status-online]="(presenceMap().get(friend.userId) ?? 'offline') === 'online'"
                    [class.bg-status-afk]="(presenceMap().get(friend.userId) ?? 'offline') === 'afk'"
                    [class.bg-outline]="(presenceMap().get(friend.userId) ?? 'offline') === 'offline'">
              </span>
            </div>
            <span class="truncate">{{ friend.username }}</span>
          </a>
        }
      </div>
    }
    @if (sidebarCollapsed()) {
      <div class="flex flex-col items-center gap-1 py-1" data-testid="sidebar-contacts">
        @for (friend of friends(); track friend.userId) {
          <a [routerLink]="['/app/messages', friend.userId]"
             class="relative w-9 h-9 flex items-center justify-center"
             [title]="friend.username">
            <div class="relative">
              @if (friend.avatarUrl) {
                <img [src]="friend.avatarUrl" [alt]="friend.username" class="w-7 h-7 rounded-full object-cover" />
              } @else {
                <div class="w-7 h-7 rounded-full bg-surface-container flex items-center justify-center">
                  <span class="text-xs font-bold text-on-surface-variant">{{ friend.username[0].toUpperCase() }}</span>
                </div>
              }
              <span class="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-surface-container"
                    [class.bg-status-online]="(presenceMap().get(friend.userId) ?? 'offline') === 'online'"
                    [class.bg-status-afk]="(presenceMap().get(friend.userId) ?? 'offline') === 'afk'"
                    [class.bg-outline]="(presenceMap().get(friend.userId) ?? 'offline') === 'offline'">
              </span>
            </div>
          </a>
        }
      </div>
    }
  </div>

  <!-- ── Spacer ─────────────────────────────────────────────── -->
  <div class="flex-1"></div>

  <!-- ── Bottom actions ────────────────────────────────────── -->
  <div class="space-y-2" [class.px-4]="!sidebarCollapsed()" [class.px-2]="sidebarCollapsed()" class="pb-4">
    @if (!sidebarCollapsed()) {
      <p-button class="block w-full" label="Create Room" icon="pi pi-plus" (onClick)="openCreateRoom()" />
      <button class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-surface-container-high text-on-surface text-sm font-bold rounded-lg hover:bg-surface-container-lowest transition-colors shadow-sm"
              type="button" (click)="logout()">
        <span class="material-symbols-outlined text-base">logout</span>
        <span>Sign out</span>
      </button>
    }
    @if (sidebarCollapsed()) {
      <button class="w-9 h-9 mx-auto flex items-center justify-center rounded-md text-primary hover:bg-surface-container-high transition-colors"
              type="button" title="Create Room" (click)="openCreateRoom()">
        <span class="material-symbols-outlined text-sm">add</span>
      </button>
      <button class="w-9 h-9 mx-auto flex items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container-high transition-colors"
              type="button" title="Sign out" (click)="logout()">
        <span class="material-symbols-outlined text-sm">logout</span>
      </button>
    }
  </div>
</aside>
```

- [ ] **Step 6: Run full Angular tests to check for regressions**

```bash
cd frontend && npx vitest run 2>&1 | tail -10
```

Expected: all tests pass (new sidebar collapse tests + existing).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/features/workspace/
git commit -m "feat: collapsible sidebar with icon strip and localStorage persistence"
```

---

## Task 4: WYSIWYG Composer — Room Chat

**Files:**
- Modify: `frontend/src/app/features/rooms/room-chat/room-chat.ts`
- Modify: `frontend/src/app/features/rooms/room-chat/room-chat.html`
- Modify: `frontend/src/app/features/rooms/room-chat/room-chat.spec.ts`

- [ ] **Step 1: Write failing unit tests**

Add to `frontend/src/app/features/rooms/room-chat/room-chat.spec.ts` inside the existing `describe` block:

```typescript
import { serializeToMarkdown } from '../../../shared/utils/inline-markdown';

describe('WYSIWYG composer serialization', () => {
  it('serializeToMarkdown converts bold HTML to markers', () => {
    expect(serializeToMarkdown('<strong>hello</strong>')).toBe('**hello**');
  });

  it('serializeToMarkdown converts italic HTML to markers', () => {
    expect(serializeToMarkdown('<em>world</em>')).toBe('_world_');
  });

  it('serializeToMarkdown converts code HTML to backtick markers', () => {
    expect(serializeToMarkdown('<code>npm</code>')).toBe('`npm`');
  });
});

describe('applyFormatting', () => {
  it('applyBold calls document.execCommand bold', () => {
    const spy = vi.spyOn(document, 'execCommand').mockReturnValue(true);
    component.applyBold();
    expect(spy).toHaveBeenCalledWith('bold');
    spy.mockRestore();
  });

  it('applyItalic calls document.execCommand italic', () => {
    const spy = vi.spyOn(document, 'execCommand').mockReturnValue(true);
    component.applyItalic();
    expect(spy).toHaveBeenCalledWith('italic');
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run to confirm RED**

```bash
cd frontend && npx vitest run src/app/features/rooms/room-chat/room-chat.spec.ts 2>&1 | tail -10
```

Expected: FAIL — `applyBold` and `applyItalic` not found.

- [ ] **Step 3: Update room-chat.ts**

Replace the entire file `frontend/src/app/features/rooms/room-chat/room-chat.ts` with:

```typescript
import { Component, DestroyRef, ElementRef, OnInit, OnDestroy, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { distinctUntilChanged, filter, finalize, map } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { RoomsApiService } from '../../../core/rooms/rooms-api.service';
import { ChatService } from '../../../core/signalr/chat.service';
import { PresenceService } from '../../../core/signalr/presence.service';
import { FilesApiService } from '../../../core/files/files-api.service';
import { NotificationsApiService } from '../../../core/notifications/notifications-api.service';
import { UnreadService } from '../../../core/signalr/unread.service';
import { ReactionsApiService } from '../../../core/reactions/reactions-api.service';
import { parseInlineMarkdown, serializeToMarkdown, markersToHtml } from '../../../shared/utils/inline-markdown';
import type { RoomDto } from '../../../core/rooms/rooms.models';
import type { MessageDto, RoomMemberPresence } from '../../../core/signalr/hub.models';
import type { AttachmentDto } from '../../../core/files/files.models';

@Component({
  selector: 'app-room-chat',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './room-chat.html',
  styleUrl: './room-chat.scss',
})
export class RoomChatComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authSession = inject(AuthSessionService);
  private readonly roomsApi = inject(RoomsApiService);
  private readonly chat = inject(ChatService);
  private readonly presence = inject(PresenceService);
  private readonly filesApi = inject(FilesApiService);
  private readonly notificationsApi = inject(NotificationsApiService);
  private readonly unread = inject(UnreadService);
  private readonly reactionsApi = inject(ReactionsApiService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);

  readonly composerEl = viewChild<ElementRef<HTMLDivElement>>('composerEl');

  readonly user = this.authSession.user;
  readonly roomId = signal(this.route.snapshot.params['id'] as string);
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly room = signal<RoomDto | null>(null);
  readonly messages = signal<MessageDto[]>([]);
  readonly composerEmpty = signal(true);
  readonly isSending = signal(false);
  readonly isUploading = signal(false);
  readonly pendingAttachment = signal<AttachmentDto | null>(null);
  readonly emojiPickerOpen = signal(false);
  readonly reactionPickerMsgId = signal<string | null>(null);
  readonly replyingTo = signal<MessageDto | null>(null);
  readonly members = signal<RoomMemberPresence[]>([]);
  readonly presenceMap = this.presence.presenceMap;

  readonly quickEmojis = ['😀', '😂', '👍', '🙏', '❤️', '🎉', '🔥', '👀'];
  readonly reactionEmojis = ['👍','👎','❤️','😂','😮','😢','🎉','🔥','🚀','👀','💯','✅','❌','⭐','🙏','👏'];

  private joinedRoomId: string | null = null;

  constructor() {
    effect(() => {
      const event = this.chat.lastRoomEvent();
      if (!event) return;

      if (event.type === 'MessageReceived') {
        this.messages.update(msgs => this.sortMessages([
          ...msgs.filter(msg => msg.id !== event.payload.id),
          event.payload,
        ]));
      } else if (event.type === 'MessageEdited') {
        this.messages.update(msgs =>
          this.sortMessages(msgs.map(m => m.id === event.payload.id ? event.payload : m))
        );
      } else if (event.type === 'MessageDeleted') {
        this.messages.update(msgs =>
          msgs.map(m => m.id === event.payload.messageId
            ? { ...m, isDeleted: true, content: null }
            : m
          )
        );
      } else if (event.type === 'ReactionToggled') {
        const { messageId, emoji, count, userIds } = event.payload;
        this.messages.update(msgs => msgs.map(m => {
          if (m.id !== messageId) return m;
          const others = m.reactions.filter(r => r.emoji !== emoji);
          return { ...m, reactions: count > 0 ? [...others, { emoji, count, userIds }] : others };
        }));
      }
    });

    effect(() => {
      const snap = this.presence.roomMembersSnapshot();
      if (!snap || snap.roomId !== this.roomId()) return;
      this.members.set(snap.members);
    });

    effect(() => {
      const event = this.presence.memberJoined();
      if (!event || event.roomId !== this.roomId()) return;
      const status = untracked(() => this.presence.presenceMap().get(event.user.userId)) ?? 'online';
      this.members.update(list => [
        ...list.filter(m => m.userId !== event.user.userId),
        { userId: event.user.userId, username: event.user.username, avatarUrl: event.user.avatarUrl,
          role: 'Member' as const, joinedAt: new Date().toISOString(), presenceStatus: status },
      ]);
    });

    effect(() => {
      const event = this.presence.memberLeft();
      if (!event || event.roomId !== this.roomId()) return;
      this.members.update(list => list.filter(m => m.userId !== event.userId));
    });

    effect(() => {
      const event = this.presence.removedFromRoom();
      if (!event || event.roomId !== this.roomId()) return;
      void this.router.navigate(['/app']);
    });
  }

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        map(params => params.get('id')),
        filter((id): id is string => !!id),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(id => this.switchRoom(id));
  }

  ngOnDestroy(): void {
    if (!this.joinedRoomId) return;
    void this.presence.leaveRoom(this.joinedRoomId);
    void this.chat.leaveRoom(this.joinedRoomId);
  }

  // ── Composer ──────────────────────────────────────────────────────────────

  onComposerInput(event: Event): void {
    const el = event.target as HTMLDivElement;
    this.composerEmpty.set(!el.textContent?.trim());
  }

  applyBold(): void { document.execCommand('bold'); }
  applyItalic(): void { document.execCommand('italic'); }

  applyCode(): void {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const code = document.createElement('code');
    try { range.surroundContents(code); } catch { /* partial selection — skip */ }
  }

  handleComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      if (event.key === 'b') { event.preventDefault(); this.applyBold(); }
      if (event.key === 'i') { event.preventDefault(); this.applyItalic(); }
      if (event.key === '`') { event.preventDefault(); this.applyCode(); }
    }
  }

  clearComposer(): void {
    const el = this.composerEl()?.nativeElement;
    if (el) el.innerHTML = '';
    this.composerEmpty.set(true);
  }

  focusComposer(): void {
    this.composerEl()?.nativeElement.focus();
  }

  sendMessage(): void {
    const el = this.composerEl()?.nativeElement;
    if (!el) return;
    const content = serializeToMarkdown(el.innerHTML);
    const attachment = this.pendingAttachment();
    if ((!content && !attachment) || this.isSending()) return;
    const replyToId = this.replyingTo()?.id ?? null;
    this.isSending.set(true);
    void this.chat.sendMessage(this.roomId(), content, replyToId, attachment?.id ?? null)
      .then(() => {
        this.clearComposer();
        this.pendingAttachment.set(null);
        this.replyingTo.set(null);
      })
      .finally(() => this.isSending.set(false));
  }

  canSendMessage(): boolean {
    return (!this.composerEmpty() || !!this.pendingAttachment()) && !this.isSending() && !this.isUploading();
  }

  insertEmoji(emoji: string): void {
    document.execCommand('insertText', false, emoji);
    this.emojiPickerOpen.set(false);
    this.composerEmpty.set(false);
  }

  toggleEmojiPicker(): void { this.emojiPickerOpen.update(v => !v); }

  // ── Reply ─────────────────────────────────────────────────────────────────

  startReply(msg: MessageDto): void {
    this.replyingTo.set(msg);
    this.reactionPickerMsgId.set(null);
    setTimeout(() => this.focusComposer(), 0);
  }

  cancelReply(): void { this.replyingTo.set(null); }

  // ── Reactions ─────────────────────────────────────────────────────────────

  openReactionPicker(msgId: string): void {
    this.reactionPickerMsgId.update(id => id === msgId ? null : msgId);
  }

  closeReactionPicker(): void { this.reactionPickerMsgId.set(null); }

  toggleReaction(msg: MessageDto, emoji: string): void {
    const userId = this.user()?.id ?? '';
    const prev = msg.reactions;
    // Optimistic update
    const existing = prev.find(r => r.emoji === emoji);
    const alreadyReacted = existing?.userIds.includes(userId) ?? false;
    let updated: typeof prev;
    if (alreadyReacted) {
      updated = prev.map(r => r.emoji !== emoji ? r : { ...r, count: r.count - 1, userIds: r.userIds.filter(id => id !== userId) })
                    .filter(r => r.count > 0);
    } else {
      const found = prev.find(r => r.emoji === emoji);
      updated = found
        ? prev.map(r => r.emoji !== emoji ? r : { ...r, count: r.count + 1, userIds: [...r.userIds, userId] })
        : [...prev, { emoji, count: 1, userIds: [userId] }];
    }
    this.messages.update(msgs => msgs.map(m => m.id === msg.id ? { ...m, reactions: updated } : m));

    this.reactionsApi.toggleReaction(msg.id, emoji).subscribe({
      error: () => {
        // Roll back
        this.messages.update(msgs => msgs.map(m => m.id === msg.id ? { ...m, reactions: prev } : m));
      },
    });
    this.reactionPickerMsgId.set(null);
  }

  hasUserReacted(msg: MessageDto, emoji: string): boolean {
    return msg.reactions.find(r => r.emoji === emoji)?.userIds.includes(this.user()?.id ?? '') ?? false;
  }

  renderContent(content: string | null): SafeHtml {
    if (!content) return this.sanitizer.bypassSecurityTrustHtml('');
    return this.sanitizer.bypassSecurityTrustHtml(parseInlineMarkdown(content));
  }

  // ── File ──────────────────────────────────────────────────────────────────

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.uploadFile(file);
    input.value = '';
  }

  onPaste(event: ClipboardEvent): void {
    const file = event.clipboardData?.files[0];
    if (file) { event.preventDefault(); this.uploadFile(file); return; }
    // Strip HTML from pasted text
    const text = event.clipboardData?.getData('text/plain');
    if (text) { event.preventDefault(); document.execCommand('insertText', false, text); }
  }

  clearAttachment(): void { this.pendingAttachment.set(null); }

  downloadFile(attachmentId: string, fileName: string): void {
    this.filesApi.downloadFile(attachmentId, fileName);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  isOwnMessage(msg: MessageDto): boolean {
    return msg.sender.id === this.user()?.id;
  }

  private switchRoom(id: string): void {
    if (this.joinedRoomId && this.joinedRoomId !== id) {
      void this.presence.leaveRoom(this.joinedRoomId);
      void this.chat.leaveRoom(this.joinedRoomId);
    }
    this.joinedRoomId = id;
    this.roomId.set(id);
    this.room.set(null);
    this.messages.set([]);
    this.members.set([]);
    this.pendingAttachment.set(null);
    this.clearComposer();
    this.replyingTo.set(null);
    this.emojiPickerOpen.set(false);
    void this.presence.joinRoom(id);
    void this.chat.joinRoom(id);
    this.loadRoom(id);
  }

  private uploadFile(file: File): void {
    if (this.isUploading()) return;
    this.isUploading.set(true);
    this.filesApi.uploadFile(file)
      .pipe(finalize(() => this.isUploading.set(false)))
      .subscribe({
        next: dto => this.pendingAttachment.set(dto),
        error: () => this.errorMessage.set('File upload failed.'),
      });
  }

  private loadRoom(id: string): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.roomsApi.getRoom(id).subscribe({
      next: room => {
        if (this.roomId() !== id) return;
        this.room.set(room);
        this.roomsApi.getMessages(id)
          .pipe(finalize(() => { if (this.roomId() === id) this.isLoading.set(false); }))
          .subscribe({
            next: msgs => {
              if (this.roomId() !== id) return;
              this.messages.set(this.sortMessages(msgs));
              this.notificationsApi.markRoomRead(id).subscribe();
              this.unread.setCount('room', id, 0);
            },
            error: () => { if (this.roomId() !== id) return; this.errorMessage.set('Unable to load messages.'); },
          });
      },
      error: () => { if (this.roomId() !== id) return; this.isLoading.set(false); this.errorMessage.set('Room not found or access denied.'); },
    });
  }

  private sortMessages(messages: MessageDto[]): MessageDto[] {
    return [...messages].sort((a, b) =>
      a.sequenceNumber - b.sequenceNumber ||
      new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime() ||
      a.id.localeCompare(b.id)
    );
  }
}
```

- [ ] **Step 4: Replace room-chat.html**

Replace `frontend/src/app/features/rooms/room-chat/room-chat.html` with:

```html
<div class="flex flex-col h-full">
  <!-- Header -->
  <div class="px-6 py-4 bg-surface-container-low flex items-center gap-4 shrink-0">
    @if (room()) {
      <span class="material-symbols-outlined text-primary">
        {{ room()!.visibility === 'Public' ? 'public' : 'lock' }}
      </span>
      <div class="flex-1 min-w-0">
        <h1 class="font-bold text-on-surface truncate" data-testid="room-title">{{ room()!.name }}</h1>
        @if (room()!.description) {
          <p class="text-xs text-on-surface-variant truncate">{{ room()!.description }}</p>
        }
      </div>
      <a [routerLink]="['/app/rooms', roomId(), 'manage']"
         class="p-2 rounded-md text-on-surface-variant hover:bg-surface-container-high transition-colors"
         title="Manage room">
        <span class="material-symbols-outlined text-sm">settings</span>
      </a>
    }
  </div>

  <!-- Messages -->
  <div class="flex-1 overflow-y-auto p-6 space-y-6" data-testid="chat-area"
       (click)="reactionPickerMsgId.set(null)">
    @if (isLoading()) {
      <p class="text-center text-on-surface-variant text-sm">Loading messages…</p>
    }
    @if (errorMessage()) {
      <p class="text-center text-error text-sm">{{ errorMessage() }}</p>
    }
    @for (msg of messages(); track msg.id) {
      <div class="flex gap-4 group relative"
           [class.justify-end]="isOwnMessage(msg)"
           [class.justify-start]="!isOwnMessage(msg)"
           [attr.data-testid]="'message-' + msg.id">

        <!-- Avatar (other users) -->
        @if (!isOwnMessage(msg)) {
          @if (msg.sender.avatarUrl) {
            <img [alt]="msg.sender.username" [src]="msg.sender.avatarUrl" class="w-10 h-10 rounded-lg object-cover shrink-0" />
          } @else {
            <div class="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
              <span class="text-sm font-bold text-on-surface-variant">{{ msg.sender.username[0].toUpperCase() }}</span>
            </div>
          }
        }

        <!-- Bubble -->
        <div class="flex flex-col min-w-0 max-w-[min(42rem,85%)] relative"
             [class.items-end]="isOwnMessage(msg)"
             [class.items-start]="!isOwnMessage(msg)">

          <!-- Action bar (hover) -->
          @if (!msg.isDeleted) {
            <div class="absolute -top-4 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150
                        bg-white/85 backdrop-blur-[12px] shadow-sm ring-1 ring-outline-variant/15 rounded-lg px-1 py-0.5
                        flex items-center gap-0.5"
                 [attr.data-testid]="'message-actions-' + msg.id"
                 (click)="$event.stopPropagation()">
              <button type="button"
                      class="w-7 h-7 flex items-center justify-center rounded text-on-surface-variant hover:bg-surface-container-high text-base transition-colors"
                      data-testid="react-btn"
                      title="React"
                      (click)="openReactionPicker(msg.id)">😊</button>
              <button type="button"
                      class="w-7 h-7 flex items-center justify-center rounded text-on-surface-variant hover:bg-surface-container-high transition-colors"
                      data-testid="reply-btn"
                      title="Reply"
                      (click)="startReply(msg)">
                <span class="material-symbols-outlined text-sm">reply</span>
              </button>
              @if (isOwnMessage(msg)) {
                <button type="button"
                        class="w-7 h-7 flex items-center justify-center rounded text-on-surface-variant hover:bg-surface-container-high transition-colors"
                        data-testid="edit-btn"
                        title="Edit">
                  <span class="material-symbols-outlined text-sm">edit</span>
                </button>
                <button type="button"
                        class="w-7 h-7 flex items-center justify-center rounded text-on-surface-variant hover:text-error hover:bg-surface-container-high transition-colors"
                        data-testid="delete-btn"
                        title="Delete"
                        (click)="chat.deleteMessage(msg.id)">
                  <span class="material-symbols-outlined text-sm">delete</span>
                </button>
              }
            </div>
          }

          <!-- Reaction picker popover -->
          @if (reactionPickerMsgId() === msg.id) {
            <div class="absolute -top-12 right-2 z-20 flex flex-wrap gap-1 p-2 max-w-[16rem]
                        bg-white/90 backdrop-blur-[12px] shadow-md ring-1 ring-outline-variant/15 rounded-lg"
                 data-testid="reaction-picker"
                 (click)="$event.stopPropagation()">
              @for (emoji of reactionEmojis; track emoji) {
                <button type="button"
                        class="w-8 h-8 flex items-center justify-center rounded-md text-base hover:bg-surface-container-high transition-colors"
                        (click)="toggleReaction(msg, emoji)">{{ emoji }}</button>
              }
            </div>
          }

          <!-- Header -->
          <div class="flex items-baseline gap-2 mb-1"
               [class.flex-row-reverse]="isOwnMessage(msg)">
            <span class="text-sm font-bold text-on-surface">{{ msg.sender.username }}</span>
            <span class="text-[10px] text-outline tracking-wider">{{ formatTime(msg.sentAt) }}</span>
            @if (msg.editedAt) {
              <span class="text-[10px] text-outline italic">(edited)</span>
            }
          </div>

          @if (msg.isDeleted) {
            <p class="text-sm text-on-surface-variant italic px-4 py-2 bg-surface-container rounded-lg"
               data-testid="message-deleted">Message deleted.</p>
          } @else {
            <!-- Reply quote -->
            @if (msg.replyTo) {
              <div class="border-l-2 border-primary/50 pl-2 mb-1 rounded-sm bg-surface-container/50"
                   data-testid="reply-quote">
                <p class="text-[10px] font-bold text-primary">{{ msg.replyTo.sender.username }}</p>
                <p class="text-xs text-on-surface-variant truncate max-w-sm">{{ msg.replyTo.content }}</p>
              </div>
            }

            <!-- Bubble -->
            <p class="text-sm leading-relaxed max-w-2xl px-4 py-2 rounded-lg"
               [class.bg-primary-container]="isOwnMessage(msg)"
               [class.text-on-primary-container]="isOwnMessage(msg)"
               [class.bg-surface-container]="!isOwnMessage(msg)"
               [class.text-on-surface]="!isOwnMessage(msg)"
               [innerHTML]="renderContent(msg.content)"
               data-testid="message-text"></p>

            <!-- Attachment -->
            @if (msg.attachment) {
              <div class="flex items-center gap-3 mt-2 px-3 py-2 bg-surface-container rounded-lg max-w-xs">
                <span class="material-symbols-outlined text-on-surface-variant shrink-0">
                  {{ msg.attachment.contentType.startsWith('image/') ? 'image' : 'attach_file' }}
                </span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-on-surface truncate">{{ msg.attachment.fileName }}</p>
                  <p class="text-xs text-on-surface-variant">{{ formatSize(msg.attachment.sizeBytes) }}</p>
                </div>
                <button type="button"
                        class="p-1 rounded hover:bg-surface-container-high text-on-surface-variant"
                        (click)="downloadFile(msg.attachment.id, msg.attachment.fileName)">
                  <span class="material-symbols-outlined text-sm">download</span>
                </button>
              </div>
            }

            <!-- Reaction pills -->
            @if (msg.reactions.length > 0) {
              <div class="flex flex-wrap gap-1 mt-1">
                @for (reaction of msg.reactions; track reaction.emoji) {
                  <button type="button"
                          class="h-6 px-2 rounded-full text-xs flex items-center gap-1 cursor-pointer select-none transition-colors"
                          [class.bg-primary-container]="hasUserReacted(msg, reaction.emoji)"
                          [class.ring-1]="hasUserReacted(msg, reaction.emoji)"
                          [class.ring-primary]="hasUserReacted(msg, reaction.emoji)"
                          [class.text-on-primary-container]="hasUserReacted(msg, reaction.emoji)"
                          [class.bg-surface-container]="!hasUserReacted(msg, reaction.emoji)"
                          [class.text-on-surface]="!hasUserReacted(msg, reaction.emoji)"
                          [class.hover:bg-surface-container-high]="!hasUserReacted(msg, reaction.emoji)"
                          [attr.data-testid]="'reaction-pill-' + reaction.emoji"
                          (click)="toggleReaction(msg, reaction.emoji)">
                    {{ reaction.emoji }} {{ reaction.count }}
                  </button>
                }
              </div>
            }
          }
        </div>
      </div>
    }
  </div>

  <!-- Composer -->
  <div class="p-4 bg-surface-container-low shrink-0">
    <input type="file" #fileInput hidden (change)="onFileSelected($event)" />

    <div class="relative bg-surface-container-lowest rounded-lg shadow-sm ring-1 ring-outline-variant/30 focus-within:ring-2 focus-within:ring-primary transition-shadow"
         data-testid="message-composer">

      <!-- Reply banner -->
      @if (replyingTo()) {
        <div class="flex items-center justify-between px-4 py-2 bg-primary-container/40 border-l-2 border-primary rounded-t-lg"
             data-testid="reply-banner">
          <div class="min-w-0">
            <p class="text-xs font-bold text-primary flex items-center gap-1">
              <span class="material-symbols-outlined text-sm">reply</span>
              Replying to {{ replyingTo()!.sender.username }}
            </p>
            <p class="text-xs text-on-surface-variant truncate max-w-xs">{{ replyingTo()!.content }}</p>
          </div>
          <button type="button"
                  class="ml-2 shrink-0 text-on-surface-variant hover:text-on-surface"
                  data-testid="reply-banner-dismiss"
                  (click)="cancelReply()">
            <span class="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      }

      <!-- Emoji picker (quick) -->
      @if (emojiPickerOpen()) {
        <div class="absolute bottom-14 left-2 z-20 grid grid-cols-4 gap-1 rounded-lg bg-surface-container-lowest p-2 shadow-lg ring-1 ring-outline-variant/40"
             data-testid="emoji-picker">
          @for (emoji of quickEmojis; track emoji) {
            <button type="button"
                    class="w-9 h-9 rounded-md text-lg leading-none hover:bg-surface-container-high focus:outline-none"
                    (click)="insertEmoji(emoji)">{{ emoji }}</button>
          }
        </div>
      }

      <!-- Contenteditable input -->
      <div #composerEl
           contenteditable="true"
           class="block w-full resize-none bg-transparent px-4 py-3 text-sm text-on-surface outline-none min-h-[72px] max-h-40 overflow-y-auto"
           data-testid="message-input"
           [attr.aria-label]="'Type a message'"
           (input)="onComposerInput($event)"
           (paste)="onPaste($event)"
           (keydown)="handleComposerKeydown($event)">
      </div>

      <!-- Toolbar -->
      <div class="min-h-12 px-2.5 py-2 bg-surface-container-low rounded-b-lg flex items-center justify-between gap-3">
        <div class="flex items-center gap-1 min-w-0">
          <!-- Format buttons -->
          <button type="button"
                  class="w-8 h-8 rounded-md flex items-center justify-center text-sm font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
                  data-testid="composer-bold"
                  title="Bold (Ctrl+B)"
                  (mousedown)="$event.preventDefault()"
                  (click)="applyBold()"><strong>B</strong></button>
          <button type="button"
                  class="w-8 h-8 rounded-md flex items-center justify-center text-sm italic text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
                  data-testid="composer-italic"
                  title="Italic (Ctrl+I)"
                  (mousedown)="$event.preventDefault()"
                  (click)="applyItalic()">I</button>
          <button type="button"
                  class="w-8 h-8 rounded-md flex items-center justify-center text-xs font-mono text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
                  data-testid="composer-code"
                  title="Code (Ctrl+`)"
                  (mousedown)="$event.preventDefault()"
                  (click)="applyCode()">&lt;/&gt;</button>

          <!-- Divider -->
          <span class="w-px h-5 bg-outline-variant/30 mx-1"></span>

          <!-- Attach -->
          <button type="button"
                  class="w-8 h-8 rounded-md flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high disabled:opacity-50 transition-colors"
                  data-testid="attach-file-btn"
                  [disabled]="isUploading()"
                  title="Attach file"
                  (click)="fileInput.click()">
            <span class="material-symbols-outlined text-[19px]">add</span>
          </button>

          <!-- Emoji -->
          <button type="button"
                  class="w-8 h-8 rounded-md flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
                  data-testid="emoji-picker-btn"
                  title="Add emoji"
                  (click)="toggleEmojiPicker()">
            <span class="material-symbols-outlined text-[19px]">mood</span>
          </button>

          <!-- Attachment chip -->
          @if (pendingAttachment()) {
            <div class="h-8 max-w-xs px-2.5 rounded-md bg-primary-container/40 text-on-surface flex items-center gap-2 text-xs min-w-0">
              <span class="material-symbols-outlined text-sm text-primary">attach_file</span>
              <span class="truncate font-medium">{{ pendingAttachment()!.fileName }}</span>
              <button class="text-on-surface-variant hover:text-error" type="button" (click)="clearAttachment()">
                <span class="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          }
          @if (isUploading()) {
            <span class="text-xs text-on-surface-variant">Uploading…</span>
          }
        </div>

        <!-- Send -->
        <button type="button"
                class="w-8 h-8 rounded-md flex items-center justify-center bg-primary text-on-primary hover:bg-primary-dim disabled:bg-surface-container-high disabled:text-on-surface-variant disabled:cursor-not-allowed transition-colors"
                data-testid="send-message-btn"
                [disabled]="!canSendMessage()"
                title="Send message"
                (click)="sendMessage()">
          <span class="material-symbols-outlined text-[18px]">send</span>
        </button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 5: Run tests**

```bash
cd frontend && npx vitest run src/app/features/rooms/room-chat/room-chat.spec.ts 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/rooms/room-chat/
git commit -m "feat: WYSIWYG composer, action bar, reply banner, and reaction UI in room chat"
```

---

## Task 5: Add Frontend Models for Reactions

**Files:**
- Modify: `frontend/src/app/core/signalr/hub.models.ts`
- Modify: `frontend/src/app/core/signalr/chat.service.ts`
- Create: `frontend/src/app/core/reactions/reactions-api.service.ts`

- [ ] **Step 1: Update hub.models.ts**

Add after the `AttachmentDto` interface and update `MessageDto`:

```typescript
// In hub.models.ts — add new interface
export interface ReactionSummaryDto {
  emoji: string;
  count: number;
  userIds: string[];
}

// Update MessageDto — add reactions field
export interface MessageDto {
  id: string;
  sequenceNumber: number;
  content: string | null;
  sender: UserSummaryDto;
  sentAt: string;
  editedAt: string | null;
  isDeleted: boolean;
  replyTo: MessageDto | null;
  attachment: AttachmentDto | null;
  reactions: ReactionSummaryDto[];   // ← new
}

// Add new event interface (add after existing ChatHub event types)
export interface ReactionToggledEvent {
  messageId: string;
  emoji: string;
  count: number;
  userIds: string[];
}

// Update RoomChatEvent union (add new variant)
export type RoomChatEvent =
  | { type: 'MessageReceived'; payload: MessageDto }
  | { type: 'MessageEdited'; payload: MessageDto }
  | { type: 'MessageDeleted'; payload: MessageDeletedEvent }
  | { type: 'ReactionToggled'; payload: ReactionToggledEvent };  // ← new
```

- [ ] **Step 2: Register ReactionToggled handler in chat.service.ts**

In `registerHandlers(conn)`, add after the existing `MessageDeleted` handler:

```typescript
conn.on('ReactionToggled', (payload: ReactionToggledEvent) => {
  this._lastRoomEvent.set({ type: 'ReactionToggled', payload });
});
```

Also add `ReactionToggledEvent` to the import list at the top of the file.

- [ ] **Step 3: Create ReactionsApiService**

Create `frontend/src/app/core/reactions/reactions-api.service.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ReactionsApiService {
  private readonly http = inject(HttpClient);

  toggleReaction(messageId: string, emoji: string): Observable<void> {
    return this.http.post<void>(`/api/messages/${messageId}/reactions`, { emoji });
  }
}
```

- [ ] **Step 4: Run full frontend tests**

```bash
cd frontend && npx vitest run 2>&1 | tail -10
```

Expected: all tests pass. TypeScript should compile cleanly (existing callers of `MessageDto` that don't pass `reactions` will have type errors — fix by defaulting to `[]` in any mock objects used in spec files).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/signalr/hub.models.ts \
        frontend/src/app/core/signalr/chat.service.ts \
        frontend/src/app/core/reactions/
git commit -m "feat: add ReactionSummaryDto, ReactionToggled event, and ReactionsApiService"
```

---

## Task 6: WYSIWYG Composer — DM Chat

**Files:**
- Modify: `frontend/src/app/features/dialogs/direct-messages/direct-messages.ts`
- Modify: `frontend/src/app/features/dialogs/direct-messages/direct-messages.html`

- [ ] **Step 1: Read the current DM component**

Open `frontend/src/app/features/dialogs/direct-messages/direct-messages.ts`. Find:
- The textarea binding (likely `messageText` signal + `[ngModel]`)
- The `sendMessage()` method's `content` read
- Imports at the top

- [ ] **Step 2: Update direct-messages.ts**

Apply the same pattern as `room-chat.ts`:

1. Remove `Textarea` from PrimeNG import, remove `messageText = signal('')`
2. Add `viewChild<ElementRef<HTMLDivElement>>('composerEl')`, `composerEmpty = signal(true)`, `replyingTo = signal<DialogMessageDto | null>(null)` signals
3. Add `applyBold()`, `applyItalic()`, `applyCode()`, `handleComposerKeydown()`, `clearComposer()`, `focusComposer()`, `onComposerInput()`, `onPaste()`, `startReply()`, `cancelReply()`, `renderContent()` methods (identical to room-chat.ts, but with `DialogMessageDto` instead of `MessageDto`)
4. Update `sendMessage()` to read `serializeToMarkdown(composerEl().nativeElement.innerHTML)` and pass `replyingTo()?.id`
5. Add import for `parseInlineMarkdown`, `serializeToMarkdown`, `markersToHtml`, `DomSanitizer`

- [ ] **Step 3: Update direct-messages.html**

Apply the same pattern as `room-chat.html`:

1. Replace `<textarea pTextarea ...>` with `<div #composerEl contenteditable="true" ...>` (same classes)
2. Add formatting toolbar buttons (B, I, `</>`) before the emoji button with `(mousedown)="$event.preventDefault()"` and the corresponding click handlers
3. Add reply banner above the contenteditable (same structure as room-chat.html, using `replyingTo()` and `DialogMessageDto`)
4. Update existing message display `<p>` tags to use `[innerHTML]="renderContent(msg.content)"` instead of `{{ msg.content }}`
5. Add action bar (react + reply buttons) with same `group-hover:opacity-100` pattern — **no reactions here** (scope says DM reactions are out of v1), only reply button

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/app/features/dialogs/ 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/dialogs/
git commit -m "feat: WYSIWYG composer and reply UI in DM chat"
```

---

## Task 7: Backend — MessageReaction Entity + Migration

**Files:**
- Create: `src/ChatHerder.Domain/Entities/MessageReaction.cs`
- Modify: `src/ChatHerder.Infrastructure/Persistence/AppDbContext.cs`

- [ ] **Step 1: Create the entity**

Create `src/ChatHerder.Domain/Entities/MessageReaction.cs`:

```csharp
namespace ChatHerder.Domain.Entities;

public sealed class MessageReaction
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid MessageId { get; init; }
    public required Guid UserId { get; init; }
    public required string Emoji { get; init; }   // max 16 chars (emoji ZWJ sequences)
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;

    public Message Message { get; init; } = null!;
    public User User { get; init; } = null!;
}
```

- [ ] **Step 2: Register in AppDbContext**

In `src/ChatHerder.Infrastructure/Persistence/AppDbContext.cs`:

Add to the property list:
```csharp
public DbSet<MessageReaction> MessageReactions => Set<MessageReaction>();
```

Add to `OnModelCreating` (after the Messages block):
```csharp
// ── MessageReactions ───────────────────────────────────────────────────────
m.Entity<MessageReaction>(e =>
{
    e.HasKey(r => r.Id);
    e.HasIndex(r => new { r.MessageId, r.UserId, r.Emoji }).IsUnique();
    e.HasIndex(r => r.MessageId);
    e.Property(r => r.Emoji).HasMaxLength(16).IsRequired();
    e.HasOne(r => r.Message).WithMany().HasForeignKey(r => r.MessageId).OnDelete(DeleteBehavior.Cascade);
    e.HasOne(r => r.User).WithMany().HasForeignKey(r => r.UserId).OnDelete(DeleteBehavior.Cascade);
});
```

- [ ] **Step 3: Add EF Core migration**

```bash
cd src/ChatHerder.API
dotnet ef migrations add AddMessageReactions \
  --project ../ChatHerder.Infrastructure \
  --startup-project . \
  -- --environment Development
```

Expected output: `Build succeeded. ... Done. To undo this action, use 'ef migrations remove'`

- [ ] **Step 4: Verify migration file was created**

```bash
ls src/ChatHerder.Infrastructure/Persistence/Migrations/ | grep AddMessageReactions
```

Expected: one `*_AddMessageReactions.cs` file present.

- [ ] **Step 5: Build to confirm no errors**

```bash
dotnet build ChatHerder.sln 2>&1 | tail -5
```

Expected: `Build succeeded.`

- [ ] **Step 6: Commit**

```bash
git add src/ChatHerder.Domain/Entities/MessageReaction.cs \
        src/ChatHerder.Infrastructure/Persistence/AppDbContext.cs \
        src/ChatHerder.Infrastructure/Persistence/Migrations/
git commit -m "feat: add MessageReaction entity and EF migration"
```

---

## Task 8: Backend — Reaction Toggle Endpoint (TDD)

**Files:**
- Modify: `src/ChatHerder.Application/DTOs/MessageDtos.cs`
- Modify: `src/ChatHerder.API/Endpoints/MessageEndpoints.cs`
- Modify: `src/ChatHerder.API/Endpoints/RoomEndpoints.cs`
- Create: `tests/ChatHerder.Unit.Tests/Endpoints/ReactionEndpointsTests.cs`

- [ ] **Step 1: Add DTOs**

In `src/ChatHerder.Application/DTOs/MessageDtos.cs`, add at the end:

```csharp
public sealed record ToggleReactionRequest(string Emoji);
public sealed record ReactionSummaryDto(string Emoji, int Count, IReadOnlyList<Guid> UserIds);
```

Also update `MessageDto` to include reactions:

```csharp
public sealed record MessageDto(
    Guid Id,
    long SequenceNumber,
    string? Content,
    UserSummary Sender,
    DateTime SentAt,
    DateTime? EditedAt,
    bool IsDeleted,
    MessageDto? ReplyTo,
    AttachmentDto? Attachment,
    IReadOnlyList<ReactionSummaryDto> Reactions);   // ← new last parameter
```

- [ ] **Step 2: Write failing unit tests**

Create `tests/ChatHerder.Unit.Tests/Endpoints/ReactionEndpointsTests.cs`:

```csharp
using ChatHerder.API.Endpoints;
using ChatHerder.API.Hubs;
using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Endpoints;

public sealed class ReactionEndpointsTests
{
    private static (AppDbContext db, SqliteConnection conn) BuildContext()
    {
        var conn = new SqliteConnection("DataSource=:memory:");
        conn.Open();
        var opts = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conn).Options;
        var db = new AppDbContext(opts);
        db.Database.EnsureCreated();
        return (db, conn);
    }

    private static ClaimsPrincipal Principal(Guid userId) =>
        new(new ClaimsIdentity([new Claim("user_id", userId.ToString())], "Test"));

    private static int StatusCode(IResult result) =>
        (int)(result.GetType().GetProperty("StatusCode")?.GetValue(result) ?? 0);

    private static (Room room, Guid ownerId) SeedRoom(AppDbContext db)
    {
        var ownerId = Guid.NewGuid();
        db.Users.Add(new User { Id = ownerId, Username = "owner", Email = "o@x.com", PasswordHash = "x" });
        var room = new Room { Name = "r1", OwnerId = ownerId, Visibility = RoomVisibility.Public };
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership { RoomId = room.Id, UserId = ownerId, Role = MemberRole.Owner });
        db.SaveChanges();
        return (room, ownerId);
    }

    private static Message SeedMessage(AppDbContext db, Guid roomId, Guid authorId)
    {
        var msg = new Message { RoomId = roomId, AuthorId = authorId, Content = "hi", SequenceNumber = 1 };
        db.Messages.Add(msg);
        db.SaveChanges();
        return msg;
    }

    [Fact]
    public async Task ToggleReaction_AddsReaction_WhenNoneExists()
    {
        var (db, conn) = BuildContext();
        await using var _ = db; await using var __ = conn;
        var (room, ownerId) = SeedRoom(db);
        var msg = SeedMessage(db, room.Id, ownerId);
        var chatHub = Substitute.For<IHubContext<ChatHub>>();
        chatHub.Clients.Returns(Substitute.For<IHubClients>());
        chatHub.Clients.Group(Arg.Any<string>()).Returns(Substitute.For<IClientProxy>());

        var result = await MessageEndpoints.ToggleReactionInternal(
            msg.Id, new ToggleReactionRequest("👍"), Principal(ownerId), db, chatHub, CancellationToken.None);

        Assert.Equal(StatusCodes.Status204NoContent, StatusCode(result));
        Assert.Single(db.MessageReactions.Where(r => r.MessageId == msg.Id && r.Emoji == "👍"));
    }

    [Fact]
    public async Task ToggleReaction_RemovesReaction_WhenAlreadyExists()
    {
        var (db, conn) = BuildContext();
        await using var _ = db; await using var __ = conn;
        var (room, ownerId) = SeedRoom(db);
        var msg = SeedMessage(db, room.Id, ownerId);
        db.MessageReactions.Add(new MessageReaction { MessageId = msg.Id, UserId = ownerId, Emoji = "👍" });
        db.SaveChanges();
        var chatHub = Substitute.For<IHubContext<ChatHub>>();
        chatHub.Clients.Returns(Substitute.For<IHubClients>());
        chatHub.Clients.Group(Arg.Any<string>()).Returns(Substitute.For<IClientProxy>());

        var result = await MessageEndpoints.ToggleReactionInternal(
            msg.Id, new ToggleReactionRequest("👍"), Principal(ownerId), db, chatHub, CancellationToken.None);

        Assert.Equal(StatusCodes.Status204NoContent, StatusCode(result));
        Assert.Empty(db.MessageReactions.Where(r => r.MessageId == msg.Id && r.Emoji == "👍"));
    }

    [Fact]
    public async Task ToggleReaction_Returns404_WhenMessageNotFound()
    {
        var (db, conn) = BuildContext();
        await using var _ = db; await using var __ = conn;
        var chatHub = Substitute.For<IHubContext<ChatHub>>();

        var result = await MessageEndpoints.ToggleReactionInternal(
            Guid.NewGuid(), new ToggleReactionRequest("👍"), Principal(Guid.NewGuid()), db, chatHub, CancellationToken.None);

        Assert.Equal(StatusCodes.Status404NotFound, StatusCode(result));
    }

    [Fact]
    public async Task ToggleReaction_Returns403_WhenNotRoomMember()
    {
        var (db, conn) = BuildContext();
        await using var _ = db; await using var __ = conn;
        var (room, ownerId) = SeedRoom(db);
        var msg = SeedMessage(db, room.Id, ownerId);
        var nonMember = Guid.NewGuid();
        db.Users.Add(new User { Id = nonMember, Username = "stranger", Email = "s@x.com", PasswordHash = "x" });
        db.SaveChanges();
        var chatHub = Substitute.For<IHubContext<ChatHub>>();

        var result = await MessageEndpoints.ToggleReactionInternal(
            msg.Id, new ToggleReactionRequest("👍"), Principal(nonMember), db, chatHub, CancellationToken.None);

        Assert.Equal(StatusCodes.Status403Forbidden, StatusCode(result));
    }

    [Fact]
    public async Task ToggleReaction_Returns400_WhenEmojiEmpty()
    {
        var (db, conn) = BuildContext();
        await using var _ = db; await using var __ = conn;
        var chatHub = Substitute.For<IHubContext<ChatHub>>();

        var result = await MessageEndpoints.ToggleReactionInternal(
            Guid.NewGuid(), new ToggleReactionRequest(""), Principal(Guid.NewGuid()), db, chatHub, CancellationToken.None);

        Assert.Equal(StatusCodes.Status400BadRequest, StatusCode(result));
    }

    [Fact]
    public async Task ToggleReaction_BroadcastsReactionToggled_ViaSignalR()
    {
        var (db, conn) = BuildContext();
        await using var _ = db; await using var __ = conn;
        var (room, ownerId) = SeedRoom(db);
        var msg = SeedMessage(db, room.Id, ownerId);
        var clientProxy = Substitute.For<IClientProxy>();
        var chatHub = Substitute.For<IHubContext<ChatHub>>();
        chatHub.Clients.Returns(Substitute.For<IHubClients>());
        chatHub.Clients.Group($"room:{room.Id}").Returns(clientProxy);

        await MessageEndpoints.ToggleReactionInternal(
            msg.Id, new ToggleReactionRequest("❤️"), Principal(ownerId), db, chatHub, CancellationToken.None);

        await clientProxy.Received(1).SendCoreAsync(
            "ReactionToggled", Arg.Any<object[]>(), Arg.Any<CancellationToken>());
    }
}
```

- [ ] **Step 3: Run to confirm RED**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "ReactionEndpointsTests" 2>&1 | tail -10
```

Expected: FAIL — `ToggleReactionInternal` not found.

- [ ] **Step 4: Implement the endpoint in MessageEndpoints.cs**

Add to `MessageEndpoints.cs` — inside `MapMessageEndpoints` add the route:

```csharp
group.MapPost("/{id:guid}/reactions", ToggleReaction).RequireAuthorization();
```

Add the internal testable wrapper:
```csharp
internal static Task<IResult> ToggleReactionInternal(
    Guid id, ToggleReactionRequest req, ClaimsPrincipal p,
    AppDbContext db, IHubContext<ChatHub> chatHub, CancellationToken ct)
    => ToggleReaction(id, req, p, db, chatHub, ct);
```

Add required using statements at the top of the file:
```csharp
using ChatHerder.API.Hubs;
using ChatHerder.Domain.Entities;
using Microsoft.AspNetCore.SignalR;
```

Add the private handler:
```csharp
private static async Task<IResult> ToggleReaction(
    Guid id,
    ToggleReactionRequest req,
    ClaimsPrincipal principal,
    AppDbContext db,
    IHubContext<ChatHub> chatHub,
    CancellationToken ct)
{
    if (string.IsNullOrEmpty(req.Emoji) || req.Emoji.Length > 16)
        return Results.BadRequest(new { error = "Invalid emoji." });

    if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
        return Results.Unauthorized();

    var msg = await db.Messages.FirstOrDefaultAsync(m => m.Id == id && m.DeletedAt == null, ct);
    if (msg is null) return Results.NotFound();

    var isMember = await db.RoomMemberships
        .AnyAsync(m => m.RoomId == msg.RoomId && m.UserId == userId, ct);
    if (!isMember) return Results.Forbid();

    var existing = await db.MessageReactions
        .FirstOrDefaultAsync(r => r.MessageId == id && r.UserId == userId && r.Emoji == req.Emoji, ct);

    if (existing is not null)
        db.MessageReactions.Remove(existing);
    else
        db.MessageReactions.Add(new MessageReaction { MessageId = id, UserId = userId, Emoji = req.Emoji });

    await db.SaveChangesAsync(ct);

    var userIds = await db.MessageReactions
        .Where(r => r.MessageId == id && r.Emoji == req.Emoji)
        .Select(r => r.UserId)
        .ToListAsync(ct);

    await chatHub.Clients.Group($"room:{msg.RoomId}").SendAsync(
        "ReactionToggled",
        new { messageId = id, emoji = req.Emoji, count = userIds.Count, userIds },
        ct);

    return Results.NoContent();
}
```

- [ ] **Step 5: Update RoomEndpoints.ToDto to include reactions**

In `RoomEndpoints.cs`, update `ToDto` signature and `GetMessages` query.

Change `internal static MessageDto ToDto(Message m) => new(` to accept optional reactions:

```csharp
internal static MessageDto ToDto(Message m, IEnumerable<MessageReaction>? reactions = null) => new(
    m.Id,
    m.SequenceNumber,
    m.DeletedAt == null ? m.Content : null,
    new UserSummary(m.Author.Id, m.Author.Username, m.Author.AvatarUrl),
    m.SentAt,
    m.EditedAt,
    m.DeletedAt != null,
    m.ReplyToMessage is null
        ? null
        : new MessageDto(
            m.ReplyToMessage.Id,
            m.ReplyToMessage.SequenceNumber,
            m.ReplyToMessage.DeletedAt == null ? m.ReplyToMessage.Content : null,
            new UserSummary(m.ReplyToMessage.Author.Id, m.ReplyToMessage.Author.Username,
                m.ReplyToMessage.Author.AvatarUrl),
            m.ReplyToMessage.SentAt, m.ReplyToMessage.EditedAt, m.ReplyToMessage.DeletedAt != null, null, null, []),
    m.Attachment is null
        ? null
        : new AttachmentDto(m.Attachment.Id, m.Attachment.FileName,
            m.Attachment.ContentType, m.Attachment.SizeBytes, m.Attachment.Comment),
    (reactions ?? [])
        .GroupBy(r => r.Emoji)
        .Select(g => new ReactionSummaryDto(g.Key, g.Count(), g.Select(r => r.UserId).ToList()))
        .ToList());
```

Also add `using ChatHerder.Domain.Entities;` to the top if not present.

In `GetMessages`, after `var messages = await query.ToListAsync(ct);`, replace the return:

```csharp
var messages = await query.ToListAsync(ct);
var msgIds = messages.Select(m => m.Id).ToList();
var reactions = await db.MessageReactions
    .Where(r => msgIds.Contains(r.MessageId))
    .ToListAsync(ct);
var reactionsByMsg = reactions.GroupBy(r => r.MessageId)
    .ToDictionary(g => g.Key, g => (IEnumerable<MessageReaction>)g.ToList());
return Results.Ok(messages.Select(m => ToDto(m, reactionsByMsg.GetValueOrDefault(m.Id))));
```

- [ ] **Step 6: Run to confirm GREEN**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "ReactionEndpointsTests" 2>&1 | tail -10
```

Expected: all 5 tests pass.

- [ ] **Step 7: Run full .NET test suite**

```bash
dotnet test ChatHerder.sln 2>&1 | tail -5
```

Expected: all existing tests + 5 new reaction tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/ChatHerder.Application/DTOs/MessageDtos.cs \
        src/ChatHerder.API/Endpoints/MessageEndpoints.cs \
        src/ChatHerder.API/Endpoints/RoomEndpoints.cs \
        tests/ChatHerder.Unit.Tests/Endpoints/ReactionEndpointsTests.cs
git commit -m "feat: add reaction toggle endpoint with SignalR broadcast and history reactions"
```

---

## Task 9: Reaction Emojis Data

**Files:**
- Create: `frontend/src/app/shared/utils/reaction-emojis.ts`

- [ ] **Step 1: Create the emoji data file**

Create `frontend/src/app/shared/utils/reaction-emojis.ts`:

```typescript
export interface EmojiCategory {
  label: string;
  emojis: string[];
}

export const REACTION_EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    label: 'Smileys',
    emojis: ['😀','😂','😍','🥲','😎','🤔','😅','🙃','😇','🥳','😤','😢','😱','🤯','🤩','😬'],
  },
  {
    label: 'Gestures',
    emojis: ['👍','👎','👏','🙏','🤝','✌️','🤞','🫶','👋','🤜','🤛','💪','🖕','👌','🤙','🫡'],
  },
  {
    label: 'Hearts',
    emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❤️‍🔥','💕','💞','💓','💗','💖','💝'],
  },
  {
    label: 'Objects',
    emojis: ['🎉','🔥','⚡','💯','🚀','💎','🎯','👀','🎊','🏆','🌟','💥','🎶','🍕','☕','🎁'],
  },
  {
    label: 'Symbols',
    emojis: ['✅','❌','⭐','💡','📌','🔔','❓','‼️','➕','➖','🔄','⏰','📢','🚫','⚠️','🔑'],
  },
];

export const REACTION_EMOJIS = REACTION_EMOJI_CATEGORIES.flatMap(c => c.emojis);

/** Emoji name lookup for search filtering. */
export const EMOJI_NAMES: Record<string, string> = {
  '😀':'grinning','😂':'joy laugh','😍':'heart eyes love','🥲':'smiling tear','😎':'cool sunglasses',
  '🤔':'thinking','😅':'sweat smile','🙃':'upside down','😇':'angel halo','🥳':'party',
  '😤':'steam nose','😢':'cry','😱':'scream','🤯':'exploding head mind blown','🤩':'star struck',
  '😬':'grimace','👍':'thumbs up like','👎':'thumbs down dislike','👏':'clapping hands',
  '🙏':'folded hands please pray','🤝':'handshake','✌️':'victory peace','🤞':'crossed fingers luck',
  '🫶':'heart hands','👋':'wave hello','💪':'flex muscle strong','❤️':'red heart love',
  '🧡':'orange heart','💛':'yellow heart','💚':'green heart','💙':'blue heart','💜':'purple heart',
  '🖤':'black heart','🤍':'white heart','💔':'broken heart','💕':'two hearts','🎉':'party tada',
  '🔥':'fire hot','⚡':'lightning bolt','💯':'hundred points perfect','🚀':'rocket launch',
  '💎':'gem diamond','🎯':'bullseye target','👀':'eyes watching','✅':'check mark done',
  '❌':'cross mark wrong','⭐':'star','💡':'light bulb idea','📌':'pin','🔔':'bell notification',
  '❓':'question','‼️':'double exclamation','⚠️':'warning','🚫':'prohibited no',
};
```

- [ ] **Step 2: Verify no import errors**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "reaction-emojis" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/shared/utils/reaction-emojis.ts
git commit -m "feat: add curated reaction emoji dataset with search names"
```

---

## Task 10: Update DEVELOPMENT_LOG and Final Verification

- [ ] **Step 1: Run full .NET test suite**

```bash
dotnet test ChatHerder.sln 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 2: Run full Angular test suite**

```bash
cd frontend && npx vitest run 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 3: Angular production build check**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: build succeeds (bundle budget warning about size is pre-existing and acceptable).

- [ ] **Step 4: TypeScript strict check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 5: Append DEVELOPMENT_LOG.md**

Append the following entry (use the next T-number after the last entry):

```
`[2026-04-19 T{N}]` | **[Feature] UI enhancements — collapsible sidebar, WYSIWYG composer, reply UI, message reactions, favicon** | Five independent features implemented per spec `docs/superpowers/specs/2026-04-19-ui-enhancements-design.md`. (1) Favicon: `favicon.svg` (slate chat bubble, #545f73), `index.html` title → "AI Chat Herder", Angular `Title` service. (2) Sidebar collapse: `sidebarCollapsed` signal + `toggleSidebar()` with localStorage persistence; collapsed icon strip (48px) shows icon-only rows for rooms and contacts with tooltip titles; toggle chevron pinned top-right. (3) WYSIWYG composer: `<textarea>` replaced with `contenteditable` div in room-chat and direct-messages; formatting toolbar (Bold/Italic/Code) uses `document.execCommand`; `serializeToMarkdown()` on send, `parseInlineMarkdown()` on display via `[innerHTML]` + `DomSanitizer`; existing messages unchanged (no migration). (4) Reply UI: action bar (`opacity-0 group-hover:opacity-100`) with react/reply/edit/delete buttons; `replyingTo` signal; reply banner above composer with dismiss; `replyToId` wired to `sendMessage()`. (5) Reactions: `MessageReaction` entity + EF migration; toggle endpoint `POST /api/messages/{id}/reactions` (204, idempotent add/remove); `ReactionToggled` SignalR event via ChatHub group; `ReactionSummaryDto` added to `MessageDto`; `ReactionsApiService` + optimistic UI update + rollback; reaction emoji picker (16 emoji in action bar popover); reaction pills below messages. | All files per plan `docs/superpowers/plans/2026-04-19-ui-enhancements.md` | **[VERIFIED]**
```

- [ ] **Step 6: Commit**

```bash
git add DEVELOPMENT_LOG.md
git commit -m "chore: update DEVELOPMENT_LOG for UI enhancements feature"
```
