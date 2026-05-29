import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCart } from '../../hooks/useCart'
import ClientNavbar from '../../components/ClientNavbar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ArrowLeft, ChevronDown, RefreshCw, Loader2 } from 'lucide-react'

function formatPrice(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

const ESTADO_LABELS = { pendiente: 'Pendiente', revisado: 'Revisado', cerrado: 'Confirmado', cancelado: 'Cancelado' }
const ESTADO_COLORS = {
  pendiente: 'border-l-yellow-400',
  revisado:  'border-l-azul',
  cerrado:   'border-l-green-500',
  cancelado: 'border-l-danger',
}
const ESTADO_BADGE = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  revisado:  'bg-blue-100 text-blue-800',
  cerrado:   'bg-green-100 text-green-800',
  cancelado: 'bg-red-100 text-red-800',
}

export default function MyOrders() {
  const { user }   = useAuth()
  const { addItem, clearCart } = useCart()
  const navigate   = useNavigate()
  const [orders, setOrders]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [expanded, setExpanded]     = useState(null)
  const [repeating, setRepeating]   = useState(null)
  const [cancelling, setCancelling] = useState(null)   // id del pedido en proceso de cancel
  const [confirmCancel, setConfirmCancel] = useState(null) // id esperando confirmación

  useEffect(() => {
    async function load() {
      const { data: cliente } = await supabase.from('clientes').select('id').eq('user_id', user.id).single()
      if (!cliente) { setLoading(false); return }
      const { data } = await supabase
        .from('prepedidos')
        .select(`
          id, numero_referencia, total, estado, created_at, fecha_visita,
          vendedores(nombre),
          items_prepedido(
            id, cantidad, precio_unitario, presentacion,
            productos(id, nombre, descripcion, unidad, imagen_url),
            variantes_producto(id, valor)
          )
        `)
        .eq('cliente_id', cliente.id)
        .order('created_at', { ascending: false })
      setOrders(data ?? []); setLoading(false)
    }
    load()
  }, [user.id])

  async function handleCancel(orderId) {
    setCancelling(orderId)
    const { error } = await supabase
      .from('prepedidos')
      .update({ estado: 'cancelado' })
      .eq('id', orderId)
    if (!error) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, estado: 'cancelado' } : o))
    }
    setConfirmCancel(null)
    setCancelling(null)
  }

  function handleRepeat(order) {
    setRepeating(order.id); clearCart()
    for (const item of order.items_prepedido) {
      if (!item.productos) continue
      const presentacion = item.presentacion ?? 'unidad'
      // Reconstruir el label de variante + presentación igual que en el catálogo
      const varVal   = item.variantes_producto?.valor ?? ''
      const presLabel = presentacion !== 'unidad' ? presentacion.charAt(0).toUpperCase() + presentacion.slice(1) : ''
      const label     = [varVal, presLabel].filter(Boolean).join(' · ')
      addItem(
        { id: item.productos.id, nombre: item.productos.nombre, descripcion: item.productos.descripcion,
          precio: item.precio_unitario, unidad: item.productos.unidad, imagen_url: item.productos.imagen_url },
        item.cantidad,
        item.variantes_producto?.id ?? null,
        label,
        item.precio_unitario,
        presentacion,
      )
    }
    navigate('/carrito')
  }

  return (
    <>
      <ClientNavbar />
      <div className="max-w-[600px] mx-auto px-4 pt-4 pb-20">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="gap-1.5 text-muted-foreground">
            <ArrowLeft size={14} /> Volver
          </Button>
          <h2 className="font-display font-normal text-2xl text-negro tracking-tight flex-1">Mis pedidos</h2>
          {orders.length > 0 && (
            <span className="text-xs text-muted-foreground bg-cream-dark px-3 py-1 rounded-full font-semibold shrink-0">
              {orders.length}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-amarillo" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center text-center py-16 gap-3">
            <span className="text-5xl">📦</span>
            <p className="font-display text-lg text-negro font-normal tracking-tight">Sin pedidos aún</p>
            <p className="text-sm text-muted-foreground max-w-[240px]">Cuando hagas tu primer prepedido aparecerá acá.</p>
            <Button onClick={() => navigate('/')} className="mt-3 bg-amarillo text-negro hover:bg-amarillo/90 font-bold">
              Ir al catálogo
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {orders.map((order, i) => {
              const isOpen = expanded === order.id
              const fecha  = new Date(order.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
              return (
                <div
                  key={order.id}
                  className={cn('bg-white rounded-[14px] shadow-card border-l-4 overflow-hidden animate-order-in', ESTADO_COLORS[order.estado] ?? 'border-l-border')}
                  style={{ animationDelay: `${i * 0.06}s` }}
                >
                  {/* Header row */}
                  <button
                    className="w-full flex items-center gap-2.5 px-4 py-3.5 hover:bg-cream active:bg-cream-dark transition-colors text-left"
                    onClick={() => setExpanded(prev => prev === order.id ? null : order.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-sm text-negro">{order.numero_referencia}</div>
                      <div className="text-[0.73rem] text-muted-foreground mt-0.5">
                        {fecha}{order.vendedores?.nombre && ` · ${order.vendedores.nombre}`}
                      </div>
                      {order.fecha_visita && (
                        <div className="text-[0.73rem] text-green-700 font-semibold mt-0.5">
                          📅 Visita: {new Date(order.fecha_visita + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long' })}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0 mr-2">
                      <div className="font-display font-bold text-[1.05rem] text-amarillo">{formatPrice(order.total)}</div>
                      <span className={cn('inline-block text-[0.65rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full mt-1', ESTADO_BADGE[order.estado] ?? 'bg-gray-100 text-gray-600')}>
                        {ESTADO_LABELS[order.estado] ?? order.estado}
                      </span>
                    </div>
                    <ChevronDown
                      size={15}
                      className={cn('text-muted-foreground shrink-0 transition-transform duration-200', isOpen && 'rotate-180')}
                    />
                  </button>

                  {/* Detail */}
                  {isOpen && (
                    <div className="px-4 border-t border-cream-dark animate-detail-open">
                      {order.items_prepedido.map(item => (
                        <div key={item.id} className="flex justify-between items-start py-2.5 border-b border-cream-dark last:border-none text-sm gap-2.5">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold truncate">{item.productos?.nombre}</div>
                            {item.variantes_producto?.valor && (
                              <div className="text-[0.73rem] text-muted-foreground mt-0.5">{item.variantes_producto.valor}</div>
                            )}
                          </div>
                          <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                            {item.presentacion && item.presentacion !== 'unidad' && (
                              <span className={`inline-flex items-center gap-0.5 text-[0.58rem] font-extrabold uppercase px-1.5 py-0.5 rounded-full border ${
                                item.presentacion === 'pack'
                                  ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                                  : 'bg-green-100 text-green-800 border-green-200'
                              }`}>
                                {item.presentacion === 'pack' ? '📦 Pack' : '🎁 Pallet'}
                              </span>
                            )}
                            <div className="text-muted-foreground text-xs">
                              {item.cantidad} {item.presentacion && item.presentacion !== 'unidad'
                                ? item.presentacion.charAt(0).toUpperCase() + item.presentacion.slice(1)
                                : (item.productos?.unidad ?? 'unidad')}
                            </div>
                            <div className="font-display font-bold text-amarillo text-sm">{formatPrice(item.precio_unitario * item.cantidad)}</div>
                          </div>
                        </div>
                      ))}

                      <div className="flex flex-col gap-2 my-3">
                        {order.estado !== 'cancelado' && (
                          <Button
                            className="w-full bg-amarillo text-negro hover:bg-amarillo/90 font-bold gap-2"
                            size="sm"
                            onClick={() => handleRepeat(order)}
                            disabled={repeating === order.id}
                          >
                            {repeating === order.id
                              ? <><Loader2 size={14} className="animate-spin" /> Cargando…</>
                              : <><RefreshCw size={14} /> Repetir este pedido</>}
                          </Button>
                        )}

                        {order.estado === 'pendiente' && (
                          confirmCancel === order.id ? (
                            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                              <p className="text-xs text-red-700 flex-1 font-semibold">¿Cancelar este pedido?</p>
                              <Button
                                size="sm"
                                className="h-7 px-3 text-xs bg-red-600 text-white hover:bg-red-700 gap-1"
                                onClick={() => handleCancel(order.id)}
                                disabled={cancelling === order.id}
                              >
                                {cancelling === order.id ? <Loader2 size={12} className="animate-spin" /> : 'Sí, cancelar'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-3 text-xs"
                                onClick={() => setConfirmCancel(null)}
                                disabled={cancelling === order.id}
                              >
                                No
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full text-xs text-muted-foreground hover:text-red-600 hover:bg-red-50"
                              onClick={() => setConfirmCancel(order.id)}
                            >
                              Cancelar pedido
                            </Button>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
