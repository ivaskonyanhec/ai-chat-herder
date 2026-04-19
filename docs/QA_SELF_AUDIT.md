# QA Self-Audit

## 11.1 Summary

- Total requirements reviewed: 77
- Covered: 35
- Partially covered: 20
- Blocked: 12
- Not covered: 10

This audit is intentionally conservative. A requirement is not marked `COVERED` unless a concrete Playwright test exists and exercises the behavior. Tests that are present but skipped are counted as `BLOCKED`, not covered.

## 11.2 Covered Requirements

- FR-2.1.1-1 registration
- FR-2.1.2-1 unique email
- FR-2.1.2-2 unique username
- FR-2.1.2-3 immutable username
- FR-2.1.2-4 no email verification required
- FR-2.1.3-1 login
- FR-2.1.3-2 invalid login
- FR-2.1.3-3 sign out current session only
- FR-2.1.4-2 password change
- FR-2.1.5-3 account deletion removes memberships in other rooms
- FR-2.2.1-1 online/AFK/offline statuses
- FR-2.2.3-1 active tab keeps user online
- FR-2.2.3-2 offline only when all tabs close
- FR-2.2.4-1 view active sessions with browser/IP details
- FR-2.2.4-2 revoke selected active sessions
- FR-2.3.1-1 personal friend list after accepted request
- FR-2.3.2-1 send friend request by username with optional text
- FR-2.3.3-1 recipient accepts friendship through live browser page
- FR-2.3.4-1 remove friend
- FR-2.4.1-1 room creation
- FR-2.4.2-2 unique room names
- FR-2.4.3-1 public catalog fields
- FR-2.4.3-2 public catalog search
- FR-2.4.4-1 private rooms hidden and invitation-only
- FR-2.4.5-1 member leave and owner-leave protection
- FR-2.4.6-1 room deletion deletes messages/files permanently
- FR-2.4.8-3 user losing room access loses message and file access
- FR-2.4.9-1 private room invitations
- FR-2.6.1-1 images and arbitrary file attachments
- FR-2.6.3-1 preserve filename and optional comment
- FR-2.6.4-1 file download only by authorized room members or dialog participants
- FR-2.6.5-1 files persist but become inaccessible after uploader loses room access
- FR-2.7.2-1 low-latency presence updates
- NFR-3.2-2 presence propagation below 2 seconds
- NFR-3.4-2 file and image size limits

## 11.3 Partial Coverage

- FR-2.1.3-4 persistent login: new browser context bootstrap is covered, but browser-close refresh-token behavior is not fully verified.
- FR-2.1.5-1 account deletion: API deletion is covered; UI action is not wired.
- FR-2.2.2-1 AFK rule: deterministic hub semantics are covered; natural 61-second browser inactivity with visible UI is blocked.
- FR-2.3.5-1 user block: API block removes friendship, records block, denies new friend request, freezes existing dialog, and blocked-users UI can unblock; full browser read-only PM UX is not covered.
- FR-2.4.2-1 room properties: owner/admin/member/ban state is covered; editable UI property flows are not.
- FR-2.4.3-3 public room joining: public join and banned rejoin are covered; catalog join UI is not.
- FR-2.4.7-1 and FR-2.4.7-2 owner/admin roles: admin delete, ban lookup, unban, demotion, and owner protections are covered at API level; full admin modal action set is not.
- FR-2.4.8-2 banned cannot rejoin: access/rejoin API covered; immediate browser removal is blocked.
- FR-2.5.1-1 personal dialogs: creation, history, author edit, and author delete are covered through REST/SignalR; live browser DM event rendering and route auto-selection remain incomplete.
- FR-2.5.2-1 message content: multiline/emoji/UTF-8/3 KB limit and attachments are covered; replies are blocked.
- FR-2.5.4-1 message editing: author edit and edited timestamp are covered; browser edited indicator is not.
- FR-2.5.5-1 message deletion: author and admin delete are covered at API level; browser deleted state is not.
- FR-2.5.6-1 message history: history refetch and chronological `afterSeq` fetch are covered; infinite scroll/offline recipient UI is not.
- FR-2.7.1-1 unread indicators: room/dialog unread count increments and clear-on-read API behavior are covered; visible room/contact badges are not.
- NFR-3.3-1 message persistence: refetch is covered, not long-term retention/infinite scroll.
- NFR-3.5-2 multi-tab behavior: auth and presence are covered, not full multi-tab chat UX.
- NFR-3.6-1 consistency: membership, bans, unbans, history, files, admin demotion, platform bans, and social blocks are partially covered; UI-only flows and full permission matrix are not.
- UI-4.1-1 layout: minimal room surface selectors are checked; visual/layout audit is not complete.
- UI-4.3-1 composer: message content is covered through hub/history; browser composer send/upload/reply are not wired.

## 11.4 Blocked Requirements

| Requirement ID | Reason | Change Needed |
| -------------- | ------ | ------------- |
| FR-2.3.2-2 | Sending a friend request from a room user list is still unavailable. | Bind dynamic room members UI to a send-friend action with optional text. |
| FR-2.3.6-1 | Dialog creation and hub sending are not yet gated to friends with no blocks. | Enforce friendship/unblocked checks in dialog creation and direct-message send paths. |
| FR-2.4.8-1 | No remove-member UI/action separate from explicit ban endpoint. | Add remove member action that records a room ban. |
| FR-2.4.8-2 | Ban endpoint does not broadcast `RemovedFromRoom`. | Publish SignalR removal event to active banned user connections. |
| FR-2.5.3-1 | Reply controls and dynamic quoted rendering are absent. | Add reply composer state, send `replyToId`, render quote blocks with test IDs. |
| FR-2.6.2-1 | Upload-by-button and paste paths are wired in components but not automated through stable selectors. | Add `file-input`, `upload-submit`, and paste-path test IDs or an equivalent test contract. |
| UI-4.1.1-1 | Member list/status UI is static. | Bind room members to `/api/rooms/{id}/members` and PresenceService updates. |
| UI-4.2-* | Initial dynamic message loading exists, but autoscroll preservation and infinite scroll are not implemented/testable. | Add scroll state logic and stable test IDs for message rows. |
| UI-4.4-1 | Unread indicators not wired to UI. | Render UnreadService counts near rooms/contacts. |
| UI-4.5-1 | Admin modal/menu actions are static. | Implement management modal actions with stable test IDs. |

## 11.5 Not Covered

- Password reset and password hashing storage checks: not included in this E2E/UAT layer yet.
- Upload-by-button/paste UI, visible unread badges, friend-request-from-room UI, and long-idle no-logout behavior still need E2E additions.
- Capacity/load requirements: intentionally not covered by Playwright; they belong in the k6 load-testing layer.
- Jabber requirements: optional advanced scope is not implemented.

## 11.6 Risk Review

- Multi-tab presence: server semantics are covered, but browser-visible member status is still static.
- Session management: API session isolation and active-session UI revocation are covered; refresh-token browser-close behavior remains only partially covered.
- Access control: room ban access, platform-ban middleware plus platform-ban page issue/revoke flow, and attachment authorization are covered for room members, banned users, dialog participants, and outsiders.
- Moderation: ban persistence, ban viewing/unban, admin demotion, and admin message delete work through API, but immediate removal of active users is not broadcast.
- Attachment security: endpoint-level upload/download authorization and size limits now have E2E coverage; browser upload-button/paste UX still needs stable-selector coverage.
- Persistence/history: message refetch and chronological API fetch are covered, but infinite scroll and offline delivery need tests.
- Notifications: unread count storage now has E2E coverage, but visible badges near rooms/contacts are still unwired.
- Social/DM gating: friend and block endpoints plus blocked-users UI unblock now have E2E coverage, but direct-message creation/sending still needs friendship and block enforcement.
- Non-functional timing: presence timing is covered; message delivery timing is blocked by missing ChatHub room join for chat connections and missing message text test IDs.
