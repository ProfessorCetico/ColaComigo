import { onAuthStateChanged, type User } from 'firebase/auth'
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react'
import { auth, firebaseConfigured } from '../lib/firebase'

type AuthState = {
  user: User | null
  loading: boolean
  configured: boolean
}

const AuthContext = createContext<AuthState>({ user: null, loading: false, configured: false })

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(firebaseConfigured)

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, configured: firebaseConfigured }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
