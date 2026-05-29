import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import AdminLayout from '../../components/AdminLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, Loader2, GripVertical, Star, X, Check, Tag } from 'lucide-react'

function formatPrice(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

const ALL_LISTAS   = ['minorista', 'mediano', 'mayorista']
const LISTA_LABELS = { minorista: 'Minorista', mediano: 'Mediano', mayorista: 'Mayorista' }

const TIPO_OPTIONS = [
  { value: 'destacado',          label: 'Solo destacado',             desc: 'Aparece en el slider sin modificar el precio' },
  { value: 'nxm',               label: 'NxM  (2x1, 3x2…)',           desc: 'Llevá N unidades, pagá M' },
  { value: 'descuento_porcentual', label: 'Descuento %',             desc: 'Porcentaje de descuento sobre el precio base' },
  { value: 'precio_especial',   label: 'Precio especial',             desc: 'Precio fijo promocional (reemplaza el precio base)' },
  { value: 'cantidad_minima',   label: 'Descuento por cantidad',      desc: 'Descuento % si el cliente lleva mínimo X unidades' },
]

const EMPTY_FORM = {
  producto_id: '', texto: '', orden: 0, activo: true,
  listas_precios: [...ALL_LISTAS],
  tipo_promo: 'destacado',
  descuento_porcentaje: 20,
  precio_promo: '',
  promo_n: 2, promo_m: 1,
  qty_minima: 6,
}

function promoLabel(p) {
  switch (p.tipo_promo) {
    case 'destacado':            return 'Destacado'
    case 'nxm':                 return `${p.promo_n}x${p.promo_m}`
    case 'descuento_porcentual': return `${p.descuento_porcentaje}% OFF`
    case 'precio_especial':     return 'Precio especial'
    case 'cantidad_minima':     return `+${p.qty_minima}u → ${p.descuento_porcentaje}% OFF`
    default:                    return 'Destacado'
  }
}

export default function Promociones() {
  const [promos, setPromos]     = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId]     = useState(null)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [confirmDelete, setConfirmDelete] = useState(null)

  async function load() {
    const [{ data: promoData }, { data: prodData }] = await Promise.all([
      supabase.from('promociones')
        .select('id, texto, orden, activo, listas_precios, tipo_promo, descuento_porcentaje, precio_promo, promo_n, promo_m, qty_minima, productos(id, nombre, precio, precio_mediano, precio_mayorista, imagen_url)')
        .order('orden'),
      supabase.from('productos').select('id, nombre, precio, precio_mediano, precio_mayorista').eq('activo', true).order('nombre'),
    ])
    setPromos(promoData ?? [])
    setProducts(prodData ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setEditId(null)
    setForm({ ...EMPTY_FORM, orden: promos.length ? Math.max(...promos.map(p => p.orden)) + 1 : 0 })
    setShowForm(true)
  }

  function openEdit(promo) {
    setEditId(promo.id)
    setForm({
      producto_id:          promo.producto_id ?? promo.productos?.id ?? '',
      texto:                promo.texto ?? '',
      orden:                promo.orden,
      activo:               promo.activo,
      listas_precios:       promo.listas_precios ?? [...ALL_LISTAS],
      tipo_promo:           promo.tipo_promo ?? 'descuento_porcentual',
      descuento_porcentaje: promo.descuento_porcentaje ?? 20,
      precio_promo:         promo.precio_promo ?? '',
      promo_n:              promo.promo_n ?? 2,
      promo_m:              promo.promo_m ?? 1,
      qty_minima:           promo.qty_minima ?? 6,
    })
    setShowForm(true)
  }

  function cancelForm() { setShowForm(false); setEditId(null); setForm(EMPTY_FORM) }

  async function handleSave() {
    if (!form.producto_id) return
    setSaving(true)
    const payload = {
      producto_id:   form.producto_id,
      texto:         form.texto || null,
      orden:         Number(form.orden) || 0,
      activo:        form.activo,
      listas_precios: form.listas_precios.length ? form.listas_precios : [...ALL_LISTAS],
      tipo_promo:    form.tipo_promo,
      descuento_porcentaje: ['descuento_porcentual', 'cantidad_minima'].includes(form.tipo_promo)
                              ? Number(form.descuento_porcentaje) : null,
      precio_promo:  form.tipo_promo === 'precio_especial' ? Number(form.precio_promo) : null,
      promo_n:       form.tipo_promo === 'nxm' ? Number(form.promo_n) : null,
      promo_m:       form.tipo_promo === 'nxm' ? Number(form.promo_m) : null,
      qty_minima:    form.tipo_promo === 'cantidad_minima' ? Number(form.qty_minima) : null,
    }
    if (editId) await supabase.from('promociones').update(payload).eq('id', editId)
    else        await supabase.from('promociones').insert(payload)
    setSaving(false); cancelForm(); load()
  }

  async function handleDelete(id) {
    setDeleting(id)
    await supabase.from('promociones').delete().eq('id', id)
    setConfirmDelete(null); setDeleting(null); load()
  }

  async function toggleActivo(promo) {
    await supabase.from('promociones').update({ activo: !promo.activo }).eq('id', promo.id)
    setPromos(prev => prev.map(p => p.id === promo.id ? { ...p, activo: !p.activo } : p))
  }

  // Reference product for the form
  const refProduct = products.find(p => p.id === form.producto_id)

  return (
    <AdminLayout>
    <div className="max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-negro flex items-center gap-2">
            <Star size={20} className="text-amarillo" /> Promociones
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Aparecen en el slider del catálogo del cliente.</p>
        </div>
        <Button onClick={openNew} className="bg-amarillo text-negro hover:bg-amarillo/90 font-bold gap-2" disabled={showForm}>
          <Plus size={16} /> Nueva promo
        </Button>
      </div>

      {/* ── Form panel ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-card border border-border mb-5 p-5">
          <h3 className="font-bold text-negro mb-4">{editId ? 'Editar promoción' : 'Nueva promoción'}</h3>
          <div className="flex flex-col gap-4">

            {/* Product */}
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
                  <option key={p.id} value={p.id}>
                    {p.nombre} — {formatPrice(p.precio)}
                  </option>
                ))}
              </select>
              {refProduct && (
                <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
                  <span>Minorista: <strong className="text-negro">{formatPrice(refProduct.precio)}</strong></span>
                  {refProduct.precio_mediano  && <span>Mediano: <strong className="text-negro">{formatPrice(refProduct.precio_mediano)}</strong></span>}
                  {refProduct.precio_mayorista && <span>Mayorista: <strong className="text-negro">{formatPrice(refProduct.precio_mayorista)}</strong></span>}
                </div>
              )}
            </div>

            {/* Tipo de promo */}
            <div className="flex flex-col gap-1.5">
              <Label>Tipo de promoción</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {TIPO_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, tipo_promo: opt.value }))}
                    className={cn(
                      'text-left rounded-lg border px-3 py-2.5 transition-colors',
                      form.tipo_promo === opt.value
                        ? 'border-amarillo bg-amarillo/10 ring-1 ring-amarillo'
                        : 'border-border hover:border-negro/30 bg-white'
                    )}
                  >
                    <div className="font-semibold text-sm text-negro">{opt.label}</div>
                    <div className="text-[0.72rem] text-muted-foreground mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Dynamic fields per tipo */}
            {form.tipo_promo === 'nxm' && (
              <div className="flex gap-3 items-end flex-wrap">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="promo_n">Llevá (N)</Label>
                  <Input id="promo_n" type="number" min={2} max={20} className="w-24"
                    value={form.promo_n}
                    onChange={e => setForm(f => ({ ...f, promo_n: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="promo_m">Pagá (M)</Label>
                  <Input id="promo_m" type="number" min={1} max={19} className="w-24"
                    value={form.promo_m}
                    onChange={e => setForm(f => ({ ...f, promo_m: e.target.value }))} />
                </div>
                {Number(form.promo_n) > 0 && Number(form.promo_m) > 0 && (
                  <div className="mb-2 text-sm font-bold text-amarillo bg-amarillo/10 px-3 py-1.5 rounded-lg border border-amarillo/30">
                    {form.promo_n}x{form.promo_m} — el cliente lleva {form.promo_n} y paga {form.promo_m}
                    {refProduct && ` → ${formatPrice(refProduct.precio * form.promo_m / form.promo_n)} c/u`}
                  </div>
                )}
              </div>
            )}

            {form.tipo_promo === 'descuento_porcentual' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="desc_pct">Descuento (%)</Label>
                <div className="flex items-center gap-3">
                  <Input id="desc_pct" type="number" min={1} max={99} className="w-24"
                    value={form.descuento_porcentaje}
                    onChange={e => setForm(f => ({ ...f, descuento_porcentaje: e.target.value }))} />
                  <span className="text-sm font-bold text-amarillo">{form.descuento_porcentaje}% OFF</span>
                  {refProduct && (
                    <span className="text-xs text-muted-foreground">
                      Precio final: <strong className="text-negro">{formatPrice(refProduct.precio * (1 - form.descuento_porcentaje / 100))}</strong>
                    </span>
                  )}
                </div>
              </div>
            )}

            {form.tipo_promo === 'precio_especial' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="precio_promo">Precio promocional ($)</Label>
                <div className="flex items-center gap-3">
                  <Input id="precio_promo" type="number" min={0} className="w-40"
                    placeholder="Ej: 1500"
                    value={form.precio_promo}
                    onChange={e => setForm(f => ({ ...f, precio_promo: e.target.value }))} />
                  {refProduct && form.precio_promo && (
                    <span className="text-xs text-muted-foreground">
                      Ahorro: <strong className="text-green-600">{formatPrice(refProduct.precio - form.precio_promo)}</strong>
                    </span>
                  )}
                </div>
              </div>
            )}

            {form.tipo_promo === 'cantidad_minima' && (
              <div className="flex gap-3 items-end flex-wrap">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="qty_min">Cantidad mínima</Label>
                  <Input id="qty_min" type="number" min={2} max={999} className="w-28"
                    value={form.qty_minima}
                    onChange={e => setForm(f => ({ ...f, qty_minima: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="desc_qty">Descuento (%)</Label>
                  <Input id="desc_qty" type="number" min={1} max={99} className="w-24"
                    value={form.descuento_porcentaje}
                    onChange={e => setForm(f => ({ ...f, descuento_porcentaje: e.target.value }))} />
                </div>
                <div className="mb-2 text-sm font-bold text-amarillo bg-amarillo/10 px-3 py-1.5 rounded-lg border border-amarillo/30">
                  +{form.qty_minima}u → {form.descuento_porcentaje}% OFF
                  {refProduct && ` → ${formatPrice(refProduct.precio * (1 - form.descuento_porcentaje / 100))} c/u`}
                </div>
              </div>
            )}

            {/* Texto personalizado */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="texto">Texto personalizado <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input id="texto" placeholder="Ej: ¡Solo esta semana! · Stock limitado"
                value={form.texto}
                onChange={e => setForm(f => ({ ...f, texto: e.target.value }))}
                maxLength={80} />
              <p className="text-xs text-muted-foreground">{form.texto.length}/80</p>
            </div>

            {/* Mostrar a */}
            <div className="flex flex-col gap-1.5">
              <Label>Mostrar a</Label>
              <div className="flex gap-4 flex-wrap">
                {ALL_LISTAS.map(lista => (
                  <label key={lista} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.listas_precios.includes(lista)}
                      onChange={e => setForm(f => ({
                        ...f,
                        listas_precios: e.target.checked
                          ? [...f.listas_precios, lista]
                          : f.listas_precios.filter(l => l !== lista),
                      }))}
                      className="w-4 h-4 accent-amarillo"
                    />
                    <span className="text-sm text-negro">{LISTA_LABELS[lista]}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Orden + Activo */}
            <div className="flex gap-4 items-end">
              <div className="flex flex-col gap-1.5 w-28">
                <Label htmlFor="orden">Orden</Label>
                <Input id="orden" type="number" min={0}
                  value={form.orden}
                  onChange={e => setForm(f => ({ ...f, orden: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input type="checkbox" checked={form.activo}
                  onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                  className="w-4 h-4 accent-amarillo" />
                <span className="text-sm font-medium text-negro">Activo</span>
              </label>
            </div>

            {/* Buttons */}
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

      {/* ── List ───────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin w-7 h-7 text-amarillo" />
        </div>
      ) : promos.length === 0 ? (
        <div className="flex flex-col items-center text-center py-16 gap-3 bg-white rounded-xl shadow-card border border-border">
          <span className="text-5xl">⭐</span>
          <p className="font-bold text-lg text-negro">Sin promociones aún</p>
          <p className="text-sm text-muted-foreground max-w-[280px]">
            Creá una nueva promoción para que aparezca en el slider del catálogo del cliente.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {promos.map(promo => {
            const product = promo.productos
            return (
              <div
                key={promo.id}
                className={cn(
                  'bg-white rounded-xl shadow-card border border-border flex items-center gap-3 px-4 py-3 transition-opacity',
                  !promo.activo && 'opacity-50'
                )}
              >
                {/* Order */}
                <div className="flex items-center gap-1 shrink-0 text-muted-foreground">
                  <GripVertical size={14} className="text-border" />
                  <span className="text-xs font-bold w-4 text-center">{promo.orden}</span>
                </div>

                {/* Image */}
                {product?.imagen_url ? (
                  <img src={product.imagen_url} alt={product.nombre}
                    className="w-11 h-11 rounded-lg object-cover shrink-0 bg-cream-dark" />
                ) : (
                  <div className="w-11 h-11 rounded-lg bg-cream-dark shrink-0 flex items-center justify-center text-xl">📦</div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-negro truncate">{product?.nombre ?? '—'}</div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    {/* Promo badge */}
                    <span className="inline-flex items-center gap-1 text-[0.62rem] font-extrabold uppercase bg-amarillo/15 text-amarillo px-2 py-0.5 rounded-full border border-amarillo/30">
                      <Tag size={9} /> {promoLabel(promo)}
                    </span>
                    {/* Lista tags */}
                    {(promo.listas_precios ?? ALL_LISTAS).map(l => (
                      <span key={l} className="text-[0.6rem] font-bold uppercase bg-cream-dark text-negro/50 px-1.5 py-0.5 rounded-full">
                        {LISTA_LABELS[l]}
                      </span>
                    ))}
                  </div>
                  {promo.texto && (
                    <div className="text-[0.7rem] text-muted-foreground truncate mt-0.5 italic">"{promo.texto}"</div>
                  )}
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
                <button onClick={() => openEdit(promo)}
                  className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-negro hover:bg-cream-dark transition-colors">
                  <Pencil size={14} />
                </button>

                {/* Delete */}
                {confirmDelete === promo.id ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleDelete(promo.id)} disabled={deleting === promo.id}
                      className="h-7 px-2 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold flex items-center gap-1">
                      {deleting === promo.id ? <Loader2 size={11} className="animate-spin" /> : 'Sí'}
                    </button>
                    <button onClick={() => setConfirmDelete(null)}
                      className="h-7 px-2 text-xs text-muted-foreground rounded-lg hover:bg-cream-dark font-semibold">
                      No
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(promo.id)}
                    className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-red-50 transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
    </AdminLayout>
  )
}
