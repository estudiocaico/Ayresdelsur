import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { CartProvider } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Button } from '@/components/ui/button'
import { Loader2, Lock } from 'lucide-react'

function DeactivatedScreen({ onSignOut, waNumero }) {
  const waUrl = waNumero
    ? `https://wa.me/${waNumero}?text=${encodeURIComponent('Hola, quisiera reactivar mi cuenta en Ayres del Sur.')}`
    : null

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 py-8 text-center bg-cream">

      {/* Icon */}
      <div className="w-18 h-18 rounded-full bg-orange-50 flex items-center justify-center text-[2rem] mb-6">
        <Lock size={32} className="text-amarillo" />
      </div>

      {/* Brand */}
      <div className="mb-7">
        <span
          className="text-[1.6rem] font-bold tracking-tight text-amarillo"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Ayres
        </span>
        <span
          className="text-[1.6rem] font-bold tracking-tight text-negro"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {' '}del Sur
        </span>
      </div>

      {/* Message */}
      <h1 className="text-[1.25rem] font-extrabold text-negro mb-2.5 leading-snug">
        Tu cuenta está pausada
      </h1>
      <p className="text-[0.9rem] text-muted-foreground leading-relaxed max-w-xs mb-8">
        Por el momento no podés acceder al catálogo.
        Hablá con tu vendedor para reactivarla.
      </p>

      {/* CTAs */}
      <div className="flex flex-col gap-3 w-full max-w-[300px]">
        {waUrl && (
          <a
            href={waUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold text-[0.9rem] transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.118 1.533 5.845L0 24l6.335-1.51A11.96 11.96 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.015-1.378l-.36-.214-3.733.89.952-3.637-.234-.374A9.77 9.77 0 0 1 2.182 12C2.182 6.58 6.58 2.182 12 2.182c5.42 0 9.818 4.398 9.818 9.818 0 5.42-4.398 9.818-9.818 9.818z"/>
            </svg>
            Hablar con mi vendedor
          </a>
        )}
        <Button
          variant="ghost"
          onClick={onSignOut}
          className="text-muted-foreground text-[0.85rem] hover:text-negro"
        >
          Cerrar sesión
        </Button>
      </div>
    </div>
  )
}

export default function ClientLayout() {
  const { user, signOut } = useAuth()
  const [activo, setActivo]     = useState(null)
  const [waNumero, setWaNumero] = useState(null)

  useEffect(() => {
    if (!user) return
    async function check() {
      const [{ data: cliente }, { data: waConf }] = await Promise.all([
        supabase.from('clientes').select('activo').eq('user_id', user.id).single(),
        supabase.from('configuracion').select('valor').eq('clave', 'whatsapp_destinos').single(),
      ])
      setActivo(cliente?.activo ?? true)
      if (waConf?.valor) {
        try {
          const destinos = JSON.parse(waConf.valor)
          if (Array.isArray(destinos) && destinos.length > 0) {
            setWaNumero(destinos[0].numero ?? null)
          }
        } catch { /* ignore */ }
      }
    }
    check()
  }, [user])

  if (activo === null) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-cream">
        <Loader2 className="w-8 h-8 animate-spin text-amarillo" />
      </div>
    )
  }

  if (activo === false) {
    return <DeactivatedScreen onSignOut={signOut} waNumero={waNumero} />
  }

  return (
    <CartProvider>
      <Outlet />
    </CartProvider>
  )
}
