export interface PlatformBanDto {
  id: string;
  userId: string;
  username: string;
  issuedByAdminId: string;
  issuedByAdminUsername: string;
  reason: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface IssuePlatformBanRequest {
  username: string;
  reason: string;
  durationHours: number | null;
}
