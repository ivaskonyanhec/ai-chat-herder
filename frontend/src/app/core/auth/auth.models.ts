export interface User {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface PersistedSession {
  accessToken: string;
  user?: User;
}

export interface LoginRequest {
  email: string;
  password: string;
  keepSignedIn: boolean;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  keepSignedIn: boolean;
}

export interface StoredSession {
  accessToken: string;
  refreshToken?: string;
  user?: User;
  keepSignedIn?: boolean;
}
