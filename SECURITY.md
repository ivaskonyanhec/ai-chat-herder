# Security Document — AI Chat Herder

> Last reviewed: 2026-04-20  
> Reviewer: Senior Security Analysis (T205)  
> Stack: .NET 10 Minimal APIs + SignalR + Angular 21 + PostgreSQL + Redis

---

## 1. Security Architecture Overview

### Authentication & Session Model
- **JWT (HMAC-SHA256)** — 15-minute access tokens, zero clock-skew tolerance, validated issuer + audience.
- **Refresh tokens** — 512-bit cryptographically random tokens stored as SHA-256 hashes in the database; transmitted only via `HttpOnly`, `SameSite=Lax`, path-restricted (`/api/auth`) cookies.
- **Session revocation** — Redis `sessions:valid:{userId}` set checked on every request by `SessionValidationMiddleware`. Logout, password change, password reset, and account deletion all call `RevokeAllAsync`.
- **Timing-attack mitigation** — Login always runs full Argon2id computation (sentinel hash) whether or not the email exists, preventing user-enumeration via timing.

### Password Security
- **Argon2id** with 64 MiB memory cost, 3 iterations, parallelism 1, 32-byte output.
- Constant-time comparison via `CryptographicOperations.FixedTimeEquals`.
- Minimum 8-character policy enforced on both registration and reset.

### Authorization
- Every protected endpoint uses `.RequireAuthorization()`.
- Room actions (send, edit, delete, ban, admin) enforce membership and ban checks in both the REST endpoints and the SignalR hub.
- File access enforces: room membership + not-banned (room files), dialog participation (DM files), uploader-only (orphan attachments).
- Admin/platform-ban endpoints are role-gated.

### Infrastructure Hardening
- **BanCheckMiddleware** — Redis `ban:{userId}` key checked before authorization; banned users receive 403.
- **AllowedHosts** — restricted to `localhost` in development; production must set the env var.
- **No raw SQL concatenation** — all DB access via EF Core parameterized queries or EF interpolated strings (`SqlQuery<T>($"...")`) which pass values as parameters.
- **Account deletion** anonymizes PII (`email` → `deleted.{id}@deleted.invalid`, `username` → UUID) to free the namespace while preserving the row for audit.

### Frontend Security
- Angular 21 HTTP client is XSS-safe by default (no `dangerouslySetInnerHTML`).
- Markdown rendering: `parseInlineMarkdown()` **escapes HTML first** (`escapeHtml()`) then applies regex replacements — prevents injection through markdown markers.
- `bypassSecurityTrustHtml` is used only with the output of `parseInlineMarkdown`, which is always pre-escaped.

---

## 2. Identified Vulnerabilities

### SEC-01 — MEDIUM | PII Disclosure: Email Leaked via `/api/users/by-username/{name}`

**File:** `src/ChatHerder.API/Endpoints/UserEndpoints.cs:64–73`

**Description:**  
`GetByUsername` returns a full `UserDto(Id, Username, Email, AvatarUrl)`. Because usernames are visible in every chat room, any authenticated user can enumerate other users' private email addresses with a single GET request.

**Exploit Scenario:**  
1. Attacker registers an account and obtains a valid JWT.  
2. Attacker observes target's username in any public room.  
3. `GET /api/users/by-username/victim` → response includes `"email": "victim@company.com"`.  
4. Email used for phishing, credential stuffing, or social engineering.

**Evidence:**
```csharp
// UserEndpoints.cs:72
return Results.Ok(new UserDto(user.Id, user.Username, user.Email, user.AvatarUrl));
```
Compare with `SearchUsers` which correctly returns `UserSearchResultDto(Id, Username, AvatarUrl)` — no email.

**Fix:**  
Return `UserSearchResultDto` (no email) from `GetByUsername`, or introduce a separate `UserPublicDto`. Email should only appear in the `/api/users/me` response (own data).

---

### SEC-02 — MEDIUM | JWT Access Token Exposed in WebSocket URL Query String

**File:** `src/ChatHerder.API/Program.cs:43–55`

**Description:**  
SignalR/WebSocket authentication passes the JWT as `?access_token=<token>` in the URL. The full URL (including the token) appears in:
- ASP.NET Core / reverse-proxy access logs
- Browser history
- Network monitoring / MITM captures
- Referrer headers if the WebSocket URL is ever leaked

The access token is valid for 15 minutes. If a log is compromised within that window, an attacker can authenticate as the user.

**Evidence:**
```csharp
// Program.cs:47
var token = ctx.Request.Query["access_token"].ToString();
if (!string.IsNullOrEmpty(token) && ctx.HttpContext.Request.Path.StartsWithSegments("/hubs"))
    ctx.Token = token;
```

**Fix:**  
Preferred: configure the server to strip `access_token` from access logs (Nginx: `$request_uri_no_token` or log-format exclusion). Additionally, ensure all reverse proxies do not log query strings for `/hubs/*` paths. As a secondary control, rotate access token lifetime or implement token-binding per connection. This is the standard SignalR pattern and cannot be fully eliminated without a protocol change, but log hygiene is achievable.

---

### SEC-03 — MEDIUM | File Upload: Client-Controlled MIME Type Stored and Re-served

**File:** `src/ChatHerder.API/Endpoints/FilesEndpoints.cs:46–59`

**Description:**  
The upload endpoint classifies files (image vs. general) and stores the content type entirely based on the client-supplied `Content-Type` HTTP header — a value the uploader controls completely. This stored content type is then re-served to other users when they download the file.

An attacker can:
1. Upload a file with `Content-Type: image/svg+xml` containing embedded script (SVG XSS) — the file would pass the "image" classifier and be stored/served as `image/svg+xml`.
2. Upload a file with `Content-Type: text/html` containing a phishing page — served back as HTML.
3. Upload any content while claiming any MIME type, creating confusion about what the file actually is.

Note: `Results.Stream(stream, attachment.ContentType, attachment.FileName)` sets `Content-Disposition: attachment`, which prevents inline browser rendering for most types. However, SVG images embedded in `<img>` tags are served by the browser's image renderer, not as downloads. If a future template renders an attachment as `<img src="/api/files/{id}">` for `image/*` content types, SVG-with-script would execute in some contexts.

**Evidence:**
```csharp
// FilesEndpoints.cs:46
var isImage = file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase);
// FilesEndpoints.cs:58-59
ContentType = file.ContentType,   // ← client-controlled
FileName    = file.FileName,      // ← client-controlled
```

**Fix:**  
1. Perform server-side MIME sniffing via magic-byte inspection (e.g., `MimeKit` or a lookup table for the first 8–16 bytes) and override or reject the client-supplied content type.  
2. Explicitly block dangerous MIME types: `text/html`, `application/javascript`, `image/svg+xml` (unless SVG is a deliberate product requirement with additional mitigations).  
3. Sanitize SVG uploads through an SVG sanitizer if SVG support is required.

---

### SEC-04 — MEDIUM | Latent Stored XSS: `markersToHtml` Exported Without HTML Escaping

**File:** `frontend/src/app/shared/utils/inline-markdown.ts:34–40`

**Description:**  
The module exports two markdown-to-HTML functions. `parseInlineMarkdown` (used in production) is safe — it HTML-escapes input before applying regex patterns. `markersToHtml` is also exported but applies regex patterns to raw, unescaped input. If any developer imports and uses `markersToHtml` with `bypassSecurityTrustHtml` or `innerHTML`, any message containing `<script>`, event handlers (`onload=`, `onerror=`), or injection via markdown patterns (`**<img onerror=alert(1)>**`) would result in stored XSS affecting all users who view the message.

**Evidence:**
```typescript
// Safe: parseInlineMarkdown escapes first
export function parseInlineMarkdown(text: string): string {
  return escapeHtml(text)               // ← escapes < > & " first
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// UNSAFE: markersToHtml does NOT escape
export function markersToHtml(text: string): string {
  return text                           // ← raw user input
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
```

Currently only referenced in test files. Not currently exploitable, but the export is an accident waiting to happen.

**Fix:**  
Option A: Delete `markersToHtml` if it has no production use case.  
Option B: Rename to `markersToHtmlUnsafe` (or add a `/* @internal */` JSDoc) and add an `escapeHtml()` call at the top, making both functions safe by default.  
Option C: Add a lint rule (`no-restricted-imports` or a custom ESLint rule) preventing `markersToHtml` from being imported outside of test files.

---

### SEC-05 — LOW | Avatar URL: No Scheme or Domain Validation

**File:** `src/ChatHerder.API/Endpoints/UserEndpoints.cs:53–57`

**Description:**  
`PATCH /api/users/me` accepts any string ≤2048 chars as `avatarUrl` without validating the URL scheme or domain. Angular's `[src]` binding sanitizes `javascript:` protocol to `unsafe:javascript:...` preventing script execution, but:
- `data:text/html,<script>...</script>` as an image src may execute in older/non-standard clients.
- If `avatarUrl` is ever rendered in a non-`[src]` context (CSS `background-image`, `innerHTML`, or string concatenation), scheme-based XSS becomes exploitable.
- Users can set avatars pointing to external tracking pixels or hostile domains, leaking their IP to third parties when other users' browsers load the image.

**Fix:**  
Validate that the URL uses `https://` scheme and optionally enforce an allowlist of trusted CDN domains. Reject `data:`, `javascript:`, `blob:`, and relative paths.

---

## 3. Security Controls Inventory

| Control | Status | Notes |
|---|---|---|
| Password hashing (Argon2id) | ✅ Strong | 64 MiB, 3 iterations, constant-time compare |
| Refresh token storage (SHA-256 hashed) | ✅ Strong | 512-bit random, hashed before storage |
| Session revocation (Redis) | ✅ Strong | Checked per-request via middleware |
| JWT validation (issuer, audience, lifetime, key) | ✅ Strong | Zero clock-skew |
| Timing-attack mitigation (sentinel hash) | ✅ Strong | Always runs full Argon2id path |
| HttpOnly, SameSite=Lax refresh cookie | ✅ Good | Path restricted to `/api/auth` |
| SQL injection prevention | ✅ Strong | EF Core parameterized queries throughout |
| Room authorization (membership + ban) | ✅ Strong | Enforced in REST + SignalR hub |
| File access authorization | ✅ Good | Room/dialog/uploader enforcement |
| XSS prevention (Angular default) | ✅ Strong | No unsafe bindings in production render paths |
| `parseInlineMarkdown` HTML escaping | ✅ Strong | Escapes before markdown replacement |
| BanCheckMiddleware | ✅ Good | Redis lookup, 403 on match |
| AllowedHosts restriction | ⚠️ Config | Must be set via env var in production |
| MIME type validation (uploads) | ❌ Missing | Client-controlled; see SEC-03 |
| Email privacy in public API | ❌ Missing | Leaked via `/api/users/by-username`; see SEC-01 |
| JWT log exposure (WebSocket) | ⚠️ Partial | Standard SignalR pattern; log hygiene required |
| Avatar URL scheme validation | ❌ Missing | See SEC-05 |
| `markersToHtml` safety | ⚠️ Latent | Not used in prod; see SEC-04 |

---

## 4. Threat Model Summary

| Threat | Mitigated? | Control |
|---|---|---|
| Account takeover via password brute-force | Partial | Argon2id slow hash (no rate limit yet) |
| Session hijacking via cookie theft | Strong | HttpOnly + SameSite=Lax |
| Session fixation | Strong | New session ID on login/refresh |
| Stored XSS via message content | Strong | `parseInlineMarkdown` escapes before inject |
| SQL injection | Strong | EF Core parameterized queries |
| Privilege escalation in rooms | Strong | Role checks in REST + hub |
| CSRF on state-changing endpoints | Moderate | SameSite=Lax + JSON Content-Type |
| Email enumeration (login) | Strong | Sentinel hash on login |
| Email enumeration (by-username) | ❌ None | SEC-01 — open PII leak |
| Malicious file upload (MIME spoofing) | Partial | Content-Disposition: attachment; no magic-byte check |
| Token leakage via server logs | Partial | JWT in query string for WebSocket |

---

## 5. Open Action Items

| ID | Severity | Title | Owner |
|---|---|---|---|
| SEC-01 | MEDIUM | Remove email from `GetByUsername` response | Backend | ✅ Fixed T206 |
| SEC-02 | MEDIUM | Strip `access_token` from access logs for `/hubs/*` | DevOps/Backend | ⚠️ Open — config item |
| SEC-03 | MEDIUM | Server-side MIME type validation on file uploads | Backend | ✅ Fixed T206 |
| SEC-04 | MEDIUM | Remove or make `markersToHtml` safe | Frontend | ✅ Fixed T206 |
| SEC-05 | LOW | Validate `avatarUrl` scheme and domain | Backend | ✅ Fixed T206 |
