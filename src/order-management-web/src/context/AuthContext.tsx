import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, type AuthResponse } from '../api/client';

type AuthState = {
  token: string | null;
  user: AuthResponse | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    businessName: string;
    ownerFullName: string;
    defaultLanguage: string;
  }) => Promise<void>;
  logout: () => void;
};

const STORAGE_KEY = 'ordermgmt_auth';

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthResponse | null>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthResponse) : null;
  });

  const token = user?.token ?? null;

  const persist = useCallback((data: AuthResponse | null) => {
    if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    else localStorage.removeItem(STORAGE_KEY);
    setUser(data);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login({ email, password });
      persist(res);
    },
    [persist]
  );

  const register = useCallback(
    async (data: {
      email: string;
      password: string;
      businessName: string;
      ownerFullName: string;
      defaultLanguage: string;
    }) => {
      const res = await api.register(data);
      persist(res);
    },
    [persist]
  );

  const logout = useCallback(() => persist(null), [persist]);

  useEffect(() => {
    api.health().catch(() => {
      /* API may be down during dev */
    });
  }, []);

  const value = useMemo(
    () => ({ token, user, login, register, logout }),
    [token, user, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
