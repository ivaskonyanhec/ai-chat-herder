export interface RoomCatalogItem {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  createdAt: string;
  memberCount: number;
}

export interface RoomDto {
  id: string;
  name: string;
  description: string | null;
  visibility: 'Public' | 'Private';
  ownerId: string;
  createdAt: string;
  memberCount: number;
  callerRole: 'Owner' | 'Admin' | 'Member' | null;
}

export interface RoomMemberDto {
  userId: string;
  username: string;
  avatarUrl: string | null;
  role: string;
  joinedAt: string;
  presenceStatus: string;
}

export interface CreateRoomRequest {
  name: string;
  description: string | null;
  visibility: 'Public' | 'Private';
}
