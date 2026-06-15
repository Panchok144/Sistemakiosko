import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

const TOKEN_KEY = 'kiosko_token'
const USER_KEY = 'kiosko_session'
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const configureAxios = (token) => {
  if (!token) {
    delete axios.defaults.headers.common.Authorization
    return
  }

  axios.defaults.headers.common.Authorization = `Bearer ${token}`
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(() => {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(TOKEN_KEY)
  })
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      setAuthReady(true)
      return
    }

    const requestInterceptor = axios.interceptors.request.use((config) => {
      const currentToken = window.localStorage.getItem(TOKEN_KEY)
      if (currentToken) {
        config.headers = {
          ...(config.headers || {}),
          Authorization: `Bearer ${currentToken}`,
        }
      }
      return config
    })

    const savedToken = window.localStorage.getItem(TOKEN_KEY)
    const savedUser = window.localStorage.getItem(USER_KEY)

    if (savedToken) {
      configureAxios(savedToken)
      setToken(savedToken)

      if (savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser)
          setUser({
            ...parsedUser,
            nombre: parsedUser.nombre || parsedUser.nombre_usuario,
            suscripcion_activa: parsedUser.suscripcion_activa ?? true,
          })
        } catch {
          window.localStorage.removeItem(USER_KEY)
        }
      }
    }

    setAuthReady(true)

    return () => {
      axios.interceptors.request.eject(requestInterceptor)
    }
  }, [])

  const login = useCallback(async ({ nombre_usuario, password }) => {
    try {
      const { data } = await axios.post(`${API_URL}/api/usuarios/login`, {
        nombre_usuario,
        password,
      })

      const normalizedUser = {
        ...data.usuario,
        nombre: data.usuario.nombre || data.usuario.nombre_usuario,
        suscripcion_activa: data.usuario.suscripcion_activa ?? true,
      }

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(TOKEN_KEY, data.token)
        window.localStorage.setItem(USER_KEY, JSON.stringify(normalizedUser))
      }

      configureAxios(data.token)
      setToken(data.token)
      setUser(normalizedUser)

      return normalizedUser
    } catch (error) {
      const message = error.response?.data?.error || 'Credenciales incorrectas'
      throw new Error(message)
    }
  }, [])

  const logout = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(TOKEN_KEY)
      window.localStorage.removeItem(USER_KEY)
    }

    configureAxios(null)
    setToken(null)
    setUser(null)
  }, [])

  const updateUser = useCallback((value) => {
    setUser((prev) => {
      const nextValue = typeof value === 'function' ? value(prev) : value

      if (typeof window !== 'undefined') {
        if (nextValue) {
          window.localStorage.setItem(USER_KEY, JSON.stringify(nextValue))
        } else {
          window.localStorage.removeItem(USER_KEY)
        }
      }

      return nextValue
    })
  }, [])

  const value = useMemo(() => ({
    user,
    token,
    authReady,
    isAuthenticated: Boolean(token && user),
    isSubscriptionActive: user?.suscripcion_activa !== false && user?.suscripcion_activa !== 0,
    login,
    logout,
    updateUser,
  }), [authReady, token, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider')
  }

  return context
}
