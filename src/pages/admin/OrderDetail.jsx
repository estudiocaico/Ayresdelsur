import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AdminLayout from '../../components/AdminLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table'
import { Loader2, ArrowLeft, Printer, Check, Save } from 'lucide-react'

const ESTADOS = ['pendiente', 'revisado', 'cerrado', 'cancelado']

const ESTADO_BADGE = {
  pendiente: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  revisado:  'bg-blue-100 text-blue-800 border border-blue-200',
  cerrado:   'bg-green-100 text-green-800 border border-green-200',
  cancelado: 'bg-red-100 text-red-800 border border-red-200',
}

function formatPrice(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

// ─── Utilidades WA ────────────────────────────────────────────────────────────

/** Limpia el número para Callmebot: sin espacios/guiones, con prefijo 54 si falta. */
function cleanPhone(phone) {
  if (!phone) return null
  let p = phone.replace(/[\s\-()+]/g, '')
  if (!p) return null
  if (p.startsWith('0'))  p = '54' + p.slice(1)   // 0223… → 54223…
  if (!p.startsWith('54')) p = '54' + p
  return p
}

/** Formatea fecha ISO 'YYYY-MM-DD' como 'lunes 14 de julio'. */
function formatFechaVisita(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const dias   = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
  const meses  = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]}`
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AdminOrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const printRef = useRef()
  const [pedido, setPedido]           = useState(null)
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [notes, setNotes]             = useState('')
  const [estado, setEstado]           = useState('')
  const [fechaVisita, setFechaVisita] = useState('')
  const [saved, setSaved]             = useState(false)
  const [apikeyGlobal, setApikeyGlobal] = useState('')

  useEffect(() => {
    async function load() {
      const [{ data }, { data: cfgData }] = await Promise.all([
        supabase.from('prepedidos').select(`
          *,
          clientes(nombre_negocio, razon_social, cuit, direccion, telefono, email,
                   whatsapp_callmebot_apikey, whatsapp_notificaciones),
          vendedores(nombre),
          items_prepedido(
            id, cantidad, precio_unitario, subtotal, presentacion,
            productos(nombre, codigo_interno, descripcion, unidad),
            variantes_producto(valor)
          )
        `).eq('id', id).single(),
        supabase.from('configuracion').select('valor').eq('clave', 'callmebot_apikey_global').maybeSingle(),
      ])
      if (data) {
        setPedido(data)
        setNotes(data.notas_admin ?? '')
        setEstado(data.estado)
        setFechaVisita(data.fecha_visita ?? '')   // '' = sin fecha; admin la elige explícitamente
      }
      if (cfgData?.valor) setApikeyGlobal(cfgData.valor)
      setLoading(false)
    }
    load()
  }, [id])

  /** Envía notificación WA al cliente si corresponde. Llama ANTES de actualizar el estado local. */
  async function notifyClienteWA({ prevEstado, prevFechaVisita }) {
    const cliente = pedido?.clientes
    // Verificar que el cliente quiere notificaciones (default true si el campo no existe aún)
    if (cliente?.whatsapp_notificaciones === false) return

    const phone  = cleanPhone(cliente?.telefono)
    if (!phone) return

    const apikey = (cliente?.whatsapp_callmebot_apikey ?? '').trim() || apikeyGlobal.trim()
    if (!apikey) return

    let mensaje = null

    // Caso A: estado cambia a cancelado
    if (estado === 'cancelado' && prevEstado !== 'cancelado') {
      mensaje = `❌ Tu pedido ${pedido.numero_referencia} fue cancelado. Contactate con nosotros si tenés dudas.`
    }
    // Caso B: fecha de visita asignada (nueva o cambiada, y no vacía)
    else if (fechaVisita && fechaVisita !== (prevFechaVisita ?? '')) {
      const vendedorNombre = pedido.vendedores?.nombre ?? 'tu vendedor'
      mensaje = `📦 Tu pedido ${pedido.numero_referencia} está confirmado. Tu vendedor ${vendedorNombre} te visita el ${formatFechaVisita(fechaVisita)}. ¡Hasta pronto!`
    }

    if (!mensaje) return

    try {
      await supabase.functions.invoke('notify-pedido', {
        body: { destinos: [{ numero: phone, apikey }], mensaje },
      })
    } catch (e) {
      console.warn('WA cliente notify error:', e)
    }
  }

  async function handleSave() {
    setSaving(true)
    const prevEstado      = pedido.estado
    const prevFechaVisita = pedido.fecha_visita

    await supabase.from('prepedidos').update({
      notas_admin: notes || null,
      estado,
      fecha_visita: fechaVisita || null,
    }).eq('id', id)

    // Notificar al cliente en paralelo (no bloquea el guardado)
    notifyClienteWA({ prevEstado, prevFechaVisita }).catch(() => {})

    setPedido(prev => ({ ...prev, notas_admin: notes || null, estado, fecha_visita: fechaVisita || null }))
    setSaved(true); setTimeout(() => setSaved(false), 2000); setSaving(false)
  }

  if (loading) return <AdminLayout><div className="flex items-center justify-center py-24"><Loader2 className="w-7 h-7 animate-spin text-amarillo" /></div></AdminLayout>
  if (!pedido)  return <AdminLayout><div className="p-6 text-danger font-semibold">Prepedido no encontrado.</div></AdminLayout>

  const cliente = pedido.clientes
  const items   = pedido.items_prepedido ?? []
  const fecha   = new Date(pedido.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <AdminLayout>
      {/* Toolbar */}
      <div className="no-print flex flex-wrap gap-2 items-center mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/pedidos')} className="gap-1.5">
          <ArrowLeft size={14} /> Volver
        </Button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap" title="Al guardar con fecha nueva, el cliente recibe un WhatsApp automático">📅 Visita:</span>
          <input
            type="date"
            value={fechaVisita}
            onChange={e => setFechaVisita(e.target.value)}
            className="h-8 rounded-md border border-input bg-white px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <select value={estado} onChange={e => setEstado(e.target.value)}
          className="h-8 rounded-md border border-input bg-white px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
          {ESTADOS.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
        </select>
        <Button variant="outline" size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : <Save size={13} />}
          {saved ? 'Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
        </Button>
        <Button size="sm" onClick={() => window.print()} className="bg-negro text-white hover:bg-negro/90 gap-1.5">
          <Printer size={14} /> Imprimir
        </Button>
      </div>

      <div className="print-order" ref={printRef}>
        {/* Header card */}
        <Card className="mb-5 shadow-panel">
          <CardContent className="pt-5">
            <div className="flex justify-between items-start flex-wrap gap-4 mb-4">
              <div className="flex items-center gap-3">
                <img src="/logo-circular.png" alt="Ayres del Sur" className="h-16 w-auto" />
                <div>
                  <p className="text-muted-foreground text-sm font-medium">Distribuidora Mayorista</p>
                  <p className="text-muted-foreground text-xs">San Miguel del Monte</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-muted-foreground">PREPEDIDO</div>
                <div className="text-xl font-extrabold text-negro">{pedido.numero_referencia}</div>
                <div className="text-xs text-muted-foreground mt-1">{fecha}</div>
              </div>
            </div>
            <hr className="border-cream-dark mb-4" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground mb-1">Cliente</p>
                <div className="font-bold">{cliente?.nombre_negocio}</div>
                {cliente?.razon_social && <div className="text-sm">{cliente.razon_social}</div>}
                {cliente?.cuit && <div className="text-xs text-muted-foreground">CUIT: {cliente.cuit}</div>}
              </div>
              <div>
                <p className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground mb-1">Contacto</p>
                {cliente?.direccion && <div className="text-sm">📍 {cliente.direccion}</div>}
                {cliente?.telefono  && <div className="text-sm">📞 {cliente.telefono}</div>}
                {cliente?.email     && <div className="text-sm">✉️ {cliente.email}</div>}
                {pedido.vendedores?.nombre && <div className="text-sm mt-1">🧑‍💼 Vendedor: <strong>{pedido.vendedores.nombre}</strong></div>}
              </div>
            </div>
            {pedido.fecha_visita && (
              <div className="mt-3 text-sm font-bold text-green-700">
                📅 Visita programada: {new Date(pedido.fecha_visita + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </div>
            )}
            <div className="mt-3">
              <span className={`inline-block px-2.5 py-0.5 rounded-full text-[0.7rem] font-bold uppercase tracking-wide ${ESTADO_BADGE[pedido.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                {pedido.estado}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Items table */}
        <Card className="mb-5 shadow-panel overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-negro hover:bg-negro">
                {['Código','Producto','Variante','Unidad','Cant.','Precio Unit.','Subtotal'].map((h,i) => (
                  <TableHead key={h} className={`text-white text-[0.7rem] uppercase tracking-wide ${i >= 4 ? 'text-right' : ''}`}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(item => (
                <TableRow key={item.id} className="hover:bg-cream">
                  <TableCell className="text-xs text-muted-foreground">{item.productos?.codigo_interno ?? '—'}</TableCell>
                  <TableCell>
                    <div className="font-semibold text-sm">{item.productos?.nombre}</div>
                    {item.productos?.descripcion && <div className="text-[0.72rem] text-muted-foreground">{item.productos.descripcion}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{item.variantes_producto?.valor ?? '—'}</TableCell>
                  <TableCell className="text-sm">
                    {item.presentacion && item.presentacion !== 'unidad'
                      ? item.presentacion.charAt(0).toUpperCase() + item.presentacion.slice(1)
                      : (item.productos?.unidad ?? 'unidad')}
                  </TableCell>
                  <TableCell className="text-right font-bold">{item.cantidad}</TableCell>
                  <TableCell className="text-right text-sm">{formatPrice(item.precio_unitario)}</TableCell>
                  <TableCell className="text-right font-bold">{formatPrice(item.subtotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={6} className="text-right font-bold text-sm py-3">TOTAL ESTIMADO</TableCell>
                <TableCell className="text-right font-extrabold text-base text-negro py-3">{formatPrice(pedido.total)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </Card>

        {/* Notes */}
        <Card className="shadow-panel">
          <CardContent className="pt-5">
            <p className="text-[0.72rem] font-bold uppercase tracking-wider text-muted-foreground mb-2">Notas del administrador</p>
            <textarea
              className="no-print w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-[80px]"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Agregar notas antes de imprimir..."
            />
            {notes && <div className="print-only hidden">{notes}</div>}
          </CardContent>
        </Card>

        <p className="mt-6 text-[0.72rem] text-muted-foreground border-t border-cream-dark pt-3">
          Ayres del Sur — Distribuidora de Alimentos | Este documento es un prepedido sujeto a confirmación por el vendedor.
        </p>
      </div>

      <style>{`
        @media print {
          .no-print   { display: none !important; }
          .print-only { display: block !important; }
          aside       { display: none !important; }
          main        { margin-left: 0 !important; width: 100% !important; }
        }
      `}</style>
    </AdminLayout>
  )
}
