import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import AdminLayout from '../../components/AdminLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Loader2, Pencil, ToggleLeft, ToggleRight, Plus, X, Search, Package } from 'lucide-react'

async function fetchOFFImageUrl(ean) {
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 8000)
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${ean}.json`,
      { signal: controller.signal }
    )
    const data = await res.json()
    if (data.status === 1) {
      return data.product?.image_front_url || data.product?.image_url || null
    }
  } catch {}
  return null
}

function formatPrice(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}
function parseNum(val) {
  return val !== '' && val !== null && val !== undefined ? parseFloat(val) : null
}

// Subcomponent: 3-column price grid for one presentation
function PriceGrid({ label, fields, values, onChange, required }) {
  return (
    <div className="mb-3">
      {label && <p className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">{label}</p>}
      <div className="grid grid-cols-3 gap-2">
        {[
          { key: fields[0], lbl: 'Minorista ($)', req: required },
          { key: fields[1], lbl: 'Mediano ($)' },
          { key: fields[2], lbl: 'Mayorista ($)' },
        ].map(({ key, lbl, req }) => (
          <div key={key} className="flex flex-col gap-1">
            <Label className="text-[0.68rem] text-muted-foreground">{lbl}{req ? ' *' : ''}</Label>
            <Input
              type="number" step="0.01" min="0" placeholder="—"
              required={!!req}
              value={values[key] ?? ''}
              onChange={e => onChange(key, e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminProducts() {
  const [products, setProducts]     = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [catFilter, setCatFilter]   = useState('')
  const [editing, setEditing]       = useState(null)
  const [variants, setVariants]     = useState([])
  const [deletedVarIds, setDeletedVarIds] = useState([])
  const [saving, setSaving]         = useState(false)
  const [searchingImgId, setSearchingImgId] = useState(null) // id del producto buscando imagen

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: prods }, { data: cats }] = await Promise.all([
      supabase.from('productos').select('*, categorias(nombre), variantes_producto(*)').order('nombre'),
      supabase.from('categorias').select('id, nombre').is('parent_id', null).order('nombre')
    ])
    setProducts(prods ?? [])
    setCategories(cats ?? [])
    setLoading(false)
  }

  const filtered = products.filter(p => {
    const matchSearch = !search || p.nombre.toLowerCase().includes(search.toLowerCase()) || p.codigo_interno?.includes(search)
    const matchCat = !catFilter || p.categoria_id === catFilter
    return matchSearch && matchCat
  })

  function openEdit(p) {
    setEditing({
      ...p,
      precio:                  p.precio ?? '',
      precio_mediano:          p.precio_mediano ?? '',
      precio_mayorista:        p.precio_mayorista ?? '',
      precio_pack:             p.precio_pack ?? '',
      precio_pack_mediano:     p.precio_pack_mediano ?? '',
      precio_pack_mayorista:   p.precio_pack_mayorista ?? '',
      precio_pallet:           p.precio_pallet ?? '',
      precio_pallet_mediano:   p.precio_pallet_mediano ?? '',
      precio_pallet_mayorista: p.precio_pallet_mayorista ?? '',
      unidades_pack:           p.unidades_pack ?? '',
      unidades_pallet:         p.unidades_pallet ?? '',
      stock_activo:            p.stock_activo  ?? false,
      stock_cantidad:          p.stock_cantidad  != null ? p.stock_cantidad  : '',
      stock_umbral_bajo:       p.stock_umbral_bajo != null ? p.stock_umbral_bajo : '',
    })
    setVariants((p.variantes_producto ?? []).map(v => ({
      id: v.id, valor: v.valor ?? '',
      precio_minorista: v.precio_minorista ?? '', precio_mediano: v.precio_mediano ?? '', precio_mayorista: v.precio_mayorista ?? '',
      precio_pack: v.precio_pack ?? '', precio_pack_mediano: v.precio_pack_mediano ?? '', precio_pack_mayorista: v.precio_pack_mayorista ?? '',
      precio_pallet: v.precio_pallet ?? '', precio_pallet_mediano: v.precio_pallet_mediano ?? '', precio_pallet_mayorista: v.precio_pallet_mayorista ?? '',
    })))
    setDeletedVarIds([])
  }

  function addVariant() {
    setVariants(prev => [...prev, {
      id: null, valor: '',
      precio_minorista: '', precio_mediano: '', precio_mayorista: '',
      precio_pack: '', precio_pack_mediano: '', precio_pack_mayorista: '',
      precio_pallet: '', precio_pallet_mediano: '', precio_pallet_mayorista: '',
    }])
  }
  function updateVariant(idx, field, value) { setVariants(prev => prev.map((v, i) => i === idx ? { ...v, [field]: value } : v)) }
  function removeVariant(idx) {
    const v = variants[idx]
    if (v.id) setDeletedVarIds(prev => [...prev, v.id])
    setVariants(prev => prev.filter((_, i) => i !== idx))
  }

  async function toggleActive(p) {
    await supabase.from('productos').update({ activo: !p.activo }).eq('id', p.id)
    loadData()
  }

  // Busca imagen en Open Food Facts por EAN.
  // fromDialog=true → rellena el campo del dialog sin guardar aún.
  // fromDialog=false → guarda directo en DB desde la tabla.
  async function buscarImagenOFF(product, fromDialog = false) {
    if (!product.ean) return
    setSearchingImgId(product.id)
    const url = await fetchOFFImageUrl(product.ean)
    if (url) {
      if (fromDialog) {
        setEditing(f => ({ ...f, imagen_url: url }))
      } else {
        await supabase.from('productos').update({ imagen_url: url }).eq('id', product.id)
        setProducts(prev => prev.map(p => p.id === product.id ? { ...p, imagen_url: url } : p))
      }
    }
    setSearchingImgId(null)
  }

  async function saveEdit(e) {
    e.preventDefault(); setSaving(true)
    const stockCantidad  = editing.stock_activo && editing.stock_cantidad  !== '' ? parseInt(editing.stock_cantidad)  : null
    const stockUmbral    = editing.stock_activo && editing.stock_umbral_bajo !== '' ? parseInt(editing.stock_umbral_bajo) : null
    await supabase.from('productos').update({
      nombre: editing.nombre, descripcion: editing.descripcion,
      precio: parseFloat(editing.precio),
      precio_mediano: parseNum(editing.precio_mediano), precio_mayorista: parseNum(editing.precio_mayorista),
      precio_pack: parseNum(editing.precio_pack), precio_pack_mediano: parseNum(editing.precio_pack_mediano), precio_pack_mayorista: parseNum(editing.precio_pack_mayorista),
      precio_pallet: parseNum(editing.precio_pallet), precio_pallet_mediano: parseNum(editing.precio_pallet_mediano), precio_pallet_mayorista: parseNum(editing.precio_pallet_mayorista),
      unidades_pack: editing.unidades_pack !== '' ? parseInt(editing.unidades_pack) : null,
      unidades_pallet: editing.unidades_pallet !== '' ? parseInt(editing.unidades_pallet) : null,
      unidad: editing.unidad, categoria_id: editing.categoria_id, imagen_url: editing.imagen_url || null,
      stock_activo:     !!editing.stock_activo,
      stock_cantidad:   stockCantidad,
      stock_umbral_bajo: stockUmbral,
    }).eq('id', editing.id)

    if (deletedVarIds.length > 0) await supabase.from('variantes_producto').delete().in('id', deletedVarIds)

    const variantPayload = (v) => ({
      valor: v.valor,
      precio_minorista: parseNum(v.precio_minorista), precio_mediano: parseNum(v.precio_mediano), precio_mayorista: parseNum(v.precio_mayorista),
      precio_pack: parseNum(v.precio_pack), precio_pack_mediano: parseNum(v.precio_pack_mediano), precio_pack_mayorista: parseNum(v.precio_pack_mayorista),
      precio_pallet: parseNum(v.precio_pallet), precio_pallet_mediano: parseNum(v.precio_pallet_mediano), precio_pallet_mayorista: parseNum(v.precio_pallet_mayorista),
    })
    for (const v of variants.filter(v => v.id)) await supabase.from('variantes_producto').update(variantPayload(v)).eq('id', v.id)
    const nuevas = variants.filter(v => !v.id && v.valor.trim())
    if (nuevas.length > 0) await supabase.from('variantes_producto').insert(nuevas.map(v => ({ producto_id: editing.id, ...variantPayload(v) })))

    setSaving(false); setEditing(null); loadData()
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-negro">Productos</h2>
        <p className="text-muted-foreground text-sm mt-1">Gestioná el catálogo. Para carga masiva usá Importar.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Input className="max-w-[260px] h-9 text-sm" placeholder="Buscar por nombre o código..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="h-9 rounded-md border border-input bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={open => { if (!open) setEditing(null) }}>
        <DialogContent className="max-w-[660px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar producto</DialogTitle>
          </DialogHeader>
          {editing && (
            <form onSubmit={saveEdit} className="space-y-4">

              {/* Basic info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[0.72rem] uppercase tracking-wider text-muted-foreground font-bold">Nombre *</Label>
                  <Input value={editing.nombre} required onChange={e => setEditing(f => ({...f, nombre: e.target.value}))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[0.72rem] uppercase tracking-wider text-muted-foreground font-bold">Descripción</Label>
                  <Input value={editing.descripcion ?? ''} onChange={e => setEditing(f => ({...f, descripcion: e.target.value}))} />
                </div>
              </div>

              {/* Product prices */}
              <div className="bg-cream rounded-lg p-4">
                <p className="text-[0.72rem] font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  Precios del producto {variants.length > 0 ? '· fallback si la variante no tiene precio' : ''}
                </p>
                <PriceGrid label="Unidad" fields={['precio','precio_mediano','precio_mayorista']}
                  values={editing} onChange={(k,v) => setEditing(f => ({...f,[k]:v}))} required />

                <div className="flex items-end justify-between gap-3 mb-1.5 mt-3">
                  <p className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">Pack (precio por unidad)</p>
                  <div className="flex flex-col gap-1">
                    <Label className="text-[0.68rem] text-muted-foreground">Unidades por pack</Label>
                    <Input type="number" min="1" step="1" placeholder="ej: 25" className="h-8 text-sm w-28"
                      value={editing.unidades_pack} onChange={e => setEditing(f => ({...f, unidades_pack: e.target.value}))} />
                  </div>
                </div>
                <PriceGrid label="" fields={['precio_pack','precio_pack_mediano','precio_pack_mayorista']}
                  values={editing} onChange={(k,v) => setEditing(f => ({...f,[k]:v}))} />

                <div className="flex items-end justify-between gap-3 mb-1.5 mt-3">
                  <p className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">Pallet (precio por unidad)</p>
                  <div className="flex flex-col gap-1">
                    <Label className="text-[0.68rem] text-muted-foreground">Unidades por pallet</Label>
                    <Input type="number" min="1" step="1" placeholder="ej: 180" className="h-8 text-sm w-28"
                      value={editing.unidades_pallet} onChange={e => setEditing(f => ({...f, unidades_pallet: e.target.value}))} />
                  </div>
                </div>
                <PriceGrid label="" fields={['precio_pallet','precio_pallet_mediano','precio_pallet_mayorista']}
                  values={editing} onChange={(k,v) => setEditing(f => ({...f,[k]:v}))} />
              </div>

              {/* Variants */}
              <div className="bg-cream rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[0.72rem] font-bold uppercase tracking-wider text-muted-foreground">Variantes / Presentaciones</p>
                  <Button type="button" variant="outline" size="sm" onClick={addVariant} className="h-7 gap-1 text-xs">
                    <Plus size={12} /> Agregar
                  </Button>
                </div>
                {variants.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">Sin variantes — el producto se vende en una sola presentación.</p>
                )}
                {variants.map((v, idx) => (
                  <div key={idx} className="border border-border rounded-lg p-3 mb-3 bg-white">
                    <div className="flex gap-2 items-center mb-3">
                      <Input placeholder="Presentación (ej: 900ml)" value={v.valor}
                        onChange={e => updateVariant(idx, 'valor', e.target.value)} className="flex-1 h-8 text-sm" />
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeVariant(idx)} className="h-7 w-7 p-0 text-muted-foreground hover:text-danger">
                        <X size={13} />
                      </Button>
                    </div>
                    {[
                      { label: 'Unidad',  fields: ['precio_minorista','precio_mediano','precio_mayorista'] },
                      { label: 'Pack',    fields: ['precio_pack','precio_pack_mediano','precio_pack_mayorista'] },
                      { label: 'Pallet',  fields: ['precio_pallet','precio_pallet_mediano','precio_pallet_mayorista'] },
                    ].map(({ label, fields }) => (
                      <PriceGrid key={label} label={label} fields={fields} values={v} onChange={(k,val) => updateVariant(idx, k, val)} />
                    ))}
                  </div>
                ))}
              </div>

              {/* Stock */}
              <div className="bg-cream rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <p className="text-[0.72rem] font-bold uppercase tracking-wider text-muted-foreground">Stock</p>
                    <p className="text-[0.68rem] text-muted-foreground">Desactivado = el producto aparece sin restricciones</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(f => ({ ...f, stock_activo: !f.stock_activo }))}
                    className="shrink-0"
                    title={editing.stock_activo ? 'Desactivar control de stock' : 'Activar control de stock'}
                  >
                    {editing.stock_activo
                      ? <ToggleRight size={30} className="text-green-600" />
                      : <ToggleLeft  size={30} className="text-gray-400"  />}
                  </button>
                </div>

                {editing.stock_activo && (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-[0.72rem] uppercase tracking-wider text-muted-foreground font-bold">
                        Stock disponible
                      </Label>
                      <Input
                        type="number" min="0" step="1" placeholder="0"
                        value={editing.stock_cantidad}
                        onChange={e => setEditing(f => ({ ...f, stock_cantidad: e.target.value }))}
                        className="h-9 text-sm"
                      />
                      {(editing.stock_cantidad === '0' || editing.stock_cantidad === 0) && (
                        <p className="text-[0.67rem] text-red-600 font-semibold leading-tight">
                          ⚠ Stock 0 → el producto se ocultará del catálogo.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-[0.72rem] uppercase tracking-wider text-muted-foreground font-bold">
                        Umbral de stock bajo
                      </Label>
                      <Input
                        type="number" min="0" step="1" placeholder="0"
                        value={editing.stock_umbral_bajo}
                        onChange={e => setEditing(f => ({ ...f, stock_umbral_bajo: e.target.value }))}
                        className="h-9 text-sm"
                      />
                      <p className="text-[0.67rem] text-muted-foreground leading-tight">
                        Se mostrará aviso al cliente cuando el stock sea igual o menor a este número
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[0.72rem] uppercase tracking-wider text-muted-foreground font-bold">Categoría</Label>
                  <select className="h-10 rounded-md border border-input bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={editing.categoria_id ?? ''} onChange={e => setEditing(f => ({...f, categoria_id: e.target.value}))}>
                    <option value="">Sin categoría</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[0.72rem] uppercase tracking-wider text-muted-foreground font-bold">Unidad base</Label>
                  <Input placeholder="ej: unidad, botella, caja..." value={editing.unidad ?? ''}
                    onChange={e => setEditing(f => ({...f, unidad: e.target.value}))} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[0.72rem] uppercase tracking-wider text-muted-foreground font-bold">URL de imagen (opcional)</Label>
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    value={editing.imagen_url ?? ''}
                    onChange={e => setEditing(f => ({...f, imagen_url: e.target.value}))}
                    placeholder="https://..."
                  />
                  {editing.ean && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={searchingImgId === editing.id}
                      onClick={() => buscarImagenOFF(editing, true)}
                      className="shrink-0 gap-1.5 text-xs"
                      title={`Buscar en Open Food Facts (EAN: ${editing.ean})`}
                    >
                      {searchingImgId === editing.id
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Search size={13} />}
                      Buscar en OFF
                    </Button>
                  )}
                </div>
                {editing.imagen_url && (
                  <img src={editing.imagen_url} alt="preview" className="h-16 w-16 object-cover rounded-lg border border-border mt-1" />
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                <Button type="submit" disabled={saving} className="bg-negro text-white hover:bg-negro/90 gap-2">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {saving ? 'Guardando...' : 'Guardar'}
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
        <Card className="shadow-panel overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-negro hover:bg-negro">
                {['Código','Nombre','Categoría','Presentaciones','Estado','Acciones'].map(h => (
                  <TableHead key={h} className="text-white text-[0.7rem] uppercase tracking-wide whitespace-nowrap">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No hay productos.</TableCell>
                </TableRow>
              )}
              {filtered.map(p => (
                <TableRow key={p.id} className="hover:bg-cream">
                  <TableCell className="text-xs text-muted-foreground">{p.codigo_interno}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {p.imagen_url
                        ? <img src={p.imagen_url} alt="" className="w-8 h-8 rounded object-cover shrink-0 border border-border" />
                        : <div className="w-8 h-8 rounded bg-cream-dark shrink-0 flex items-center justify-center"><Package size={16} className="text-muted-foreground" /></div>
                      }
                      <div className="min-w-0">
                        <div className="font-semibold text-sm">{p.nombre}</div>
                        {p.descripcion && <div className="text-[0.72rem] text-muted-foreground">{p.descripcion}</div>}
                        <div className="text-[0.7rem] text-muted-foreground mt-0.5">
                          Min: {formatPrice(p.precio)}
                          {p.precio_mediano   ? ` · Med: ${formatPrice(p.precio_mediano)}`   : ''}
                          {p.precio_mayorista ? ` · May: ${formatPrice(p.precio_mayorista)}` : ''}
                        </div>
                        {p.stock_activo && (
                          <span className={`inline-block mt-0.5 text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full border ${
                            p.stock_cantidad === 0
                              ? 'bg-red-100 text-red-700 border-red-200'
                              : p.stock_cantidad != null && p.stock_cantidad <= (p.stock_umbral_bajo ?? 0)
                                ? 'bg-orange-100 text-orange-700 border-orange-200'
                                : 'bg-green-100 text-green-700 border-green-200'
                          }`}>
                            {p.stock_cantidad === 0 ? 'Agotado' : `Stock: ${p.stock_cantidad ?? '—'} u.`}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{p.categorias?.nombre ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[0.65rem] font-bold bg-blue-100 text-blue-800 border border-blue-200">Unidad</span>
                      {p.precio_pack   && <span className="inline-block px-2 py-0.5 rounded-full text-[0.65rem] font-bold bg-yellow-100 text-yellow-800 border border-yellow-200">Pack</span>}
                      {p.precio_pallet && <span className="inline-block px-2 py-0.5 rounded-full text-[0.65rem] font-bold bg-green-100 text-green-800 border border-green-200">Pallet</span>}
                    </div>
                    {(p.variantes_producto?.length ?? 0) > 0 && (
                      <div className="mt-1 text-[0.7rem] text-muted-foreground">{p.variantes_producto.map(v => v.valor).join(', ')}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[0.68rem] font-bold uppercase tracking-wide ${p.activo ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(p)} className="h-7 px-2 text-xs gap-1">
                        <Pencil size={11} /> Editar
                      </Button>
                      {p.ean && (
                        <button
                          onClick={() => buscarImagenOFF(p, false)}
                          disabled={searchingImgId === p.id}
                          title={p.imagen_url ? `Actualizar imagen (EAN: ${p.ean})` : `Buscar imagen (EAN: ${p.ean})`}
                          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-cream-dark transition-colors text-blue-500 disabled:opacity-40"
                        >
                          {searchingImgId === p.id
                            ? <Loader2 size={14} className="animate-spin" />
                            : <Search size={14} />}
                        </button>
                      )}
                      <button
                        onClick={() => toggleActive(p)}
                        title={p.activo ? 'Desactivar' : 'Activar'}
                        className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-cream-dark transition-colors"
                      >
                        {p.activo
                          ? <ToggleRight size={20} className="text-green-600" />
                          : <ToggleLeft  size={20} className="text-gray-400"  />}
                      </button>
                    </div>
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
