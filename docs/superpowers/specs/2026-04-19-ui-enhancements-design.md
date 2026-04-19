# UI Enhancements Design
**Date:** 2026-04-19  
**Status:** Approved  
**Features:** Collapsible Sidebar · WYSIWYG Composer · Reply/Citation · Message Reactions · Favicon + Title

---

## 1. Collapsible Sidebar

### Behaviour
The workspace sidebar toggles between **expanded** (`w-72` / 288 px) and **collapsed** (`w-12` / 48 px) states. Transition: `transition-[width] duration-200 ease-in-out overflow-hidden`. Preference persisted in `localStorage` under key `sidebar_collapsed`.

### State
`WorkspaceShellComponent` gains:
```typescript
sidebarCollapsed = signal(false);
```
Initialised from `localStorage` on component construction. Written back on every toggle.

### Toggle Control
A `chevron_left` / `chevron_right` Material Symbol button pinned to the **top-right corner of the sidebar**. Visible in both states. At 48 px it flips to `chevron_right`.

### Collapsed Icon Strip (48 px)
| Area | Expanded | Collapsed |
|---|---|---|
| Header | Logo icon + "Workspace" text | Logo icon only |
| Search | Full input | `search` icon only — click expands |
| Public rooms | Room name rows + unread badge | `public`/`lock` icon per room; unread dot on icon |
| Private rooms | Same | Same |
| Contacts | Avatar + name + presence dot | Avatar only (6 px overlap stack) + presence dot |
| Bottom | "Create Room" button + "Sign out" button | `add` icon + `logout` icon |

All collapsed icon items carry a `title` tooltip with the full label.

### Active Indication (Collapsed)
Active room icon receives a 3 px left accent bar in `bg-primary` — equivalent to VS Code's activity bar active indicator.

### Accordion State
When the sidebar is collapsed, all accordion sections (Public Rooms, Private Rooms, Contacts) ignore their expanded/collapsed signal — items render as icon-only rows regardless.

---

## 2. WYSIWYG Composer (Minimal Formatting)

### Storage Format
Messages are stored as **lightweight inline markers** — a subset of Markdown:

| Format | Stored | Rendered |
|---|---|---|
| Bold | `**text**` | `<strong>text</strong>` |
| Italic | `_text_` | `<em>text</em>` |
| Inline code | `` `text` `` | `<code>text</code>` |

Existing plain-text messages render unchanged — no DB migration required.

### Composer Input Element
The current `<textarea>` is replaced with a `<div contenteditable="true">`. This gives true in-place WYSIWYG formatting while editing.

### Toolbar
Three buttons added to the composer toolbar, left of the emoji button:

| Button | Label | Shortcut | execCommand |
|---|---|---|---|
| Bold | **B** | `Ctrl+B` | `document.execCommand('bold')` |
| Italic | _I_ | `Ctrl+I` | `document.execCommand('italic')` |
| Code | `<>` | `Ctrl+\`` | Wraps selection in `<code>` tag |

Button "active" state (pressed appearance) reflects `document.queryCommandState('bold' | 'italic')` and whether selection is inside a `<code>` node.

### Send Serialization
On send, the contenteditable `innerHTML` is serialized to marker syntax before transmission:
- `<b>`, `<strong>` → `**...**`
- `<i>`, `<em>` → `_..._`
- `<code>` → `` `...` ``
- Block elements (`<div>`, `<p>`) → newlines
- All other tags stripped

### Display Rendering
A `parseInlineMarkdown(text: string): SafeHtml` utility function converts stored markers to sanitized HTML. Applied via `[innerHTML]` on message text elements. Uses Angular's `DomSanitizer.bypassSecurityTrustHtml()` after sanitizing with a whitelist allowing only `<strong>`, `<em>`, `<code>`.

### Paste Handling
On paste, strip all HTML — accept plain text only (`clipboardData.getData('text/plain')`). Prevents injection of external markup.

### Keyboard Behaviour
- `Enter` (no modifier) → send message (unchanged)
- `Shift+Enter` → insert newline (unchanged)
- `Ctrl+B` / `Ctrl+I` / `Ctrl+\`` → apply formatting to selection

### Edit Mode
When a user opens an existing message for editing, the stored marker text is **parsed to HTML** before being loaded into the contenteditable (`**bold**` → `<strong>bold</strong>`) so the editing experience remains WYSIWYG. On cancel, the contenteditable is cleared without sending.

### Scope
Room chat composer and DM composer both receive this upgrade (both use the same pattern).

---

## 3. Reply / Citation

### Backend Status
**Already complete.** `MessageDto.replyTo`, `DialogMessageDto.replyTo`, and the `replyToId` parameters on `SendMessage` / `SendDirectMessage` hub methods are all implemented. Display quote block (`border-l-2 border-primary/50`) already renders in the message list.

### Message Action Bar
A glassmorphism pill toolbar that appears on message hover:

```
opacity-0 group-hover:opacity-100 transition-opacity duration-150
```

Positioned: `absolute -top-4 right-2` relative to the message bubble container. Style: `bg-white/85 backdrop-blur-[12px] shadow-sm ring-1 ring-outline-variant/15 rounded-lg px-1 py-0.5 flex items-center gap-0.5`.

**Buttons (all messages):**
- 😊 — open reaction emoji picker (`data-testid="react-btn"`)
- ↩ — reply (`data-testid="reply-btn"`)

**Additional buttons (own messages only):**
- ✏️ — edit message (`data-testid="edit-btn"`)
- 🗑️ — delete message (`data-testid="delete-btn"`)

### Reply State
`RoomChatComponent` gains:
```typescript
replyingTo = signal<MessageDto | null>(null);
```
`DirectMessagesComponent` gains the equivalent with `DialogMessageDto`.

The message bubble container div gains `relative` positioning to anchor the action bar correctly.

### Reply Banner
When `replyingTo()` is non-null, a banner renders **above the composer toolbar**, inside the composer container:

```
bg-primary-container/40 border-l-2 border-primary rounded-t-lg px-4 py-2
flex items-center justify-between
```

Contents:
- Left: `↩ Replying to **username**` + truncated quoted text (max 80 chars, `text-xs text-on-surface-variant`)
- Right: `✕` button clears `replyingTo`

Composer receives focus automatically when `replyingTo` is set.

### Sending
`sendMessage()` reads `replyingTo()?.id` as the `replyToId` argument. After send, `replyingTo.set(null)`.

### Scope
Identical implementation in DM composer with `DialogMessageDto`.

---

## 4. Message Reactions

### Database
New EF Core entity and migration:

```csharp
public class MessageReaction
{
    public Guid Id { get; init; }
    public Guid MessageId { get; init; }
    public Message Message { get; init; } = null!;
    public Guid UserId { get; init; }
    public User User { get; init; } = null!;
    public string Emoji { get; init; } = "";      // max 16 chars (emoji ZWJ sequences)
    public DateTime CreatedAt { get; init; }
}
// Unique index: (MessageId, UserId, Emoji)
// Index: MessageId (for history fetch)
```

`AppDbContext` gains `DbSet<MessageReaction> MessageReactions`.

### API Endpoint
```
POST /api/messages/{messageId}/reactions
Body: { "emoji": "👍" }
```

Toggle semantics — adds if absent, removes if present. Returns **204 No Content**. Broadcasts `ReactionToggled` SignalR event to the room group. Validates:
- Message exists and belongs to a room the caller is a member of
- Emoji string non-empty, max 16 chars
- Not a deleted message

### SignalR Event
`ReactionToggled` sent via `ChatHub.Clients.Group($"room:{roomId}")`:

```json
{
  "messageId": "uuid",
  "emoji": "👍",
  "count": 3,
  "userIds": ["uid1", "uid2", "uid3"]
}
```

`ChatService` handles `ReactionToggled` and patches the local message list in-place — finding the message by ID and updating its `reactions` array.

### DTO Addition
`MessageDto` gains:
```typescript
reactions: ReactionSummaryDto[];
// ReactionSummaryDto: { emoji: string; count: number; userIds: string[] }
```

Populated in the history endpoint (room message fetch) and included in `MessageReceived` events going forward. Existing history queries join `MessageReactions` grouped by emoji.

### Frontend — Emoji Picker for Reactions
No external library. A static `REACTION_EMOJIS` constant (~80 emoji) organised in 5 categories:

| Category | Sample |
|---|---|
| Smileys | 😀 😂 😍 🥲 😎 🤔 😅 🙃 |
| Gestures | 👍 👎 👏 🙏 🤝 ✌️ 🤞 🫶 |
| Hearts | ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 |
| Objects | 🎉 🔥 ⚡ 💯 🚀 💎 🎯 👀 |
| Symbols | ✅ ❌ ⭐ 💡 📌 🔔 ❓ ‼️ |

A text `<input>` at the top filters by emoji name (using a `EMOJI_NAMES` lookup map). Rendered as a glassmorphism popover anchored to the 😊 button in the action bar. Clicking an emoji calls the toggle endpoint and closes the picker.

### Frontend — Reaction Pills
Rendered below the message bubble when `reactions.length > 0`, as a flex-wrap row:

```
flex flex-wrap gap-1 mt-1
```

Each pill:
```
h-6 px-2 rounded-full text-xs flex items-center gap-1 cursor-pointer select-none transition-colors
```

| State | Style |
|---|---|
| Current user reacted | `bg-primary-container ring-1 ring-primary/30 text-on-primary-container` |
| Others only | `bg-surface-container text-on-surface hover:bg-surface-container-high` |

Clicking any pill toggles the current user's reaction via the toggle endpoint.

### Optimistic Update
On click, update `reactions` locally immediately. On HTTP error, roll back to previous state and show a brief error toast.

### Scope
Room messages only in v1. DM reactions are out of scope.

---

## 5. Favicon + App Title

### Title
`index.html` `<title>` → `AI Chat Herder`.  
Angular's `Title` service injected into `AppComponent.ngOnInit()`:
```typescript
this.title.setTitle('AI Chat Herder');
```

### Favicon
New file: `frontend/public/favicon.svg`

Design spec:
- 32×32 viewBox
- Rounded rectangle speech bubble, fill `#545f73` (primary slate)
- Three white ellipsis dots (`⬤ ⬤ ⬤`) centred inside
- Bottom-left pointer tail (chat bubble convention)
- SVG — scales crisply at all sizes

`index.html` link tags:
```html
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="icon" href="favicon.ico" sizes="any">   <!-- fallback -->
```

### Web Manifest
If `manifest.webmanifest` exists, update `name` → `"AI Chat Herder"` and `short_name` → `"ChatHerder"`.

---

## Implementation Order

| # | Feature | Backend | Frontend | Tests |
|---|---|---|---|---|
| 1 | Favicon + title | — | `index.html`, `AppComponent` | — |
| 2 | Sidebar collapse | — | `WorkspaceShellComponent` | Unit + E2E |
| 3 | WYSIWYG composer | — | `RoomChatComponent`, `DirectMessagesComponent` | Unit + E2E |
| 4 | Reply UI | — (done) | Both chat components | Unit + E2E |
| 5 | Reactions | EF migration + endpoint + SignalR | Both chat components | Unit (backend) + Unit (frontend) + E2E |

---

## Data-testid Contract

| Element | `data-testid` |
|---|---|
| Sidebar toggle button | `sidebar-toggle` |
| Collapsed sidebar | `sidebar-collapsed` |
| Bold button | `composer-bold` |
| Italic button | `composer-italic` |
| Code button | `composer-code` |
| Reply button (message action) | `reply-btn` |
| React button (message action) | `react-btn` |
| Reply banner | `reply-banner` |
| Reply banner dismiss | `reply-banner-dismiss` |
| Reaction picker popover | `reaction-picker` |
| Reaction pill | `reaction-pill-{emoji}` |
| Message action bar | `message-actions-{messageId}` |
