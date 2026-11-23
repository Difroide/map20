import { API_URL } from './apiUrl';

/**
 * Autenticação própria contra /api/auth (JWT), no lugar do Supabase Auth.
 * O token vive no localStorage; cada request do painel o manda no
 * Authorization (lib/api.ts).
 */

const TOKEN_KEY = 'sentinel_token';

export interface SessionUser {
  id: string;
  email: string;
  created_at?: string;
  user_metadata?: Record<string, any>;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage indisponível (modo privado antigo): sessão só em memória
  }
}

async function authFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw Object.assign(new Error(body.message || body.error || `HTTP ${response.status}`), {
      status: response.status,
    });
  }
  return response.json();
}

export async function apiLogin(
  email: string,
  password: string,
): Promise<{ access_token: string; user: SessionUser }> {
  const session = await authFetch<{ access_token: string; user: SessionUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(session.access_token);
  return session;
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  created_at: string | null;
  active: boolean;
}

export function apiMe(): Promise<Profile> {
  return authFetch<Profile>('/auth/me');
}

export function apiUpdateProfile(patch: { name?: string; avatar_url?: string }): Promise<Profile> {
  return authFetch<Profile>('/auth/me', { method: 'PATCH', body: JSON.stringify(patch) });
}

export function apiChangePassword(password: string): Promise<{ ok: boolean }> {
  return authFetch<{ ok: boolean }>('/auth/password', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export function apiLogout(): void {
  setToken(null);
}
