import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import AdminLayout from '../../components/AdminLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Loader2, Download, ArrowRight, TrendingUp, TrendingDown } from 'lucide-react'

function formatPrice(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}
function toLocalDateStr(d) { return d.toISOString().split('T')[0] }
function startOfWeek(date) {
  const d = new Date(date); const day = d.getDay()
  d.setHours(0,0,0,0); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); return d
}
function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1, 0,0,0,0) }

const PERIODOS = [
  { key: 'dia', label: 'Hoy' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes', label: 'Este mes' },
  { key: 'custom', label: 'Personalizado' },
]

const ESTADO_BADGE = {
  pendiente: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  revisado:  'bg-blue-100 text-blue-800 border-blue-200',
  cerrado:   'bg-green-100 text-green-800 border-green-200',
  cancelado: 'bg-red-100 text-red-800 border-red-200',
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const today = toLocalDateStr(new Date())

  const [periodo, setPeriodo]       = useState('semana')
  const [customFrom, setCustomFrom] = useState(today)
  const [customTo, setCustomTo]     = useState(today)

  const [stats, setStats]           = useState({ total: 0, pendientes: 0, clientes: 0, productos: 0 })
  const [weekly, setWeekly]         = useState({ estaSemana: 0, semanaPasada: 0 })
  const [topClientes, setTopClientes]   = useState([])
  const [topProductos, setTopProductos] = useState([])
  const [allOrdersRaw, setAllOrdersRaw] = useState([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    async function load() {
      const inicioEstaSemana   = startOfWeek(new Date())
      const inicioSemanaPasada = new Date(inicioEstaSemana)
      inicioSemanaPasada.setDate(inicioSemanaPasada.getDate() - 7)

      const [
        { count: total },
        { count: pendientes },
        { count: clientes },
        { count: productos },
        { data: weekOrders },
        { data: allOrders },
        { data: allItems },
      ] = await Promise.all([
        supabase.from('prepedidos').select('*', { count: 'exact', head: true }),
        supabase.from('prepedidos').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente'),
        supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('activo', true),
        supabase.from('productos').select('*', { count: 'exact', head: true }).eq('activo', true),
        supabase.from('prepedidos').select('total, created_at').neq('estado', 'cancelado').gte('created_at', inicioSemanaPasada.toISOString()),
        supabase.from('prepedidos').select('id, numero_referencia, created_at, total, estado, notas_admin, cliente_id, clientes(nombre_negocio, direccion, telefono), vendedores(nombre)').neq('estado', 'cancelado').order('created_at', { ascending: false }),
        supabase.from('items_prepedido').select('producto_id, cantidad, productos(nombre)'),
      ])

      setStats({ total: total ?? 0, pendientes: pendientes ?? 0, clientes: clientes ?? 0, productos: productos ?? 0 })
      setAllOrdersRaw(allOrders ?? [])

      const estaSemana   = (weekOrders ?? []).filter(o => new Date(o.created_at) >= inicioEstaSemana).reduce((s, o) => s + (o.total ?? 0), 0)
      const semanaPasada = (weekOrders ?? []).filter(o => new Date(o.created_at) >= inicioSemanaPasada && new Date(o.created_at) < inicioEstaSemana).reduce((s, o) => s + (o.total ?? 0), 0)
      setWeekly({ estaSemana, semanaPasada })

      const clientMap = {}
      ;(allOrders ?? []).forEach(o => {
        const id = o.cliente_id
        if (!clientMap[id]) clientMap[id] = { nombre: o.clientes?.nombre_negocio ?? '—', total: 0, pedidos: 0 }
        clientMap[id].total   += o.total ?? 0
        clientMap[id].pedidos += 1
      })
      setTopClientes(Object.values(clientMap).sort((a, b) => b.total - a.total).slice(0, 5))

      const prodMap = {}
      ;(allItems ?? []).forEach(i => {
        const id = i.producto_id
        if (!prodMap[id]) prodMap[id] = { nombre: i.productos?.nombre ?? '—', cantidad: 0 }
        prodMap[id].cantidad += i.cantidad ?? 0
      })
      setTopProductos(Object.values(prodMap).sort((a, b) => b.cantidad - a.cantidad).slice(0, 5))

      setLoading(false)
    }
    load()
  }, [])

  const { rangeFrom, rangeTo } = useMemo(() => {
    const now = new Date()
    if (periodo === 'dia') {
      const from = new Date(now); from.setHours(0,0,0,0)
      const to   = new Date(now); to.setHours(23,59,59,999)
      return { rangeFrom: from, rangeTo: to }
    }
    if (periodo === 'semana') {
      const from = startOfWeek(now)
      const to   = new Date(from); to.setDate(to.getDate() + 6); to.setHours(23,59,59,999)
      return { rangeFrom: from, rangeTo: to }
    }
    if (periodo === 'mes') {
      const from = startOfMonth(now)
      const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      return { rangeFrom: from, rangeTo: to }
    }
    return { rangeFrom: new Date(customFrom + 'T00:00:00'), rangeTo: new Date(customTo + 'T23:59:59') }
  }, [periodo, customFrom, customTo])

  const filteredOrders = useMemo(() => allOrdersRaw.filter(o => {
    const d = new Date(o.created_at); return d >= rangeFrom && d <= rangeTo
  }), [allOrdersRaw, rangeFrom, rangeTo])

  const periodoTotal   = filteredOrders.reduce((s, o) => s + (o.total ?? 0), 0)
  const periodoPending = filteredOrders.filter(o => o.estado === 'pendiente').length

  function handleExport() {
    const rows = filteredOrders.map(o => ({
      'Referencia': o.numero_referencia,
      'Cliente':    o.clientes?.nombre_negocio ?? '—',
      'Dirección':  o.clientes?.direccion ?? '',
      'Teléfono':   o.clientes?.telefono ?? '',
      'Vendedor':   o.vendedores?.nombre ?? '—',
      'Total ($)':  o.total,
      'Estado':     o.estado,
      'Notas':      o.notas_admin ?? '',
      'Fecha':      new Date(o.created_at).toLocaleString('es-AR'),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Prepedidos')
    const periodoStr = periodo === 'custom' ? `${customFrom}_${customTo}` : PERIODOS.find(p => p.key === periodo)?.label.replace(/ /g, '_') ?? periodo
    XLSX.writeFile(wb, `prepedidos_${periodoStr}.xlsx`)
  }

  const varPct = weekly.semanaPasada > 0
    ? Math.round(((weekly.estaSemana - weekly.semanaPasada) / weekly.semanaPasada) * 100)
    : null

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-negro">Dashboard</h2>
          <p className="text-muted-foreground text-sm mt-1">Resumen de actividad del sistema de preventa.</p>
        </div>

        {/* Period selector */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-[#F0EDE4] rounded-lg p-1 gap-0.5">
            {PERIODOS.map(p => (
              <Button
                key={p.key}
                variant={periodo === p.key ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setPeriodo(p.key)}
                className={`rounded-md text-xs px-3 ${periodo === p.key ? 'bg-negro text-white hover:bg-negro/90' : 'text-muted-foreground hover:text-negro hover:bg-white'}`}
              >
                {p.label}
              </Button>
            ))}
          </div>
          {periodo === 'custom' && (
            <div className="flex items-center gap-2">
              <Input type="date" className="w-36 h-8 text-xs" value={customFrom} onChange={e => setCustomFrom(e.target.value)} max={customTo} />
              <span className="text-muted-foreground text-xs">→</span>
              <Input type="date" className="w-36 h-8 text-xs" value={customTo} onChange={e => setCustomTo(e.target.value)} min={customFrom} />
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 text-xs border-negro/20">
            <Download size={13} /> Excel
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-amarillo" />
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
            <Card className="border-l-4 border-l-amarillo shadow-panel">
              <CardContent className="pt-5">
                <div className="text-3xl font-bold font-display text-negro">{stats.pendientes}</div>
                <div className="text-[0.72rem] uppercase tracking-wider text-muted-foreground mt-2">Pendientes totales</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-azul shadow-panel">
              <CardContent className="pt-5">
                <div className="text-3xl font-bold font-display text-azul">{filteredOrders.length}</div>
                <div className="text-[0.72rem] uppercase tracking-wider text-muted-foreground mt-2">Pedidos en el período</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-negro shadow-panel">
              <CardContent className="pt-5">
                <div className="text-2xl font-bold font-display text-negro">{formatPrice(periodoTotal)}</div>
                <div className="text-[0.72rem] uppercase tracking-wider text-muted-foreground mt-2">Monto del período</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-purple-500 shadow-panel">
              <CardContent className="pt-5">
                <div className="text-3xl font-bold font-display text-purple-700">{stats.clientes}</div>
                <div className="text-[0.72rem] uppercase tracking-wider text-muted-foreground mt-2">Clientes activos</div>
              </CardContent>
            </Card>
          </div>

          <p className="text-[0.72rem] text-muted-foreground mb-6">
            Período: {rangeFrom.toLocaleDateString('es-AR')} — {rangeTo.toLocaleDateString('es-AR')}
            {' · '}{filteredOrders.length} pedido{filteredOrders.length !== 1 ? 's' : ''}
            {periodoPending > 0 && ` · ${periodoPending} pendiente${periodoPending !== 1 ? 's' : ''}`}
          </p>

          {/* Comparativo semanal */}
          <Card className="mb-6 shadow-panel">
            <CardHeader className="pb-3">
              <CardTitle className="text-[0.78rem] uppercase tracking-wider text-muted-foreground font-bold">
                Comparativo semanal (no cancelados)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-[0.75rem] text-muted-foreground mb-1">Esta semana</div>
                  <div className="text-xl font-bold font-display text-negro">{formatPrice(weekly.estaSemana)}</div>
                </div>
                <div>
                  <div className="text-[0.75rem] text-muted-foreground mb-1">Semana anterior</div>
                  <div className="text-lg font-bold">{formatPrice(weekly.semanaPasada)}</div>
                </div>
                <div>
                  <div className="text-[0.75rem] text-muted-foreground mb-1">Variación</div>
                  {varPct !== null ? (
                    <div className={`flex items-center gap-1 text-lg font-bold ${varPct >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {varPct >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                      {varPct >= 0 ? '+' : ''}{varPct}%
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-sm">Sin datos</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top clientes + top productos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
            <Card className="shadow-panel">
              <CardHeader className="pb-3">
                <CardTitle className="text-[0.78rem] uppercase tracking-wider text-muted-foreground font-bold">
                  Top 5 clientes (histórico)
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {topClientes.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Sin datos aún.</p>
                ) : topClientes.map((c, i) => (
                  <div key={i} className="flex justify-between items-center py-1.5 border-b border-cream-dark text-sm last:border-none">
                    <div>
                      <span className="text-muted-foreground font-bold mr-2">{i + 1}.</span>
                      <span className="font-semibold">{c.nombre}</span>
                      <span className="text-muted-foreground text-[0.72rem] ml-1">({c.pedidos} ped.)</span>
                    </div>
                    <span className="font-bold text-negro">{formatPrice(c.total)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="shadow-panel">
              <CardHeader className="pb-3">
                <CardTitle className="text-[0.78rem] uppercase tracking-wider text-muted-foreground font-bold">
                  Top 5 productos más pedidos (histórico)
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {topProductos.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Sin datos aún.</p>
                ) : topProductos.map((p, i) => (
                  <div key={i} className="flex justify-between items-center py-1.5 border-b border-cream-dark text-sm last:border-none">
                    <div>
                      <span className="text-muted-foreground font-bold mr-2">{i + 1}.</span>
                      <span className="font-semibold">{p.nombre}</span>
                    </div>
                    <span className="font-bold">{p.cantidad} u.</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Pedidos del período */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold">
              Prepedidos del período
              <span className="font-normal text-muted-foreground text-sm ml-2">({filteredOrders.length})</span>
            </h3>
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/pedidos')} className="gap-1.5 text-xs">
              Ver todos <ArrowRight size={12} />
            </Button>
          </div>

          <Card className="shadow-panel">
            <Table>
              <TableHeader>
                <TableRow className="bg-negro hover:bg-negro">
                  <TableHead className="text-white text-[0.72rem] uppercase tracking-wide">Referencia</TableHead>
                  <TableHead className="text-white text-[0.72rem] uppercase tracking-wide">Cliente</TableHead>
                  <TableHead className="text-white text-[0.72rem] uppercase tracking-wide">Vendedor</TableHead>
                  <TableHead className="text-white text-[0.72rem] uppercase tracking-wide">Total</TableHead>
                  <TableHead className="text-white text-[0.72rem] uppercase tracking-wide">Estado</TableHead>
                  <TableHead className="text-white text-[0.72rem] uppercase tracking-wide">Fecha</TableHead>
                  <TableHead className="text-white text-[0.72rem] uppercase tracking-wide"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Sin prepedidos en este período.
                    </TableCell>
                  </TableRow>
                )}
                {filteredOrders.map(p => (
                  <TableRow key={p.id} className="hover:bg-cream">
                    <TableCell className="font-bold text-sm">{p.numero_referencia}</TableCell>
                    <TableCell className="text-sm">{p.clientes?.nombre_negocio ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.vendedores?.nombre ?? '—'}</TableCell>
                    <TableCell className="font-bold text-sm">{formatPrice(p.total)}</TableCell>
                    <TableCell>
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[0.7rem] font-bold uppercase tracking-wide border ${ESTADO_BADGE[p.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                        {p.estado}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(p.created_at).toLocaleDateString('es-AR')}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/pedidos/${p.id}`)} className="text-xs">
                        Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </AdminLayout>
  )
}
