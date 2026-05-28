import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'

export default function Login() {
  const { signIn, profile, user } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  // Si ya esta logueado, redirigir
  if (user && profile) {
    navigate(profile.role === 'admin' ? '/admin' : '/', { replace: true })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      // La redireccion ocurre en el useEffect del AuthContext
    } catch (err) {
      setError('Email o contraseña incorrectos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-700 flex items-center justify-center p-5">
      <div className="w-full max-w-[380px]">

        {/* Logo / header */}
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="Ayres del Sur"
            className="h-16 w-auto mx-auto mb-3"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
          <p className="text-white/75 text-sm">Sistema de Preventa</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-panel-lg px-6 py-7">
          <h2 className="text-[1.1rem] font-bold mb-5 text-negro">Ingresá a tu cuenta</h2>

          {error && (
            <Alert variant="destructive" className="mb-5">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 mt-2 bg-amarillo text-negro hover:bg-amarillo/90 font-bold text-base gap-2"
              disabled={loading}
            >
              {loading ? <><Loader2 size={16} className="animate-spin" /> Ingresando...</> : 'Ingresar'}
            </Button>
          </form>
        </div>

        <p className="text-center text-white/75 text-sm mt-5">
          ¿Primera vez?{' '}
          <a href="/registro" className="text-white font-bold underline underline-offset-2">
            Crear cuenta
          </a>
        </p>
      </div>
    </div>
  )
}
