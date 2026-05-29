import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import AdminLayout from '../../components/AdminLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, UserCheck, Pencil, Check, X, ToggleLeft, ToggleRight, Mail, Send } from 'lucide-react'

export default function AdminVendedores() {
  const [vendedores, setVendedores]         = useState([])
  const [loading, setLoading]               = useState(true)
  const [showForm, setShowForm]             = useState(false)
  const [nombre, setNombre]                 = useState('')
  const [emailForm, setEmailForm]           = useState('')
  const [saving, setSaving]                 = useState(false)
  const [error, setError]                   = useState('')
  const [editingId, setEditingId]           = useState(null)
  const [editingNombre, setEditingNombre]   = useState('')
  const [editingEmail, setEditingEmail]     = useState('')
  const [invitingId, setInvitingId]         = useState(null)
  const [inviteResult, setInviteResult]     = useState({}) // { [id]: 'ok' | 'error' | 'sending' }

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('vendedores').select('*').order('nombre')
    setVendedores(data ?? [])
    setLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault(); setSaving(true); setError('')
    const payload = { nombre: nombre.trim() }
    if (emailForm.trim()) payload.email = emailForm.trim().toLowerCase()
    const { error: err } = await supabase.from('vendedores').insert(payload)
    if (err) { setError(err.message) } else { setNombre(''); setEmailForm(''); setShowForm(false); load() }
    setSaving(false)
  }

  function startEdit(v) {
    setEditingId(v.id)
    setEditingNombre(v.nombre)
    setEditingEmail(v.email ?? '')
    setError('')
  }
  function cancelEdit() { setEditingId(null); setEditingNombre(''); setEditingEmail(''); setError('') }

  async function saveEdit(id) {
    if (!editingNombre.trim()) return
    setSaving(true); setError('')
    const payload = { nombre: editingNombre.trim() }
    if (editingEmail.trim()) payload.email = editingEmail.trim().toLowerCase()
    else payload.email = null
    const { error: err } = await supabase.from('vendedores').update(payload).eq('id', id)
    if (err) { setError(err.message) } else {
      setVendedores(prev => prev.map(v => v.id === id ? { ...v, ...payload } : v))
      cancelEdit()
    }
    setSaving(false)
  }

  async function toggleActive(v) {
    await supabase.from('vendedores').update({ activo: !v.activo }).eq('id', v.id)
    setVendedores(prev => prev.map(x => x.id === v.id ? { ...x, activo: !v.activo } : x))
  }

  async function sendInvite(v) {
    if (!v.email) return
    setInvitingId(v.id)
    setInviteResult(prev => ({ ...prev, [v.id]: 'sending' }))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-vendedor`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey':        import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email: v.email, vendedorId: v.id }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'Error al enviar invitación')
      setInviteResult(prev => ({ ...prev, [v.id]: 'ok' }))
    } catch (err) {
      // Traducir mensajes de error comunes de Supabase Auth
      let msg = err.message ?? 'Error al enviar invitación'
      if (msg.includes('already been registered') || msg.includes('already registered'))
        msg = 'Este email ya tiene una cuenta registrada. Eliminá el usuario desde Supabase Auth y volvé a intentar.'
      if (msg.includes('SERVICE_ROLE_KEY'))
        msg = 'Falta configurar el secret SERVICE_ROLE_KEY en la Edge Function.'
      if (msg.includes('Invalid API key') || msg.includes('Forbidden'))
        msg = 'La SERVICE_ROLE_KEY configurada no es válida.'
      setInviteResult(prev => ({ ...prev, [v.id]: msg }))
    }
    setInvitingId(null)
  }

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-negro">Vendedores</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Gestioná el equipo de ventas. Los vendedores pueden acceder desde el celular.
          </p>
        </div>
        <Button
          onClick={() => { setShowForm(s => !s); setError('') }}
          className={`gap-2 ${showForm ? 'bg-gray-200 text-negro hover:bg-gray-300' : 'bg-negro text-white hover:bg-negro/90'}`}
        >
          <UserCheck size={15} />
          {showForm ? 'Cancelar' : 'Nuevo vendedor'}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6 shadow-panel p-5">
          <h3 className="text-base font-bold mb-4">Nuevo vendedor</h3>
          <form onSubmit={handleAdd} className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Input
                placeholder="Nombre del vendedor *"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                required
                autoFocus
                className="flex-1"
              />
              <Input
                placeholder="Email (para acceso a la app)"
                type="email"
                value={emailForm}
                onChange={e => setEmailForm(e.target.value)}
                className="flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              Si ingresás un email, podrás enviar una invitación para que el vendedor acceda desde su celular.
            </p>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving} className="bg-negro text-white hover:bg-negro/90 gap-1.5">
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? 'Creando...' : 'Crear vendedor'}
              </Button>
            </div>
          </form>
          {error && (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-amarillo" />
        </div>
      ) : (
        <Card className="shadow-panel overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-negro hover:bg-negro">
                <TableHead className="text-white text-[0.7rem] uppercase tracking-wide">Vendedor</TableHead>
                <TableHead className="text-white text-[0.7rem] uppercase tracking-wide">Email / Acceso</TableHead>
                <TableHead className="text-white text-[0.7rem] uppercase tracking-wide">Estado</TableHead>
                <TableHead className="text-white text-[0.7rem] uppercase tracking-wide">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendedores.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No hay vendedores. Creá el primero.
                  </TableCell>
                </TableRow>
              )}
              {vendedores.map(v => (
                <TableRow key={v.id} className="hover:bg-cream">
                  {/* Nombre */}
                  <TableCell>
                    {editingId === v.id ? (
                      <Input
                        className="max-w-[200px] h-8 text-sm"
                        value={editingNombre}
                        onChange={e => setEditingNombre(e.target.value)}
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                      />
                    ) : (
                      <span className="font-semibold text-sm">👤 {v.nombre}</span>
                    )}
                  </TableCell>

                  {/* Email + invite */}
                  <TableCell>
                    {editingId === v.id ? (
                      <Input
                        className="max-w-[220px] h-8 text-sm"
                        type="email"
                        placeholder="email@ejemplo.com"
                        value={editingEmail}
                        onChange={e => setEditingEmail(e.target.value)}
                      />
                    ) : (
                      <div className="flex flex-col gap-1">
                        {v.email ? (
                          <>
                            <div className="flex items-center gap-1.5">
                              <Mail size={12} className="text-muted-foreground shrink-0" />
                              <span className="text-xs text-muted-foreground">{v.email}</span>
                            </div>
                            {/* Invite status / button */}
                            {inviteResult[v.id] === 'ok' ? (
                              <span className="text-[0.68rem] text-green-700 font-semibold flex items-center gap-1">
                                <Check size={11} /> Invitación enviada
                              </span>
                            ) : typeof inviteResult[v.id] === 'string' && inviteResult[v.id] !== 'sending' ? (
                              <span className="text-[0.68rem] text-red-600">{inviteResult[v.id]}</span>
                            ) : (
                              <button
                                onClick={() => sendInvite(v)}
                                disabled={invitingId === v.id}
                                className="flex items-center gap-1 text-[0.68rem] text-azul font-semibold hover:underline disabled:opacity-50 w-fit"
                              >
                                {invitingId === v.id
                                  ? <><Loader2 size={10} className="animate-spin" /> Enviando...</>
                                  : <><Send size={10} /> Enviar invitación</>
                                }
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Sin email</span>
                        )}
                        {v.user_id && (
                          <span className="text-[0.65rem] text-green-700 font-bold uppercase tracking-wide">● Cuenta activa</span>
                        )}
                      </div>
                    )}
                  </TableCell>

                  {/* Estado */}
                  <TableCell>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[0.68rem] font-bold uppercase tracking-wide ${v.activo ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                      {v.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </TableCell>

                  {/* Acciones */}
                  <TableCell>
                    <div className="flex gap-1.5 items-center">
                      {editingId === v.id ? (
                        <>
                          <Button size="sm" onClick={() => saveEdit(v.id)} disabled={saving}
                            className="h-7 px-2 bg-negro text-white hover:bg-negro/90">
                            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 px-2">
                            <X size={13} />
                          </Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => startEdit(v)} className="h-7 px-2 text-xs gap-1">
                          <Pencil size={11} /> Editar
                        </Button>
                      )}
                      {editingId !== v.id && (
                        <Button variant="ghost" size="sm" onClick={() => toggleActive(v)} className="h-7 px-2 text-xs gap-1">
                          {v.activo ? <ToggleLeft size={13} /> : <ToggleRight size={13} />}
                          {v.activo ? 'Desactivar' : 'Activar'}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {error && editingId && (
            <div className="p-4">
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          )}
        </Card>
      )}
    </AdminLayout>
  )
}
