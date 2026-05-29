import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, Loader2, GripVertical, Star, X, Check } from 'lucide-react'

function formatPrice(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

const ALL_LISTAS = ['minorista', 'mediano', 'mayorista']
const LISTA_LABELS = { minorista: 'Minorista', mediano: 'Mediano', mayorista: 'Mayorista' }

const EMPTY_FORM = { producto_id: '', texto: '', orden: 0, activo: true, listas_precios: [...ALL_LISTAS] }

export default function Promociones() {
  const [promos, setPromos]       = useState([])
  const [products, setProducts]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState(null)
  const [showForm, setShowForm]   = useState(false)
  const [editId, setEditId]       = useState(null)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [confirmDelete, setConfirmDelete] = useState(null)

  async function load() {
    const [{ data: promoData }, { data: prodData }] = await Promise.all([
      supabase
        .from('promociones')
        .select(`
          id, texto, orden, activo, listas_precios, created_at,
          productos(id, nombre, precio, precio_mediano, precio_mayorista, imagen_url, unidad)
        `)
        .order('orden'),
      supabase
        .from('productos')
        .select('id, nombre, precio')
        .eq('activo', true)
        .order('nombre'),
    ])
    setPromos(promoData ?? [])
    setProducts(prodData ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setEditId(null)
    setForm({ ...EMPTY_FORM, orden: (promos.length > 0 ? Math.max(...promos.map(p => p.orden)) + 1 : 0) })
    setShowForm(true)
  }

  function openEdit(promo) {
    setEditId(promo.id)
    setForm({
      producto_id: promo.producto_id ?? promo.productos?.id ?? '',
      texto: promo.texto ?? '',
      orden: promo.orden,
      activo: promo.activo,
      listas_precios: promo.listas_precios ?? [...ALL_LISTAS],
    })
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditId(null)
    setForm(EMPTY_FORM)
  }

  async function handleSave() {
    if (!form.producto_id) return
    setSaving(true)
    const payload = {
      producto_id: form.producto_id,
      texto: form.texto || null,
      orden: Number(form.orden) || 0,
      activo: form.activo,
      listas_precios: form.listas_precios.length ? form.listas_precios : [...ALL_LISTAS],
    }
    if (editId) {
      await supabase.from('promociones').update(payload).eq('id', editId)
    } else {
      await supabase.from('promociones').insert(payload)
    }
    setSaving(false)
    cancelForm()
    load()
  }

  async function handleDelete(id) {
    setDeleting(id)
    await supabase.from('promociones').delete().eq('id', id)
    setConfirmDelete(null)
    setDeleting(null)
    load()
  }

  async function toggleActivo(promo) {
    await supabase.from('promociones').update({ activo: !promo.activo }).eq('id', promo.id)
    setPromos(prev => prev.map(p => p.id === promo.id ? { ...p, activo: !p.activo } : p))
  }

  const selectedProduct = products.find(p => p.id === form.producto_id)

  return (
    <div className="max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-negro flex items-center gap-2">
            <Star size={20} className="text-amarillo" />
            Promociones
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Aparecen en el slider al inicio del catálogo del cliente.</p>
        </div>
        <Button
          onClick={openNew}
          className="bg-amarillo text-negro hover:bg-amarillo/90 font-bold gap-2"
          disabled={showForm}
        >
          <Plus size={16} /> Nueva promo
        </Button>
      </div>

      {/* Form panel */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-card border border-border mb-5 p-5">
          <h3 className="font-bold text-negro mb-4">{editId ? 'Editar promoción' : 'Nueva promoción'}</h3>
          <div className="flex flex-col gap-4">

            {/* Product selector */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="producto">Producto <span className="text-danger">*</span></Label>
              <select
                id="producto"
                className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.producto_id}
                onChange={e => setForm(f => ({ ...f, producto_id: e.target.value }))}
              >
                <option value="">— Seleccioná un producto —</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre} — {formatPrice(p.precio)}</option>
                ))}
              </select>
              {selectedProduct && (
                <p className="text-xs text-muted-foreground">Precio: {formatPrice(selectedProduct.precio)}</p>
              )}
            </div>

            {/* Custom text */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="texto">Texto personalizado</Label>
              <Input
                id="texto"
                placeholder="Ej: ¡Oferta de la semana! · 3x2 en pack"
                value={form.texto}
                onChange={e => setForm(f => ({ ...f, texto: e.target.value }))}
                maxLength={80}
              />
              <p className="text-xs text-muted-foreground">{form.texto.length}/80 — aparece debajo del nombre del producto.</p>
            </div>

            {/* Mostrar a — price list checkboxes */}
            <div className="flex flex-col gap-1.5">
              <Label>Mostrar a</Label>
              <div className="flex gap-3 flex-wrap">
                {ALL_LISTAS.map(lista => (
                  <label key={lista} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.listas_precios.includes(lista)}
                      onChange={e => {
                        setForm(f => ({
                          ...f,
                          listas_precios: e.target.checked
                            ? [...f.listas_precios, lista]
                            : f.listas_precios.filter(l => l !== lista),
                        }))
                      }}
                      className="w-4 h-4 accent-amarillo"
                    />
                    <span className="text-sm text-negro">{LISTA_LABELS[lista]}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">La promo solo aparecerá a los clientes con esas listas de precio.</p>
            </div>

            {/* Orden + Activo */}
            <div className="flex gap-4 items-end">
              <div className="flex flex-col gap-1.5 w-28">
                <Label htmlFor="orden">Orden</Label>
                <Input
                  id="orden"
                  type="number"
                  min={0}
                  value={form.orden}
                  onChange={e => setForm(f => ({ ...f, orden: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                  className="w-4 h-4 accent-amarillo"
                />
                <span className="text-sm font-medium text-negro">Activo</span>
              </label>
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" onClick={cancelForm} disabled={saving} className="gap-1.5">
                <X size={14} /> Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !form.producto_id}
                className="bg-amarillo text-negro hover:bg-amarillo/90 font-bold gap-1.5"
              >
                {saving
                  ? <><Loader2 size={14} className="animate-spin" /> Guardando…</>
                  : <><Check size={14} /> {editId ? 'Guardar cambios' : 'Crear promoción'}</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin w-7 h-7 text-amarillo" />
        </div>
      ) : promos.length === 0 ? (
        <div className="flex flex-col items-center text-center py-16 gap-3 bg-white rounded-xl shadow-card border border-border">
          <span className="text-5xl">⭐</span>
          <p className="font-bold text-lg text-negro">Sin promociones activas</p>
          <p className="text-sm text-muted-foreground max-w-[280px]">
            Creá una nueva promoción para que aparezca en el slider del catálogo del cliente.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {promos.map((promo, i) => {
            const product = promo.productos
            return (
              <div
                key={promo.id}
                className={cn(
                  'bg-white rounded-xl shadow-card border border-border flex items-center gap-3 px-4 py-3 transition-opacity',
                  !promo.activo && 'opacity-50'
                )}
              >
                {/* Order badge */}
                <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
                  <GripVertical size={14} className="text-border" />
                  <span className="text-xs font-bold w-5 text-center">{promo.orden}</span>
                </div>

                {/* Product image */}
                {product?.imagen_url ? (
                  <img
                    src={product.imagen_url}
                    alt={product.nombre}
                    className="w-12 h-12 rounded-lg object-cover shrink-0 bg-cream-dark"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-cream-dark shrink-0 flex items-center justify-center text-2xl">📦</div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-negro truncate">{product?.nombre ?? '—'}</div>
                  {promo.texto && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">"{promo.texto}"</div>
                  )}
                  <div className="flex items-center gap-1 flex-wrap mt-0.5">
                    <span className="text-xs font-bold text-amarillo">{product?.precio ? formatPrice(product.precio) : ''}</span>
                    {(promo.listas_precios ?? ALL_LISTAS).map(l => (
                      <span key={l} className="text-[0.6rem] font-bold uppercase bg-cream-dark text-negro/60 px-1.5 py-0.5 rounded-full">{LISTA_LABELS[l]}</span>
                    ))}
                  </div>
                </div>

                {/* Active toggle */}
                <button
                  onClick={() => toggleActivo(promo)}
                  className={cn(
                    'shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border transition-colors',
                    promo.activo
                      ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                      : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                  )}
                >
                  {promo.activo ? 'Activa' : 'Inactiva'}
                </button>

                {/* Edit */}
                <button
                  onClick={() => openEdit(promo)}
                  className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-negro hover:bg-cream-dark transition-colors"
                >
                  <Pencil size={14} />
                </button>

                {/* Delete */}
                {confirmDelete === promo.id ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleDelete(promo.id)}
                      disabled={deleting === promo.id}
                      className="h-7 px-2 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold flex items-center gap-1"
                    >
                      {deleting === promo.id ? <Loader2 size={11} className="animate-spin" /> : 'Sí'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="h-7 px-2 text-xs text-muted-foreground rounded-lg hover:bg-cream-dark font-semibold"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(promo.id)}
                    className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
