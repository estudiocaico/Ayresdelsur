import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import AdminLayout from '../../components/AdminLayout'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Loader2, ChevronDown, ChevronUp, CheckCircle2, Banknote, MapPin, Phone } from 'lucide-react'

function formatPrice(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0)
}

function formatFecha(isoStr) {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// ── Tab: Deuda por cliente ────────────────────────────────────────────────────
function TabDeuda({ deudaData, setDeudaData, setHistorialData }) {
  const [expandedClient, setExpandedClient] = useState(null)
  const [pagoForm, setPagoForm]             = useState(null) // { id, monto, nota, rect }
  const [saving, setSaving]                 = useState(false)

  // Group by client
  const grupos = Object.values(
    (deudaData ?? []).reduce((acc, p) => {
      const cid = p.clientes?.id ?? '__unknown__'
      if (!acc[cid]) acc[cid] = { cliente: p.clientes, pedidos: [], total: 0 }
      acc[cid].pedidos.push(p)
      acc[cid].total += p.total ?? 0
      return acc
    }, {})
  ).sort((a, b) => b.total - a.total)

  const totalGeneral  = grupos.reduce((s, g) => s + g.total, 0)
  const totalClientes = grupos.length
  const totalPedidos  = deudaData.length

  async function cobrar() {
    setSaving(true)
    const updates = {
      estado_pago:  'pagado',
      monto_pagado: parseFloat(pagoForm.monto) || null,
      nota_pago:    pagoForm.nota?.trim() || null,
      fecha_pago:   new Date().toISOString(),
    }
    await supabase.from('prepedidos').update(updates).eq('id', pagoForm.id)

    const paid = deudaData.find(p => p.id === pagoForm.id)
    setDeudaData(prev => prev.filter(p => p.id !== pagoForm.id))
    if (paid) setHistorialData(prev => [{ ...paid, ...updates }, ...prev])

    setPagoForm(null)
    setSaving(false)
  }

  if (deudaData.length === 0) {
    return (
      <div className="text-center py-20">
        <CheckCircle2 size={40} className="mx-auto text-green-500 mb-3" />
        <p className="font-bold text-negro text-lg">Todo cobrado</p>
        <p className="text-sm text-muted-foreground mt-1">No hay prepedidos pendientes de cobro.</p>
      </div>
    )
  }

  return (
    <>
      {/* Resumen */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total adeudado', value: formatPrice(totalGeneral), highlight: true },
          { label: 'Clientes',       value: totalClientes },
          { label: 'Prepedidos',     value: totalPedidos },
        ].map(({ label, value, highlight }) => (
          <Card key={label} className="p-4 shadow-panel">
            <p className="text-[0.68rem] uppercase tracking-wider font-bold text-muted-foreground mb-1">{label}</p>
            <p className={`font-display font-extrabold text-2xl leading-tight ${highlight ? 'text-amarillo' : 'text-negro'}`}>
              {value}
            </p>
          </Card>
        ))}
      </div>

      {/* Lista de clientes */}
      <div className="flex flex-col gap-3">
        {grupos.map(({ cliente, pedidos, total }) => {
          const cid      = cliente?.id ?? '__unknown__'
          const isOpen   = expandedClient === cid

          return (
            <Card key={cid} className="shadow-panel overflow-hidden">
              {/* Cabecera del cliente */}
              <button
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-cream transition-colors text-left"
                onClick={() => setExpandedClient(isOpen ? null : cid)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-negro text-sm leading-snug truncate">
                    {cliente?.nombre_negocio ?? '—'}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {cliente?.direccion && (
                      <span className="flex items-center gap-1 text-[0.72rem] text-muted-foreground">
                        <MapPin size={10} /> {cliente.direccion}
                      </span>
                    )}
                    {cliente?.telefono && (
                      <a
                        href={`tel:${cliente.telefono}`}
                        onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1 text-[0.72rem] text-azul font-semibold"
                      >
                        <Phone size={10} /> {cliente.telefono}
                      </a>
                    )}
                    <span className="text-[0.72rem] text-muted-foreground">
                      {pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-display font-extrabold text-lg text-amarillo leading-tight">
                    {formatPrice(total)}
                  </p>
                  <p className="text-[0.68rem] text-muted-foreground uppercase tracking-wider">Debe</p>
                </div>
                {isOpen
                  ? <ChevronUp size={16} className="text-muted-foreground shrink-0" />
                  : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
              </button>

              {/* Pedidos del cliente */}
              {isOpen && (
                <div className="border-t border-cream-dark">
                  {pedidos.map((p, i) => (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3 px-5 py-3 ${i < pedidos.length - 1 ? 'border-b border-cream-dark' : ''}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-negro">{p.numero_referencia}</p>
                        <p className="text-[0.72rem] text-muted-foreground">
                          Pedido: {formatFecha(p.created_at)}
                        </p>
                      </div>
                      <p className="font-bold text-sm text-negro shrink-0">{formatPrice(p.total)}</p>

                      {pagoForm?.id === p.id ? (
                        /* Formulario inline */
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                          <input
                            type="number"
                            value={pagoForm.monto}
                            onChange={e => setPagoForm(f => ({ ...f, monto: e.target.value }))}
                            placeholder="Monto"
                            className="w-28 h-7 rounded-md border border-input px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          <input
                            type="text"
                            value={pagoForm.nota}
                            onChange={e => setPagoForm(f => ({ ...f, nota: e.target.value }))}
                            placeholder="Nota (opcional)"
                            className="w-36 h-7 rounded-md border border-input px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          <button
                            onClick={cobrar}
                            disabled={saving}
                            className="h-7 px-3 bg-green-600 text-white text-xs font-bold rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                          >
                            {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                            Cobrar
                          </button>
                          <button
                            onClick={() => setPagoForm(null)}
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-negro transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setPagoForm({ id: p.id, monto: String(p.total ?? ''), nota: '' })}
                          className="shrink-0 h-7 px-3 border border-input bg-white text-xs font-bold rounded-md hover:bg-cream transition-colors flex items-center gap-1"
                        >
                          <Banknote size={12} /> Cobrar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </>
  )
}

// ── Tab: Historial de cobros ──────────────────────────────────────────────────
function TabHistorial({ historialData }) {
  const today = new Date().toISOString().split('T')[0]
  const [fechaDesde,     setFechaDesde]     = useState('')
  const [fechaHasta,     setFechaHasta]     = useState(today)
  const [searchCliente,  setSearchCliente]  = useState('')

  const filtered = (historialData ?? []).filter(p => {
    if (searchCliente && !p.clientes?.nombre_negocio?.toLowerCase().includes(searchCliente.toLowerCase())) return false
    if (fechaDesde && p.fecha_pago && new Date(p.fecha_pago) < new Date(fechaDesde + 'T00:00:00')) return false
    if (fechaHasta && p.fecha_pago && new Date(p.fecha_pago) > new Date(fechaHasta + 'T23:59:59')) return false
    return true
  })

  const totalCobrado = filtered.reduce((s, p) => s + (p.monto_pagado ?? p.total ?? 0), 0)

  return (
    <>
      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-5 items-center">
        <Input
          className="max-w-[200px] h-9 text-sm"
          placeholder="Buscar cliente..."
          value={searchCliente}
          onChange={e => setSearchCliente(e.target.value)}
        />
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Desde</span>
          <input
            type="date"
            value={fechaDesde}
            onChange={e => setFechaDesde(e.target.value)}
            max={fechaHasta || undefined}
            className="h-9 rounded-md border border-input bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Hasta</span>
          <input
            type="date"
            value={fechaHasta}
            onChange={e => setFechaHasta(e.target.value)}
            min={fechaDesde || undefined}
            className="h-9 rounded-md border border-input bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {filtered.length > 0 && (
          <div className="ml-auto flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
            <CheckCircle2 size={13} className="text-green-600" />
            <span className="text-[0.78rem] font-bold text-green-800">{formatPrice(totalCobrado)} cobrados</span>
            <span className="text-[0.72rem] text-green-700">({filtered.length} pedido{filtered.length !== 1 ? 's' : ''})</span>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="font-bold text-negro mb-1">Sin registros</p>
          <p className="text-sm text-muted-foreground">Ajustá los filtros para ver cobros anteriores.</p>
        </div>
      ) : (
        <Card className="shadow-panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-negro">
                {['Fecha cobro', 'Cliente', 'Referencia', 'Total pedido', 'Monto cobrado', 'Nota'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[0.7rem] font-bold uppercase tracking-wide text-white whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-cream'}>
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap font-semibold text-green-800">
                    {formatFecha(p.fecha_pago)}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-negro">
                    {p.clientes?.nombre_negocio ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {p.numero_referencia}
                  </td>
                  <td className="px-4 py-2.5 text-sm font-semibold">
                    {formatPrice(p.total)}
                  </td>
                  <td className="px-4 py-2.5 text-sm font-bold text-green-800">
                    {p.monto_pagado != null ? formatPrice(p.monto_pagado) : formatPrice(p.total)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground italic">
                    {p.nota_pago || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function AdminCobranza() {
  const [tab,           setTab]           = useState('deuda')
  const [deudaData,     setDeudaData]     = useState([])
  const [historialData, setHistorialData] = useState([])
  const [loading,       setLoading]       = useState(true)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [deuda, historial] = await Promise.all([
      supabase
        .from('prepedidos')
        .select('id, numero_referencia, total, nota_pago, created_at, clientes(id, nombre_negocio, direccion, telefono)')
        .eq('estado', 'cerrado')
        .eq('estado_pago', 'a_cobrar')
        .order('created_at', { ascending: false }),
      supabase
        .from('prepedidos')
        .select('id, numero_referencia, total, monto_pagado, nota_pago, fecha_pago, created_at, clientes(nombre_negocio)')
        .eq('estado_pago', 'pagado')
        .order('fecha_pago', { ascending: false, nullsFirst: false }),
    ])
    setDeudaData(deuda.data ?? [])
    setHistorialData(historial.data ?? [])
    setLoading(false)
  }

  const tabs = [
    { id: 'deuda',     label: 'Deuda por cliente' },
    { id: 'historial', label: 'Historial de cobros' },
  ]

  return (
    <AdminLayout>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-negro">Cobranza</h2>
        <p className="text-muted-foreground text-sm mt-1">Seguimiento de pagos y deudas de clientes.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-cream-dark rounded-xl p-1 w-fit mb-6">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              tab === t.id
                ? 'bg-negro text-white shadow-sm'
                : 'text-muted-foreground hover:text-negro'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-amarillo" />
        </div>
      ) : tab === 'deuda' ? (
        <TabDeuda
          deudaData={deudaData}
          setDeudaData={setDeudaData}
          setHistorialData={setHistorialData}
        />
      ) : (
        <TabHistorial historialData={historialData} />
      )}
    </AdminLayout>
  )
}
