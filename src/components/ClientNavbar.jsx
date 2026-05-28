import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useCart } from '../hooks/useCart'
import { ShoppingCart, Package, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ClientNavbar() {
  const { signOut }    = useAuth()
  const { itemCount }  = useCart()
  const navigate       = useNavigate()

  return (
    <nav className="sticky top-0 z-[100] bg-negro text-white flex items-center justify-between px-4 h-14 shadow-[0_2px_10px_rgba(0,0,0,0.25)]">

      {/* Brand */}
      <button
        className="flex items-center focus:outline-none"
        onClick={() => navigate('/catalogo')}
        aria-label="Ir al catálogo"
      >
        <img
          src="/logo.png"
          alt="Ayres del Sur"
          className="h-7 w-auto"
          style={{ filter: 'brightness(0) invert(1)' }}
        />
      </button>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/mis-pedidos')}
          className="text-white/85 hover:bg-white/15 hover:text-white gap-1.5 text-[0.8rem] font-semibold px-3"
        >
          <Package size={15} />
          Mis pedidos
        </Button>

        {/* Cart button */}
        <button
          onClick={() => navigate('/carrito')}
          className="relative bg-white/12 hover:bg-white/22 border-none rounded-lg p-2 text-white transition-colors"
          aria-label="Ver carrito"
        >
          <ShoppingCart size={20} />
          {itemCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-amarillo text-negro text-[0.6rem] font-extrabold w-[18px] h-[18px] rounded-full flex items-center justify-center leading-none">
              {itemCount > 99 ? '99+' : itemCount}
            </span>
          )}
        </button>

        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="text-white/70 hover:bg-white/15 hover:text-white px-2"
          aria-label="Cerrar sesión"
        >
          <LogOut size={16} />
        </Button>
      </div>
    </nav>
  )
}
