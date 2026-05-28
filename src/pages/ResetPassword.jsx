import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [done, setDone]         = useState(false)
  const [error, setError]       = useState('')
  const [ready, setReady]       = useState(false)

  useEffect(() => {
    // Supabase dispara PASSWORD_RECOVERY al llegar desde el link del email
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setReady(true)
      }
    })
    // Chequeamos si ya hay sesión activa (ej: recarga de página)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return }
    if (password.length < 6)  { setError('La contraseña debe tener al menos 6 caracteres.'); return }
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) setError('No se pudo actualizar la contraseña. El link puede haber expirado.')
    else setDone(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-700 flex items-center justify-center p-5">
      <div className="w-full max-w-[380px]">

        <div className="text-center mb-8">
          <img src="/logo.png" alt="Ayres del Sur" className="h-16 w-auto mx-auto mb-3"
            style={{ filter: 'brightness(0) invert(1)' }} />
          <p className="text-white/75 text-sm">Sistema de Preventa</p>
        </div>

        <div className="bg-white rounded-2xl shadow-panel-lg px-6 py-7">
          <h2 className="text-[1.1rem] font-bold mb-5 text-negro">Nueva contraseña</h2>

          {done ? (
            <div className="text-center py-6">
              <div className="text-5xl mb-4">✅</div>
              <p className="font-bold text-negro mb-2">Contraseña actualizada</p>
              <p className="text-sm text-muted-foreground mb-6">
                Ya podés ingresar con tu nueva contraseña.
              </p>
              <a href="/login">
                <Button className="bg-amarillo text-negro hover:bg-amarillo/90 font-bold">
                  Ir al login
                </Button>
              </a>
            </div>
          ) : !ready ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="animate-spin text-amarillo w-7 h-7" />
              <p className="text-sm text-muted-foreground">Verificando link...</p>
            </div>
          ) : (
            <>
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">Nueva contraseña</Label>
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
                    placeholder="Repetí la contraseña"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 mt-1 bg-amarillo text-negro hover:bg-amarillo/90 font-bold gap-2"
                  disabled={loading}
                >
                  {loading
                    ? <><Loader2 size={16} className="animate-spin" /> Guardando...</>
                    : 'Guardar nueva contraseña'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
