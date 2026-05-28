import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AdminLayout from '../../components/AdminLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, ArrowRight, TrendingUp, TrendingDown, AlertCircle, Truck, BarChart2, Users } from 'lucide-react'

function formatPrice(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}
function startOfWeek(date) {
  const d = new Date(date); const day = d.getDay()
  d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); return d
}
function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
}

const ESTADO_BADGE = {
  pendiente: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  revisado:  'bg-blue-100 text-blue-800 border-blue-200',
  cerrado:   'bg-green-100 text-green-800 border-green-200',
  cancelado: 'bg-red-100 text-red-800 border-red-200',
}

export default function AdminDashboard() {
  const navigate  = useNavigate()
  const [loading, setLoading] = useState(true)
  const [dash,    setDash]    = useState(null)

  useEffect(() => {
    async function load() {
      const now              = new Date()
      const inicioSemana     = startOfWeek(now)
      const inicioSemanaPasada = new Date(inicioSemana)
      inicioSemanaPasada.setDate(inicioSemanaPasada.getDate() - 7)
      const inicioMes = startOfMonth(now)
      const hace30    = new Date(now); hace30.setDate(hace30.getDate() - 30)

      const [
        { count: sinAsignarCount },
        { data: revisados },
        { data: allOrders },
        { data: allClientes },
        { data: allItems },
      ] = await Promise.all([
        // 1. Pedidos pendientes sin vendedor asignado
        supabase.from('prepedidos')
          .select('*', { count: 'exact', head: true })
          .eq('estado', 'pendiente')
          .is('vendedor_id', null),
        // 2. Pedidos revisados (listos para despachar)
        supabase.from('prepedidos')
          .select('id, total')
          .eq('estado', 'revisado'),
        // 3. Todos los pedidos no cancelados (fuente de todos los cálculos JS)
        supabase.from('prepedidos')
          .select('id, numero_referencia, created_at, total, estado, vendedor_id, cliente_id, clientes(nombre_negocio), vendedores(nombre)')
          .neq('estado', 'cancelado')
          .order('created_at', { ascending: false }),
        // 4. Clientes activos (para riesgo)
        supabase.from('clientes')
          .select('id, nombre_negocio')
          .eq('activo', true),
        // 5. Items de pedidos (para top productos del mes)
        supabase.from('items_prepedido')
          .select('prepedido_id, producto_id, cantidad, productos(nombre)'),
      ])

      const orders   = allOrders   ?? []
      const clientes = allClientes ?? []
      const items    = allItems    ?? []

      // ── KPI 2: Por despachar ────────────────────────────────────────
      const porDespachar = {
        count: (revisados ?? []).length,
        total: (revisados ?? []).reduce((s, o) => s + (o.total ?? 0), 0),
      }

      // ── KPI 3: Comparativo semanal ──────────────────────────────────
      const desdeSemPasada = orders.filter(o => new Date(o.created_at) >= inicioSemanaPasada)
      const estaSemana   = desdeSemPasada.filter(o => new Date(o.created_at) >= inicioSemana)
        .reduce((s, o) => s + (o.total ?? 0), 0)
      const semanaPasada = desdeSemPasada.filter(o => new Date(o.created_at) < inicioSemana)
        .reduce((s, o) => s + (o.total ?? 0), 0)
      const varPct = semanaPasada > 0
        ? Math.round(((estaSemana - semanaPasada) / semanaPasada) * 100)
        : null

      // ── KPI 4: Clientes activos últimos 30 días ─────────────────────
      const clientesActivos30 = new Set(
        orders.filter(o => new Date(o.created_at) >= hace30).map(o => o.cliente_id)
      ).size

      // ── Tops del mes ────────────────────────────────────────────────
      const mesPedidos   = orders.filter(o => new Date(o.created_at) >= inicioMes)
      const mesPedidoIds = new Set(mesPedidos.map(o => o.id))

      // Top Vendedores
      const vendMap = {}
      mesPedidos.forEach(o => {
        if (!o.vendedor_id) return
        if (!vendMap[o.vendedor_id]) vendMap[o.vendedor_id] = { nombre: o.vendedores?.nombre ?? '—', total: 0, pedidos: 0 }
        vendMap[o.vendedor_id].total   += o.total ?? 0
        vendMap[o.vendedor_id].pedidos += 1
      })
      const topVendedores = Object.values(vendMap).sort((a, b) => b.total - a.total).slice(0, 5)

      // Top Clientes
      const cliMap = {}
      mesPedidos.forEach(o => {
        if (!cliMap[o.cliente_id]) cliMap[o.cliente_id] = { nombre: o.clientes?.nombre_negocio ?? '—', total: 0, pedidos: 0 }
        cliMap[o.cliente_id].total   += o.total ?? 0
        cliMap[o.cliente_id].pedidos += 1
      })
      const topClientes = Object.values(cliMap).sort((a, b) => b.total - a.total).slice(0, 5)

      // Top Productos (solo ítems de pedidos de este mes)
      const prodMap = {}
      items.filter(i => mesPedidoIds.has(i.prepedido_id)).forEach(i => {
        if (!prodMap[i.producto_id]) prodMap[i.producto_id] = { nombre: i.productos?.nombre ?? '—', cantidad: 0 }
        prodMap[i.producto_id].cantidad += i.cantidad ?? 0
      })
      const topProductos = Object.values(prodMap).sort((a, b) => b.cantidad - a.cantidad).slice(0, 5)

      // ── Clientes en riesgo (>30 días sin pedir) ─────────────────────
      const lastOrder = {}
      orders.forEach(o => {
        const d = new Date(o.created_at)
        if (!lastOrder[o.cliente_id] || d > lastOrder[o.cliente_id].fecha) {
          lastOrder[o.cliente_id] = { fecha: d, vendedor: o.vendedores?.nombre ?? null }
        }
      })
      const hoy = new Date()
      const clientesRiesgo = clientes
        .map(c => {
          const last = lastOrder[c.id]
          if (!last) return { nombre: c.nombre_negocio, dias: null, vendedor: null }
          const dias = Math.floor((hoy - last.fecha) / 864e5)
          return { nombre: c.nombre_negocio, dias, vendedor: last.vendedor }
        })
        .filter(c => c.dias === null || c.dias > 30)
        .sort((a, b) => (b.dias ?? 9999) - (a.dias ?? 9999))
        .slice(0, 15)

      setDash({
        sinAsignarCount: sinAsignarCount ?? 0,
        porDespachar,
        weekly: { estaSemana, semanaPasada, varPct },
        clientesActivos30,
        totalClientes: clientes.length,
        ultimos10: orders.slice(0, 10),
        topVendedores,
        topClientes,
        topProductos,
        clientesRiesgo,
      })
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-7 h-7 animate-spin text-amarillo" />
        </div>
      </AdminLayout>
    )
  }

  const {
    sinAsignarCount, porDespachar, weekly,
    clientesActivos30, totalClientes,
    ultimos10, topVendedores, topClientes, topProductos, clientesRiesgo,
  } = dash

  const mesLabel = new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

  return (
    <AdminLayout>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-negro">Dashboard</h2>
        <p className="text-muted-foreground text-sm mt-1">Estado operativo del día.</p>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">

        {/* Pedidos sin asignar */}
        <Card
          onClick={() => navigate('/admin/pedidos')}
          className={`shadow-panel border-l-4 cursor-pointer hover:shadow-md transition-shadow ${sinAsignarCount > 0 ? 'border-l-red-500' : 'border-l-green-500'}`}
        >
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <div className={`text-3xl font-bold font-display ${sinAsignarCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {sinAsignarCount}
                </div>
                <div className="text-[0.72rem] uppercase tracking-wider text-muted-foreground mt-2">Sin asignar</div>
              </div>
              <AlertCircle size={18} className={sinAsignarCount > 0 ? 'text-red-400 mt-0.5' : 'text-green-400 mt-0.5'} />
            </div>
            <p className={`text-[0.7rem] mt-1.5 font-medium ${sinAsignarCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {sinAsignarCount > 0 ? 'Requieren vendedor' : 'Todo asignado ✓'}
            </p>
          </CardContent>
        </Card>

        {/* Por despachar */}
        <Card
          onClick={() => navigate('/admin/pedidos')}
          className="shadow-panel border-l-4 border-l-amarillo cursor-pointer hover:shadow-md transition-shadow"
        >
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-3xl font-bold font-display text-negro">{porDespachar.count}</div>
                <div className="text-[0.72rem] uppercase tracking-wider text-muted-foreground mt-2">Por despachar</div>
              </div>
              <Truck size={18} className="text-amarillo mt-0.5" />
            </div>
            <p className="text-[0.7rem] text-muted-foreground mt-1.5">
              {porDespachar.count > 0 ? formatPrice(porDespachar.total) : 'Sin pedidos revisados'}
            </p>
          </CardContent>
        </Card>

        {/* Facturado esta semana */}
        <Card className="shadow-panel border-l-4 border-l-negro">
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xl font-bold font-display text-negro leading-tight">
                  {formatPrice(weekly.estaSemana)}
                </div>
                <div className="text-[0.72rem] uppercase tracking-wider text-muted-foreground mt-2">Esta semana</div>
              </div>
              <BarChart2 size={18} className="text-muted-foreground mt-0.5" />
            </div>
            {weekly.varPct !== null ? (
              <div className={`flex items-center gap-1 text-[0.72rem] font-semibold mt-1.5 ${weekly.varPct >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {weekly.varPct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {weekly.varPct >= 0 ? '+' : ''}{weekly.varPct}% vs semana ant.
              </div>
            ) : (
              <p className="text-[0.7rem] text-muted-foreground mt-1.5">Sin datos semana ant.</p>
            )}
          </CardContent>
        </Card>

        {/* Clientes activos */}
        <Card className="shadow-panel border-l-4 border-l-azul">
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-3xl font-bold font-display text-azul">
                  {clientesActivos30}
                  <span className="text-base text-muted-foreground font-normal"> / {totalClientes}</span>
                </div>
                <div className="text-[0.72rem] uppercase tracking-wider text-muted-foreground mt-2">Activos (30 días)</div>
              </div>
              <Users size={18} className="text-azul/60 mt-0.5" />
            </div>
            <p className="text-[0.7rem] text-muted-foreground mt-1.5">
              {totalClientes - clientesActivos30 > 0
                ? `${totalClientes - clientesActivos30} sin actividad reciente`
                : 'Todos activos ✓'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Últimos 10 pedidos ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold text-negro">
          Últimos prepedidos
          <span className="font-normal text-muted-foreground text-sm ml-2">(10 más recientes)</span>
        </h3>
        <Button variant="outline" size="sm" onClick={() => navigate('/admin/pedidos')} className="gap-1.5 text-xs border-negro/20">
          Ver todos <ArrowRight size={12} />
        </Button>
      </div>
      <Card className="shadow-panel mb-6">
        <Table>
          <TableHeader>
            <TableRow className="bg-negro hover:bg-negro">
              {['Referencia', 'Cliente', 'Vendedor', 'Total', 'Estado', 'Fecha', ''].map(h => (
                <TableHead key={h} className="text-white text-[0.72rem] uppercase tracking-wide">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ultimos10.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  Todavía no hay prepedidos.
                </TableCell>
              </TableRow>
            ) : ultimos10.map(p => (
              <TableRow
                key={p.id}
                className={`hover:bg-cream ${!p.vendedor_id && p.estado === 'pendiente' ? 'bg-yellow-50' : ''}`}
              >
                <TableCell className="font-bold text-sm">{p.numero_referencia}</TableCell>
                <TableCell className="text-sm">{p.clientes?.nombre_negocio ?? '—'}</TableCell>
                <TableCell className="text-xs">
                  {p.vendedores?.nombre
                    ? <span className="text-negro">{p.vendedores.nombre}</span>
                    : <span className="text-red-500 font-semibold">Sin asignar</span>
                  }
                </TableCell>
                <TableCell className="font-bold text-sm">{formatPrice(p.total)}</TableCell>
                <TableCell>
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-[0.7rem] font-bold uppercase tracking-wide border ${ESTADO_BADGE[p.estado] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
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

      {/* ── Top 5 del mes ──────────────────────────────────────────────── */}
      <h3 className="text-base font-bold text-negro mb-3">
        Top 5 del mes
        <span className="font-normal text-muted-foreground text-sm ml-2 capitalize">({mesLabel})</span>
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">

        {/* Vendedores */}
        <Card className="shadow-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-[0.78rem] uppercase tracking-wider text-muted-foreground font-bold">Vendedores</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {topVendedores.length === 0
              ? <p className="text-muted-foreground text-sm py-2">Sin ventas este mes.</p>
              : topVendedores.map((v, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b border-cream-dark last:border-none">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[0.7rem] font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                    <span className="text-sm font-semibold truncate">{v.nombre}</span>
                    <span className="text-muted-foreground text-[0.7rem] shrink-0">{v.pedidos} ped.</span>
                  </div>
                  <span className="text-sm font-bold text-negro shrink-0 ml-2">{formatPrice(v.total)}</span>
                </div>
              ))
            }
          </CardContent>
        </Card>

        {/* Productos */}
        <Card className="shadow-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-[0.78rem] uppercase tracking-wider text-muted-foreground font-bold">Productos más pedidos</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {topProductos.length === 0
              ? <p className="text-muted-foreground text-sm py-2">Sin ventas este mes.</p>
              : topProductos.map((p, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b border-cream-dark last:border-none">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[0.7rem] font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                    <span className="text-sm font-semibold truncate">{p.nombre}</span>
                  </div>
                  <span className="text-sm font-bold shrink-0 ml-2">{p.cantidad} u.</span>
                </div>
              ))
            }
          </CardContent>
        </Card>

        {/* Clientes */}
        <Card className="shadow-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-[0.78rem] uppercase tracking-wider text-muted-foreground font-bold">Clientes</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {topClientes.length === 0
              ? <p className="text-muted-foreground text-sm py-2">Sin ventas este mes.</p>
              : topClientes.map((c, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b border-cream-dark last:border-none">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[0.7rem] font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                    <span className="text-sm font-semibold truncate">{c.nombre}</span>
                    <span className="text-muted-foreground text-[0.7rem] shrink-0">{c.pedidos} ped.</span>
                  </div>
                  <span className="text-sm font-bold text-negro shrink-0 ml-2">{formatPrice(c.total)}</span>
                </div>
              ))
            }
          </CardContent>
        </Card>
      </div>

      {/* ── Clientes en riesgo ──────────────────────────────────────────── */}
      {clientesRiesgo.length > 0 && (
        <>
          <h3 className="text-base font-bold text-negro mb-3 flex items-center gap-2">
            Clientes sin pedir
            <span className="text-muted-foreground font-normal text-sm">(más de 30 días)</span>
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-700 text-[0.65rem] font-bold">
              {clientesRiesgo.length}
            </span>
          </h3>
          <Card className="shadow-panel">
            <Table>
              <TableHeader>
                <TableRow className="bg-negro hover:bg-negro">
                  {['Cliente', 'Último pedido', 'Vendedor asignado'].map(h => (
                    <TableHead key={h} className="text-white text-[0.72rem] uppercase tracking-wide">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientesRiesgo.map((c, i) => (
                  <TableRow key={i} className="hover:bg-cream">
                    <TableCell className="font-semibold text-sm">{c.nombre}</TableCell>
                    <TableCell>
                      {c.dias === null
                        ? <span className="text-red-600 font-semibold text-sm">Nunca pidió</span>
                        : <span className={`text-sm font-semibold ${c.dias > 60 ? 'text-red-600' : 'text-orange-600'}`}>
                            Hace {c.dias} días
                          </span>
                      }
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.vendedor ?? '—'}</TableCell>
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
