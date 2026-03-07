import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, setTokens, clearTokens, getToken } from '../api/client';

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  webhookToken: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (token) {
      // Verify token by fetching accounts (any authenticated endpoint)
      api.get('/accounts').then((res) => {
        if (res.success) {
          // Token is valid — restore user from localStorage
          const storedUser = localStorage.getItem('user');
          if (storedUser) {
            setUser(JSON.parse(storedUser));
          }
        } else {
          clearTokens();
          localStorage.removeItem('user');
        }
        setIsLoading(false);
      }).catch(() => {
        setIsLoading(false);
      });
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    if (!res.success) throw new Error(res.error || 'Login failed');
    setTokens(res.data.accessToken, res.data.refreshToken);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    setUser(res.data.user);
  };

  const register = async (email: string, password: string, name?: string) => {
    const res = await api.post('/auth/register', { email, password, name });
    if (!res.success) throw new Error(res.error || 'Registration failed');
    setTokens(res.data.accessToken, res.data.refreshToken);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    setUser(res.data.user);
  };

  const logout = () => {
    clearTokens();
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
