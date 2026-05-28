import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, ArrowLeft } from 'lucide-react'

export default function ForgotPassword() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (err) setError('No se pudo enviar el email. Verificá que sea correcto.')
    else setSent(true)
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
          <a href="/login" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-negro mb-5 w-fit">
            <ArrowLeft size={14} /> Volver al login
          </a>

          <h2 className="text-[1.1rem] font-bold mb-2 text-negro">Recuperar contraseña</h2>

          {sent ? (
            <div className="text-center py-6">
              <div className="text-5xl mb-4">📧</div>
              <p className="font-bold text-negro mb-2">Revisá tu correo</p>
              <p className="text-sm text-muted-foreground">
                Te enviamos un link para restablecer tu contraseña a{' '}
                <strong className="text-negro">{email}</strong>.
              </p>
              <p className="text-xs text-muted-foreground mt-3">Si no lo ves, revisá la carpeta de spam.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-5">
                Ingresá tu email y te mandamos un link para crear una nueva contraseña.
              </p>

              {error && (
                <Alert variant="destructive" className="mb-4">
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
                <Button
                  type="submit"
                  className="w-full h-11 mt-1 bg-amarillo text-negro hover:bg-amarillo/90 font-bold gap-2"
                  disabled={loading}
                >
                  {loading
                    ? <><Loader2 size={16} className="animate-spin" /> Enviando...</>
                    : 'Enviar link de recuperación'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
