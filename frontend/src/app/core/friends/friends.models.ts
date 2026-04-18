export interface FriendRequestDto {
  id: string;
  senderId: string;
  senderUsername: string;
  senderAvatarUrl: string | null;
  receiverId: string;
  receiverUsername: string;
  receiverAvatarUrl: string | null;
  status: 'Pending' | 'Accepted' | 'Rejected';
  message: string | null;
  createdAt: string;
}

export interface FriendDto {
  friendshipId: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  friendSince: string;
}
