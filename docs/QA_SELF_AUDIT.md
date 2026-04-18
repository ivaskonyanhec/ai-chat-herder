# QA Self-Audit

## 11.1 Summary

- Total requirements reviewed: 77
- Covered: 22
- Partially covered: 18
- Blocked: 26
- Not covered: 11

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
- FR-2.4.1-1 room creation
- FR-2.4.2-2 unique room names
- FR-2.4.3-1 public catalog fields
- FR-2.4.3-2 public catalog search
- FR-2.4.4-1 private rooms hidden and invitation-only
- FR-2.4.5-1 member leave and owner-leave protection
- FR-2.4.9-1 private room invitations
- FR-2.7.2-1 low-latency presence updates
- NFR-3.2-2 presence propagation below 2 seconds

## 11.3 Partial Coverage

- FR-2.1.3-4 persistent login: new browser context bootstrap is covered, but browser-close refresh-token behavior is not fully verified.
- FR-2.1.5-1 account deletion: API deletion is covered; UI action is not wired.
- FR-2.2.2-1 AFK rule: deterministic hub semantics are covered; natural 61-second browser inactivity with visible UI is blocked.
- FR-2.4.2-1 room properties: owner/admin/member/ban state is covered; editable UI property flows are not.
- FR-2.4.3-3 public room joining: public join and banned rejoin are covered; catalog join UI is not.
- FR-2.4.7-1 and FR-2.4.7-2 owner/admin roles: ban-related cases are covered; full admin modal action set is not.
- FR-2.4.8-2 banned cannot rejoin: access/rejoin API covered; immediate browser removal is blocked.
- FR-2.4.8-3 loss of room access: room API access covered; file access is blocked.
- FR-2.5.2-1 message content: multiline/emoji/UTF-8/3 KB limit are covered; attachments and replies are blocked.
- FR-2.5.4-1 message editing: author edit and edited timestamp are covered; browser edited indicator is not.
- FR-2.5.5-1 message deletion: author delete is covered; admin delete and browser deleted state are not.
- FR-2.5.6-1 message history: history refetch and chronological `afterSeq` fetch are covered; infinite scroll/offline recipient UI is not.
- NFR-3.3-1 message persistence: refetch is covered, not long-term retention/infinite scroll.
- NFR-3.5-2 multi-tab behavior: auth and presence are covered, not full multi-tab chat UX.
- NFR-3.6-1 consistency: membership/bans/history partially covered; files and complete permissions are not.
- UI-4.1-1 layout: minimal room surface selectors are checked; visual/layout audit is not complete.
- UI-4.3-1 composer: message content is covered through hub/history; browser composer send/upload/reply are not wired.

## 11.4 Blocked Requirements

| Requirement ID | Reason | Change Needed |
| -------------- | ------ | ------------- |
| FR-2.2.4-1, FR-2.2.4-2 | Active-session UI needs stable live rows for multi-session E2E. | Bind sessions panel to API with stable row/test IDs and revoke controls. |
| FR-2.3.* | Friend/contact endpoints and dynamic UI are absent or static. | Implement/map friend request, friendship, remove friend, and user block endpoints and UI. |
| FR-2.4.6-1 | File deletion side effects cannot be verified without file endpoints. | Map upload/download endpoints and room deletion file assertions. |
| FR-2.4.8-1 | No remove-member UI/action separate from explicit ban endpoint. | Add remove member action that records a room ban. |
| FR-2.4.8-2 | Ban endpoint does not broadcast `RemovedFromRoom`. | Publish SignalR removal event to active banned user connections. |
| FR-2.5.1-1 | Dialog setup and dynamic DM UI are missing. | Implement friend/dialog creation flow and bind DM UI to ChatService. |
| FR-2.5.3-1 | Reply controls and dynamic quoted rendering are absent. | Add reply composer state, send `replyToId`, render quote blocks with test IDs. |
| FR-2.6.* and NFR-3.4-2 | No file upload/download endpoints are mapped in `Program.cs`; upload UI is absent. | Create `FileEndpoints`, enforce size/access rules, add `file-input`, `upload-submit`, and download link test IDs. |
| UI-4.1.1-1 | Member list/status UI is static. | Bind room members to `/api/rooms/{id}/members` and PresenceService updates. |
| UI-4.2-* | Dynamic message list/autoscroll/infinite scroll not implemented. | Bind room UI to messages API/ChatService with scroll state tests. |
| UI-4.4-1 | Unread indicators not wired to UI. | Render UnreadService counts near rooms/contacts. |
| UI-4.5-1 | Admin modal/menu actions are static. | Implement management modal actions with stable test IDs. |

## 11.5 Not Covered

- Password reset and password hashing storage checks: not included in this E2E/UAT layer yet.
- Admin message deletion, room deletion side effects, unread indicators, and long-idle no-logout behavior still need E2E additions.
- Capacity/load requirements: intentionally not covered by Playwright; they belong in the k6 load-testing layer.
- Jabber requirements: optional advanced scope is not implemented.

## 11.6 Risk Review

- Multi-tab presence: server semantics are covered, but browser-visible member status is still static.
- Session management: API session isolation is covered; active-session UI revocation needs browser E2E.
- Access control: room ban access is covered; attachment security is completely blocked by missing file endpoints.
- Moderation: ban persistence works through API, but immediate removal of active users is not broadcast.
- Attachment security: high risk until upload/download endpoints enforce membership checks and size limits.
- Persistence/history: message refetch and chronological API fetch are covered, but infinite scroll and offline delivery need tests.
- Non-functional timing: presence timing is covered; message delivery timing is blocked by ChatHub group/browser rendering gaps.
