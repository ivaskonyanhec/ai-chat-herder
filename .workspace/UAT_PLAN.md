# User Acceptance Testing (UAT) Plan

## Scenario 1: Onboarding & Identity

- **Goal**: Verify registration, login, and username immutability.
- **Verification**: Register `Alice`, try to change username (must fail), delete account (must succeed).

## Scenario 2: Multi-Tab Presence & AFK (Req 2.3)

- **Goal**: Verify the 1-minute AFK rule across multiple tabs.
- **Steps**:
  1. User A opens 2 tabs.
  2. User A stays idle in both for 61 seconds.
  3. **Expected**: Status changes to AFK for others.
  4. User A moves mouse in Tab 1 -> Status becomes Online.

## Scenario 3: Real-Time Messaging & SignalR

- **Goal**: Verify message delivery under 3 seconds and quoting.
- **Verification**: User A sends message -> User B receives it instantly. User B replies with a quote.

## Scenario 4: Room Moderation

- **Goal**: Admin controls and instant kicks.
- **Verification**: Admin bans User B. User B must be instantly disconnected from the WebSocket and lose access.

## Scenario 5: File Access Security (Req 2.6)

- **Goal**: Granular file access.
- **Verification**: Non-room-member attempts to download a file via direct link -> 403 Forbidden.
