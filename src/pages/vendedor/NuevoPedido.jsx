import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useVendedor } from './VendedorLayout'
import { Loader2, Search, ArrowLeft, Plus, Minus, ShoppingCart, ChevronDown, ChevronUp } from 'lucide-react'

// ── Utilidades ────────────────────────────────────────────────────────────────

function formatPrice(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

function calcTotal(cart) {
  return cart.reduce((s, i) => s + i.price * i.qty, 0)
}

function getPrecio(product, presentacion, lista) {
  if (presentacion === 'pack') {
    const up = lista === 'mayorista' ? product.precio_pack_mayorista
             : lista === 'mediano'   ? product.precio_pack_mediano
             :                         product.precio_pack
    if (up == null) return null
    return up * (product.unidades_pack ?? 1)
  }
  if (presentacion === 'pallet') {
    const up = lista === 'mayorista' ? product.precio_pallet_mayorista
             : lista === 'mediano'   ? product.precio_pallet_mediano
             :                         product.precio_pallet
    if (up == null) return null
    return up * (product.unidades_pallet ?? 1)
  }
  if (lista === 'mayorista' && product.precio_mayorista != null) return product.precio_mayorista
  if (lista === 'mediano'   && product.precio_mediano   != null) return product.precio_mediano
  return product.precio
}

// ── Cache del catálogo en localStorage (1 hora) ───────────────────────────────
const CACHE_KEY = 'ads_vendedor_catalog_v1'
const CACHE_TTL = 60 * 60 * 1000

function getCachedCatalog() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) return null
    return data
  } catch { return null }
}

function setCachedCatalog(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }))
  } catch {}
}

// ── Debounce hook ─────────────────────────────────────────────────────────────
function useDebounce(value, delay = 300) {
  const [dv, setDv] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return dv
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 1 — Seleccionar / crear cliente
// ═══════════════════════════════════════════════════════════════════════════════

function Step1({ onSelect }) {
  const { vendedor } = useVendedor()
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState([])
  const [searching, setSearching] = useState(false)
  const [showForm, setShowForm]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [form, setForm] = useState({ nombre: '', telefono: '', direccion: '', email: '', cuit: '', lista_precios: '' })
  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    if (!debouncedQuery.trim()) { setResults([]); return }
    setSearching(true)
    supabase
      .from('clientes')
      .select('id, nombre_negocio, direccion, telefono, lista_precios, activo, pendiente_aprobacion')
      .ilike('nombre_negocio', `%${debouncedQuery}%`)
      .order('nombre_negocio')
      .limit(12)
      .then(({ data }) => { setResults(data ?? []); setSearching(false) })
  }, [debouncedQuery])

  async function handleCrear(e) {
    e.preventDefault()
    if (!form.lista_precios) { setError('Elegí una lista de precios para continuar.'); return }
    setSaving(true); setError('')
    const { data, error: err } = await supabase
      .from('clientes')
      .insert({
        nombre_negocio:          form.nombre.trim(),
        telefono:                form.telefono.trim() || null,
        direccion:               form.direccion.trim() || '',
        email:                   form.email.trim() || null,
        cuit:                    form.cuit.trim() || null,
        lista_precios:           form.lista_precios,
        activo:                  true,
        pendiente_aprobacion:    true,
        creado_por_vendedor_id:  vendedor.id,
      })
      .select()
      .single()
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false)
    onSelect(data)
  }

  const fieldCls = 'w-full border border-input rounded-lg bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <div className="px-4 pt-4 pb-6">
      <h2 className="font-display text-xl font-bold text-negro mb-4">Nuevo pedido</h2>
      <p className="text-[0.82rem] text-muted-foreground mb-3 font-semibold uppercase tracking-wider">Paso 1 — Seleccionar cliente</p>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar por nombre del negocio..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 border border-input rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
        />
        {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="flex flex-col gap-2 mb-5">
          {results.map(c => (
            <div key={c.id} className="bg-white rounded-xl shadow-card px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-negro truncate">{c.nombre_negocio}</div>
                {c.direccion && <div className="text-[0.75rem] text-muted-foreground">{c.direccion}</div>}
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[0.65rem] font-bold text-muted-foreground capitalize">{c.lista_precios}</span>
                  {c.pendiente_aprobacion && (
                    <span className="text-[0.58rem] font-bold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full uppercase">
                      Pend. aprobación
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => onSelect(c)}
                className="shrink-0 bg-amarillo text-negro text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-amarillo/90 transition-colors"
              >
                Seleccionar
              </button>
            </div>
          ))}
        </div>
      )}

      {query && !searching && results.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">Sin resultados para "{query}"</p>
      )}

      {/* Divider */}
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-cream-dark" />
        <span className="text-[0.7rem] text-muted-foreground font-semibold">o</span>
        <div className="flex-1 h-px bg-cream-dark" />
      </div>

      {/* Create new */}
      <button
        onClick={() => setShowForm(f => !f)}
        className="w-full py-2.5 border-2 border-dashed border-negro/20 rounded-xl text-sm font-bold text-negro hover:border-negro/40 transition-colors flex items-center justify-center gap-2"
      >
        <Plus size={15} />
        {showForm ? 'Cancelar' : 'Crear cliente nuevo'}
      </button>

      {showForm && (
        <form onSubmit={handleCrear} className="mt-4 bg-white rounded-xl shadow-card p-4 flex flex-col gap-3">
          <p className="text-[0.72rem] font-bold uppercase tracking-wider text-muted-foreground">Datos del nuevo cliente</p>

          <input required placeholder="Nombre del negocio *" value={form.nombre}
            onChange={e => setForm(f => ({...f, nombre: e.target.value}))} className={fieldCls} />
          <input required placeholder="Teléfono *" value={form.telefono}
            onChange={e => setForm(f => ({...f, telefono: e.target.value}))} className={fieldCls} />
          <input placeholder="Dirección" value={form.direccion}
            onChange={e => setForm(f => ({...f, direccion: e.target.value}))} className={fieldCls} />
          <input placeholder="Email (opcional)" type="email" value={form.email}
            onChange={e => setForm(f => ({...f, email: e.target.value}))} className={fieldCls} />
          <input placeholder="CUIT (opcional)" value={form.cuit}
            onChange={e => setForm(f => ({...f, cuit: e.target.value}))} className={fieldCls} />

          <div className="flex flex-col gap-1">
            <label className="text-[0.68rem] font-bold uppercase tracking-wider text-muted-foreground">Lista de precios *</label>
            <select required value={form.lista_precios} onChange={e => setForm(f => ({...f, lista_precios: e.target.value}))}
              className={fieldCls}>
              <option value="">Seleccionar lista...</option>
              <option value="minorista">Minorista</option>
              <option value="mediano">Mediano</option>
              <option value="mayorista">Mayorista</option>
            </select>
          </div>

          {error && <p className="text-[0.78rem] text-red-600 font-semibold">{error}</p>}

          <button type="submit" disabled={saving}
            className="w-full py-2.5 bg-negro text-white font-bold text-sm rounded-lg hover:bg-negro/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><Loader2 size={14} className="animate-spin" />Creando...</> : 'Crear y continuar →'}
          </button>
        </form>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 2 — Catálogo liviano
// ═══════════════════════════════════════════════════════════════════════════════

function Step2({ cliente, cart, setCart, onBack, onNext }) {
  const [catalog, setCatalog]       = useState(null)  // { productos, categorias, promos }
  const [loading, setLoading]       = useState(true)
  const [catFilter, setCatFilter]   = useState('')
  const [textFilter, setTextFilter] = useState('')
  const [cartOpen, setCartOpen]     = useState(false)
  const lista = cliente.lista_precios ?? 'minorista'

  // ── Carga del catálogo (localStorage cache) ────────────────────────────────
  useEffect(() => {
    const cached = getCachedCatalog()
    if (cached) { setCatalog(cached); setLoading(false); return }

    Promise.all([
      supabase.from('productos')
        .select(`id, codigo_interno, nombre, unidad,
          precio, precio_mediano, precio_mayorista,
          precio_pack, precio_pack_mediano, precio_pack_mayorista, unidades_pack,
          precio_pallet, precio_pallet_mediano, precio_pallet_mayorista, unidades_pallet,
          categoria_id, categorias(id, nombre)`)
        .eq('activo', true)
        .order('nombre'),
      supabase.from('categorias').select('id, nombre').order('nombre'),
      supabase.from('promociones')
        .select('id, producto_id, texto, tipo_promo, descuento_porcentaje, promo_n, promo_m, qty_minima, presentacion, listas_precios')
        .eq('activo', true),
    ]).then(([{ data: prods }, { data: cats }, { data: promos }]) => {
      const data = { productos: prods ?? [], categorias: cats ?? [], promos: promos ?? [] }
      setCachedCatalog(data)
      setCatalog(data)
      setLoading(false)
    })
  }, [])

  // ── Carrito ────────────────────────────────────────────────────────────────
  function setQty(product, presentacion, qty) {
    const key = `${product.id}-${presentacion}`
    if (qty <= 0) {
      setCart(prev => prev.filter(i => i.key !== key))
      return
    }
    const price = getPrecio(product, presentacion, lista) ?? 0
    setCart(prev => {
      const existing = prev.find(i => i.key === key)
      if (existing) return prev.map(i => i.key === key ? { ...i, qty } : i)
      return [...prev, {
        key, productId: product.id, name: product.nombre, code: product.codigo_interno,
        presentacion, price, qty,
      }]
    })
  }

  function getQty(productId, presentacion) {
    return cart.find(i => i.key === `${productId}-${presentacion}`)?.qty ?? 0
  }

  // ── Filtrado local (sin llamadas a DB) ─────────────────────────────────────
  const visibleProducts = (catalog?.productos ?? []).filter(p => {
    if (catFilter && p.categoria_id !== catFilter) return false
    if (textFilter) {
      const q = textFilter.toLowerCase()
      if (!p.nombre.toLowerCase().includes(q) && !p.codigo_interno?.toLowerCase().includes(q)) return false
    }
    return true
  })

  const promoMap = {}
  ;(catalog?.promos ?? []).forEach(pr => {
    const key = pr.producto_id
    if (!promoMap[key]) promoMap[key] = []
    promoMap[key].push(pr)
  })

  const totalItems = cart.reduce((s, i) => s + i.qty, 0)
  const totalPrice = calcTotal(cart)

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-amarillo" />
        <p className="text-sm text-muted-foreground">Cargando catálogo…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="sticky top-[52px] bg-cream z-30 px-4 pt-3 pb-2 border-b border-cream-dark">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={onBack} className="text-muted-foreground">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <span className="font-bold text-sm text-negro truncate block">{cliente.nombre_negocio}</span>
            <span className="text-[0.68rem] text-muted-foreground capitalize">{lista}</span>
          </div>
        </div>

        {/* Búsqueda */}
        <div className="relative mb-2">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar producto o código..."
            value={textFilter}
            onChange={e => setTextFilter(e.target.value)}
            className="w-full pl-8 pr-3 py-2 border border-input rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Chips de categoría */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setCatFilter('')}
            className={`shrink-0 px-3 py-1 rounded-full text-[0.68rem] font-bold border transition-colors ${!catFilter ? 'bg-negro text-white border-negro' : 'bg-white text-negro border-input'}`}
          >
            Todas
          </button>
          {(catalog?.categorias ?? []).map(cat => (
            <button
              key={cat.id}
              onClick={() => setCatFilter(catFilter === cat.id ? '' : cat.id)}
              className={`shrink-0 px-3 py-1 rounded-full text-[0.68rem] font-bold border transition-colors ${catFilter === cat.id ? 'bg-negro text-white border-negro' : 'bg-white text-negro border-input'}`}
            >
              {cat.nombre}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de productos */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {visibleProducts.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">Sin productos.</p>
        )}
        {visibleProducts.map(p => {
          const promos = (promoMap[p.id] ?? []).filter(pr => {
            if (!pr.listas_precios) return true
            try { const lp = JSON.parse(pr.listas_precios); return !Array.isArray(lp) || lp.includes(lista) } catch { return true }
          })

          const pres = ['unidad']
          if (p.precio_pack != null)   pres.push('pack')
          if (p.precio_pallet != null) pres.push('pallet')

          return (
            <div key={p.id} className="bg-white rounded-xl px-3.5 py-3 shadow-card">
              {/* Nombre + código */}
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-[0.95rem] text-negro leading-snug">{p.nombre}</span>
                  {p.codigo_interno && (
                    <span className="text-[0.68rem] text-muted-foreground ml-1.5">({p.codigo_interno})</span>
                  )}
                </div>
                {promos.length > 0 && (
                  <span className="shrink-0 bg-orange-100 text-orange-700 text-[0.6rem] font-extrabold uppercase px-1.5 py-0.5 rounded-full border border-orange-200">
                    🏷️ {promos[0].texto}
                  </span>
                )}
              </div>

              {/* Precios por presentación + controles */}
              {pres.map(pr => {
                const price = getPrecio(p, pr, lista)
                if (price == null) return null
                const qty = getQty(p.id, pr)

                return (
                  <div key={pr} className="flex items-center justify-between gap-2 py-1.5 border-t border-cream-dark first:border-t-0">
                    <div className="min-w-0">
                      <span className="text-[0.72rem] font-bold text-muted-foreground uppercase">
                        {pr === 'pack' ? `Pack ×${p.unidades_pack ?? '?'}` : pr === 'pallet' ? `Pallet ×${p.unidades_pallet ?? '?'}` : p.unidad ?? 'Unidad'}
                      </span>
                      <span className="ml-1.5 font-bold text-[0.85rem] text-negro">{formatPrice(price)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setQty(p, pr, qty - 1)}
                        className="w-7 h-7 rounded-full bg-cream-dark flex items-center justify-center text-negro hover:bg-negro hover:text-white transition-colors"
                      >
                        <Minus size={12} />
                      </button>
                      <input
                        type="number" min="0"
                        value={qty}
                        onChange={e => setQty(p, pr, parseInt(e.target.value) || 0)}
                        className="w-10 text-center font-extrabold text-base bg-transparent focus:outline-none"
                      />
                      <button
                        onClick={() => setQty(p, pr, qty + 1)}
                        className="w-7 h-7 rounded-full bg-negro flex items-center justify-center text-white hover:bg-negro/80 transition-colors"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Carrito flotante */}
      {totalItems > 0 && (
        <div className="fixed bottom-[60px] left-0 right-0 z-40 px-4 pb-3">
          <div className="bg-negro text-white rounded-xl shadow-lg overflow-hidden">
            {/* Summary (expandible) */}
            {cartOpen && (
              <div className="max-h-52 overflow-y-auto border-b border-white/10">
                {cart.map(i => (
                  <div key={i.key} className="flex justify-between items-center px-4 py-2 text-sm border-b border-white/5 last:border-0">
                    <span className="truncate flex-1 text-white/80 text-[0.78rem]">
                      {i.qty}× {i.name}
                      {i.presentacion !== 'unidad' && <span className="text-white/50 ml-1">({i.presentacion})</span>}
                    </span>
                    <span className="font-bold shrink-0 ml-2">{formatPrice(i.price * i.qty)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => setCartOpen(o => !o)} className="text-white/60 hover:text-white transition-colors">
                {cartOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
              <div className="flex items-center gap-2 flex-1">
                <ShoppingCart size={16} />
                <span className="font-bold">{totalItems} item{totalItems > 1 ? 's' : ''}</span>
                <span className="text-white/60 text-sm">·</span>
                <span className="font-bold text-amarillo">{formatPrice(totalPrice)}</span>
              </div>
              <button
                onClick={onNext}
                className="bg-amarillo text-negro text-sm font-extrabold px-4 py-1.5 rounded-lg hover:bg-amarillo/90 transition-colors shrink-0"
              >
                Revisar →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 3 — Confirmar pedido
// ═══════════════════════════════════════════════════════════════════════════════

function Step3({ cliente, cart, vendedor, onBack, onSuccess }) {
  const [notes, setNotes]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const total = calcTotal(cart)

  function formatPrice(n) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
  }

  async function handleConfirm() {
    setSaving(true); setError('')
    try {
      // Número de referencia
      const refNum = `PP-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`

      // Crear prepedido
      const { data: pedido, error: pErr } = await supabase
        .from('prepedidos')
        .insert({
          numero_referencia: refNum,
          cliente_id:        cliente.id,
          vendedor_id:       vendedor.id,
          estado:            'revisado',
          tomado_en_visita:  true,
          total,
          notas_admin:       notes || null,
        })
        .select()
        .single()

      if (pErr) throw pErr

      // Crear items
      const { error: iErr } = await supabase.from('items_prepedido').insert(
        cart.map(i => ({
          prepedido_id:    pedido.id,
          producto_id:     i.productId,
          variante_id:     null,
          cantidad:        i.qty,
          precio_unitario: i.price,
          subtotal:        i.price * i.qty,
          presentacion:    i.presentacion,
        }))
      )
      if (iErr) throw iErr

      // Notificar al admin por WhatsApp (no bloquea)
      notifyAdmin({ refNum, total, clienteNombre: cliente.nombre_negocio, vendedorNombre: vendedor.nombre, cart }).catch(() => {})

      onSuccess(refNum)
    } catch (err) {
      setError('Error al confirmar el pedido. Intentá de nuevo.')
      console.error(err)
    } finally { setSaving(false) }
  }

  async function notifyAdmin({ refNum, total, clienteNombre, vendedorNombre, cart }) {
    const { data: cfgData } = await supabase
      .from('configuracion').select('valor').eq('clave', 'whatsapp_destinos').maybeSingle()
    if (!cfgData?.valor) return

    let destinos
    try { destinos = JSON.parse(cfgData.valor) } catch { return }
    if (!destinos?.length) return

    const lineas = cart.slice(0, 10).map(i =>
      `• ${i.qty}x ${i.name}${i.presentacion !== 'unidad' ? ` (${i.presentacion})` : ''} → ${formatPrice(i.price * i.qty)}`
    )
    if (cart.length > 10) lineas.push(`... y ${cart.length - 10} producto(s) más`)

    const mensaje =
      `🌿 *Nuevo Prepedido (visita) — Ayres del Sur*\n\n` +
      `📋 Pedido: ${refNum}\n👤 Cliente: ${clienteNombre}\n🧑‍💼 Vendedor: ${vendedorNombre}\n` +
      `💰 Total: ${formatPrice(total)}\n\n🛒 *Detalle:*\n${lineas.join('\n')}`

    await supabase.functions.invoke('notify-pedido', { body: { destinos, mensaje } })
  }

  return (
    <div className="px-4 pt-4 pb-6 max-w-[520px] mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} className="text-muted-foreground"><ArrowLeft size={18} /></button>
        <h2 className="font-display text-xl font-bold text-negro">Confirmar pedido</h2>
      </div>

      {/* Cliente */}
      <div className="bg-white rounded-xl shadow-card px-4 py-3 mb-3">
        <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Cliente</p>
        <p className="font-extrabold text-negro">{cliente.nombre_negocio}</p>
        {cliente.direccion && <p className="text-[0.78rem] text-muted-foreground">{cliente.direccion}</p>}
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl shadow-card overflow-hidden mb-3">
        {cart.map(i => (
          <div key={i.key} className="flex justify-between items-center px-4 py-2.5 border-b border-cream-dark last:border-b-0">
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-sm text-negro">{i.name}</span>
              {i.presentacion !== 'unidad' && (
                <span className="ml-1.5 text-[0.65rem] font-bold text-muted-foreground uppercase">{i.presentacion}</span>
              )}
              <div className="text-[0.72rem] text-muted-foreground">{i.qty} × {formatPrice(i.price)}</div>
            </div>
            <span className="font-bold text-negro shrink-0">{formatPrice(i.price * i.qty)}</span>
          </div>
        ))}
        <div className="flex justify-between items-center px-4 py-3 bg-negro">
          <span className="text-[0.72rem] font-bold uppercase tracking-wider text-white/70">Total</span>
          <span className="font-display font-extrabold text-[1.2rem] text-amarillo">{formatPrice(total)}</span>
        </div>
      </div>

      {/* Notas */}
      <div className="mb-5">
        <label className="text-[0.68rem] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
          Observaciones (opcional)
        </label>
        <textarea
          rows={3}
          placeholder="Ej: cliente pide entrega a la tarde..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      {error && <p className="text-[0.78rem] text-red-600 font-semibold mb-3">{error}</p>}

      <button
        onClick={handleConfirm}
        disabled={saving}
        className="w-full py-3.5 bg-amarillo text-negro font-extrabold text-base rounded-xl hover:bg-amarillo/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving ? <><Loader2 size={16} className="animate-spin" />Enviando...</> : '✓ Confirmar pedido'}
      </button>

      <p className="text-center text-[0.72rem] text-muted-foreground mt-2">
        El pedido queda en estado "Revisado" con tu firma de visita.
      </p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Página principal — máquina de estados de 3 pasos
// ═══════════════════════════════════════════════════════════════════════════════

export default function NuevoPedido() {
  const { vendedor } = useVendedor()
  const [step, setStep]               = useState(1)
  const [cliente, setCliente]         = useState(null)
  const [cart, setCart]               = useState([])
  const [successRef, setSuccessRef]   = useState(null)

  function handleSelectCliente(c) { setCliente(c); setCart([]); setStep(2) }
  function handleBackToStep1()    { setStep(1) }
  function handleToStep3()        { if (cart.length > 0) setStep(3) }
  function handleBackToStep2()    { setStep(2) }
  function handleSuccess(refNum)  { setSuccessRef(refNum); setStep(4) }

  function reset() {
    setStep(1); setCliente(null); setCart([]); setSuccessRef(null)
  }

  // ── Éxito ──────────────────────────────────────────────────────────────────
  if (step === 4) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="font-display text-2xl font-bold text-negro mb-2">¡Pedido confirmado!</h2>
        <p className="text-sm text-muted-foreground mb-1">{successRef}</p>
        <p className="text-sm text-muted-foreground mb-8">El pedido fue registrado como "Revisado".</p>
        <button
          onClick={reset}
          className="bg-amarillo text-negro font-bold px-6 py-2.5 rounded-xl hover:bg-amarillo/90 transition-colors"
        >
          Tomar otro pedido
        </button>
      </div>
    )
  }

  if (step === 1) return <Step1 onSelect={handleSelectCliente} />
  if (step === 2) return (
    <Step2
      cliente={cliente}
      cart={cart}
      setCart={setCart}
      onBack={handleBackToStep1}
      onNext={handleToStep3}
    />
  )
  if (step === 3) return (
    <Step3
      cliente={cliente}
      cart={cart}
      vendedor={vendedor}
      onBack={handleBackToStep2}
      onSuccess={handleSuccess}
    />
  )
  return null
}
