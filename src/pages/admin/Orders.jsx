import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import AdminLayout from '../../components/AdminLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Printer, FileSpreadsheet, Map } from 'lucide-react'

const ESTADO_BADGE = {
  pendiente: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  revisado:  'bg-blue-100 text-blue-800 border border-blue-200',
  cerrado:   'bg-green-100 text-green-800 border border-green-200',
  cancelado: 'bg-red-100 text-red-800 border border-red-200',
}

const ESTADOS = ['Todos', 'pendiente', 'revisado', 'cerrado', 'cancelado']

function formatPrice(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

function esc(str) {
  return String(str ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function printWindow(html) {
  const w = window.open('', '_blank')
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => { w.print() }, 600)
}

function buildFullOrdersHTML(orders, vendedorNombre) {
  const fecha = new Date().toLocaleDateString('es-AR')

  const ordersHTML = orders.map(p => {
    const cliente   = p.clientes
    const items     = p.items_prepedido ?? []
    const itemsRows = items.map(item => `
      <tr>
        <td class="muted">${esc(item.productos?.codigo_interno)}</td>
        <td>
          <strong>${esc(item.productos?.nombre)}</strong>
          ${item.variantes_producto?.valor ? `<br><span class="muted" style="font-size:10px">${esc(item.variantes_producto.valor)}</span>` : ''}
        </td>
        <td class="muted">${esc(item.productos?.unidad)}</td>
        <td style="text-align:right;font-weight:700">${esc(item.cantidad)}</td>
        <td style="text-align:right">${formatPrice(item.precio_unitario)}</td>
        <td style="text-align:right;font-weight:700;color:#E8A020">${formatPrice(item.subtotal)}</td>
      </tr>
    `).join('')

    return `
      <div class="order-page">
        <div class="page-header">
          <div style="display:flex;align-items:center;gap:12px">
            <img src="${window.location.origin}/logo-circular.png" style="height:60px;width:auto" alt="Ayres del Sur" />
            <div>
              <div class="muted" style="font-size:11px;font-weight:600">DISTRIBUIDORA MAYORISTA</div>
              <div class="muted" style="font-size:11px">San Miguel del Monte</div>
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.08em;color:#767676">PREPEDIDO</div>
            <div style="font-size:22px;font-weight:800;color:#1A1A1A;letter-spacing:-0.02em">${esc(p.numero_referencia)}</div>
            <div class="muted" style="font-size:11px">${new Date(p.created_at).toLocaleDateString('es-AR')}</div>
          </div>
        </div>

        <div class="vendedor-pill">Vendedor: ${esc(vendedorNombre)}</div>

        <div class="client-grid">
          <div>
            <div class="label">Cliente</div>
            <div style="font-weight:700;font-size:14px">${esc(cliente?.nombre_negocio)}</div>
            ${cliente?.razon_social ? `<div style="font-size:12px">${esc(cliente.razon_social)}</div>` : ''}
            ${cliente?.cuit ? `<div class="muted" style="font-size:11px">CUIT: ${esc(cliente.cuit)}</div>` : ''}
          </div>
          <div>
            <div class="label">Contacto</div>
            ${cliente?.direccion ? `<div style="font-size:12px">📍 ${esc(cliente.direccion)}</div>` : ''}
            ${cliente?.telefono  ? `<div style="font-size:12px">📞 ${esc(cliente.telefono)}</div>`  : ''}
            ${p.fecha_visita     ? `<div style="font-size:12px;font-weight:700;color:#E8A020">📅 Visita: ${new Date(p.fecha_visita + 'T12:00:00').toLocaleDateString('es-AR')}</div>` : ''}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Código</th><th>Producto</th><th>Unid.</th>
              <th style="text-align:right">Cant.</th>
              <th style="text-align:right">Precio unit.</th>
              <th style="text-align:right">Subtotal</th>
            </tr>
          </thead>
          <tbody>${itemsRows}</tbody>
          <tfoot>
            <tr>
              <td colspan="5" style="text-align:right">TOTAL ESTIMADO</td>
              <td style="text-align:right;color:#E8A020;font-size:15px">${formatPrice(p.total)}</td>
            </tr>
          </tfoot>
        </table>

        <div class="footer">Ayres del Sur — Distribuidora Mayorista · Prepedido sujeto a confirmación · ${fecha}</div>
      </div>
    `
  }).join('')

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<title>Prepedidos — ${vendedorNombre}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'DM Sans', Arial, sans-serif; margin: 0; padding: 0; color: #1A1A1A; background: #fff; }
  .order-page { padding: 28px 36px; page-break-after: always; border-bottom: 3px solid #F0EDE4; }
  .order-page:last-child { page-break-after: auto; border-bottom: none; }
  .page-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 2px solid #1A1A1A; margin-bottom: 12px; }
  .vendedor-pill { display: inline-block; background: #E8A020; color: #1A1A1A; font-weight: 700; font-size: 12px; padding: 4px 14px; border-radius: 100px; margin-bottom: 12px; }
  .client-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #FAFAF7; padding: 12px 14px; border-radius: 8px; margin-bottom: 14px; border: 1px solid #F0EDE4; }
  .label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #767676; margin-bottom: 3px; }
  .muted { color: #767676; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #1A1A1A; color: #fff; padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
  td { padding: 7px 10px; border-bottom: 1px solid #F0EDE4; vertical-align: middle; }
  tbody tr:last-child td { border-bottom: none; }
  tfoot td { background: #1A1A1A; color: #fff; font-weight: 700; padding: 9px 10px; }
  .footer { margin-top: 14px; font-size: 10px; color: #aaa; border-top: 1px solid #F0EDE4; padding-top: 8px; }
  @media print { body { background: white; } .order-page { page-break-after: always; } }
</style>
</head><body>${ordersHTML}</body></html>`
}

function buildRouteSheetHTML(orders, vendedorNombre) {
  const fecha = new Date().toLocaleDateString('es-AR')
  const rows = orders.map((p, i) => `
    <tr>
      <td style="text-align:center;color:#767676">${i + 1}</td>
      <td><strong>${esc(p.clientes?.nombre_negocio)}</strong></td>
      <td class="muted">${esc(p.clientes?.direccion)}</td>
      <td class="muted" style="font-size:11px">${esc(p.numero_referencia)}</td>
      <td style="font-weight:600;color:${p.fecha_visita ? '#E8A020' : '#767676'}">${p.fecha_visita ? new Date(p.fecha_visita + 'T12:00:00').toLocaleDateString('es-AR') : '—'}</td>
      <td style="text-align:right;font-weight:700;color:#E8A020">${formatPrice(p.total)}</td>
      <td style="text-align:center;font-size:16px">☐</td>
    </tr>
  `).join('')

  const total = orders.reduce((s, o) => s + (o.total ?? 0), 0)

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<title>Hoja de Ruta — ${vendedorNombre}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'DM Sans', Arial, sans-serif; margin: 32px 36px; color: #1A1A1A; background: #fff; }
  .muted { color: #767676; }
  .page-header { display: flex; align-items: center; gap: 14px; padding-bottom: 14px; border-bottom: 2px solid #1A1A1A; margin-bottom: 16px; }
  .page-header h1 { font-size: 24px; font-weight: 800; margin: 0 0 2px; letter-spacing: -0.02em; }
  .sub { color: #767676; font-size: 12px; }
  .vendedor-pill { display: inline-flex; align-items: center; gap: 6px; background: #E8A020; color: #1A1A1A; font-weight: 700; font-size: 13px; padding: 6px 16px; border-radius: 100px; margin-bottom: 16px; }
  .summary { display: grid; grid-template-columns: repeat(3, auto); gap: 0; background: #FAFAF7; border: 1px solid #F0EDE4; border-radius: 8px; padding: 12px 16px; margin-bottom: 18px; width: fit-content; gap: 0 24px; }
  .summary-item { display: flex; flex-direction: column; }
  .summary-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #767676; margin-bottom: 2px; }
  .summary-value { font-size: 15px; font-weight: 800; color: #1A1A1A; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #1A1A1A; color: #fff; padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
  td { padding: 9px 10px; border-bottom: 1px solid #F0EDE4; vertical-align: middle; }
  tbody tr:nth-child(even) { background: #FAFAF7; }
  tbody tr:last-child td { border-bottom: none; }
  tfoot td { background: #1A1A1A; color: #fff; font-weight: 700; padding: 9px 10px; }
  .footer { margin-top: 16px; font-size: 10px; color: #aaa; border-top: 1px solid #F0EDE4; padding-top: 8px; }
  @media print { body { background: white; margin: 20px; } }
</style>
</head><body>
  <div class="page-header">
    <img src="${window.location.origin}/logo-circular.png" style="height:64px;width:auto" alt="Ayres del Sur" />
    <div>
      <h1>Hoja de Ruta</h1>
      <div class="sub">Distribuidora Mayorista · San Miguel del Monte</div>
    </div>
  </div>

  <div class="vendedor-pill">
    🧑‍💼 ${esc(vendedorNombre)}
  </div>

  <div class="summary">
    <div class="summary-item">
      <span class="summary-label">Fecha</span>
      <span class="summary-value">${fecha}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">Clientes</span>
      <span class="summary-value">${orders.length}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">Total estimado</span>
      <span class="summary-value" style="color:#E8A020">${formatPrice(total)}</span>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:36px">#</th>
        <th>Cliente</th>
        <th>Dirección</th>
        <th>Referencia</th>
        <th>Fecha Visita</th>
        <th style="text-align:right">Total estimado</th>
        <th style="text-align:center;width:80px">✓ Visitado</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="5" style="text-align:right;font-size:10px;letter-spacing:0.06em;text-transform:uppercase">Total estimado</td>
        <td style="text-align:right;color:#E8A020;font-size:14px">${formatPrice(total)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">Ayres del Sur — Distribuidora de Alimentos · Documento generado el ${fecha}</div>
</body></html>`
}

export default function AdminOrders() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const [orders, setOrders]                 = useState([])
  const [vendedores, setVendedores]         = useState([])
  const [loading, setLoading]               = useState(true)
  const [estado, setEstado]                 = useState(location.state?.estado ?? 'Todos')
  const [vendedorFilter, setVendedorFilter] = useState(location.state?.vendedorFilter ?? 'Todos')
  const [search, setSearch]                 = useState('')
  const [printing, setPrinting]             = useState(false)

  useEffect(() => {
    async function loadVendedores() {
      const { data } = await supabase
        .from('vendedores')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre')
      setVendedores(data ?? [])
    }
    loadVendedores()
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      let q = supabase
        .from('prepedidos')
        .select('id, numero_referencia, total, estado, created_at, fecha_visita, vendedor_id, clientes(nombre_negocio, direccion), vendedores(nombre)')
        .order('created_at', { ascending: false })

      if (estado !== 'Todos') q = q.eq('estado', estado)
      if (vendedorFilter === 'sin_asignar') q = q.is('vendedor_id', null)
      else if (vendedorFilter !== 'Todos') q = q.eq('vendedor_id', vendedorFilter)

      const { data } = await q
      setOrders(data ?? [])
      setLoading(false)
    }
    load()
  }, [estado, vendedorFilter])

  const filtered = orders.filter(o =>
    !search ||
    o.numero_referencia?.includes(search.toUpperCase()) ||
    o.clientes?.nombre_negocio?.toLowerCase().includes(search.toLowerCase())
  )

  async function assignVendedor(orderId, vendedorId) {
    await supabase
      .from('prepedidos')
      .update({ vendedor_id: vendedorId || null })
      .eq('id', orderId)
    setOrders(prev => prev.map(o =>
      o.id === orderId
        ? { ...o, vendedor_id: vendedorId || null, vendedores: vendedores.find(v => v.id === vendedorId) ?? null }
        : o
    ))
  }

  async function handlePrintOrders() {
    if (!selectedVendedor) return
    setPrinting(true)
    const { data } = await supabase
      .from('prepedidos')
      .select(`
        id, numero_referencia, total, estado, created_at, fecha_visita,
        clientes(nombre_negocio, razon_social, cuit, direccion, telefono),
        items_prepedido(
          id, cantidad, precio_unitario, subtotal,
          productos(nombre, codigo_interno, unidad),
          variantes_producto(valor)
        )
      `)
      .eq('vendedor_id', vendedorFilter)
      .order('created_at', { ascending: false })

    if (data?.length) {
      printWindow(buildFullOrdersHTML(data, selectedVendedor.nombre))
    }
    setPrinting(false)
  }

  function handlePrintRouteSheet() {
    if (!selectedVendedor) return
    printWindow(buildRouteSheetHTML(filtered, selectedVendedor.nombre))
  }

  function handleExportExcel() {
    const rows = [
      ['Referencia', 'Cliente', 'Dirección', 'Vendedor', 'Total ($)', 'Estado', 'Fecha', 'Fecha Visita'],
      ...filtered.map(p => [
        p.numero_referencia,
        p.clientes?.nombre_negocio ?? '',
        p.clientes?.direccion ?? '',
        p.vendedores?.nombre ?? 'Sin asignar',
        p.total ?? 0,
        p.estado,
        new Date(p.created_at).toLocaleDateString('es-AR'),
        p.fecha_visita ? new Date(p.fecha_visita + 'T12:00:00').toLocaleDateString('es-AR') : '',
      ])
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [14, 28, 28, 18, 14, 12, 12, 14].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Prepedidos')
    XLSX.writeFile(wb, `prepedidos_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const selectedVendedor = vendedores.find(v => v.id === vendedorFilter)

  return (
    <AdminLayout>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-negro">Prepedidos</h2>
        <p className="text-muted-foreground text-sm mt-1">Listado completo de prepedidos recibidos.</p>
      </div>

      {/* Filters toolbar */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <Input
          className="max-w-[220px] h-9 text-sm"
          placeholder="Buscar cliente o referencia..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="h-9 rounded-md border border-input bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={estado}
          onChange={e => setEstado(e.target.value)}
        >
          {ESTADOS.map(e => (
            <option key={e} value={e}>
              {e === 'Todos' ? 'Todos los estados' : e.charAt(0).toUpperCase() + e.slice(1)}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={vendedorFilter}
          onChange={e => setVendedorFilter(e.target.value)}
        >
          <option value="Todos">Todos los vendedores</option>
          <option value="sin_asignar">Sin asignar</option>
          {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
        </select>

        {selectedVendedor && (
          <>
            <Button variant="outline" size="sm" onClick={handlePrintRouteSheet} className="gap-1.5 text-xs">
              <Map size={13} /> Hoja de ruta
            </Button>
            <Button size="sm" onClick={handlePrintOrders} disabled={printing} className="gap-1.5 text-xs bg-negro text-white hover:bg-negro/90">
              {printing ? <><Loader2 size={13} className="animate-spin" /> Preparando...</> : <><Printer size={13} /> Imprimir pedidos</>}
            </Button>
          </>
        )}

        <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-1.5 text-xs ml-auto">
          <FileSpreadsheet size={13} /> Exportar Excel
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-amarillo" />
        </div>
      ) : (
        <Card className="shadow-panel overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-negro hover:bg-negro">
                {['Referencia','Cliente','Dirección','Vendedor','Total','Estado','Fecha','Visita',''].map(h => (
                  <TableHead key={h} className="text-white text-[0.7rem] uppercase tracking-wide whitespace-nowrap">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No hay prepedidos.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map(p => (
                <TableRow key={p.id} className="hover:bg-cream">
                  <TableCell className="font-bold text-sm">{p.numero_referencia}</TableCell>
                  <TableCell className="text-sm font-medium">{p.clientes?.nombre_negocio ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.clientes?.direccion ?? '—'}</TableCell>
                  <TableCell>
                    <select
                      className="h-8 rounded-md border border-input bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring min-w-[110px]"
                      value={p.vendedor_id ?? ''}
                      onChange={e => assignVendedor(p.id, e.target.value)}
                    >
                      <option value="">Sin asignar</option>
                      {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                    </select>
                  </TableCell>
                  <TableCell className="font-bold text-sm">{formatPrice(p.total)}</TableCell>
                  <TableCell>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[0.68rem] font-bold uppercase tracking-wide ${ESTADO_BADGE[p.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                      {p.estado}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {new Date(p.created_at).toLocaleDateString('es-AR')}
                  </TableCell>
                  <TableCell className={`text-xs whitespace-nowrap ${p.fecha_visita ? 'text-green-700 font-semibold' : 'text-muted-foreground'}`}>
                    {p.fecha_visita ? new Date(p.fecha_visita + 'T12:00:00').toLocaleDateString('es-AR') : '—'}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" onClick={() => navigate(`/admin/pedidos/${p.id}`)} className="text-xs bg-negro text-white hover:bg-negro/90 h-7 px-3">
                      Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </AdminLayout>
  )
}
