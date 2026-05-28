import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'

export default function Register() {
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    setLoading(true)
    try {
      // Verificar que el email este pre-registrado por el admin
      // Usamos RPC con SECURITY DEFINER para bypassear RLS desde usuario anónimo
      const { data: canRegister, error: rpcError } = await supabase
        .rpc('check_email_preregistered', { p_email: email })

      if (rpcError || !canRegister) {
        setError('Este email no está registrado en el sistema. Contactá a la distribuidora.')
        setLoading(false)
        return
      }

      // Crear cuenta
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      })

      if (signUpError) throw signUpError

      // El trigger de Supabase vincula automaticamente el usuario con clientes
      navigate('/', { replace: true })

    } catch (err) {
      if (err.message?.includes('already registered')) {
        setError('Este email ya tiene una cuenta. Ingresá desde la pantalla de login.')
      } else {
        setError(err.message ?? 'Error al crear la cuenta. Intentá de nuevo.')
      }
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
          <p className="text-white/75 text-sm">Crear tu cuenta</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-panel-lg px-6 py-7">
          <h2 className="text-[1.1rem] font-bold mb-5 text-negro">Nueva cuenta</h2>

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
              <p className="text-[0.75rem] text-muted-foreground">
                Debe ser el email que te registró la distribuidora.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm">Confirmar contraseña</Label>
              <Input
                id="confirm"
                type="password"
                placeholder="Repetí tu contraseña"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 mt-2 bg-amarillo text-negro hover:bg-amarillo/90 font-bold text-base gap-2"
              disabled={loading}
            >
              {loading ? <><Loader2 size={16} className="animate-spin" /> Creando cuenta...</> : 'Crear cuenta'}
            </Button>
          </form>

          <p className="text-center text-sm mt-5 text-muted-foreground">
            ¿Ya tenés cuenta?{' '}
            <Link to="/login" className="text-green-700 font-semibold hover:underline">
              Ingresá acá
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
