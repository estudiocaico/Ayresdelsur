import { useAuth } from '../../contexts/AuthContext'
import { useVendedor } from './VendedorLayout'
import { LogOut } from 'lucide-react'

export default function MiPerfil() {
  const { user, signOut } = useAuth()
  const { vendedor } = useVendedor()

  return (
    <div className="px-4 pt-8 pb-6 max-w-[420px] mx-auto">

      {/* Avatar */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-20 h-20 rounded-full bg-negro flex items-center justify-center text-white text-3xl font-extrabold mb-3">
          {vendedor.nombre.charAt(0).toUpperCase()}
        </div>
        <h2 className="font-display text-xl font-bold text-negro">{vendedor.nombre}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{user?.email}</p>
        <span className="mt-2 inline-block px-3 py-0.5 bg-amarillo/20 text-amarillo text-[0.68rem] font-extrabold uppercase tracking-wider rounded-full">
          Vendedor
        </span>
      </div>

      {/* Info */}
      <div className="bg-white rounded-xl shadow-card divide-y divide-cream-dark mb-6">
        <div className="px-4 py-3.5">
          <p className="text-[0.68rem] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Nombre</p>
          <p className="text-sm font-semibold text-negro">{vendedor.nombre}</p>
        </div>
        <div className="px-4 py-3.5">
          <p className="text-[0.68rem] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Email</p>
          <p className="text-sm font-semibold text-negro">{user?.email ?? '—'}</p>
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={signOut}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-danger text-danger font-bold hover:bg-red-50 transition-colors"
      >
        <LogOut size={16} />
        Cerrar sesión
      </button>
    </div>
  )
}
