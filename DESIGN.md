# DESIGN.md — Slate Protocol Design System

**Source:** Stitch project `8437817411820068917` "Classic Pro Messenger"
**Design system name:** Slate Protocol
**Creative direction:** Architectural Workspace / Structured Clarity
**Last exported:** 2026-04-18

> This file is the design system reference for all frontend work. Angular component CSS/SCSS must consume `designs/tokens.css` variables and follow the rules below. Keep this file in sync with `AGENT.md` §3.2 (Frontend coding standards).

---

## 1. Creative North Star — "Structured Clarity"

The UI is a **high-end editorial workspace**, not a consumer messaging app. Think glass-walled executive office: deep slate frames wrapping a pure white content canvas. The aesthetic is curated, permanent, and essential — not playful.

Key visual principles:
- Heavy, authoritative frame (sidebars) + luminous white content area
- Intentional asymmetry and high-density typography
- Tonal depth over decorative chrome

---

## 2. Surface Hierarchy

Treat the UI as nested physical layers:

| Layer | Token | Hex | Usage |
|-------|-------|-----|-------|
| The Canvas | `--color-surface-container-lowest` | `#ffffff` | Main message area — maximum legibility |
| The Recess | `--color-surface-container-low` | `#f0f4f7` | Search bars, message input — "carved out" effect |
| The Container | `--color-surface-container` | `#e8eff3` | Sidebars, panels |
| The Frame | `--color-primary` | `#545f73` | Navigation drawer |
| App Background | `--color-surface` | `#f7f9fb` | Page background |

### The "No-Line" Rule

**Prohibit 1px solid borders for sectioning.** Boundaries are defined solely by background color shifts. The eye perceives edges through tonal contrast, not drawn lines.

- ✅ `background-color` shift to define zones
- ✅ `--ghost-border` (`rgba(169, 180, 185, 0.15)`) for accessibility fallback only
- ❌ `border: 1px solid` for structural sectioning

### The "Glass & Gradient" Rule

- **Navigation drawer:** `background: var(--nav-gradient)` (primary → primary-dim, top to bottom)
- **Floating elements** (context menus, profile cards): Glassmorphism
  ```css
  background: var(--glass-bg);           /* rgba(255,255,255,0.85) */
  backdrop-filter: blur(var(--glass-blur)); /* 12px */
  ```

---

## 3. Color Palette

### Primary Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-primary` | `#545f73` | Nav drawer, primary buttons, active states |
| `--color-primary-dim` | `#485367` | Nav drawer gradient end |
| `--color-on-primary` | `#f6f7ff` | Text on primary buttons |
| `--color-primary-container` | `#d8e3fb` | Chips, tags |

### Status Indicators

| State | Token | Hex | Size |
|-------|-------|-----|------|
| Online | `--color-status-online` | `#4caf50` | 8px circle |
| AFK | `--color-status-afk` | `#ffb300` | 8px circle |
| Offline | `--color-status-offline` | `#717c82` | 8px circle |

Status dots use a "porthole" cutout: `border: var(--status-dot-border)` matching `--color-surface-container-lowest`.

### Error States

| Token | Hex |
|-------|-----|
| `--color-error` | `#9f403d` |
| `--color-error-container` | `#fe8983` |
| `--color-on-error` | `#fff7f6` |

---

## 4. Typography — "The Editorial Voice"

**Font family:** Inter (all — body, headline, label)

```css
font-family: var(--font-family); /* 'Inter', system-ui, sans-serif */
```

### Hierarchy

| Role | Token | Size | Weight | Usage |
|------|-------|------|--------|-------|
| The Authority | `title-sm` | `0.875rem` | 600 | Usernames, section labels |
| The Narrative | `body-md` | `0.875rem` | 400 | Message body — line-height 1.5 |
| The Metadata | `label-sm` | `0.625rem` | 400 | Timestamps, status text |
| The Display | `headline-sm` | `1.5rem` | 600 | Channel names, settings headers (use sparingly) |

### Rules

- **Actionable text** (buttons, links): semi-bold (`--font-weight-semibold: 600`)
- **Informational text** (body, metadata): regular (`--font-weight-regular: 400`)
- **Metadata letter spacing:** `var(--letter-spacing-metadata)` = `0.02em` — gives an "expensive editorial feel"
- **Message body line height:** `var(--line-height-normal)` = `1.5`

---

## 5. Roundness

Scale base: `ROUND_FOUR` (0.25rem increments)

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-xs` / `--radius-sm` | `0.125rem` | Tooltips, overlays — sharper professional edge |
| `--radius-md` | `0.375rem` | Buttons |
| `--radius-lg` | `0.5rem` | **Maximum for structural elements** |
| `--radius-full` | `9999px` | Avatars, status dots |

**Rule:** Never exceed `--radius-lg` for structural elements. Higher roundness = "playful" — violates the Architectural aesthetic.

---

## 6. Elevation & Shadow

Depth via **tonal layering only** — not drop shadows.

- **Floating state (modals):** `box-shadow: var(--shadow-ambient)` = `0 4px 24px 0 rgba(42,52,57,0.04)`
- **No heavy drop shadows.** The 4% opacity ambient shadow is the maximum.
- **Layering principle:** `surface-container-lowest` (white) card on `surface-container` (light gray) background — contrast provides the "lift".

---

## 7. Component Specs

### Buttons

| Variant | Background | Text | Border | Roundness |
|---------|-----------|------|--------|-----------|
| Primary | `--color-primary` | `--color-on-primary` | none | `--radius-md` |
| Secondary | `--color-surface-container-high` | `--color-on-surface` | none | `--radius-md` |
| Tertiary | transparent | `--color-primary` | none (box hidden until hover) | `--radius-md` |

### Input Fields

```css
background: var(--color-surface-container-low);
/* Focus state — NOT a thick border: */
border-bottom: 2px solid var(--color-primary);
/* OR: */
outline: 1px solid rgba(84, 95, 115, 0.5);
```

### Message Threads

- **No divider lines** between messages — use vertical whitespace (`--spacing-4`)
- **Message grouping:** consecutive messages from same user → show avatar/name on first only
- Deleted messages render as: `"Message deleted"` in `--color-on-surface-variant` italic

### Status Dots

```css
.status-dot {
  width:  var(--status-dot-size);   /* 8px */
  height: var(--status-dot-size);
  border-radius: var(--radius-full);
  border: var(--status-dot-border); /* 2px solid #ffffff — porthole cutout */
}
.status-dot--online  { background: var(--color-status-online); }
.status-dot--afk     { background: var(--color-status-afk); }
.status-dot--offline { background: var(--color-status-offline); }
```

### Tooltips & Overlays

```css
background: var(--color-inverse-surface);  /* #0b0f10 */
color: var(--color-inverse-on-surface);
border-radius: var(--radius-xs);           /* sharp edge */
```

---

## 8. Spacing

Grid base: 4px (`--spacing-1`)

| Token | Value | Common use |
|-------|-------|-----------|
| `--spacing-2` | `0.5rem` | Tight gaps, icon padding |
| `--spacing-3` | `0.75rem` | Input padding |
| `--spacing-4` | `1rem` | `spacing-md` — message vertical gap |
| `--spacing-6` | `1.5rem` | Section padding |
| `--spacing-8` | `2rem` | Panel padding |

---

## 9. Do's and Don'ts

### Do
- Use whitespace to separate content. Let the white "paper" areas breathe.
- Use tonal shifts (`surface` → `surface_variant`) to indicate different functional zones.
- Use Inter semi-bold for actionable text, regular for informational text.

### Don't
- **Don't** use 1px solid borders to create boxes.
- **Don't** use generic drop shadows. Stick to tonal layering or the 4% ambient shadow.
- **Don't** use vibrant colors for structural elements — reserve color for functional status (Online/AFK) or critical errors.
- **Don't** use `border-radius` higher than `--radius-lg` (0.5rem) for structural components.

---

## 10. Exported Mockups

All mockup HTML files are in `./designs/`. Open any file in a browser for a pixel-accurate reference.

| File | Screen |
|------|--------|
| `designs/authentication.html` | Sign In + Register + Forgot Password |
| `designs/main-chat-interface.html` | Main Chat (room view, sidebar, members panel) |
| `designs/private-messaging.html` | DM / Personal Dialog |
| `designs/contacts-management.html` | Contacts / Friends list |
| `designs/public-room-catalog.html` | Public Room Catalog + Search |
| `designs/manage-room-settings.html` | Admin Modal (Members / Admins / Bans / Invitations / Settings tabs) |
| `designs/profile-settings.html` | User Profile & Settings |
| `designs/security-sessions.html` | Active Sessions management |
| `designs/friend-requests.html` | Friend Requests — incoming (Accept/Decline) + sent (Pending/Declined status) |
| `designs/room-invitations.html` | Room Invitations — pending private room invite cards with Accept/Decline |
| `designs/platform-ban-admin.html` | Platform Ban Admin — issue ban form, active bans table, revoked bans section |

**CSS tokens:** `designs/tokens.css` — import this in every Angular component stylesheet or in `styles.scss` globally.

---

## 11. Angular Integration

```scss
// styles.scss (global)
@import 'designs/tokens.css';

// or in angular.json styles array:
// "designs/tokens.css"
```

Component usage:
```scss
.sidebar {
  background: var(--color-surface-container);
  // NOT: background: #e8eff3  ← no hardcoded hex values
}

.message-area {
  background: var(--color-surface-container-lowest);
}

.message-input {
  background: var(--color-surface-container-low);
  font-family: var(--font-family);
  font-size: var(--font-size-body-md);
  line-height: var(--line-height-normal);
}
```

> **Sync rule:** Any change to the Stitch design system must be reflected in both `designs/tokens.css` and `DESIGN.md`. Update `DEVELOPMENT_LOG.md` with the task entry before editing.
