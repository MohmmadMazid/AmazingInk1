import { createContext, useContext, useEffect, useState } from 'react';
import { client } from '../lib/api.js';
import { setCurrencyConfig } from '../lib/money.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  /** Load the org's currency alongside the session, so prices render correctly on first paint. */
  const loadCurrency = () =>
    client.get('/settings/bootstrap').then((r) => setCurrencyConfig(r.data.data)).catch(() => {});

  useEffect(() => {
    const token = localStorage.getItem('mccms_token');
    if (!token) { setReady(true); return; }
    client.get('/auth/me')
      .then(async (r) => { setUser(r.data.data); await loadCurrency(); })
      .catch(() => localStorage.removeItem('mccms_token'))
      .finally(() => setReady(true));
  }, []);

  const login = async (email, password) => {
    const { data } = await client.post('/auth/login', { email, password });
    localStorage.setItem('mccms_token', data.data.token);
    setUser(data.data.user);
    await loadCurrency();
  };
  const logout = () => { localStorage.removeItem('mccms_token'); setUser(null); };

  return <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>;
}
