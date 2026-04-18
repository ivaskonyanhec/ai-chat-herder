export interface DialogDto {
  id: string;
  otherUserId: string;
  otherUsername: string;
  otherAvatarUrl: string | null;
  createdAt: string;
  isFrozen: boolean;
}
