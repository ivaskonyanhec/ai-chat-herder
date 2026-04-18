# Requirement Coverage Matrix

Source of truth: `requirements.md`. Status values mean:

- `COVERED`: an automated E2E/UAT test exercises this requirement.
- `PARTIALLY COVERED`: an automated test covers backend or partial behavior, but visible browser UX or an edge case is missing.
- `BLOCKED`: product UI/API/testability support is missing.
- `NOT COVERED`: not automated in this E2E/UAT layer.

| Requirement ID | Requirement Summary | Test Type | Test File | Test Name / Scenario | Status | Notes |
| -------------- | ------------------- | --------- | --------- | -------------------- | ------ | ----- |
| FR-2.1.1-1 | Self-registration with email, password, and unique username | E2E/UAT | `e2e/tests/01-auth.spec.ts`, `e2e/tests/uat/01-onboarding.uat.spec.ts` | registration creates authenticated session; new user can register | COVERED | Browser registration form uses `data-testid` selectors. |
| FR-2.1.2-1 | Email must be unique | E2E | `e2e/tests/01-auth.spec.ts` | duplicate email and duplicate username are rejected | COVERED | API-backed uniqueness validation. |
| FR-2.1.2-2 | Username must be unique | E2E | `e2e/tests/01-auth.spec.ts` | duplicate email and duplicate username are rejected | COVERED | API-backed uniqueness validation. |
| FR-2.1.2-3 | Username is immutable after registration | E2E/UAT | `e2e/tests/01-auth.spec.ts`, `e2e/tests/uat/01-onboarding.uat.spec.ts` | username remains immutable through the profile API | COVERED | API ignores attempted username mutation and preserves registered username. |
| FR-2.1.2-4 | Email verification is not required | E2E | `e2e/tests/01-auth.spec.ts` | registration creates authenticated session | COVERED | Registration proceeds directly to authenticated app. |
| FR-2.1.3-1 | Sign in with email and password | E2E | `e2e/tests/01-auth.spec.ts` | login with valid credentials shows main chat shell | COVERED | Browser login form. |
| FR-2.1.3-2 | Invalid login is rejected | E2E | `e2e/tests/01-auth.spec.ts` | invalid login shows an error | COVERED | Browser error state. |
| FR-2.1.3-3 | Sign out logs out current browser session only | E2E | `e2e/tests/01-auth.spec.ts` | sign out invalidates only current browser session | COVERED | Verifies first token is revoked and second session remains valid. |
| FR-2.1.3-4 | Persistent login across browser close/reopen | E2E | `e2e/tests/01-auth.spec.ts` | persistent session survives a new browser context | PARTIALLY COVERED | Verifies storage bootstrap in a new context; refresh-token rotation is not browser-verified. |
| FR-2.1.4-1 | Password reset | E2E | None | None | NOT COVERED | No email capture/test hook for reset token. |
| FR-2.1.4-2 | Password change for logged-in users | E2E | `e2e/tests/01-auth.spec.ts` | password change keeps current session and revokes other active sessions | COVERED | API behavior covered; no UI flow required by requirements. |
| FR-2.1.4-3 | Passwords stored securely hashed | E2E | None | None | NOT COVERED | Better suited to unit/integration/security tests, not browser E2E. |
| FR-2.1.5-1 | Delete account action | E2E/UAT | `e2e/tests/01-auth.spec.ts`, `e2e/tests/uat/01-onboarding.uat.spec.ts` | delete account endpoint removes authentication | PARTIALLY COVERED | API path covered; visible UI action is blocked by static settings UI. |
| FR-2.1.5-2 | Deleting account removes owned rooms and their messages/files | E2E | None | None | BLOCKED | File endpoints and room deletion consequences need end-to-end fixture flow. |
| FR-2.1.5-3 | Deleting account removes memberships in other rooms | E2E | `e2e/tests/01-auth.spec.ts` | delete account removes the deleted user from memberships in other rooms | COVERED | Verifies remaining owner no longer sees deleted user in room membership. |
| FR-2.2.1-1 | Presence statuses: online, AFK, offline | E2E | `e2e/tests/03-presence.spec.ts` | online/AFK/offline status tests | COVERED | SignalR hub behavior covered. |
| FR-2.2.2-1 | AFK after more than 1 minute inactivity across all tabs | E2E/UAT | `e2e/tests/03-presence.spec.ts`, `e2e/tests/uat/02-multitab-afk.uat.spec.ts` | AFK only after all tabs are AFK | PARTIALLY COVERED | Deterministic hub calls cover server semantics; natural 61-second browser inactivity UI is blocked. |
| FR-2.2.3-1 | Multi-tab: any active tab keeps user online | E2E/UAT | `e2e/tests/03-presence.spec.ts`, `e2e/tests/uat/02-multitab-afk.uat.spec.ts` | activity in one tab restores online | COVERED | Uses independent SignalR connections as tabs. |
| FR-2.2.3-2 | Offline only when all tabs close | E2E | `e2e/tests/03-presence.spec.ts` | offline status appears only after all tabs close | COVERED | SignalR connection lifecycle covered. |
| FR-2.2.4-1 | View active sessions with browser/IP details | E2E | `e2e/tests/01-auth.spec.ts` | active sessions can be viewed and selectively revoked through the UI | COVERED | Browser UI verifies current-session card and other-session row with browser/IP details. |
| FR-2.2.4-2 | Revoke selected active sessions | E2E | `e2e/tests/01-auth.spec.ts` | active sessions can be viewed and selectively revoked through the UI | COVERED | Browser UI clicks `revoke-session-{id}` and verifies revoked token is invalid. |
| FR-2.3.1-1 | Personal contact/friend list | E2E | `e2e/tests/07-social.spec.ts` | accepted friendship appears in both users' friend lists | COVERED | API-backed friend list is verified after acceptance. |
| FR-2.3.2-1 | Send friend request by username | E2E | `e2e/tests/07-social.spec.ts` | friend request by username can be accepted and then removed through the API | COVERED | Optional request text is asserted in pending request payload. |
| FR-2.3.2-2 | Send friend request from room user list with optional text | E2E | None | None | BLOCKED | Dynamic room members UI still has no send-friend action. |
| FR-2.3.3-1 | Recipient confirms friendship | E2E | `e2e/tests/07-social.spec.ts` | incoming friend request can be accepted from the live browser page | COVERED | Browser page renders live request data and accepts it. |
| FR-2.3.4-1 | Remove friend | E2E | `e2e/tests/07-social.spec.ts` | friend request by username can be accepted and then removed through the API | COVERED | Friendship removal is verified through the friend list afterward. |
| FR-2.3.5-1 | User-to-user ban blocks contact and freezes existing PMs | E2E | `e2e/tests/07-social.spec.ts` | blocking a friend removes friendship, records the block, and freezes the existing dialog | PARTIALLY COVERED | API block/freeze and blocked friend-request denial covered; browser read-only/frozen PM UX is not fully exercised. |
| FR-2.3.6-1 | Personal messages only between unblocked friends | E2E | None | None | BLOCKED | DM behavior exists, but dialog creation/hub sending are not yet gated to friendship/unblocked state. |
| FR-2.4.1-1 | Registered user can create chat room | E2E | `e2e/tests/05-admin.spec.ts`, helpers | room creator is automatically owner | COVERED | API-backed room creation used throughout suite. |
| FR-2.4.2-1 | Room properties: name, description, visibility, owner, admins, members, bans | E2E | `e2e/tests/05-admin.spec.ts` | owner/admin/member/ban scenarios | PARTIALLY COVERED | Core owner/admin/member/ban state covered; UI property editing is not. |
| FR-2.4.2-2 | Room names are unique | E2E | `e2e/tests/06-rooms.spec.ts` | room names are unique | COVERED | Duplicate room name returns 409. |
| FR-2.4.3-1 | Public room catalog with name/description/member count | E2E | `e2e/tests/06-rooms.spec.ts` | public room catalog exposes name, description, and member count | COVERED | API catalog assertions cover required fields. |
| FR-2.4.3-2 | Public catalog supports search | E2E | `e2e/tests/06-rooms.spec.ts` | public room catalog exposes name, description, and member count and supports search | COVERED | Search query returns the matching room. |
| FR-2.4.3-3 | Public rooms can be joined unless banned | E2E | `e2e/tests/05-admin.spec.ts` | owner bans member and banned user cannot rejoin | PARTIALLY COVERED | Join and banned rejoin covered; catalog UI join not covered. |
| FR-2.4.4-1 | Private rooms hidden from public catalog and invitation-only | E2E | `e2e/tests/06-rooms.spec.ts` | private rooms are hidden from public catalog and cannot be joined directly; private room invitation allows invited user to join | COVERED | Covers catalog hiding, direct join 403, invitation accept. |
| FR-2.4.5-1 | Users may leave rooms; owner cannot leave | E2E | `e2e/tests/06-rooms.spec.ts` | member can leave a room, but owner cannot leave their own room | COVERED | API membership result verified. |
| FR-2.4.6-1 | Room deletion deletes messages/files permanently | E2E | None | None | BLOCKED | File endpoint missing; message deletion side effect not covered. |
| FR-2.4.7-1 | Owner/admin roles and owner protections | E2E | `e2e/tests/05-admin.spec.ts` | owner cannot be banned by admin; admin role can ban normal member | PARTIALLY COVERED | Ban-related owner/admin protections covered; admin management UI not covered. |
| FR-2.4.7-2 | Admin actions: delete messages, remove/ban members, view/unban bans, manage admins | E2E | `e2e/tests/05-admin.spec.ts` | ban/member/admin API scenarios | PARTIALLY COVERED | Ban and make-admin covered; delete messages, unban, modal UI not covered. |
| FR-2.4.8-1 | Removing user by admin is treated as ban | E2E | `e2e/tests/05-admin.spec.ts` | removing a user from room UI is treated as a ban | BLOCKED | No remove-member UI; endpoint is explicit ban only. |
| FR-2.4.8-2 | Banned user removed immediately and cannot rejoin | E2E/UAT | `e2e/tests/05-admin.spec.ts`, `e2e/tests/uat/04-moderation.uat.spec.ts` | banned member cannot access/rejoin | PARTIALLY COVERED | Access/rejoin covered; immediate SignalR browser removal is blocked. |
| FR-2.4.8-3 | User losing room access loses message and file access | E2E | `e2e/tests/05-admin.spec.ts`, `e2e/tests/04-attachments.spec.ts` | members endpoint forbidden; file access skipped | PARTIALLY COVERED | Room API access covered; files blocked by missing endpoint. |
| FR-2.4.9-1 | Invite users to private rooms | E2E | `e2e/tests/06-rooms.spec.ts` | private room invitation allows invited user to join | COVERED | Owner sends invitation by username; invitee accepts and becomes member. |
| FR-2.5.1-1 | Personal dialogs behave like chats | E2E | `e2e/tests/07-social.spec.ts` | direct messages persist to dialog history and support author edit/delete endpoints | PARTIALLY COVERED | Dialog creation, history, edit, and delete paths are covered; live browser DM rendering/group join remains incomplete. |
| FR-2.5.2-1 | Plain text, multiline, emoji, attachments, reply/reference; max 3 KB; UTF-8 | E2E/UAT | `e2e/tests/02-chat.spec.ts`, `e2e/tests/uat/03-realtime-messaging.uat.spec.ts` | multiline emoji history; message size limit; skipped attachments/replies | PARTIALLY COVERED | Text, UTF-8, persistence, size covered; attachments/replies blocked. |
| FR-2.5.3-1 | Reply visually outlined/quoted | E2E/UAT | `e2e/tests/02-chat.spec.ts`, `e2e/tests/uat/03-realtime-messaging.uat.spec.ts` | reply/reference skipped | BLOCKED | No browser reply controls or dynamic rendering. |
| FR-2.5.4-1 | Users can edit own messages and UI shows edited indicator | E2E | `e2e/tests/02-chat.spec.ts` | message author can edit their own message and edited timestamp is returned | PARTIALLY COVERED | API edit and edited timestamp covered; browser gray edited indicator remains blocked by static message UI. |
| FR-2.5.5-1 | Messages can be deleted by author/admin | E2E | `e2e/tests/02-chat.spec.ts` | message author can delete their own message | PARTIALLY COVERED | Author delete covered; admin delete and browser UI state still need coverage. |
| FR-2.5.6-1 | Persistent chronological history and infinite scroll; offline delivery | E2E/UAT | `e2e/tests/02-chat.spec.ts`, `e2e/tests/uat/03-realtime-messaging.uat.spec.ts` | message remains available via history refetch; room history can be fetched in chronological order with afterSeq | PARTIALLY COVERED | Persistence and chronological API fetch covered; infinite scroll and offline recipient UI not covered. |
| FR-2.6.1-1 | Images and arbitrary file attachments | E2E/UAT | `e2e/tests/04-attachments.spec.ts`, `e2e/tests/uat/05-file-security.uat.spec.ts` | upload tests skipped | BLOCKED | File endpoints/UI missing. |
| FR-2.6.2-1 | Upload by button and paste | E2E | `e2e/tests/04-attachments.spec.ts` | upload tests skipped | BLOCKED | No upload UI. |
| FR-2.6.3-1 | Preserve filename and optional comment | E2E | `e2e/tests/04-attachments.spec.ts` | metadata skipped | BLOCKED | No upload endpoint/UI path. |
| FR-2.6.4-1 | Download only by current room members or authorized dialog participants | E2E/UAT | `e2e/tests/04-attachments.spec.ts`, `e2e/tests/uat/05-file-security.uat.spec.ts` | direct URL 403 skipped | BLOCKED | No GET `/api/files/{attachmentId}` endpoint. |
| FR-2.6.5-1 | Files persist but inaccessible after uploader loses room access | E2E | `e2e/tests/04-attachments.spec.ts` | banned user loses file access skipped | BLOCKED | File endpoint missing. |
| FR-2.7.1-1 | Unread indicators for rooms and dialogs clear when opened | E2E | None | None | NOT COVERED | Unread service exists, but UI indicators not tested. |
| FR-2.7.2-1 | Presence updates low latency | E2E | `e2e/tests/03-presence.spec.ts` | online/AFK/offline propagation tests | COVERED | Uses 2-second assertions. |
| NFR-3.1-1 | Support up to 300 simultaneous users | E2E | None | None | NOT COVERED | Load testing belongs to k6, not Playwright. |
| NFR-3.1-2 | Room up to 1000 participants, unlimited rooms, typical sizing | E2E | None | None | NOT COVERED | Load/capacity concern; not Playwright. |
| NFR-3.2-1 | Message delivery to recipients within 3 seconds | E2E/UAT | `e2e/tests/02-chat.spec.ts`, `e2e/tests/uat/03-realtime-messaging.uat.spec.ts` | live browser delivery skipped | BLOCKED | RoomChat now renders message state, but ChatHub lacks chat-connection room join and message text lacks `data-testid="message-text"`. |
| NFR-3.2-2 | Presence propagation below 2 seconds | E2E/UAT | `e2e/tests/03-presence.spec.ts`, `e2e/tests/uat/02-multitab-afk.uat.spec.ts` | status propagation tests | COVERED | SignalR propagation tested with 2-second limits. |
| NFR-3.2-3 | Usable with 10,000-message history | E2E | None | None | NOT COVERED | Needs seeded history/performance test strategy. |
| NFR-3.3-1 | Messages persist for years; older history infinite scroll | E2E | `e2e/tests/02-chat.spec.ts` | history refetch | PARTIALLY COVERED | Persistence refetch covered; years/infinite scroll not covered. |
| NFR-3.4-1 | Local file system storage | E2E | None | None | NOT COVERED | Infrastructure behavior; file API missing. |
| NFR-3.4-2 | File max 20 MB, image max 3 MB | E2E | `e2e/tests/04-attachments.spec.ts` | size-limit tests skipped | BLOCKED | No upload endpoint. |
| NFR-3.5-1 | No automatic logout due to inactivity | E2E | None | None | NOT COVERED | Could be covered by long-idle browser test later. |
| NFR-3.5-2 | Login state persists and app works across tabs | E2E | `e2e/tests/01-auth.spec.ts`, `e2e/tests/03-presence.spec.ts` | persistent session; multi-tab presence | PARTIALLY COVERED | Auth/presence covered; full app multi-tab UX not. |
| NFR-3.6-1 | Consistency of membership, bans, file access, history, permissions | E2E | `e2e/tests/02-chat.spec.ts`, `e2e/tests/05-admin.spec.ts` | history and ban scenarios | PARTIALLY COVERED | Membership/bans/history partly covered; files and full permissions incomplete. |
| UI-4.1-1 | Classic web chat layout with top menu, center messages, input bottom, side rooms/contacts | E2E | `e2e/tests/02-chat.spec.ts` | room surface has chat area and input | PARTIALLY COVERED | Minimal selector check only; visual layout not audited here. |
| UI-4.1.1-1 | Rooms/contacts on right, accordion room list, member statuses on right | E2E | None | None | BLOCKED | Current room member sidebar is static and not data-bound. |
| UI-4.2-1 | Autoscroll to new messages and no forced autoscroll when reading older messages | E2E | None | None | BLOCKED | Dynamic message list exists, but scroll behavior is not implemented/testable. |
| UI-4.2-2 | Infinite scroll for older history | E2E | None | None | BLOCKED | Initial message loading exists, but older-history infinite scroll is not implemented/testable. |
| UI-4.3-1 | Composer supports multiline, emoji, file/image, reply | E2E | `e2e/tests/02-chat.spec.ts`, `e2e/tests/04-attachments.spec.ts` | multiline/emoji covered via hub/history; file/reply skipped | PARTIALLY COVERED | Browser text composer is wired, but reply/upload controls and message-text test IDs are missing. |
| UI-4.4-1 | Unread visual indicators near rooms/contacts | E2E | None | None | BLOCKED | UI indicators not wired. |
| UI-4.5-1 | Admin actions available from menus/modal dialogs | E2E | `e2e/tests/05-admin.spec.ts` | UI moderation skipped | BLOCKED | Manage room/admin modals are static. |
| ADV-6-1 | Jabber client support | E2E | None | None | NOT COVERED | Advanced optional requirement not implemented. |
| ADV-6-2 | Jabber federation between servers | E2E | None | None | NOT COVERED | Advanced optional requirement not implemented. |
| ADV-6-3 | Jabber-specific UI screens | E2E | None | None | NOT COVERED | Advanced optional requirement not implemented. |
