import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useVendedor } from './VendedorLayout'
import {
  Loader2, Search, ArrowLeft, Plus, Minus,
  ShoppingCart, ChevronDown, ChevronUp, CheckCircle, X,
} from 'lucide-react'

// ── Colores de categoría (mismo mapa que el catálogo del cliente) ─────────────
const CATEGORY_COLORS = {
  'Almacen':             '#5B8C5A',
  'Almacén':             '#5B8C5A',
  'Bebidas':             '#2E85C8',
  'Bebidas Alcoholicas': '#C4873A',
  'Bebidas Alcohólicas': '#C4873A',
  'Lacteos':             '#2E85C8',
  'Lácteos':             '#2E85C8',
  'Limpieza':            '#5B7FA6',
  'Snacks':              '#C4873A',
  'Vinos':               '#7B3F6E',
}

// ── Precio base según presentación y lista ────────────────────────────────────
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

function formatPrice(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

// ── Promo helpers (idénticos al catálogo del cliente) ─────────────────────────
function calcEffectivePrice(promo, basePrice) {
  switch (promo.tipo_promo) {
    case 'nxm':
      if (!promo.promo_n || !promo.promo_m) return basePrice
      return basePrice * promo.promo_m / promo.promo_n
    case 'descuento_porcentual':
      if (!promo.descuento_porcentaje) return basePrice
      return basePrice * (1 - promo.descuento_porcentaje / 100)
    case 'precio_especial':
      return promo.precio_promo ?? basePrice
    case 'cantidad_minima':
      // Precio se ajusta dinámicamente según qty en calcTotal
      return basePrice
    default:
      return basePrice
  }
}

function promoBadge(promo) {
  switch (promo.tipo_promo) {
    case 'nxm':                  return `${promo.promo_n}×${promo.promo_m}`
    case 'descuento_porcentual': return `${promo.descuento_porcentaje}% OFF`
    case 'precio_especial':      return 'OFERTA'
    case 'cantidad_minima':      return `+${promo.qty_minima}u → ${promo.descuento_porcentaje}% OFF`
    default:                     return 'PROMO'
  }
}

function calcAddQty(promo) {
  if (promo.tipo_promo === 'nxm')            return promo.promo_n ?? 1
  if (promo.tipo_promo === 'cantidad_minima') return promo.qty_minima ?? 1
  return 1
}

// Subtotal real de un item respetando:
//   nxm          → grupos completos al precio promo + resto al precio normal
//   cantidad_minima → descuento solo si qty >= umbral
//   otros          → precio efectivo fijo × qty
function calcItemSubtotal(item) {
  const { qty, basePrice, price, promoType, promoN, promoM, promoQtyMin, promoDesc } = item

  if (promoType === 'nxm' && promoN && promoM) {
    const groups    = Math.floor(qty / promoN)
    const remainder = qty % promoN
    return groups * promoM * basePrice + remainder * basePrice
  }

  if (promoType === 'cantidad_minima' && promoQtyMin && promoDesc != null) {
    const effPrice = qty >= promoQtyMin
      ? basePrice * (1 - promoDesc / 100)
      : basePrice
    return effPrice * qty
  }

  return price * qty
}

// Total del carrito
function calcTotal(cart) {
  return cart.reduce((sum, item) => sum + calcItemSubtotal(item), 0)
}

// ── Cache del catálogo (1 hora) ───────────────────────────────────────────────
const CACHE_KEY = 'ads_vendedor_catalog_v3'
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

// ── Persistencia del borrador de pedido ───────────────────────────────────────
const DRAFT_KEY_PREFIX = 'ads_draft_'
const DRAFT_TTL        = 24 * 60 * 60 * 1000 // 24 horas

function readDraft(vendedorId) {
  try {
    const raw = localStorage.getItem(`${DRAFT_KEY_PREFIX}${vendedorId}`)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (!d.cliente || !d.savedAt || Date.now() - d.savedAt > DRAFT_TTL) return null
    return d
  } catch { return null }
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
  const [form, setForm] = useState({
    nombre: '', telefono: '', direccion: '', email: '', cuit: '', lista_precios: ''
  })
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
        nombre_negocio:         form.nombre.trim(),
        telefono:               form.telefono.trim() || null,
        direccion:              form.direccion.trim() || '',
        email:                  form.email.trim() || null,
        cuit:                   form.cuit.trim() || null,
        lista_precios:          form.lista_precios,
        activo:                 true,
        pendiente_aprobacion:   true,
        creado_por_vendedor_id: vendedor.id,
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
      <p className="text-[0.82rem] text-muted-foreground mb-3 font-semibold uppercase tracking-wider">
        Paso 1 — Seleccionar cliente
      </p>

      {/* Búsqueda */}
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
        {searching && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Resultados */}
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

      {/* Divisor */}
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-cream-dark" />
        <span className="text-[0.7rem] text-muted-foreground font-semibold">o</span>
        <div className="flex-1 h-px bg-cream-dark" />
      </div>

      {/* Crear nuevo */}
      <button
        onClick={() => setShowForm(f => !f)}
        className="w-full py-2.5 border-2 border-dashed border-negro/20 rounded-xl text-sm font-bold text-negro hover:border-negro/40 transition-colors flex items-center justify-center gap-2"
      >
        <Plus size={15} />
        {showForm ? 'Cancelar' : 'Crear cliente nuevo'}
      </button>

      {showForm && (
        <form onSubmit={handleCrear} className="mt-4 bg-white rounded-xl shadow-card p-4 flex flex-col gap-3">
          <p className="text-[0.72rem] font-bold uppercase tracking-wider text-muted-foreground">
            Datos del nuevo cliente
          </p>

          <input required placeholder="Nombre del negocio *" value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className={fieldCls} />
          <input required placeholder="Teléfono *" value={form.telefono}
            onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} className={fieldCls} />
          <input placeholder="Dirección" value={form.direccion}
            onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} className={fieldCls} />
          <input placeholder="Email (opcional)" type="email" value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={fieldCls} />
          <input placeholder="CUIT (opcional)" value={form.cuit}
            onChange={e => setForm(f => ({ ...f, cuit: e.target.value }))} className={fieldCls} />

          <div className="flex flex-col gap-1">
            <label className="text-[0.68rem] font-bold uppercase tracking-wider text-muted-foreground">
              Lista de precios *
            </label>
            <select required value={form.lista_precios}
              onChange={e => setForm(f => ({ ...f, lista_precios: e.target.value }))}
              className={fieldCls}
            >
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
// PASO 2 — Catálogo en acordeón
// ═══════════════════════════════════════════════════════════════════════════════

function Step2({ cliente, cart, setCart, onBack, onNext }) {
  const [catalog, setCatalog]       = useState(null)
  const [loading, setLoading]       = useState(true)
  const [catFilter, setCatFilter]   = useState('')
  const [textFilter, setTextFilter] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [cartOpen, setCartOpen]     = useState(false)
  const lista = cliente.lista_precios ?? 'minorista'

  // ── Carga del catálogo ─────────────────────────────────────────────────────
  useEffect(() => {
    const cached = getCachedCatalog()
    if (cached) { setCatalog(cached); setLoading(false); return }

    Promise.all([
      supabase.from('productos')
        .select(`id, codigo_interno, nombre, unidad,
          precio, precio_mediano, precio_mayorista,
          precio_pack, precio_pack_mediano, precio_pack_mayorista, unidades_pack,
          precio_pallet, precio_pallet_mediano, precio_pallet_mayorista, unidades_pallet,
          stock_activo, stock_cantidad, stock_umbral_bajo,
          categoria_id, categorias(id, nombre)`)
        .eq('activo', true)
        .order('nombre'),
      supabase.from('categorias').select('id, nombre').order('nombre'),
      supabase.from('promociones')
        .select('id, producto_id, texto, tipo_promo, descuento_porcentaje, precio_promo, promo_n, promo_m, qty_minima, presentacion, listas_precios')
        .eq('activo', true),
    ]).then(([{ data: prods }, { data: cats }, { data: promos }]) => {
      const data = { productos: prods ?? [], categorias: cats ?? [], promos: promos ?? [] }
      setCachedCatalog(data)
      setCatalog(data)
      setLoading(false)
    })
  }, [])

  // ── Mapa de promos filtrado por lista de precios ───────────────────────────
  const promoMap = {}
  ;(catalog?.promos ?? []).forEach(pr => {
    if (pr.listas_precios) {
      try {
        const lp = JSON.parse(pr.listas_precios)
        if (Array.isArray(lp) && !lp.includes(lista)) return
      } catch {}
    }
    if (!promoMap[pr.producto_id]) promoMap[pr.producto_id] = []
    promoMap[pr.producto_id].push(pr)
  })

  // ── Obtiene la promo más relevante para un producto y presentación ─────────
  function getBestPromo(productId, presentacion) {
    const promos = promoMap[productId] ?? []
    // Promo específica para esta presentación primero, luego la genérica
    return (
      promos.find(p => p.presentacion === presentacion) ??
      promos.find(p => !p.presentacion) ??
      null
    )
  }

  // ── Carrito ────────────────────────────────────────────────────────────────
  function setQty(product, presentacion, newQty) {
    const key = `${product.id}-${presentacion}`

    if (newQty <= 0) {
      setCart(prev => prev.filter(i => i.key !== key))
      return
    }

    const basePrice = getPrecio(product, presentacion, lista)
    if (basePrice == null) return

    const promo = getBestPromo(product.id, presentacion)

    let price = basePrice
    let promoType = null, promoN = null, promoM = null
    let promoQtyMin = null, promoDesc = null, promoBadgeLabel = null

    if (promo) {
      promoType = promo.tipo_promo
      promoBadgeLabel = promoBadge(promo)
      if (promo.tipo_promo === 'nxm') {
        // Para nxm guardamos N y M; el subtotal se calcula dinámicamente en calcItemSubtotal
        promoN = promo.promo_n
        promoM = promo.promo_m
        // price queda igual a basePrice; el descuento emerge del cálculo por grupos
      } else if (promo.tipo_promo !== 'cantidad_minima') {
        price = calcEffectivePrice(promo, basePrice)
      } else {
        promoQtyMin = promo.qty_minima
        promoDesc   = promo.descuento_porcentaje
      }
    }

    setCart(prev => {
      const existing = prev.find(i => i.key === key)
      if (existing) return prev.map(i => i.key === key ? { ...i, qty: newQty } : i)
      return [...prev, {
        key, productId: product.id, name: product.nombre, code: product.codigo_interno,
        presentacion, basePrice, price, qty: newQty,
        promoType, promoN, promoM, promoQtyMin, promoDesc, promoBadgeLabel,
      }]
    })
  }

  function getQty(productId, presentacion) {
    return cart.find(i => i.key === `${productId}-${presentacion}`)?.qty ?? 0
  }

  // ── Filtros + orden (productos con promo primero; agotados ocultos) ─────────
  const visibleProducts = (catalog?.productos ?? [])
    .filter(p => {
      // Ocultar agotados
      if (p.stock_activo && p.stock_cantidad === 0) return false
      if (catFilter && p.categoria_id !== catFilter) return false
      if (textFilter) {
        const q = textFilter.toLowerCase()
        if (!p.nombre.toLowerCase().includes(q) && !p.codigo_interno?.toLowerCase().includes(q)) return false
      }
      return true
    })
    .sort((a, b) => {
      const aP = !!(promoMap[a.id]?.length)
      const bP = !!(promoMap[b.id]?.length)
      if (aP === bP) return 0
      return aP ? -1 : 1
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
    <div>
      {/* ── Header sticky ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 bg-cream z-30 px-4 pt-3 pb-2 border-b border-cream-dark">

        {/* Cliente + back */}
        <div className="flex items-center gap-2 mb-2">
          <button onClick={onBack} className="text-muted-foreground shrink-0">
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
        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setCatFilter('')}
            className={`shrink-0 px-3 py-1 rounded-full text-[0.68rem] font-bold border transition-colors ${
              !catFilter ? 'bg-negro text-white border-negro' : 'bg-white text-negro border-input'
            }`}
          >
            Todas
          </button>
          {(catalog?.categorias ?? []).map(cat => (
            <button
              key={cat.id}
              onClick={() => setCatFilter(catFilter === cat.id ? '' : cat.id)}
              className={`shrink-0 px-3 py-1 rounded-full text-[0.68rem] font-bold border transition-colors ${
                catFilter === cat.id ? 'bg-negro text-white border-negro' : 'bg-white text-negro border-input'
              }`}
            >
              {cat.nombre}
            </button>
          ))}
        </div>
      </div>

      {/* ── Lista de productos (acordeón) ──────────────────────────────────── */}
      <div className="px-4 pt-3 pb-32 space-y-2.5">
        {visibleProducts.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">Sin productos.</p>
        )}

        {visibleProducts.map(p => {
          const isExpanded  = expandedId === p.id
          const catColor    = CATEGORY_COLORS[p.categorias?.nombre]
          const bestPromo   = promoMap[p.id]?.[0] ?? null   // badge indicator
          const hasInCart   = cart.some(i => i.productId === p.id)

          const pres = ['unidad']
          if (p.precio_pack != null)   pres.push('pack')
          if (p.precio_pallet != null) pres.push('pallet')

          const stockMax     = p.stock_activo && p.stock_cantidad != null ? p.stock_cantidad : null
          const stockBajo    = p.stock_activo && p.stock_cantidad != null && p.stock_cantidad > 0
            && p.stock_cantidad <= (p.stock_umbral_bajo ?? 0)
          // Total en carrito para este producto (todas las presentaciones)
          const totalCartQtyForProd = cart.filter(i => i.productId === p.id).reduce((s, i) => s + i.qty, 0)

          return (
            <div
              key={p.id}
              className="bg-white rounded-xl overflow-hidden shadow-card"
              style={{ borderLeft: `3px solid ${catColor ?? '#E8A020'}` }}
            >
              {/* Fila de cabecera — click para expandir */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : p.id)}
                className="w-full flex items-center gap-3 px-3.5 py-3 text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-[0.92rem] text-negro leading-snug">{p.nombre}</span>
                    {p.codigo_interno && (
                      <span className="text-[0.65rem] text-muted-foreground">({p.codigo_interno})</span>
                    )}
                    {/* Vendedor ve el stock exacto */}
                    {p.stock_activo && p.stock_cantidad != null && (
                      <span className={`text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full border ${
                        stockBajo
                          ? 'bg-orange-100 text-orange-700 border-orange-200'
                          : 'bg-green-50 text-green-700 border-green-200'
                      }`}>
                        Stock: {p.stock_cantidad} u.
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {bestPromo && (
                    <span className="bg-orange-100 text-orange-700 text-[0.58rem] font-extrabold uppercase px-1.5 py-0.5 rounded-full border border-orange-200">
                      {promoBadge(bestPromo)}
                    </span>
                  )}
                  {hasInCart && (
                    <span className="w-2 h-2 rounded-full bg-amarillo shrink-0" />
                  )}
                  {isExpanded
                    ? <ChevronUp size={15} className="text-muted-foreground" />
                    : <ChevronDown size={15} className="text-muted-foreground" />
                  }
                </div>
              </button>

              {/* Contenido expandido */}
              {isExpanded && (
                <div className="border-t border-cream-dark">
                  {pres.map((pr, idx) => {
                    const basePrice = getPrecio(p, pr, lista)
                    if (basePrice == null) return null

                    const promo      = getBestPromo(p.id, pr)
                    const effPrice   = promo ? calcEffectivePrice(promo, basePrice) : basePrice
                    const hasDisc    = promo && Math.round(effPrice) < Math.round(basePrice)
                    const badge      = promo ? promoBadge(promo) : null
                    const addQtyStep = promo ? calcAddQty(promo) : 1
                    const qty        = getQty(p.id, pr)

                    const presLabel = pr === 'pack'
                      ? `Pack ×${p.unidades_pack ?? '?'}`
                      : pr === 'pallet'
                      ? `Pallet ×${p.unidades_pallet ?? '?'}`
                      : (p.unidad ?? 'Unidad')

                    // Descripción legible de la promo
                    const promoDesc = promo ? (() => {
                      switch (promo.tipo_promo) {
                        case 'nxm':                  return `Llevás ${promo.promo_n}, pagás ${promo.promo_m}`
                        case 'descuento_porcentual': return `${promo.descuento_porcentaje}% de descuento`
                        case 'precio_especial':      return 'Precio especial'
                        case 'cantidad_minima':      return `Llevando +${promo.qty_minima} u. → ${promo.descuento_porcentaje}% OFF`
                        default:                     return null
                      }
                    })() : null

                    // Hint dinámico según qty actual
                    let promoHint = null, hintActive = false
                    if (qty > 0 && promo) {
                      if (promo.tipo_promo === 'nxm' && promo.promo_n) {
                        const rem = qty % promo.promo_n
                        if (rem === 0) {
                          const g = qty / promo.promo_n
                          promoHint = `${g} grupo${g > 1 ? 's' : ''} completo${g > 1 ? 's' : ''} · promo activa`
                          hintActive = true
                        } else {
                          promoHint = `Faltan ${promo.promo_n - rem} para completar el grupo`
                        }
                      } else if (promo.tipo_promo === 'cantidad_minima' && promo.qty_minima) {
                        if (qty >= promo.qty_minima) {
                          promoHint = `Descuento activo · ${promo.descuento_porcentaje}% OFF`
                          hintActive = true
                        } else {
                          promoHint = `Faltan ${promo.qty_minima - qty} para el ${promo.descuento_porcentaje}% OFF`
                        }
                      }
                    }

                    return (
                      <div
                        key={pr}
                        className={`flex items-start justify-between gap-2 px-3.5 py-2.5 ${
                          idx > 0 ? 'border-t border-cream-dark' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          {/* Presentación + badge */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[0.72rem] font-bold text-muted-foreground uppercase">
                              {presLabel}
                            </span>
                            {badge && (
                              <span className="bg-orange-100 text-orange-700 text-[0.56rem] font-extrabold uppercase px-1 py-0.5 rounded-full border border-orange-200">
                                {badge}
                              </span>
                            )}
                          </div>

                          {/* Descripción completa de la promo */}
                          {promoDesc && (
                            <p className="text-[0.68rem] text-muted-foreground mt-0.5">{promoDesc}</p>
                          )}

                          {/* Precio */}
                          <div className="flex items-baseline gap-1.5 mt-0.5">
                            {hasDisc && (
                              <span className="text-[0.68rem] text-muted-foreground line-through">
                                {formatPrice(basePrice)}
                              </span>
                            )}
                            <span className="font-bold text-[0.9rem] text-negro">
                              {formatPrice(effPrice)}
                            </span>
                            {promo?.tipo_promo === 'cantidad_minima' && qty < (promo.qty_minima ?? 0) && (
                              <span className="text-[0.62rem] text-muted-foreground">(sin promo)</span>
                            )}
                          </div>

                          {/* Pill: faltan X / promo activa */}
                          {promoHint && (
                            <span className={`mt-1 inline-block text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full border ${
                              hintActive
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              {promoHint}
                            </span>
                          )}
                        </div>

                        {/* Controles */}
                        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                          <button
                            onClick={() => setQty(p, pr, qty - 1)}
                            className="w-7 h-7 rounded-full bg-cream-dark flex items-center justify-center text-negro hover:bg-negro hover:text-white transition-colors"
                          >
                            <Minus size={12} />
                          </button>
                          <input
                            type="number"
                            min="0"
                            max={stockMax ?? undefined}
                            value={qty}
                            onChange={e => {
                              const newVal = parseInt(e.target.value) || 0
                              if (stockMax != null) {
                                const otherQty = totalCartQtyForProd - qty
                                setQty(p, pr, Math.min(newVal, Math.max(0, stockMax - otherQty)))
                              } else {
                                setQty(p, pr, newVal)
                              }
                            }}
                            className="w-10 text-center font-extrabold text-base bg-transparent focus:outline-none"
                          />
                          <button
                            onClick={() => {
                              if (stockMax != null && totalCartQtyForProd >= stockMax) return
                              setQty(p, pr, qty === 0 ? addQtyStep : qty + 1)
                            }}
                            disabled={stockMax != null && totalCartQtyForProd >= stockMax}
                            className="w-7 h-7 rounded-full bg-negro flex items-center justify-center text-white hover:bg-negro/80 transition-colors disabled:opacity-40"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Carrito flotante ───────────────────────────────────────────────── */}
      {totalItems > 0 && (
        <div className="fixed bottom-[60px] left-0 right-0 z-40 px-4 pb-3">
          <div className="bg-negro text-white rounded-xl shadow-lg overflow-hidden">
            {cartOpen && (
              <div className="max-h-52 overflow-y-auto border-b border-white/10">
                {cart.map(i => (
                  <div key={i.key} className="flex justify-between items-center px-4 py-2 text-sm border-b border-white/5 last:border-0">
                    <span className="truncate flex-1 text-white/80 text-[0.78rem]">
                      {i.qty}× {i.name}
                      {i.presentacion !== 'unidad' && (
                        <span className="text-white/50 ml-1">({i.presentacion})</span>
                      )}
                      {i.promoBadgeLabel && (
                        <span className="text-amarillo ml-1 text-[0.6rem] font-bold">· {i.promoBadgeLabel}</span>
                      )}
                    </span>
                    <span className="font-bold shrink-0 ml-2">{formatPrice(calcItemSubtotal(i))}</span>
                  </div>
                ))}
              </div>
            )}

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
// PASO 3 — Confirmar pedido (con edición inline)
// ═══════════════════════════════════════════════════════════════════════════════

function Step3({ cliente, cart, setCart, vendedor, onBack, onSuccess }) {
  const [notes, setNotes]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const total = calcTotal(cart)

  function editQty(key, newQty) {
    if (newQty <= 0) {
      setCart(prev => prev.filter(i => i.key !== key))
    } else {
      setCart(prev => prev.map(i => i.key === key ? { ...i, qty: newQty } : i))
    }
  }

  async function handleConfirm() {
    if (cart.length === 0) return
    setSaving(true); setError('')
    try {
      const refNum = `PP-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`

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

      const { error: iErr } = await supabase.from('items_prepedido').insert(
        cart.map(i => {
          const subtotal = calcItemSubtotal(i)
          return {
            prepedido_id:    pedido.id,
            producto_id:     i.productId,
            variante_id:     null,
            cantidad:        i.qty,
            precio_unitario: subtotal / i.qty,   // precio promedio efectivo
            subtotal,
            presentacion:    i.presentacion,
            promo_label:     i.promoBadgeLabel ?? null,
            precio_base:     i.promoType ? i.basePrice : null,
          }
        })
      )
      if (iErr) throw iErr

      // Notificar al admin (no bloquea)
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
      `• ${i.qty}x ${i.name}${i.presentacion !== 'unidad' ? ` (${i.presentacion})` : ''} → ${formatPrice(calcItemSubtotal(i))}`
    )
    if (cart.length > 10) lineas.push(`... y ${cart.length - 10} producto(s) más`)

    const mensaje =
      `🌿 *Nuevo Prepedido (visita) — Ayres del Sur*\n\n` +
      `📋 Pedido: ${refNum}\n👤 Cliente: ${clienteNombre}\n🧑‍💼 Vendedor: ${vendedorNombre}\n` +
      `💰 Total: ${formatPrice(total)}\n\n🛒 *Detalle:*\n${lineas.join('\n')}`

    await supabase.functions.invoke('notify-pedido', { body: { destinos, mensaje } })
  }

  // Carrito vacío (el vendedor eliminó todos los items)
  if (cart.length === 0) {
    return (
      <div className="px-4 pt-4 pb-6">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={onBack} className="text-muted-foreground"><ArrowLeft size={18} /></button>
          <h2 className="font-display text-xl font-bold text-negro">Confirmar pedido</h2>
        </div>
        <div className="text-center py-16">
          <p className="font-bold text-negro mb-1">El carrito quedó vacío</p>
          <p className="text-sm text-muted-foreground mb-6">Volvé al catálogo para agregar productos.</p>
          <button onClick={onBack}
            className="bg-negro text-white font-bold px-5 py-2.5 rounded-xl hover:bg-negro/90 transition-colors">
            Volver al catálogo
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="px-4 pt-4 pb-36 max-w-[520px] mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} className="text-muted-foreground"><ArrowLeft size={18} /></button>
        <h2 className="font-display text-xl font-bold text-negro">Confirmar pedido</h2>
      </div>

      {/* Cliente */}
      <div className="bg-white rounded-xl shadow-card px-4 py-3 mb-3">
        <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Cliente</p>
        <p className="font-extrabold text-negro">{cliente.nombre_negocio}</p>
        {cliente.direccion && <p className="text-[0.78rem] text-muted-foreground">{cliente.direccion}</p>}
        <p className="text-[0.68rem] text-muted-foreground capitalize mt-0.5">Lista: {cliente.lista_precios}</p>
      </div>

      {/* Items con edición */}
      <div className="bg-white rounded-xl shadow-card overflow-hidden mb-3">
        <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground px-4 pt-3 pb-1">
          Productos · tocá para editar cantidades
        </p>
        {cart.map(i => {
          const subtotal = calcItemSubtotal(i)
          // Para nxm mostramos el badge en lugar de "X c/u" porque el precio unitario varía
          const unitInfo = i.promoType === 'nxm'
            ? i.promoBadgeLabel
            : `${formatPrice(subtotal / i.qty)} c/u`
          return (
            <div key={i.key} className="flex items-center gap-3 px-4 py-2.5 border-t border-cream-dark">
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-negro leading-snug">{i.name}</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {i.presentacion !== 'unidad' && (
                    <span className="text-[0.62rem] font-bold text-muted-foreground uppercase">{i.presentacion}</span>
                  )}
                  {i.promoType !== 'nxm' && i.promoBadgeLabel && (
                    <span className="text-[0.58rem] font-extrabold uppercase bg-orange-100 text-orange-700 px-1 py-0.5 rounded-full border border-orange-200">
                      {i.promoBadgeLabel}
                    </span>
                  )}
                </div>
                <div className="text-[0.7rem] text-muted-foreground">{unitInfo}</div>
              </div>

              {/* Controles de cantidad */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => editQty(i.key, i.qty - 1)}
                  className="w-6 h-6 rounded-full bg-cream-dark flex items-center justify-center text-negro hover:bg-red-100 hover:text-red-600 transition-colors"
                >
                  <Minus size={10} />
                </button>
                <span className="font-extrabold text-sm min-w-[22px] text-center">{i.qty}</span>
                <button
                  onClick={() => editQty(i.key, i.qty + 1)}
                  className="w-6 h-6 rounded-full bg-cream-dark flex items-center justify-center text-negro hover:bg-negro hover:text-white transition-colors"
                >
                  <Plus size={10} />
                </button>
              </div>

              {/* Subtotal */}
              <span className="font-bold text-sm text-negro shrink-0 min-w-[70px] text-right">
                {formatPrice(subtotal)}
              </span>
            </div>
          )
        })}
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
    </div>

    {/* ── Barra fija: total siempre visible + confirmar ──────────────────── */}
    <div className="fixed bottom-[60px] left-0 right-0 z-40 px-4 pb-2">
      <div className="bg-negro text-white rounded-xl shadow-panel-lg flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-[0.58rem] text-white/55 uppercase tracking-wider leading-none mb-0.5">Total estimado</p>
          <p className="font-display font-extrabold text-amarillo text-[1.25rem] leading-tight">
            {formatPrice(total)}
          </p>
        </div>
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="bg-amarillo text-negro font-extrabold text-sm px-5 py-2.5 rounded-lg hover:bg-amarillo/90 transition-colors disabled:opacity-50 flex items-center gap-2 shrink-0"
        >
          {saving ? <><Loader2 size={14} className="animate-spin" />Enviando...</> : 'Confirmar pedido'}
        </button>
      </div>
    </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Página principal — máquina de 3 pasos
// ═══════════════════════════════════════════════════════════════════════════════

export default function NuevoPedido() {
  const { vendedor } = useVendedor()

  // ── Restaurar borrador guardado (se ejecuta UNA vez al montar) ─────────────
  const [initialDraft] = useState(() => readDraft(vendedor.id))

  const [step, setStep]                   = useState(initialDraft?.step      ?? 1)
  const [cliente, setCliente]             = useState(initialDraft?.cliente   ?? null)
  const [cart, setCart]                   = useState(initialDraft?.cart      ?? [])
  const [successRef, setSuccessRef]       = useState(null)
  const [draftRestored, setDraftRestored]   = useState(!!initialDraft?.cliente)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const draftKey = `${DRAFT_KEY_PREFIX}${vendedor.id}`

  // ── Auto-guardar borrador cada vez que cambia algo ─────────────────────────
  useEffect(() => {
    if (!cliente) return  // sin cliente no hay nada que guardar
    try {
      localStorage.setItem(draftKey, JSON.stringify({ step, cliente, cart, savedAt: Date.now() }))
    } catch {}
  }, [step, cliente, cart])

  function clearDraft() { try { localStorage.removeItem(draftKey) } catch {} }

  // ── Handlers de navegación ─────────────────────────────────────────────────
  function handleSelectCliente(c)  { setCliente(c); setCart([]); setStep(2) }
  function handleBackToStep1()     { setStep(1) }
  function handleToStep3()         { if (cart.length > 0) setStep(3) }
  function handleBackToStep2()     { setStep(2) }
  function handleSuccess(refNum)   {
    clearDraft()
    setSuccessRef(refNum)
    setDraftRestored(false)
    setStep(4)
  }
  function reset() {
    clearDraft()
    setStep(1); setCliente(null); setCart([]); setSuccessRef(null); setDraftRestored(false)
  }

  // ── Banner de borrador recuperado ──────────────────────────────────────────
  const draftBanner = draftRestored && (
    <div className="mx-4 mt-3 mb-1 bg-amarillo-cl border border-amarillo/50 rounded-xl px-4 py-2.5 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[0.78rem] font-bold text-negro leading-snug">Pedido en progreso recuperado</p>
        <p className="text-[0.7rem] text-muted-foreground truncate">{cliente?.nombre_negocio}</p>
      </div>

      {confirmDiscard ? (
        /* Confirmación destructiva */
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[0.68rem] text-red-700 font-semibold whitespace-nowrap">¿Borrar el pedido?</span>
          <button
            onClick={() => { setConfirmDiscard(false); reset() }}
            className="text-[0.68rem] font-bold bg-red-600 text-white px-2 py-0.5 rounded-md hover:bg-red-700 transition-colors"
          >
            Sí, borrar
          </button>
          <button
            onClick={() => setConfirmDiscard(false)}
            className="text-[0.68rem] font-semibold text-negro hover:text-negro/70 transition-colors px-1"
          >
            No
          </button>
        </div>
      ) : (
        <>
          {/* Acción destructiva — solo abre confirmación, NO borra todavía */}
          <button
            onClick={() => setConfirmDiscard(true)}
            className="text-[0.68rem] font-semibold text-muted-foreground hover:text-red-600 transition-colors whitespace-nowrap shrink-0"
          >
            Borrar pedido
          </button>
          {/* X = solo cierra el aviso, el pedido se mantiene */}
          <button
            onClick={() => setDraftRestored(false)}
            className="text-muted-foreground hover:text-negro transition-colors shrink-0 p-0.5"
            title="Cerrar aviso"
          >
            <X size={14} />
          </button>
        </>
      )}
    </div>
  )

  // ── Pantalla de éxito ──────────────────────────────────────────────────────
  if (step === 4) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-5">
          <CheckCircle size={36} className="text-green-600" strokeWidth={1.5} />
        </div>
        <h2 className="font-display text-2xl font-bold text-negro mb-2">Pedido confirmado</h2>
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

  if (step === 1) return (
    <>
      {draftBanner}
      <Step1 onSelect={handleSelectCliente} />
    </>
  )

  if (step === 2) return (
    <>
      {draftBanner}
      <Step2
        cliente={cliente}
        cart={cart}
        setCart={setCart}
        onBack={handleBackToStep1}
        onNext={handleToStep3}
      />
    </>
  )

  if (step === 3) return (
    <>
      {draftBanner}
      <Step3
        cliente={cliente}
        cart={cart}
        setCart={setCart}
        vendedor={vendedor}
        onBack={handleBackToStep2}
        onSuccess={handleSuccess}
      />
    </>
  )

  return null
}
