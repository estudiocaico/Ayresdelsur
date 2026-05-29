import { createContext, useContext, useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Loader2, CalendarDays, ShoppingBag, UserCircle } from 'lucide-react'

// ── Contexto: datos del vendedor logueado ────────────────────────────────────
const VendedorCtx = createContext(null)
export function useVendedor() {
  const ctx = useContext(VendedorCtx)
  if (!ctx) throw new Error('useVendedor debe usarse dentro de VendedorLayout')
  return ctx
}

// ── Bottom nav tab ────────────────────────────────────────────────────────────
function Tab({ to, Icon, label }) {
  return (
    <NavLink
      to={to}
      end={to === '/vendedor'}
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 px-5 py-2 text-[0.6rem] font-bold uppercase tracking-wider transition-colors ${
          isActive ? 'text-amarillo' : 'text-muted-foreground'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={20} strokeWidth={isActive ? 2.5 : 1.75} />
          {label}
        </>
      )}
    </NavLink>
  )
}

// ── Layout principal ──────────────────────────────────────────────────────────
export default function VendedorLayout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [vendedor, setVendedor] = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!user) return
    supabase
      .from('vendedores')
      .select('id, nombre, email')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        setVendedor(data)
        setLoading(false)
      })
  }, [user])

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-cream">
        <Loader2 className="w-8 h-8 animate-spin text-amarillo" />
      </div>
    )
  }

  if (!vendedor) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-cream gap-4 px-6 text-center">
        <p className="font-bold text-negro">No se encontró tu perfil de vendedor.</p>
        <button onClick={signOut} className="text-sm text-muted-foreground underline">Cerrar sesión</button>
      </div>
    )
  }

  return (
    <VendedorCtx.Provider value={{ vendedor }}>
      <div className="min-h-dvh bg-cream flex flex-col">

        {/* Top navbar */}
        <header className="bg-negro text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50 shadow-sm">
          <img src="/logo.png" alt="Ayres del Sur" className="h-7 w-auto brightness-0 invert" />
          <span className="text-[0.78rem] text-cream-dark font-semibold">{vendedor.nombre}</span>
        </header>

        {/* Main content — padding-bottom for bottom nav */}
        <main className="flex-1 overflow-y-auto pb-[68px]">
          <Outlet />
        </main>

        {/* Bottom navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-cream-dark flex justify-around items-center h-[60px] z-50 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
          <Tab to="/vendedor"           Icon={CalendarDays}  label="Mis visitas" />
          <Tab to="/vendedor/pedido"    Icon={ShoppingBag}   label="Nuevo pedido" />
          <Tab to="/vendedor/perfil"    Icon={UserCircle}    label="Mi perfil" />
        </nav>
      </div>
    </VendedorCtx.Provider>
  )
}
