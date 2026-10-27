import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api, { getToken, setToken, setUnauthorizedHandler } from './api'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(!!getToken())

  const clear = useCallback(() => { setToken(null); setUser(null) }, [])

  useEffect(() => {
    setUnauthorizedHandler(clear)
    if (!getToken()) return
    api.get('/api/auth/me').then((r) => setUser(r.data)).catch(clear).finally(() => setLoading(false))
  }, [clear])

  const value = useMemo(() => ({
    user, loading, setUser,
    async login(email, password) {
      const { data } = await api.post('/api/auth/login', { email, password })
      setToken(data.access_token); setUser(data.user); return data.user
    },
    async register(payload) {
      const { data } = await api.post('/api/auth/register', payload)
      setToken(data.access_token); setUser(data.user); return data.user
    },
    async logout() {
      try { await api.post('/api/auth/logout') } catch { /* token may already be invalid */ }
      clear()
    },
    acceptToken(data) { setToken(data.access_token); setUser(data.user) },
  }), [user, loading, clear])

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}
