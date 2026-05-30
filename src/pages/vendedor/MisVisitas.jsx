import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useVendedor } from './VendedorLayout'
import { Loader2, MapPin, Phone, Calendar, FileText, X, Pencil } from 'lucide-react'

const ESTADO_BADGE = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  revisado:  'bg-blue-100 text-blue-800',
  cerrado:   'bg-green-100 text-green-800',
  cancelado: 'bg-red-100 text-red-800',
}
const ESTADO_LABEL = { pendiente: 'Pendiente', revisado: 'Revisado', cerrado: 'Confirmado', cancelado: 'Cancelado' }

function formatPrice(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

function formatFecha(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T12:00:00')
  const dias  = ['dom','lun','mar','mié','jue','vie','sáb']
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]}`
}

// ── Modal de detalle del pedido ───────────────────────────────────────────────
function PedidoModal({ pedido, onClose }) {
  const [items, setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const c = pedido.clientes

  useEffect(() => {
    supabase
      .from('items_prepedido')
      .select('cantidad, precio_unitario, subtotal, presentacion, productos(nombre, codigo_interno, unidad)')
      .eq('prepedido_id', pedido.id)
      .then(({ data }) => { setItems(data ?? []); setLoading(false) })
  }, [pedido.id])

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-negro/50" onClick={onClose} />

      {/* Sheet */}
      <div className="relative bg-cream rounded-t-2xl max-h-[88dvh] flex flex-col shadow-panel-lg">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-cream-dark" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-4 pb-3 border-b border-cream-dark">
          <div>
            <h3 className="font-display font-bold text-lg text-negro leading-tight">{c?.nombre_negocio ?? '—'}</h3>
            <p className="text-xs text-muted-foreground">{pedido.numero_referencia}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wide ${ESTADO_BADGE[pedido.estado] ?? 'bg-gray-100 text-gray-600'}`}>
              {ESTADO_LABEL[pedido.estado] ?? pedido.estado}
            </span>
            <button onClick={onClose} className="text-muted-foreground hover:text-negro transition-colors p-1">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3">
          {/* Info cliente */}
          <div className="bg-white rounded-xl shadow-card p-3 space-y-1.5">
            {c?.direccion && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin size={13} className="shrink-0" />
                <span className="text-[0.82rem]">{c.direccion}</span>
              </div>
            )}
            {c?.telefono && (
              <div className="flex items-center gap-2">
                <Phone size={13} className="shrink-0 text-muted-foreground" />
                <a href={`tel:${c.telefono}`} className="text-[0.82rem] text-azul font-semibold">
                  {c.telefono}
                </a>
              </div>
            )}
            {pedido.fecha_visita && (
              <div className="flex items-center gap-2 text-green-700 font-semibold">
                <Calendar size={13} className="shrink-0" />
                <span className="text-[0.82rem]">Visita: {formatFecha(pedido.fecha_visita)}</span>
              </div>
            )}
            {pedido.notas_admin && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <FileText size={13} className="shrink-0 mt-0.5" />
                <span className="text-[0.78rem] italic">{pedido.notas_admin}</span>
              </div>
            )}
          </div>

          {/* Items */}
          <div className="bg-white rounded-xl shadow-card overflow-hidden">
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground px-4 pt-3 pb-1">Detalle del pedido</p>
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 size={20} className="animate-spin text-amarillo" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin items.</p>
            ) : (
              <>
                {items.map((item, i) => (
                  <div key={i} className="flex justify-between items-start px-4 py-2.5 border-b border-cream-dark last:border-b-0">
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="font-semibold text-sm text-negro leading-snug">{item.productos?.nombre}</p>
                      <p className="text-[0.7rem] text-muted-foreground">
                        {item.cantidad} × {formatPrice(item.precio_unitario)}
                        {item.presentacion && item.presentacion !== 'unidad' && (
                          <span className="ml-1 font-bold uppercase text-[0.62rem]">({item.presentacion})</span>
                        )}
                      </p>
                    </div>
                    <span className="font-bold text-sm text-negro shrink-0">{formatPrice(item.subtotal)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center px-4 py-3 bg-negro">
                  <span className="text-[0.7rem] font-bold uppercase tracking-wider text-white/70">Total estimado</span>
                  <span className="font-display font-bold text-[1.1rem] text-amarillo">{formatPrice(pedido.total)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tarjeta de pedido ─────────────────────────────────────────────────────────
function PedidoCard({ pedido, onMarcarRealizado, onVerPedido }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading]       = useState(false)
  const navigate = useNavigate()
  const c = pedido.clientes

  async function handleCerrar() {
    setLoading(true)
    await onMarcarRealizado(pedido.id)
    setLoading(false)
    setConfirming(false)
  }

  return (
    <div className="bg-white rounded-xl shadow-card p-4 flex flex-col gap-3 border-l-4 border-l-amarillo">

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-extrabold text-negro text-base leading-tight truncate">{c?.nombre_negocio ?? '—'}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{pedido.numero_referencia}</div>
        </div>
        <span className={`shrink-0 inline-block px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wide ${ESTADO_BADGE[pedido.estado] ?? 'bg-gray-100 text-gray-600'}`}>
          {ESTADO_LABEL[pedido.estado] ?? pedido.estado}
        </span>
      </div>

      {/* Detalles */}
      <div className="space-y-1 text-sm">
        {c?.direccion && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin size={12} className="shrink-0" />
            <span className="text-[0.82rem]">{c.direccion}</span>
          </div>
        )}
        {c?.telefono && (
          <div className="flex items-center gap-1.5">
            <Phone size={12} className="shrink-0 text-muted-foreground" />
            <a href={`tel:${c.telefono}`} className="text-[0.82rem] text-azul font-semibold">
              {c.telefono}
            </a>
          </div>
        )}
        {pedido.fecha_visita && (
          <div className="flex items-center gap-1.5 text-green-700 font-semibold">
            <Calendar size={12} className="shrink-0" />
            <span className="text-[0.82rem]">Visita: {formatFecha(pedido.fecha_visita)}</span>
          </div>
        )}
        {pedido.notas_admin && (
          <div className="flex items-start gap-1.5 text-muted-foreground">
            <FileText size={12} className="shrink-0 mt-0.5" />
            <span className="text-[0.78rem] italic">{pedido.notas_admin}</span>
          </div>
        )}
      </div>

      {/* Total */}
      <div className="flex items-center justify-between border-t border-cream-dark pt-2.5">
        <span className="text-[0.72rem] uppercase tracking-wider font-bold text-muted-foreground">Total estimado</span>
        <span className="font-display font-bold text-[1.15rem] text-amarillo">{formatPrice(pedido.total)}</span>
      </div>

      {/* Acciones */}
      <div className="flex gap-2">
        <button
          onClick={() => onVerPedido(pedido)}
          className="flex-1 py-2 border border-cream-dark bg-white text-negro text-sm font-bold rounded-lg hover:bg-cream transition-colors"
        >
          Ver pedido
        </button>

        {pedido.estado !== 'cerrado' && pedido.estado !== 'cancelado' && (
          <button
            onClick={() => navigate(`/vendedor/editar/${pedido.id}`)}
            className="py-2 px-3 bg-azul text-white text-sm font-bold rounded-lg hover:bg-azul/90 transition-colors flex items-center gap-1.5 shrink-0"
          >
            <Pencil size={13} /> Editar
          </button>
        )}

        {pedido.estado !== 'cerrado' && pedido.estado !== 'cancelado' && (
          confirming ? (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex-1">
              <p className="text-xs text-green-800 font-semibold flex-1">¿Confirmar visita?</p>
              <button
                onClick={handleCerrar}
                disabled={loading}
                className="bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {loading ? <Loader2 size={12} className="animate-spin" /> : 'Sí'}
              </button>
              <button onClick={() => setConfirming(false)} className="text-xs text-muted-foreground px-2 py-1.5">No</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="flex-1 py-2 bg-negro text-white text-sm font-bold rounded-lg hover:bg-negro/90 transition-colors"
            >
              Marcar realizada
            </button>
          )
        )}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function MisVisitas() {
  const { vendedor } = useVendedor()
  const [pedidos, setPedidos]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [modalPedido, setModalPedido] = useState(null)

  useEffect(() => { load() }, [vendedor.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('prepedidos')
      .select(`
        id, numero_referencia, total, estado, fecha_visita, notas_admin, created_at,
        clientes(nombre_negocio, direccion, telefono)
      `)
      .eq('vendedor_id', vendedor.id)
      .in('estado', ['pendiente', 'revisado'])
      .order('fecha_visita', { ascending: true, nullsFirst: false })
    setPedidos(data ?? [])
    setLoading(false)
  }

  async function marcarRealizado(pedidoId) {
    await supabase.from('prepedidos').update({ estado: 'cerrado' }).eq('id', pedidoId)
    setPedidos(prev => prev.filter(p => p.id !== pedidoId))
  }

  const conFecha = pedidos.filter(p => !!p.fecha_visita)
  const sinFecha = pedidos.filter(p => !p.fecha_visita)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 animate-spin text-amarillo" />
      </div>
    )
  }

  return (
    <>
      <div className="px-4 pt-4 pb-6 max-w-[520px] mx-auto">
        <h2 className="font-display text-2xl font-bold text-negro tracking-tight mb-1">Mis visitas</h2>
        <p className="text-sm text-muted-foreground mb-5">
          {conFecha.length > 0
            ? `${conFecha.length} pedido${conFecha.length > 1 ? 's' : ''} con fecha agendada`
            : 'Sin visitas agendadas'}
        </p>

        {pedidos.length === 0 ? (
          <div className="text-center py-16">
            <p className="font-bold text-negro mb-1">Sin pedidos asignados</p>
            <p className="text-sm text-muted-foreground">El admin te asignará pedidos desde el panel.</p>
          </div>
        ) : (
          <>
            {conFecha.length > 0 && (
              <div className="flex flex-col gap-3 mb-6">
                {conFecha.map(p => (
                  <PedidoCard key={p.id} pedido={p} onMarcarRealizado={marcarRealizado} onVerPedido={setModalPedido} />
                ))}
              </div>
            )}

            {sinFecha.length > 0 && (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 h-px bg-cream-dark" />
                  <span className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    Pendientes sin fecha
                  </span>
                  <div className="flex-1 h-px bg-cream-dark" />
                </div>
                <div className="flex flex-col gap-3">
                  {sinFecha.map(p => (
                    <PedidoCard key={p.id} pedido={p} onMarcarRealizado={marcarRealizado} onVerPedido={setModalPedido} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      {modalPedido && (
        <PedidoModal pedido={modalPedido} onClose={() => setModalPedido(null)} />
      )}
    </>
  )
}
