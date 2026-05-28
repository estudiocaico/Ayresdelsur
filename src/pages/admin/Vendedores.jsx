import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import AdminLayout from '../../components/AdminLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, UserCheck, Pencil, Check, X, ToggleLeft, ToggleRight } from 'lucide-react'

export default function AdminVendedores() {
  const [vendedores, setVendedores]         = useState([])
  const [loading, setLoading]               = useState(true)
  const [showForm, setShowForm]             = useState(false)
  const [nombre, setNombre]                 = useState('')
  const [saving, setSaving]                 = useState(false)
  const [error, setError]                   = useState('')
  const [editingId, setEditingId]           = useState(null)
  const [editingNombre, setEditingNombre]   = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('vendedores').select('*').order('nombre')
    setVendedores(data ?? [])
    setLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault(); setSaving(true); setError('')
    const { error: err } = await supabase.from('vendedores').insert({ nombre: nombre.trim() })
    if (err) { setError(err.message) } else { setNombre(''); setShowForm(false); load() }
    setSaving(false)
  }

  function startEdit(v) { setEditingId(v.id); setEditingNombre(v.nombre); setError('') }
  function cancelEdit() { setEditingId(null); setEditingNombre(''); setError('') }

  async function saveEdit(id) {
    if (!editingNombre.trim()) return
    setSaving(true); setError('')
    const { error: err } = await supabase.from('vendedores').update({ nombre: editingNombre.trim() }).eq('id', id)
    if (err) { setError(err.message) } else {
      setVendedores(prev => prev.map(v => v.id === id ? { ...v, nombre: editingNombre.trim() } : v))
      cancelEdit()
    }
    setSaving(false)
  }

  async function toggleActive(v) {
    await supabase.from('vendedores').update({ activo: !v.activo }).eq('id', v.id)
    setVendedores(prev => prev.map(x => x.id === v.id ? { ...x, activo: !v.activo } : x))
  }

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-negro">Vendedores</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Gestioná el equipo de ventas. Los vendedores se asignan desde Prepedidos.
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
          <form onSubmit={handleAdd} className="flex gap-2">
            <Input
              placeholder="Nombre del vendedor"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              required
              autoFocus
              className="flex-1"
            />
            <Button type="submit" disabled={saving} className="bg-negro text-white hover:bg-negro/90 gap-1.5">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? 'Creando...' : 'Crear'}
            </Button>
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
                <TableHead className="text-white text-[0.7rem] uppercase tracking-wide">Estado</TableHead>
                <TableHead className="text-white text-[0.7rem] uppercase tracking-wide">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendedores.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    No hay vendedores. Creá el primero.
                  </TableCell>
                </TableRow>
              )}
              {vendedores.map(v => (
                <TableRow key={v.id} className="hover:bg-cream">
                  <TableCell>
                    {editingId === v.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          className="max-w-[240px] h-8 text-sm"
                          value={editingNombre}
                          onChange={e => setEditingNombre(e.target.value)}
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(v.id); if (e.key === 'Escape') cancelEdit() }}
                        />
                        <Button size="sm" onClick={() => saveEdit(v.id)} disabled={saving}
                          className="h-7 px-2 bg-negro text-white hover:bg-negro/90">
                          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 px-2">
                          <X size={13} />
                        </Button>
                      </div>
                    ) : (
                      <span className="font-semibold text-sm">👤 {v.nombre}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[0.68rem] font-bold uppercase tracking-wide ${v.activo ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                      {v.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1.5">
                      {editingId !== v.id && (
                        <Button variant="ghost" size="sm" onClick={() => startEdit(v)} className="h-7 px-2 text-xs gap-1">
                          <Pencil size={11} /> Editar
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(v)} className="h-7 px-2 text-xs gap-1">
                        {v.activo ? <ToggleLeft size={13} /> : <ToggleRight size={13} />}
                        {v.activo ? 'Desactivar' : 'Activar'}
                      </Button>
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
