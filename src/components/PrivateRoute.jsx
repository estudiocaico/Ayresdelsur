import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Loader2 } from 'lucide-react'

export default function PrivateRoute({ role }) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <Loader2 className="w-8 h-8 animate-spin text-amarillo" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (role && profile?.role !== role) {
    // Redirigir al area correcta segun rol
    if (profile?.role === 'admin')    return <Navigate to="/admin"    replace />
    if (profile?.role === 'vendedor') return <Navigate to="/vendedor" replace />
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
