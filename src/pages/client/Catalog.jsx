import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCart } from '../../hooks/useCart'
import ClientNavbar from '../../components/ClientNavbar'
import { cn } from '@/lib/utils'
import { Search, Minus, Plus, Loader2, Zap } from 'lucide-react'

const CATEGORY_ICONS = {
  'Almacen':             '🧂',
  'Almacén':             '🧂',
  'Bebidas':             '🥤',
  'Bebidas Alcoholicas': '🍺',
  'Bebidas Alcohólicas': '🍺',
  'Lacteos':             '🥛',
  'Lácteos':             '🥛',
  'Limpieza':            '🧹',
  'Snacks':              '🍿',
}

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
}

const LISTA_LABELS = {
  minorista: null,
  mediano:   'Mediano',
  mayorista: 'Mayorista',
}

function formatPrice(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

// Returns the base (unit) price for a product+list tier
function getPrecioBase(product, listaPrecio) {
  if (listaPrecio === 'mayorista' && product.precio_mayorista) return product.precio_mayorista
  if (listaPrecio === 'mediano'   && product.precio_mediano)   return product.precio_mediano
  return product.precio
}

// Returns price for a given presentation and tier
function getPrecioByPresentation(product, variant, listaPrecio, presentacion) {
  const src = variant ?? product

  if (presentacion === 'pack') {
    if (listaPrecio === 'mayorista' && src.precio_pack_mayorista != null) return src.precio_pack_mayorista
    if (listaPrecio === 'mediano'   && src.precio_pack_mediano   != null) return src.precio_pack_mediano
    if (src.precio_pack != null) return src.precio_pack
    // fallback to product-level if variant doesn't have pack price
    if (variant) {
      if (listaPrecio === 'mayorista' && product.precio_pack_mayorista != null) return product.precio_pack_mayorista
      if (listaPrecio === 'mediano'   && product.precio_pack_mediano   != null) return product.precio_pack_mediano
      if (product.precio_pack != null) return product.precio_pack
    }
    return null
  }

  if (presentacion === 'pallet') {
    if (listaPrecio === 'mayorista' && src.precio_pallet_mayorista != null) return src.precio_pallet_mayorista
    if (listaPrecio === 'mediano'   && src.precio_pallet_mediano   != null) return src.precio_pallet_mediano
    if (src.precio_pallet != null) return src.precio_pallet
    if (variant) {
      if (listaPrecio === 'mayorista' && product.precio_pallet_mayorista != null) return product.precio_pallet_mayorista
      if (listaPrecio === 'mediano'   && product.precio_pallet_mediano   != null) return product.precio_pallet_mediano
      if (product.precio_pallet != null) return product.precio_pallet
    }
    return null
  }

  // 'unidad'
  if (!variant) return getPrecioBase(product, listaPrecio)
  if (listaPrecio === 'mayorista' && variant.precio_mayorista != null) return variant.precio_mayorista
  if (listaPrecio === 'mediano'   && variant.precio_mediano   != null) return variant.precio_mediano
  if (variant.precio_minorista != null) return variant.precio_minorista
  return getPrecioBase(product, listaPrecio)
}

// Checks if pack/pallet is available for a product+variant combo
function hasPack(product, variant) {
  const src = variant ?? product
  return src.precio_pack != null || product.precio_pack != null
}
function hasPallet(product, variant) {
  const src = variant ?? product
  return src.precio_pallet != null || product.precio_pallet != null
}

const PRES_LABELS = { unidad: 'Unidad', pack: 'Pack', pallet: 'Pallet' }

// ─── Promo helpers ───────────────────────────────────────────────────────────
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
      if (!promo.descuento_porcentaje) return basePrice
      return basePrice * (1 - promo.descuento_porcentaje / 100)
    default: // 'destacado' y cualquier otro: sin cambio de precio
      return basePrice
  }
}

function calcAddQty(promo) {
  if (promo.tipo_promo === 'nxm')            return promo.promo_n ?? 1
  if (promo.tipo_promo === 'cantidad_minima') return promo.qty_minima ?? 1
  return 1
}

function promoBadge(promo) {
  switch (promo.tipo_promo) {
    case 'nxm':                  return `${promo.promo_n}x${promo.promo_m}`
    case 'descuento_porcentual': return `${promo.descuento_porcentaje}% OFF`
    case 'precio_especial':      return 'OFERTA'
    case 'cantidad_minima':      return `+${promo.qty_minima}u → ${promo.descuento_porcentaje}% OFF`
    default:                     return 'DESTACADO' // 'destacado' y valores legacy
  }
}

// ─── PromoCard ────────────────────────────────────────────────────────────────
function PromoCard({ promo, listaPrecio, cartItems, onAdd, onUpdate }) {
  const product = promo.productos
  const [imgFailed, setImgFailed] = useState(false)
  const [imgSrc, setImgSrc]       = useState(product?.imagen_url ?? null)

  const basePrice      = product ? getPrecioBase(product, listaPrecio) : null
  const effectivePrice = basePrice != null ? calcEffectivePrice(promo, basePrice) : null
  const hasDiscount    = effectivePrice != null && basePrice != null && Math.round(effectivePrice) < Math.round(basePrice)
  const addQty         = calcAddQty(promo)
  const badge          = promoBadge(promo)

  const key      = `${product?.id}-base-unidad`
  const cartItem = cartItems.find(i => i.key === key)

  function handleAdd() {
    if (!product || effectivePrice == null) return
    if (promo.tipo_promo === 'nxm' && promo.promo_n && promo.promo_m) {
      // Precio BASE + metadatos: calcItemTotal aplica la lógica por grupos
      onAdd(product, addQty, null, badge, basePrice, 'unidad',
        { promoN: promo.promo_n, promoM: promo.promo_m })
    } else if (promo.tipo_promo === 'cantidad_minima' && promo.qty_minima && promo.descuento_porcentaje) {
      // Precio BASE + mínimo + descuento: calcItemTotal aplica según qty >= mínimo
      onAdd(product, addQty, null, badge, basePrice, 'unidad',
        { promoQtyMin: promo.qty_minima, promoDesc: promo.descuento_porcentaje })
    } else {
      onAdd(product, addQty, null, badge, effectivePrice, 'unidad')
    }
  }

  if (!product || effectivePrice == null) return null

  return (
    <div
      className="snap-start flex-none rounded-2xl overflow-hidden shadow-panel bg-negro flex"
      style={{ width: 'min(78vw, 264px)', height: '152px' }}
    >
      {/* Left: text content */}
      <div className="flex flex-col justify-between p-3 flex-1 min-w-0">

        {/* Promo badge */}
        <span className="inline-flex items-center gap-1 bg-amarillo text-negro text-[0.6rem] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full self-start">
          <Zap size={8} /> {badge}
        </span>

        {/* Name + text + price + cart */}
        <div>
          <div className="font-bold text-white text-[0.8rem] leading-snug line-clamp-2">{product.nombre}</div>
          {promo.texto && (
            <div className="text-[0.65rem] text-white/60 mt-0.5 line-clamp-1">{promo.texto}</div>
          )}
          <div className="flex items-center justify-between mt-1.5 gap-1.5">
            {/* Prices */}
            <div className="flex flex-col leading-none">
              {hasDiscount && (
                <span className="text-[0.62rem] text-white/45 line-through">{formatPrice(basePrice)}</span>
              )}
              <span className="font-display font-extrabold text-amarillo text-[0.95rem] leading-tight">
                {formatPrice(effectivePrice)}
              </span>
              {promo.tipo_promo === 'nxm' && (
                <span className="text-[0.58rem] text-white/45 mt-0.5">c/u en grupo de {promo.promo_n}</span>
              )}
            </div>

            {/* Cart controls */}
            {cartItem ? (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onUpdate(key, cartItem.qty - 1)}
                  className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/40 text-white flex items-center justify-center transition-colors"
                >
                  <Minus size={10} />
                </button>
                <span className="font-display font-extrabold text-sm text-white min-w-[16px] text-center">{cartItem.qty}</span>
                <button
                  onClick={() => onUpdate(key, cartItem.qty + 1)}
                  className="w-6 h-6 rounded-full bg-amarillo hover:bg-amarillo/80 text-negro flex items-center justify-center transition-colors"
                >
                  <Plus size={10} />
                </button>
              </div>
            ) : (
              <button
                onClick={handleAdd}
                className="shrink-0 bg-amarillo text-negro hover:bg-amarillo/80 rounded-lg px-2 py-1 text-[0.67rem] font-extrabold transition-colors whitespace-nowrap"
              >
                {addQty > 1 ? `+${addQty}u.` : '+ Agregar'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right: product image — same height as card, with padding */}
      <div className="shrink-0 p-2 pl-1" style={{ width: '100px' }}>
        <div className="w-full h-full rounded-xl overflow-hidden bg-white/8">
          {imgSrc && !imgFailed ? (
            <img
              src={imgSrc}
              alt={product.nombre}
              className="w-full h-full object-cover"
              onError={() => {
                if (imgSrc.includes('front_es.400.jpg')) {
                  setImgSrc(imgSrc.replace('front_es.400.jpg', 'front.400.jpg'))
                } else {
                  setImgFailed(true)
                }
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl opacity-30">📦</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── ProductCard ──────────────────────────────────────────────────────────────
function ProductCard({ product, listaPrecio, cartItems, onAdd, onUpdate }) {
  const [selectedVariant, setSelectedVariant] = useState(product.variantes_producto?.[0] ?? null)
  const [presentacion, setPresentacion]       = useState('unidad')
  const [imgSrc, setImgSrc]   = useState(product.imagen_url ?? null)
  const [imgFailed, setImgFailed] = useState(false)

  // Reset presentation when variant changes (pack/pallet may not be available on new variant)
  function handleVariantChange(varId) {
    const v = product.variantes_producto.find(v => v.id === varId)
    setSelectedVariant(v ?? null)
    setPresentacion('unidad')
  }

  const showPack        = hasPack(product, selectedVariant)
  const showPallet      = hasPallet(product, selectedVariant)
  const hasMultiplePres = showPack || showPallet

  // Units per presentation (how many individual units come in one pack/pallet)
  const unidadesPres = presentacion === 'pack'
    ? (product.unidades_pack ?? null)
    : presentacion === 'pallet'
    ? (product.unidades_pallet ?? null)
    : null

  // Key includes presentation so cart can hold e.g. "pack" and "unidad" separately
  const key      = `${product.id}-${selectedVariant?.id ?? 'base'}-${presentacion}`
  const cartItem = cartItems.find(i => i.key === key)

  // displayPrice = unit price for this presentation tier
  const displayPrice = getPrecioByPresentation(product, selectedVariant, listaPrecio, presentacion)
  // totalPrice = what goes into the cart (unit price × units in the pack/pallet)
  const totalPrice   = (unidadesPres && displayPrice != null) ? displayPrice * unidadesPres : displayPrice
  const catColor     = CATEGORY_COLORS[product.categorias?.nombre]

  function handleAdd() {
    const presUnits = unidadesPres ? ` · ${unidadesPres} u.` : ''
    const presLabel = presentacion !== 'unidad' ? `${PRES_LABELS[presentacion]}${presUnits}` : ''
    const varLabel  = selectedVariant?.valor ?? ''
    const label     = [varLabel, presLabel].filter(Boolean).join(' · ')
    // price stored in cart = total pack/pallet price so cart math is correct
    onAdd(product, 1, selectedVariant?.id ?? null, label || varLabel, totalPrice, presentacion)
  }

  if (displayPrice == null) return null // product has no valid price

  return (
    <div
      className="bg-white rounded-xl shadow-card flex overflow-hidden animate-card-reveal min-h-[96px]"
      style={{ borderLeft: `3px solid ${catColor ?? 'var(--amarillo)'}` }}
    >
      {/* Imagen — 96px ancho × alto completo del card (mínimo cuadrado 3:3) */}
      <div className="relative w-[96px] shrink-0 self-stretch bg-cream-dark">
        {imgSrc && !imgFailed ? (
          <img
            src={imgSrc}
            alt={product.nombre}
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => {
              if (imgSrc.includes('front_es.400.jpg')) {
                setImgSrc(imgSrc.replace('front_es.400.jpg', 'front.400.jpg'))
              } else {
                setImgFailed(true)
              }
            }}
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-4xl"
            style={{ background: catColor ? `${catColor}20` : undefined }}
          >
            {CATEGORY_ICONS[product.categorias?.nombre] ?? '📦'}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 px-3 py-3">
        <div className="font-bold text-sm text-negro leading-snug">{product.nombre}</div>
        {product.descripcion && (
          <div className="text-[0.72rem] text-muted-foreground mt-0.5 line-clamp-1">{product.descripcion}</div>
        )}

        {/* Variant selector */}
        {product.variantes_producto?.length > 1 && (
          <select
            className="mt-1.5 h-7 w-full rounded-md border border-input bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            value={selectedVariant?.id ?? ''}
            onChange={e => handleVariantChange(e.target.value)}
          >
            {product.variantes_producto.map(v => (
              <option key={v.id} value={v.id}>{v.valor}</option>
            ))}
          </select>
        )}

        {/* Presentation selector (Unidad / Pack / Pallet) */}
        {hasMultiplePres && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {['unidad', ...(showPack ? ['pack'] : []), ...(showPallet ? ['pallet'] : [])].map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPresentacion(p)}
                className={cn(
                  'px-2.5 py-0.5 rounded-full text-[0.68rem] font-semibold border transition-colors',
                  presentacion === p
                    ? 'bg-negro text-white border-negro'
                    : 'bg-white text-negro border-border hover:border-negro/50'
                )}
              >
                {PRES_LABELS[p]}
              </button>
            ))}
          </div>
        )}

        {/* Price */}
        <div className="mt-1.5 flex items-baseline gap-1.5 flex-wrap">
          <span className="font-display font-bold text-amarillo text-base leading-none">
            {formatPrice(displayPrice)}
          </span>
          {unidadesPres && unidadesPres > 1 && (
            <span className="text-[0.7rem] text-muted-foreground">
              ×{unidadesPres} u. <strong className="text-negro">{formatPrice(totalPrice)}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col justify-end shrink-0 px-3 py-3">
        {cartItem ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onUpdate(key, cartItem.qty - 1)}
              className="w-7 h-7 rounded-full bg-cream-dark hover:bg-negro hover:text-white text-negro flex items-center justify-center transition-colors"
            >
              <Minus size={12} />
            </button>
            <span className="font-display font-extrabold text-sm min-w-[22px] text-center">{cartItem.qty}</span>
            <button
              onClick={() => onUpdate(key, cartItem.qty + 1)}
              className="w-7 h-7 rounded-full bg-cream-dark hover:bg-negro hover:text-white text-negro flex items-center justify-center transition-colors"
            >
              <Plus size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={handleAdd}
            className="bg-amarillo text-negro hover:bg-amarillo/90 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap"
          >
            + Agregar
          </button>
        )}
      </div>
    </div>
  )
}

export default function Catalog() {
  const { user } = useAuth()
  const [products, setProducts]             = useState([])
  const [categories, setCategories]         = useState([])
  const [promos, setPromos]                 = useState([])
  const [loading, setLoading]               = useState(true)
  const [search, setSearch]                 = useState('')
  const [activeCategory, setActiveCategory] = useState('Todos')
  const [listaPrecio, setListaPrecio]       = useState('minorista')
  const { items, addItem, updateQty }       = useCart()

  useEffect(() => {
    async function load() {
      // Step 1: load catalog + client data in parallel
      const [{ data: prods }, { data: cats }, { data: cliente }] = await Promise.all([
        supabase
          .from('productos')
          .select('*, categorias(nombre), variantes_producto(*)')
          .eq('activo', true)
          .order('nombre'),
        supabase
          .from('categorias')
          .select('id, nombre')
          .is('parent_id', null)
          .order('nombre'),
        supabase
          .from('clientes')
          .select('lista_precios')
          .eq('user_id', user.id)
          .single(),
      ])
      setProducts(prods ?? [])
      setCategories(cats ?? [])
      if (cliente?.lista_precios) setListaPrecio(cliente.lista_precios)

      // Step 2: load promos separately (two-step to avoid FK-join cache issues)
      const { data: promoRows } = await supabase
        .from('promociones')
        .select('id, texto, orden, listas_precios, producto_id, tipo_promo, descuento_porcentaje, precio_promo, promo_n, promo_m, qty_minima')
        .eq('activo', true)
        .order('orden')

      if (promoRows?.length) {
        const ids = [...new Set(promoRows.map(p => p.producto_id))]
        const { data: promoProds } = await supabase
          .from('productos')
          .select('id, nombre, precio, precio_mediano, precio_mayorista, imagen_url, unidad')
          .in('id', ids)
        const prodMap = Object.fromEntries((promoProds ?? []).map(p => [p.id, p]))
        setPromos(promoRows.map(p => ({ ...p, productos: prodMap[p.producto_id] ?? null })))
      }

      setLoading(false)
    }
    load()
  }, [user.id])

  const filtered = useMemo(() => {
    return products.filter(p => {
      const matchCat    = activeCategory === 'Todos' || p.categorias?.nombre === activeCategory
      const matchSearch = !search ||
        p.nombre.toLowerCase().includes(search.toLowerCase()) ||
        p.codigo_interno?.toLowerCase().includes(search.toLowerCase())
      return matchCat && matchSearch
    })
  }, [products, activeCategory, search])

  // Only show promos targeted at the client's price list
  const visiblePromos = useMemo(() =>
    promos.filter(p => !p.listas_precios?.length || p.listas_precios.includes(listaPrecio)),
    [promos, listaPrecio]
  )

  if (loading) {
    return (
      <>
        <ClientNavbar />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-amarillo" />
        </div>
      </>
    )
  }

  return (
    <>
      <ClientNavbar />

      {/* Price list banner */}
      {LISTA_LABELS[listaPrecio] && (
        <div className="bg-azul-cl border-b border-azul/20 text-azul text-center text-[0.72rem] font-semibold py-1.5 px-4">
          Lista de precios: <strong>{LISTA_LABELS[listaPrecio]}</strong>
        </div>
      )}

      {/* Search bar — sticky below navbar */}
      <div className="sticky top-14 z-[90] bg-cream border-b border-border px-4 py-2">
        <div className="max-w-[600px] mx-auto relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            className="w-full h-9 rounded-lg border border-input bg-white pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Buscar producto o código..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Category tabs — sticky below search */}
      <div className="sticky top-[calc(3.5rem+52px)] z-[80] bg-cream border-b border-border">
        <div className="flex gap-1.5 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-w-[600px] mx-auto">
          {['Todos', ...categories.map(c => c.nombre)].map(cat => {
            const isActive = activeCategory === cat
            const color    = CATEGORY_COLORS[cat]
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  'shrink-0 px-3 py-1 rounded-full text-[0.72rem] font-semibold border transition-colors whitespace-nowrap',
                  isActive
                    ? 'text-white border-transparent'
                    : 'bg-white text-negro border-border hover:border-negro/40'
                )}
                style={isActive && color ? { background: color, borderColor: color } : {}}
              >
                {CATEGORY_ICONS[cat] ? `${CATEGORY_ICONS[cat]} ` : ''}{cat}
              </button>
            )
          })}
        </div>
      </div>

      {/* Promo slider */}
      {visiblePromos.length > 0 && (
        <div className="max-w-[600px] mx-auto pt-3.5 pb-1">
          <div className="flex items-center gap-1.5 px-4 mb-2">
            <Zap size={13} className="text-amarillo" />
            <span className="text-[0.72rem] font-extrabold uppercase tracking-widest text-negro/60">Destacados</span>
          </div>
          <div className="flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {visiblePromos.map(promo => (
              <PromoCard
                key={promo.id}
                promo={promo}
                listaPrecio={listaPrecio}
                cartItems={items}
                onAdd={addItem}
                onUpdate={updateQty}
              />
            ))}
          </div>
        </div>
      )}

      {/* Product list */}
      <div className="max-w-[600px] mx-auto px-4 pt-4 pb-28">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🔍</div>
            <p className="font-bold text-lg mb-1.5">Sin resultados</p>
            <p className="text-sm text-muted-foreground">Probá con otro término o cambiá de categoría.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                listaPrecio={listaPrecio}
                cartItems={items}
                onAdd={addItem}
                onUpdate={updateQty}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
