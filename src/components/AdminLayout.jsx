import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, ClipboardList, Users, UserCheck,
  Package, Upload, Settings, LogOut, Menu, X, Star, Banknote,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

const links = [
  { to: '/admin',               label: 'Dashboard',     icon: LayoutDashboard, end: true },
  { to: '/admin/pedidos',       label: 'Prepedidos',    icon: ClipboardList },
  { to: '/admin/clientes',      label: 'Clientes',      icon: Users },
  { to: '/admin/vendedores',    label: 'Vendedores',    icon: UserCheck },
  { to: '/admin/productos',     label: 'Productos',     icon: Package },
  { to: '/admin/importar',      label: 'Importar',      icon: Upload },
  { to: '/admin/promociones',   label: 'Promociones',   icon: Star },
  { to: '/admin/cobranza',      label: 'Cobranza',      icon: Banknote },
  { to: '/admin/configuracion', label: 'Configuración', icon: Settings },
]

export default function AdminLayout({ children }) {
  const { signOut } = useAuth()
  const navigate    = useNavigate()
  const [open, setOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-[#F0EDE4]">

      {/* ── Mobile overlay ─────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Mobile toggle ──────────────────────────────────────────────── */}
      <button
        className="fixed top-3.5 left-3.5 z-50 md:hidden bg-negro text-white p-2 rounded-lg shadow-panel"
        onClick={() => setOpen(o => !o)}
        aria-label="Abrir menú"
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full w-60 bg-negro text-white flex flex-col z-50',
          'transition-transform duration-250 ease-in-out',
          'md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="px-5 py-4 border-b border-white/10 flex flex-col gap-1">
          <img
            src="/logo.png"
            alt="Ayres del Sur"
            className="h-8 w-auto self-start object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
          <p className="text-[0.65rem] uppercase tracking-widest opacity-40">Panel Admin</p>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-5 py-2.5 text-[0.88rem] border-l-[3px] transition-all duration-150',
                  isActive
                    ? 'bg-amarillo/15 text-white border-amarillo'
                    : 'text-white/60 border-transparent hover:bg-white/7 hover:text-white',
                )
              }
            >
              <Icon size={16} className="shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer / logout */}
        <div className="px-4 py-4 border-t border-white/10">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="w-full justify-start gap-2 text-white/60 hover:text-white hover:bg-white/10 text-[0.82rem]"
          >
            <LogOut size={15} />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────────────── */}
      <main className="flex-1 ml-0 md:ml-60 p-4 md:p-7 min-w-0">
        {children}
      </main>
    </div>
  )
}
