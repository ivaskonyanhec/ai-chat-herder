export interface RoomInvitationDto {
  id: string;
  roomId: string;
  roomName: string;
  invitedByUserId: string;
  invitedByUsername: string;
  invitedUserId: string;
  invitedUsername: string;
  status: 'Pending' | 'Accepted' | 'Rejected';
  createdAt: string;
}
