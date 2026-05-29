import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useVendedor } from './VendedorLayout'
import { Loader2 } from 'lucide-react'

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

// ── Tarjeta de pedido ─────────────────────────────────────────────────────────
function PedidoCard({ pedido, onMarcarRealizado }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading]       = useState(false)
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
            <span>📍</span>
            <span className="text-[0.82rem]">{c.direccion}</span>
          </div>
        )}
        {c?.telefono && (
          <div className="flex items-center gap-1.5">
            <span>📞</span>
            <a
              href={`tel:${c.telefono}`}
              className="text-[0.82rem] text-azul font-semibold underline-offset-2 hover:underline"
            >
              {c.telefono}
            </a>
          </div>
        )}
        {pedido.fecha_visita && (
          <div className="flex items-center gap-1.5 text-green-700 font-semibold">
            <span>📅</span>
            <span className="text-[0.82rem]">Visita: {formatFecha(pedido.fecha_visita)}</span>
          </div>
        )}
        {pedido.notas_admin && (
          <div className="flex items-start gap-1.5 text-muted-foreground">
            <span className="mt-0.5">📝</span>
            <span className="text-[0.78rem] italic">{pedido.notas_admin}</span>
          </div>
        )}
      </div>

      {/* Total */}
      <div className="flex items-center justify-between border-t border-cream-dark pt-2.5">
        <span className="text-[0.72rem] uppercase tracking-wider font-bold text-muted-foreground">Total estimado</span>
        <span className="font-display font-bold text-[1.15rem] text-amarillo">{formatPrice(pedido.total)}</span>
      </div>

      {/* Acción */}
      {pedido.estado !== 'cerrado' && pedido.estado !== 'cancelado' && (
        confirming ? (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
            <p className="text-xs text-green-800 font-semibold flex-1">¿Marcar visita como realizada?</p>
            <button
              onClick={handleCerrar}
              disabled={loading}
              className="bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : '✓ Confirmar'}
            </button>
            <button onClick={() => setConfirming(false)} className="text-xs text-muted-foreground px-2 py-1.5">No</button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="w-full py-2 bg-negro text-white text-sm font-bold rounded-lg hover:bg-negro/90 transition-colors"
          >
            Marcar visita realizada
          </button>
        )
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function MisVisitas() {
  const { vendedor } = useVendedor()
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [vendedor.id])

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
    setPedidos(prev => prev.map(p => p.id === pedidoId ? { ...p, estado: 'cerrado' } : p))
  }

  const conFecha  = pedidos.filter(p => !!p.fecha_visita)
  const sinFecha  = pedidos.filter(p => !p.fecha_visita)
  const realizados = pedidos.filter(p => p.estado === 'cerrado')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 animate-spin text-amarillo" />
      </div>
    )
  }

  return (
    <div className="px-4 pt-4 pb-6 max-w-[520px] mx-auto">
      <h2 className="font-display text-2xl font-bold text-negro tracking-tight mb-1">Mis visitas</h2>
      <p className="text-sm text-muted-foreground mb-5">
        {conFecha.length > 0 ? `${conFecha.length} pedido${conFecha.length > 1 ? 's' : ''} con fecha agendada` : 'Sin visitas agendadas hoy'}
      </p>

      {pedidos.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📭</div>
          <p className="font-bold text-negro mb-1">Sin pedidos asignados</p>
          <p className="text-sm text-muted-foreground">El admin te asignará pedidos desde el panel.</p>
        </div>
      ) : (
        <>
          {/* Con fecha de visita */}
          {conFecha.length > 0 && (
            <div className="flex flex-col gap-3 mb-6">
              {conFecha.map(p => (
                <PedidoCard key={p.id} pedido={p} onMarcarRealizado={marcarRealizado} />
              ))}
            </div>
          )}

          {/* Sin fecha de visita */}
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
                  <PedidoCard key={p.id} pedido={p} onMarcarRealizado={marcarRealizado} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
