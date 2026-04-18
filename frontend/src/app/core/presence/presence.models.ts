export type UserStatus = 'online' | 'afk' | 'offline';

export interface RoomMember {
  userId: string;
  username: string;
  avatarUrl: string | null;
  role: 'Member' | 'Admin' | 'Owner';
  joinedAt: string;
  presenceStatus: UserStatus;
}

export interface UserStatusChangedEvent {
  userId: string;
  status: UserStatus;
}

export interface RoomMembersSnapshotEvent {
  roomId: string;
  members: RoomMember[];
}

export interface MemberJoinedEvent {
  roomId: string;
  user: {
    userId: string;
    username: string;
    avatarUrl: string | null;
  };
}

export interface MemberLeftEvent {
  roomId: string;
  userId: string;
}

export interface RemovedFromRoomEvent {
  roomId: string;
  reason: 'banned' | 'kicked' | 'left';
}
