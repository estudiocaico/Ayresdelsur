import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import AdminLayout from '../../components/AdminLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, UserPlus, Pencil, ToggleLeft, ToggleRight, Search, CheckCircle } from 'lucide-react'

const EMPTY_NEW = {
  nombre_negocio: '', razon_social: '', cuit: '',
  direccion: '', telefono: '', email: '', lista_precios: 'minorista',
}

export default function AdminClients() {
  const [clients, setClients]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(EMPTY_NEW)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const [editing, setEditing]   = useState(null)
  const [search, setSearch]     = useState('')

  useEffect(() => { loadClients() }, [])

  async function loadClients() {
    const { data } = await supabase.from('clientes').select('*').order('nombre_negocio')
    setClients(data ?? [])
    setLoading(false)
  }

  function handleChange(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const { data: existe } = await supabase.from('clientes').select('id').eq('email', form.email).single()
      if (existe) throw new Error('Ya existe un cliente con ese email.')
      const { error: err } = await supabase.from('clientes').insert({
        nombre_negocio: form.nombre_negocio, razon_social: form.razon_social || null,
        cuit: form.cuit || null, direccion: form.direccion,
        telefono: form.telefono || null, email: form.email, activo: true, lista_precios: form.lista_precios,
      })
      if (err) throw err
      setSuccess(`Cliente "${form.nombre_negocio}" creado. Compartile la URL para que cree su contraseña en /registro.`)
      setForm(EMPTY_NEW); setShowForm(false); loadClients()
    } catch (err) { setError(err.message ?? 'Error al crear el cliente.')
    } finally { setSaving(false) }
  }

  function openEdit(c) {
    setEditing({
      id: c.id,
      nombre_negocio: c.nombre_negocio ?? '',
      razon_social:   c.razon_social   ?? '',
      cuit:           c.cuit           ?? '',
      direccion:      c.direccion      ?? '',
      telefono:       c.telefono       ?? '',
      lista_precios:  c.lista_precios  ?? 'minorista',
      whatsapp_callmebot_apikey: c.whatsapp_callmebot_apikey ?? '',
      whatsapp_notificaciones:   c.whatsapp_notificaciones   ?? true,
    })
    setError('')
  }

  async function handleEditSave(e) {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const { error: err } = await supabase.from('clientes').update({
        nombre_negocio: editing.nombre_negocio, razon_social: editing.razon_social || null,
        cuit: editing.cuit || null, direccion: editing.direccion,
        telefono: editing.telefono || null, lista_precios: editing.lista_precios,
        whatsapp_callmebot_apikey: editing.whatsapp_callmebot_apikey || null,
        whatsapp_notificaciones:   editing.whatsapp_notificaciones,
      }).eq('id', editing.id)
      if (err) throw err
      setClients(prev => prev.map(c => c.id === editing.id ? { ...c, ...editing } : c))
      setEditing(null); setSuccess('Cliente actualizado.'); setTimeout(() => setSuccess(''), 3000)
    } catch (err) { setError(err.message ?? 'Error al guardar.')
    } finally { setSaving(false) }
  }

  async function toggleActive(client) {
    await supabase.from('clientes').update({ activo: !client.activo }).eq('id', client.id)
    setClients(prev => prev.map(c => c.id === client.id ? { ...c, activo: !client.activo } : c))
  }

  async function approveClient(client) {
    await supabase.from('clientes').update({ pendiente_aprobacion: false, activo: true }).eq('id', client.id)
    setClients(prev => prev.map(c => c.id === client.id ? { ...c, pendiente_aprobacion: false, activo: true } : c))
  }

  const FieldRow = ({ label, children }) => (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[0.75rem] uppercase tracking-wider text-muted-foreground font-bold">{label}</Label>
      {children}
    </div>
  )

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-negro">Clientes</h2>
          <p className="text-muted-foreground text-sm mt-1">Gestioná las cuentas de tus clientes.</p>
        </div>
        <Button
          onClick={() => { setShowForm(s => !s); setError(''); setSuccess('') }}
          className={`gap-2 ${showForm ? 'bg-gray-200 text-negro hover:bg-gray-300' : 'bg-negro text-white hover:bg-negro/90'}`}
        >
          <UserPlus size={15} />
          {showForm ? 'Cancelar' : 'Nuevo cliente'}
        </Button>
      </div>

      {success && (
        <Alert className="mb-5 bg-amarillo-cl border-amarillo/30 text-[#7A4B00]">
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}
      {error && !editing && (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* New client form */}
      {showForm && (
        <Card className="mb-6 shadow-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Nuevo cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                <FieldRow label="Nombre del negocio *">
                  <Input name="nombre_negocio" required value={form.nombre_negocio} onChange={handleChange} />
                </FieldRow>
                <FieldRow label="Razón social">
                  <Input name="razon_social" value={form.razon_social} onChange={handleChange} />
                </FieldRow>
                <FieldRow label="CUIT">
                  <Input name="cuit" placeholder="20-12345678-1" value={form.cuit} onChange={handleChange} />
                </FieldRow>
                <FieldRow label="Teléfono">
                  <Input name="telefono" value={form.telefono} onChange={handleChange} />
                </FieldRow>
                <FieldRow label="Dirección *">
                  <Input name="direccion" required value={form.direccion} onChange={handleChange} />
                </FieldRow>
                <FieldRow label="Email (usuario de acceso) *">
                  <Input name="email" type="email" required value={form.email} onChange={handleChange} />
                  <p className="text-[0.72rem] text-muted-foreground">El cliente usa este email para registrarse en /registro.</p>
                </FieldRow>
                <FieldRow label="Lista de precios">
                  <select name="lista_precios" className="h-10 rounded-md border border-input bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={form.lista_precios} onChange={handleChange}>
                    <option value="minorista">Minorista (precio base)</option>
                    <option value="mediano">Mediano</option>
                    <option value="mayorista">Mayorista</option>
                  </select>
                </FieldRow>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" disabled={saving} className="bg-negro text-white hover:bg-negro/90 gap-2">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {saving ? 'Creando...' : 'Crear cliente'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={open => { if (!open) { setEditing(null); setError('') } }}>
        <DialogContent className="max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
          </DialogHeader>
          {error && (
            <Alert variant="destructive" className="mb-3">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {editing && (
            <form onSubmit={handleEditSave}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-2">
                <FieldRow label="Nombre del negocio *">
                  <Input required value={editing.nombre_negocio} onChange={e => setEditing(f => ({...f, nombre_negocio: e.target.value}))} />
                </FieldRow>
                <FieldRow label="Razón social">
                  <Input value={editing.razon_social} onChange={e => setEditing(f => ({...f, razon_social: e.target.value}))} />
                </FieldRow>
                <FieldRow label="CUIT">
                  <Input placeholder="20-12345678-1" value={editing.cuit} onChange={e => setEditing(f => ({...f, cuit: e.target.value}))} />
                </FieldRow>
                <FieldRow label="Teléfono">
                  <Input value={editing.telefono} onChange={e => setEditing(f => ({...f, telefono: e.target.value}))} />
                </FieldRow>
                <FieldRow label="Dirección *" >
                  <Input required value={editing.direccion} className="sm:col-span-2" onChange={e => setEditing(f => ({...f, direccion: e.target.value}))} />
                </FieldRow>
                <FieldRow label="Lista de precios">
                  <select className="h-10 rounded-md border border-input bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={editing.lista_precios} onChange={e => setEditing(f => ({...f, lista_precios: e.target.value}))}>
                    <option value="minorista">Minorista (precio base)</option>
                    <option value="mediano">Mediano</option>
                    <option value="mayorista">Mayorista</option>
                  </select>
                </FieldRow>
              </div>

              {/* WhatsApp */}
              <div className="mt-4 border border-border rounded-lg p-3.5 bg-cream/40 space-y-3">
                <p className="text-[0.72rem] font-bold uppercase tracking-wider text-muted-foreground">Notificaciones WhatsApp</p>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[0.75rem] uppercase tracking-wider text-muted-foreground font-bold">
                    API Key Callmebot <span className="normal-case font-normal">(opcional)</span>
                  </Label>
                  <Input
                    placeholder="Ej: 1234567  — vacío: usa la API key global"
                    value={editing.whatsapp_callmebot_apikey}
                    onChange={e => setEditing(f => ({...f, whatsapp_callmebot_apikey: e.target.value}))}
                  />
                  <p className="text-[0.68rem] text-muted-foreground leading-relaxed">
                    Para activar: el cliente envía <strong>"I allow callmebot to send me messages"</strong> al{' '}
                    <strong>+34 644 59 79 23</strong> por WhatsApp y recibe su API key.
                    El número de teléfono del cliente (campo de arriba) se usa como destino.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={editing.whatsapp_notificaciones}
                    onClick={() => setEditing(f => ({...f, whatsapp_notificaciones: !f.whatsapp_notificaciones}))}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${editing.whatsapp_notificaciones ? 'bg-green-500' : 'bg-gray-300'}`}
                  >
                    <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${editing.whatsapp_notificaciones ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                  <Label className="text-sm cursor-pointer" onClick={() => setEditing(f => ({...f, whatsapp_notificaciones: !f.whatsapp_notificaciones}))}>
                    Recibe notificaciones por WhatsApp
                  </Label>
                </div>
              </div>

              <p className="text-[0.72rem] text-muted-foreground mt-3 mb-4">
                El email no puede modificarse ya que es el usuario de acceso del cliente.
              </p>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => { setEditing(null); setError('') }}>Cancelar</Button>
                <Button type="submit" disabled={saving} className="bg-negro text-white hover:bg-negro/90 gap-2">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-amarillo" />
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="relative mb-4 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-8 h-9 text-sm"
              placeholder="Buscar por nombre, email o CUIT…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <Card className="shadow-panel overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-negro hover:bg-negro">
                {['Negocio','CUIT','Dirección','Teléfono','Email','Lista precios','Estado','Acciones'].map(h => (
                  <TableHead key={h} className="text-white text-[0.7rem] uppercase tracking-wide whitespace-nowrap">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                const q = search.toLowerCase()
                const filtered = search
                  ? clients.filter(c => [c.nombre_negocio, c.email, c.cuit, c.razon_social].some(f => f?.toLowerCase().includes(q)))
                  : clients
                if (filtered.length === 0) return (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      {search ? 'Sin resultados para esa búsqueda.' : 'No hay clientes aún.'}
                    </TableCell>
                  </TableRow>
                )
                return filtered.map(c => (
                <TableRow key={c.id} className={`hover:bg-cream ${c.pendiente_aprobacion ? 'bg-orange-50' : ''}`}>
                  <TableCell>
                    <div className="font-semibold text-sm">{c.nombre_negocio}</div>
                    {c.razon_social && <div className="text-[0.75rem] text-muted-foreground">{c.razon_social}</div>}
                    {c.pendiente_aprobacion && (
                      <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[0.62rem] font-bold uppercase tracking-wide bg-orange-100 text-orange-800 border border-orange-200">
                        ⏳ Requiere aprobación
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{c.cuit ?? '—'}</TableCell>
                  <TableCell className="text-sm">{c.direccion}</TableCell>
                  <TableCell className="text-sm">{c.telefono ?? '—'}</TableCell>
                  <TableCell className="text-sm">{c.email}</TableCell>
                  <TableCell className="text-sm capitalize">{c.lista_precios ?? 'minorista'}</TableCell>
                  <TableCell>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[0.68rem] font-bold uppercase tracking-wide ${c.activo ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                      {c.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1.5 flex-wrap">
                      {c.pendiente_aprobacion && (
                        <Button size="sm" onClick={() => approveClient(c)}
                          className="h-7 px-2 text-xs gap-1 bg-orange-500 text-white hover:bg-orange-600">
                          <CheckCircle size={11} /> Aprobar
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openEdit(c)} className="h-7 px-2 text-xs gap-1">
                        <Pencil size={11} /> Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(c)} className="h-7 px-2 text-xs gap-1">
                        {c.activo ? <ToggleLeft size={13} /> : <ToggleRight size={13} />}
                        {c.activo ? 'Desactivar' : 'Activar'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                ))
              })()}
            </TableBody>
          </Table>
        </Card>
        </>
      )}
    </AdminLayout>
  )
}
