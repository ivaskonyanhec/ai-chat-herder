export interface UserSummary {
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

export interface MessageDto {
  id: string;
  sequenceNumber: number;
  content: string | null;
  sender: UserSummary;
  sentAt: string;
  editedAt: string | null;
  isDeleted: boolean;
  replyTo: MessageDto | null;
  attachment: AttachmentDto | null;
}

export interface DialogMessageDto {
  id: string;
  sequenceNumber: number;
  content: string | null;
  sender: UserSummary;
  sentAt: string;
  editedAt: string | null;
  isDeleted: boolean;
  replyTo: DialogMessageDto | null;
  attachment: AttachmentDto | null;
}

export interface UserTypingEvent {
  roomId?: string;
  dialogId?: string;
  userId: string;
  isTyping: boolean;
}

export interface UnreadCountChangedEvent {
  contextType: 'room' | 'dialog';
  contextId: string;
  count: number;
}
