export type PresenceStatus = 'online' | 'afk' | 'offline';

export interface RoomMemberPresence {
  userId: string;
  username: string;
  avatarUrl: string | null;
  role: string;
  joinedAt: string;
  presenceStatus: PresenceStatus;
}

export interface RoomMemberJoined {
  userId: string;
  username: string;
  avatarUrl: string | null;
}

export interface UserSummaryDto {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export interface AttachmentDto {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  comment: string | null;
}

export interface ReactionSummaryDto {
  emoji: string;
  count: number;
  userIds: string[];
}

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
  reactions: ReactionSummaryDto[];
}

export interface DialogMessageDto {
  id: string;
  sequenceNumber: number;
  content: string | null;
  sender: UserSummaryDto;
  sentAt: string;
  editedAt: string | null;
  isDeleted: boolean;
  replyTo: DialogMessageDto | null;
  attachment: AttachmentDto | null;
  reactions: ReactionSummaryDto[];
}

// PresenceHub server→client event payloads
export interface UserStatusChangedEvent { userId: string; status: PresenceStatus; }
export interface RoomMembersSnapshotEvent { roomId: string; members: RoomMemberPresence[]; }
export interface MemberJoinedEvent { roomId: string; user: RoomMemberJoined; }
export interface MemberLeftEvent { roomId: string; userId: string; }
export interface RemovedFromRoomEvent { roomId: string; }
export interface AddedToRoomEvent { roomId: string; }
export interface FriendRequestReceivedEvent { requestId: string; fromUserId: string; fromUsername: string; message: string | null; }
export interface FriendRequestAcceptedEvent { userId: string; username: string; }
export interface RoomInvitationReceivedEvent { invitationId: string; roomId: string; roomName: string; fromUserId: string; }
export interface DialogFrozenEvent { dialogId: string; }
export interface ForceDisconnectEvent { reason: string; }

// ChatHub server→client event payloads
export interface MessageDeletedEvent { messageId: string; roomId: string; }
export interface UserTypingEvent { roomId: string; userId: string; isTyping: boolean; }
export interface DirectMessageDeletedEvent { messageId: string; dialogId: string; }
export interface UserTypingInDialogEvent { dialogId: string; userId: string; isTyping: boolean; }
export interface UnreadCountChangedEvent { contextType: 'room' | 'dialog'; contextId: string; count: number; }
export interface ReactionToggledEvent { messageId: string; emoji: string; count: number; userIds: string[]; }

// Union types for ChatService event signals
export type RoomChatEvent =
  | { type: 'MessageReceived'; payload: MessageDto }
  | { type: 'MessageEdited'; payload: MessageDto }
  | { type: 'MessageDeleted'; payload: MessageDeletedEvent }
  | { type: 'ReactionToggled'; payload: ReactionToggledEvent };

export type DmChatEvent =
  | { type: 'DirectMessageReceived'; payload: DialogMessageDto }
  | { type: 'DirectMessageEdited'; payload: DialogMessageDto }
  | { type: 'DirectMessageDeleted'; payload: DirectMessageDeletedEvent };

export type TypingEvent =
  | { type: 'UserTyping'; payload: UserTypingEvent }
  | { type: 'UserTypingInDialog'; payload: UserTypingInDialogEvent };
