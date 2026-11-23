import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  apiLogin,
  apiLogout,
  apiMe,
  apiUpdateProfile,
  getToken,
  setToken,
  SessionUser,
} from '@/lib/authClient';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  plan: 'free' | 'starter' | 'pro' | 'enterprise' | 'unlimited';
  avatar_url?: string;
  createdAt: string;
  active: boolean;
  subscription_end: string | null;
}

/** Shape mínimo que o app usava da sessão do Supabase. */
export interface Session {
  access_token: string;
}

interface AuthContextType {
  user: User | null;
  supabaseUser: SessionUser | null;
  session: Session | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; isAdmin: boolean }>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<boolean>;
  updateUser: (updates: Partial<User>) => Promise<void>;
}

const authContextFallback: AuthContextType = {
  user: null,
  supabaseUser: null,
  session: null,
  isLoading: false,
  login: async () => ({ success: false, isAdmin: false }),
  logout: async () => {},
  resetPassword: async () => false,
  updateUser: async () => {},
};

const AuthContext = createContext<AuthContextType>(authContextFallback);

/** Monta o User do app a partir do perfil devolvido por /auth/me. */
function fromProfile(p: Awaited<ReturnType<typeof apiMe>>): User {
  return {
    id: p.id,
    name: p.name || p.email?.split('@')[0] || '',
    email: p.email || '',
    // Mantidos no tipo porque varias telas os leem. Com um so usuario e
    // sem cobranca, os valores sao constantes.
    role: 'user',
    plan: 'unlimited',
    avatar_url: p.avatar_url ?? undefined,
    createdAt: p.created_at ?? '',
    active: p.active ?? true,
    subscription_end: null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SessionUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // Sessão = token guardado. Valida chamando /auth/me: 401 limpa e cai
    // no login; erro de rede mantém a UI destravada sem derrubar a sessão.
    const initializeAuth = async () => {
      const token = getToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      setSession({ access_token: token });
      try {
        const profile = await apiMe();
        if (!isMounted) return;
        setUser(fromProfile(profile));
        setSupabaseUser({ id: profile.id, email: profile.email });
      } catch (error: any) {
        if (!isMounted) return;
        if (error?.status === 401) {
          setToken(null);
          setSession(null);
        } else {
          console.error('[Auth] Falha ao validar a sessão:', error);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (
    email: string,
    password: string,
  ): Promise<{ success: boolean; isAdmin: boolean }> => {
    try {
      const { access_token, user: sessionUser } = await apiLogin(email, password);
      setSession({ access_token });
      setSupabaseUser(sessionUser);

      const profile = await apiMe().catch(() => null);
      setUser(
        profile
          ? fromProfile(profile)
          : fromProfile({
              id: sessionUser.id,
              email: sessionUser.email,
              name: (sessionUser.user_metadata?.name as string) || '',
              avatar_url: null,
              created_at: sessionUser.created_at ?? null,
              active: true,
            }),
      );

      return { success: true, isAdmin: false };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, isAdmin: false };
    }
  };

  const logout = async () => {
    apiLogout();
    setUser(null);
    setSupabaseUser(null);
    setSession(null);
    localStorage.removeItem('adsTracker_needsOnboarding');
    sessionStorage.removeItem('sentinel_auto_synced');
  };

  /**
   * Sem servidor de e-mail não há link de redefinição: senha perdida é
   * trocada pelo admin em Configurações → Usuários.
   */
  const resetPassword = async (): Promise<boolean> => false;

  const updateUser = async (updates: Partial<User>) => {
    if (!session) return;
    try {
      const profile = await apiUpdateProfile({
        name: updates.name,
        avatar_url: updates.avatar_url,
      });
      setUser(fromProfile(profile));
    } catch (error) {
      console.error('Error updating user:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        supabaseUser,
        session,
        isLoading,
        login,
        logout,
        resetPassword,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
