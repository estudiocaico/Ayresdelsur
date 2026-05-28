import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCart } from '../../hooks/useCart'
import ClientNavbar from '../../components/ClientNavbar'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, Loader2, Minus, Plus, X } from 'lucide-react'

function formatPrice(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

function buildWAMessage({ refNum, total, clienteNombre, items }) {
  const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const limite = 10
  const lineas = items.slice(0, limite).map(i => {
    const v = i.variantLabel ? ` (${i.variantLabel})` : ''
    return `• ${i.qty}x ${i.name}${v} → ${formatPrice(i.price * i.qty)}`
  })
  if (items.length > limite) lineas.push(`... y ${items.length - limite} producto(s) más`)
  return (
    `🌿 *Nuevo Prepedido — Ayres del Sur*\n\n` +
    `📋 Pedido: ${refNum}\n👤 Cliente: ${clienteNombre}\n💰 Total: ${formatPrice(total)}\n📅 Fecha: ${fecha}\n\n` +
    `🛒 *Detalle:*\n${lineas.join('\n')}`
  )
}

export default function Cart() {
  const { user } = useAuth()
  const { items, total, updateQty, removeItem, clearCart } = useCart()
  const navigate = useNavigate()

  const [notes, setNotes]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const [pedidoMinimo, setPedidoMinimo] = useState(0)
  const [waDestinos, setWaDestinos]     = useState([])

  useEffect(() => {
    Promise.all([
      supabase.from('configuracion').select('valor').eq('clave', 'pedido_minimo').single(),
      supabase.from('configuracion').select('valor').eq('clave', 'whatsapp_destinos').single(),
    ]).then(([{ data: minData }, { data: waData }]) => {
      if (minData) setPedidoMinimo(Number(minData.valor) || 0)
      if (waData?.valor) { try { setWaDestinos(JSON.parse(waData.valor)) } catch { setWaDestinos([]) } }
    })
  }, [])

  const minimoAlcanzado = pedidoMinimo === 0 || total >= pedidoMinimo
  const faltaParaMinimo = pedidoMinimo - total
  const pctMinimo       = pedidoMinimo > 0 ? Math.min((total / pedidoMinimo) * 100, 100) : 100

  async function notifyWhatsApp({ refNum, clienteNombre }) {
    if (waDestinos.length === 0) return
    const mensaje = buildWAMessage({ refNum, total, clienteNombre, items })
    try {
      await supabase.functions.invoke('notify-pedido', { body: { destinos: waDestinos, mensaje } })
    } catch {
      waDestinos.forEach(({ numero }) => window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, '_blank'))
    }
  }

  async function handleConfirm() {
    if (items.length === 0) return
    if (!minimoAlcanzado) { setError(`El pedido mínimo es de ${formatPrice(pedidoMinimo)}. Te faltan ${formatPrice(faltaParaMinimo)}.`); return }
    setLoading(true); setError('')
    try {
      const { data: clienteData } = await supabase.from('clientes').select('id, nombre_negocio').eq('user_id', user.id).single()
      if (!clienteData) throw new Error('No se encontró el perfil del cliente.')
      const refNum = `PP-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`
      const { data: pedido, error: pedidoErr } = await supabase.from('prepedidos').insert({
        cliente_id: clienteData.id, numero_referencia: refNum, total, notas_admin: notes || null, estado: 'pendiente',
      }).select().single()
      if (pedidoErr) throw pedidoErr
      const { error: itemsErr } = await supabase.from('items_prepedido').insert(items.map(i => ({
        prepedido_id: pedido.id, producto_id: i.productId, variante_id: i.variantId ?? null,
        cantidad: i.qty, precio_unitario: i.price, subtotal: i.price * i.qty,
        presentacion: i.presentacion ?? 'unidad',
      })))
      if (itemsErr) throw itemsErr
      notifyWhatsApp({ refNum, clienteNombre: clienteData.nombre_negocio }).catch(() => {})
      clearCart(); navigate(`/pedido-confirmado/${pedido.id}`)
    } catch (err) {
      setError('Hubo un error al confirmar el pedido. Por favor intentalo de nuevo.'); console.error(err)
    } finally { setLoading(false) }
  }

  return (
    <>
      <ClientNavbar />

      <div className="max-w-[600px] mx-auto px-4 pt-4 pb-[170px]">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="gap-1.5 text-muted-foreground">
            <ArrowLeft size={14} /> Volver
          </Button>
          <h2 className="font-extrabold text-lg flex-1">Mi carrito</h2>
          {items.length > 0 && (
            <span className="text-xs text-muted-foreground bg-cream-dark px-3 py-1 rounded-full font-semibold">
              {items.reduce((s, i) => s + i.qty, 0)} items
            </span>
          )}
        </div>

        {items.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🛒</div>
            <p className="font-bold text-lg mb-1.5">Tu carrito está vacío</p>
            <p className="text-sm text-muted-foreground mb-5">Agregá productos desde el catálogo.</p>
            <Button onClick={() => navigate('/')} className="bg-amarillo text-negro hover:bg-amarillo/90 font-bold">
              Ver catálogo
            </Button>
          </div>
        ) : (
          <>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-2.5">
              {items.map(item => (
                <div
                  key={item.key}
                  className="bg-white rounded-xl shadow-card border-l-[3px] border-l-amarillo px-3.5 py-3.5 flex gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm leading-snug">{item.name}</div>
                    {item.variantLabel && <div className="text-[0.75rem] text-muted-foreground mt-0.5">{item.variantLabel}</div>}
                    <div className="text-sm text-muted-foreground mt-1">{formatPrice(item.price)} × {item.qty}</div>
                    <div className="font-display font-bold text-amarillo text-base mt-0.5">{formatPrice(item.price * item.qty)}</div>
                  </div>
                  <div className="flex flex-col items-end gap-2.5">
                    <button
                      onClick={() => removeItem(item.key)}
                      className="text-muted-foreground bg-cream-dark hover:bg-red-100 hover:text-danger border-none rounded-md px-2 py-1 text-xs leading-none transition-colors"
                      aria-label="Quitar"
                    >
                      <X size={13} />
                    </button>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => updateQty(item.key, item.qty - 1)}
                        className="w-8 h-8 rounded-full bg-cream-dark hover:bg-negro hover:text-white text-negro flex items-center justify-center transition-colors"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="font-display font-extrabold text-base min-w-[26px] text-center">{item.qty}</span>
                      <button
                        onClick={() => updateQty(item.key, item.qty + 1)}
                        className="w-8 h-8 rounded-full bg-cream-dark hover:bg-negro hover:text-white text-negro flex items-center justify-center transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Notes */}
            <div className="mt-5 flex flex-col gap-1.5">
              <label className="text-[0.72rem] font-bold uppercase tracking-wider text-muted-foreground">
                Observaciones (opcional)
              </label>
              <textarea
                className="w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-[80px]"
                rows={3}
                placeholder="Ej: preferencia de entrega, productos urgentes..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      {/* Sticky summary */}
      {items.length > 0 && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[600px] bg-white border-t-2 border-negro px-4 pt-3 pb-5 shadow-[0_-6px_24px_rgba(0,0,0,0.10)]">
          {/* Min order progress */}
          {pedidoMinimo > 0 && (
            <div className="mb-3">
              <div className="flex justify-between text-[0.74rem] text-muted-foreground mb-1.5">
                <span>Mínimo {formatPrice(pedidoMinimo)}</span>
                {minimoAlcanzado
                  ? <span className="text-green-700 font-bold">✓ Alcanzado</span>
                  : <span>Faltan <strong className="text-negro">{formatPrice(faltaParaMinimo)}</strong></span>}
              </div>
              <div className="h-1.5 bg-cream-dark rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-400"
                  style={{ width: `${pctMinimo}%`, background: minimoAlcanzado ? '#43A047' : 'var(--amarillo)' }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-between items-center mb-3">
            <span className="text-[0.78rem] uppercase tracking-wider font-bold text-muted-foreground">Total estimado</span>
            <span className="font-display font-bold text-[1.6rem] text-negro tracking-tight">{formatPrice(total)}</span>
          </div>

          <Button
            className="w-full h-12 bg-amarillo text-negro hover:bg-amarillo/90 font-bold text-base gap-2"
            onClick={handleConfirm}
            disabled={loading || !minimoAlcanzado}
          >
            {loading ? <><Loader2 size={16} className="animate-spin" /> Enviando pedido…</> : 'Confirmar prepedido'}
          </Button>
          <p className="text-[0.72rem] text-muted-foreground text-center mt-2">
            No se realiza ningún cobro. El vendedor te contactará para cerrar la venta.
          </p>
        </div>
      )}
    </>
  )
}
