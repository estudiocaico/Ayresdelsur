import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useVendedor } from './VendedorLayout'
import {
  Loader2, ArrowLeft, ChevronDown, ChevronUp,
  Plus, Minus, Trash2, Check, Search,
} from 'lucide-react'

// ── Helpers (misma lógica que NuevoPedido) ────────────────────────────────────

const CATEGORY_COLORS = {
  'Almacen': '#5B8C5A', 'Almacén': '#5B8C5A',
  'Bebidas': '#2E85C8',
  'Bebidas Alcoholicas': '#C4873A', 'Bebidas Alcohólicas': '#C4873A',
  'Lacteos': '#2E85C8', 'Lácteos': '#2E85C8',
  'Limpieza': '#5B7FA6', 'Snacks': '#C4873A', 'Vinos': '#7B3F6E',
}

function formatPrice(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0)
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
  return product.precio ?? null
}

function promoBadge(promo) {
  if (!promo) return null
  switch (promo.tipo_promo) {
    case 'nxm':                  return `${promo.promo_n}×${promo.promo_m}`
    case 'descuento_porcentual': return `${promo.descuento_porcentaje}% OFF`
    case 'precio_especial':      return 'OFERTA'
    case 'cantidad_minima':      return `${promo.descuento_porcentaje}% OFF`
    default:                     return null
  }
}

function calcEffectivePrice(promo, basePrice) {
  if (!promo) return basePrice
  switch (promo.tipo_promo) {
    case 'nxm':                  return basePrice
    case 'descuento_porcentual': return basePrice * (1 - (promo.descuento_porcentaje ?? 0) / 100)
    case 'precio_especial':      return promo.precio_especial ?? basePrice
    case 'cantidad_minima':      return basePrice
    default:                     return basePrice
  }
}

function calcAddQty(promo) {
  if (!promo) return 1
  if (promo.tipo_promo === 'nxm') return promo.promo_n ?? 1
  if (promo.tipo_promo === 'cantidad_minima') return promo.qty_minima ?? 1
  return 1
}

function calcItemSubtotal(item) {
  const { qty, basePrice, price, promoType, promoN, promoM, promoQtyMin, promoDesc } = item
  if (promoType === 'nxm' && promoN && promoM) {
    const groups    = Math.floor(qty / promoN)
    const remainder = qty % promoN
    return groups * promoM * basePrice + remainder * basePrice
  }
  if (promoType === 'cantidad_minima' && promoQtyMin && promoDesc != null) {
    const effPrice = qty >= promoQtyMin ? basePrice * (1 - promoDesc / 100) : basePrice
    return effPrice * qty
  }
  return price * qty
}

function calcTotal(cart) {
  return cart.reduce((sum, item) => sum + calcItemSubtotal(item), 0)
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function EditarPedido() {
  const { id }      = useParams()
  const navigate    = useNavigate()
  const { vendedor } = useVendedor()

  const [pedido,      setPedido]      = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [error,       setError]       = useState('')

  // Carrito
  const [cart,        setCart]        = useState([])

  // Catálogo
  const [products,    setProducts]    = useState([])
  const [promoMap,    setPromoMap]    = useState({})  // { productId: [promo, ...] }
  const [lista,       setLista]       = useState('normal')
  const [search,      setSearch]      = useState('')
  const [expandedId,  setExpandedId]  = useState(null)

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    const [{ data: ped }, { data: prods }, { data: promos }] = await Promise.all([
      supabase.from('prepedidos').select(`
        id, numero_referencia, total, estado, cliente_id,
        clientes(id, nombre_negocio, precio_lista),
        items_prepedido(
          id, cantidad, precio_unitario, subtotal, presentacion, promo_label, precio_base,
          productos(
            id, nombre, codigo_interno, unidad,
            precio, precio_mayorista, precio_mediano,
            precio_pack, precio_pack_mayorista, precio_pack_mediano,
            precio_pallet, precio_pallet_mayorista, precio_pallet_mediano,
            unidades_pack, unidades_pallet, imagen_url, categorias(nombre)
          )
        )
      `).eq('id', id).single(),
      supabase.from('productos')
        .select(`
          id, codigo_interno, nombre, descripcion, activo,
          precio, precio_mayorista, precio_mediano,
          precio_pack, precio_pack_mayorista, precio_pack_mediano,
          precio_pallet, precio_pallet_mayorista, precio_pallet_mediano,
          unidades_pack, unidades_pallet, imagen_url,
          stock_activo, stock_cantidad, stock_umbral_bajo,
          categorias(id, nombre)
        `)
        .eq('activo', true).order('nombre'),
      supabase.from('promociones').select('*').eq('activo', true),
    ])

    if (!ped) { setLoading(false); return }

    const clienteLista = ped.clientes?.precio_lista ?? 'normal'
    setLista(clienteLista)
    setPedido(ped)
    setProducts(prods ?? [])

    // promoMap: { productId: [promo, ...] }
    const pm = {}
    for (const promo of (promos ?? [])) {
      if (!pm[promo.producto_id]) pm[promo.producto_id] = []
      pm[promo.producto_id].push(promo)
    }
    setPromoMap(pm)

    // Reconstruir carrito desde items existentes en DB
    const reconstructed = (ped.items_prepedido ?? []).map(item => {
      const prod = item.productos
      if (!prod) return null

      const bestPromo = (pm[prod.id] ?? []).find(p => !p.presentacion || p.presentacion === item.presentacion) ?? null
      const basePrice = item.precio_base ?? item.precio_unitario

      return {
        key:            `${prod.id}-${item.presentacion}`,
        productId:      prod.id,
        name:           prod.nombre,
        code:           prod.codigo_interno,
        presentacion:   item.presentacion,
        basePrice,
        price:          basePrice,
        qty:            item.cantidad,
        promoType:      bestPromo?.tipo_promo      ?? null,
        promoN:         bestPromo?.promo_n         ?? null,
        promoM:         bestPromo?.promo_m         ?? null,
        promoQtyMin:    bestPromo?.qty_minima      ?? null,
        promoDesc:      bestPromo?.descuento_porcentaje ?? null,
        promoBadgeLabel: item.promo_label ?? (bestPromo ? promoBadge(bestPromo) : null),
      }
    }).filter(Boolean)

    setCart(reconstructed)
    setLoading(false)
  }

  // ── Helpers de carrito ────────────────────────────────────────────────────────

  function getBestPromo(productId, presentacion) {
    return (promoMap[productId] ?? []).find(p => !p.presentacion || p.presentacion === presentacion) ?? null
  }

  function getQty(productId, presentacion) {
    return cart.find(i => i.key === `${productId}-${presentacion}`)?.qty ?? 0
  }

  function changeQty(key, newQty) {
    if (newQty <= 0) setCart(prev => prev.filter(i => i.key !== key))
    else             setCart(prev => prev.map(i => i.key === key ? { ...i, qty: newQty } : i))
  }

  function addFromCatalog(product, presentacion, qty) {
    const key       = `${product.id}-${presentacion}`
    const basePrice = getPrecio(product, presentacion, lista)
    if (basePrice == null) return

    const promo = getBestPromo(product.id, presentacion)
    let price = basePrice
    let promoType = null, promoN = null, promoM = null
    let promoQtyMin = null, promoDesc = null, promoBadgeLabel = null

    if (promo) {
      promoType       = promo.tipo_promo
      promoBadgeLabel = promoBadge(promo)
      if (promo.tipo_promo === 'nxm') {
        promoN = promo.promo_n; promoM = promo.promo_m
      } else if (promo.tipo_promo !== 'cantidad_minima') {
        price = calcEffectivePrice(promo, basePrice)
      } else {
        promoQtyMin = promo.qty_minima; promoDesc = promo.descuento_porcentaje
      }
    }

    setCart(prev => {
      const existing = prev.find(i => i.key === key)
      if (existing) return prev.map(i => i.key === key ? { ...i, qty: i.qty + qty } : i)
      return [...prev, {
        key, productId: product.id, name: product.nombre, code: product.codigo_interno,
        presentacion, basePrice, price, qty,
        promoType, promoN, promoM, promoQtyMin, promoDesc, promoBadgeLabel,
      }]
    })
  }

  // ── Guardar ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (cart.length === 0) { setError('El pedido no puede quedar vacío.'); return }
    setSaving(true); setError('')
    try {
      const total = calcTotal(cart)
      await supabase.from('items_prepedido').delete().eq('prepedido_id', id)
      await supabase.from('items_prepedido').insert(
        cart.map(i => {
          const subtotal = calcItemSubtotal(i)
          return {
            prepedido_id:    id,
            producto_id:     i.productId,
            variante_id:     null,
            cantidad:        i.qty,
            precio_unitario: subtotal / i.qty,
            subtotal,
            presentacion:    i.presentacion,
            promo_label:     i.promoBadgeLabel ?? null,
            precio_base:     i.promoType ? i.basePrice : null,
          }
        })
      )
      await supabase.from('prepedidos').update({ total }).eq('id', id)
      setSaved(true)
    } catch (err) {
      setError('Error al guardar. Intentá de nuevo.')
      console.error(err)
    } finally { setSaving(false) }
  }

  // ── Pantalla de éxito ─────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={28} className="animate-spin text-amarillo" />
    </div>
  )

  if (!pedido) return (
    <div className="px-4 py-12 text-center text-muted-foreground text-sm">
      Prepedido no encontrado.
    </div>
  )

  if (saved) return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-4">
        <Check size={28} className="text-green-600" />
      </div>
      <h2 className="font-display font-bold text-xl text-negro mb-1">Pedido actualizado</h2>
      <p className="text-sm text-muted-foreground mb-6">
        {pedido.numero_referencia} · {pedido.clientes?.nombre_negocio}
      </p>
      <button
        onClick={() => navigate('/vendedor')}
        className="px-6 py-2.5 bg-negro text-white rounded-xl font-bold text-sm"
      >
        Volver a mis visitas
      </button>
    </div>
  )

  // ── Render principal ──────────────────────────────────────────────────────────

  const total = calcTotal(cart)

  const visibleProducts = products.filter(p => {
    if (p.stock_activo && p.stock_cantidad === 0) return false
    if (!search) return true
    return p.nombre.toLowerCase().includes(search.toLowerCase()) ||
      (p.codigo_interno ?? '').toLowerCase().includes(search.toLowerCase())
  })

  return (
    <>
      <div className="px-4 pt-4 pb-40 max-w-[520px] mx-auto">

        {/* Header */}
        <button
          onClick={() => navigate('/vendedor')}
          className="flex items-center gap-1 text-muted-foreground text-sm mb-3 -ml-1"
        >
          <ArrowLeft size={15} /> Mis visitas
        </button>
        <h2 className="font-display text-xl font-bold text-negro leading-tight">Editar pedido</h2>
        <p className="text-sm text-muted-foreground mb-5">
          {pedido.numero_referencia} · {pedido.clientes?.nombre_negocio}
        </p>

        {/* ── Sección 1: Productos actuales ────────────────────────── */}
        <p className="text-[0.68rem] font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Productos en el pedido
        </p>

        <div className="bg-white rounded-xl shadow-card overflow-hidden mb-6">
          {cart.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6 px-4">
              Sin productos. Agregá desde el catálogo.
            </p>
          ) : (
            cart.map((item, idx) => (
              <div
                key={item.key}
                className={`flex items-center gap-2 px-4 py-3 ${idx < cart.length - 1 ? 'border-b border-cream-dark' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-negro leading-snug truncate">{item.name}</p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    {item.presentacion !== 'unidad' && (
                      <span className="text-[0.62rem] font-bold text-muted-foreground uppercase">{item.presentacion}</span>
                    )}
                    {item.promoBadgeLabel && (
                      <span className="text-[0.58rem] font-extrabold uppercase bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full border border-orange-200">
                        {item.promoBadgeLabel}
                      </span>
                    )}
                  </div>
                </div>

                {/* Controles de cantidad */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => changeQty(item.key, item.qty - 1)}
                    className="w-7 h-7 rounded-lg bg-cream-dark flex items-center justify-center hover:bg-cream transition-colors"
                  >
                    {item.qty === 1
                      ? <Trash2 size={12} className="text-red-500" />
                      : <Minus  size={12} />}
                  </button>
                  <span className="w-7 text-center font-bold text-sm tabular-nums">{item.qty}</span>
                  <button
                    onClick={() => changeQty(item.key, item.qty + 1)}
                    className="w-7 h-7 rounded-lg bg-cream-dark flex items-center justify-center hover:bg-cream transition-colors"
                  >
                    <Plus size={12} />
                  </button>
                </div>

                <span className="font-bold text-sm text-negro shrink-0 w-20 text-right tabular-nums">
                  {formatPrice(calcItemSubtotal(item))}
                </span>
              </div>
            ))
          )}
        </div>

        {/* ── Sección 2: Catálogo ──────────────────────────────────── */}
        <p className="text-[0.68rem] font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Agregar productos
        </p>

        {/* Búsqueda */}
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Buscar producto o código..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-9 pl-8 pr-3 rounded-xl border border-cream-dark bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amarillo/30"
          />
        </div>

        {/* Acordeón de productos */}
        <div className="flex flex-col gap-2">
          {visibleProducts.map(product => {
            const isOpen      = expandedId === product.id
            const catName     = product.categorias?.nombre ?? ''
            const catColor    = CATEGORY_COLORS[catName] ?? '#888888'
            const bestPromo   = getBestPromo(product.id, 'unidad')
            const hasInCart   = cart.some(i => i.productId === product.id)
            const stockMax    = product.stock_activo && product.stock_cantidad != null ? product.stock_cantidad : null
            const stockBajo   = product.stock_activo && product.stock_cantidad != null && product.stock_cantidad > 0
              && product.stock_cantidad <= (product.stock_umbral_bajo ?? 0)
            const totalCartQtyForProd = cart.filter(i => i.productId === product.id).reduce((s, i) => s + i.qty, 0)

            const presentations = [
              { pres: 'unidad',  label: 'Unidad' },
              product.precio_pack   != null ? { pres: 'pack',   label: `Pack ×${product.unidades_pack   ?? '?'}` } : null,
              product.precio_pallet != null ? { pres: 'pallet', label: `Pallet ×${product.unidades_pallet ?? '?'}` } : null,
            ].filter(Boolean)

            return (
              <div
                key={product.id}
                className="bg-white rounded-xl shadow-card overflow-hidden"
                style={{ borderLeft: `3px solid ${catColor}` }}
              >
                {/* Cabecera del producto */}
                <button
                  className="w-full flex items-center gap-3 px-3 py-3 text-left"
                  onClick={() => setExpandedId(isOpen ? null : product.id)}
                >
                  {product.imagen_url
                    ? <img src={product.imagen_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0 bg-cream-dark" />
                    : <div className="w-9 h-9 rounded-lg shrink-0" style={{ background: `${catColor}25` }} />
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-semibold text-sm text-negro leading-snug truncate">{product.nombre}</p>
                      {product.stock_activo && product.stock_cantidad != null && (
                        <span className={`text-[0.58rem] font-bold px-1.5 py-0.5 rounded-full border ${
                          stockBajo
                            ? 'bg-orange-100 text-orange-700 border-orange-200'
                            : 'bg-green-50 text-green-700 border-green-200'
                        }`}>
                          Stock: {product.stock_cantidad} u.
                        </span>
                      )}
                    </div>
                    {product.codigo_interno && (
                      <p className="text-[0.7rem] text-muted-foreground">{product.codigo_interno}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {bestPromo && (
                      <span className="bg-orange-100 text-orange-700 text-[0.58rem] font-extrabold uppercase px-1.5 py-0.5 rounded-full border border-orange-200">
                        {promoBadge(bestPromo)}
                      </span>
                    )}
                    {hasInCart && <span className="w-2 h-2 rounded-full bg-amarillo shrink-0" />}
                    {isOpen
                      ? <ChevronUp   size={15} className="text-muted-foreground" />
                      : <ChevronDown size={15} className="text-muted-foreground" />}
                  </div>
                </button>

                {/* Presentaciones */}
                {isOpen && (
                  <div className="border-t border-cream-dark divide-y divide-cream-dark">
                    {presentations.map(({ pres, label }) => {
                      const promo   = getBestPromo(product.id, pres)
                      const baseP   = getPrecio(product, pres, lista)
                      if (baseP == null) return null
                      const effP    = promo ? calcEffectivePrice(promo, baseP) : baseP
                      const hasDisc = promo && Math.round(effP) < Math.round(baseP)
                      const qty     = getQty(product.id, pres)
                      const addStep = promo ? calcAddQty(promo) : 1
                      const badge   = promo ? promoBadge(promo) : null

                      return (
                        <div key={pres} className="flex items-center gap-2 px-3 py-2.5">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-semibold text-negro">{label}</span>
                              {badge && (
                                <span className="text-[0.58rem] font-extrabold uppercase bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full border border-orange-200">
                                  {badge}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {hasDisc && (
                                <span className="text-[0.68rem] text-muted-foreground line-through">{formatPrice(baseP)}</span>
                              )}
                              <span className={`text-[0.72rem] font-bold ${hasDisc ? 'text-green-700' : 'text-muted-foreground'}`}>
                                {formatPrice(effP)}
                              </span>
                            </div>
                          </div>

                          {qty > 0 ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => changeQty(`${product.id}-${pres}`, qty - 1)}
                                className="w-7 h-7 rounded-lg bg-cream-dark flex items-center justify-center"
                              >
                                {qty === 1 ? <Trash2 size={11} className="text-red-500" /> : <Minus size={11} />}
                              </button>
                              <span className="w-7 text-center font-bold text-sm tabular-nums">{qty}</span>
                              <button
                                onClick={() => {
                                  if (stockMax != null && totalCartQtyForProd >= stockMax) return
                                  addFromCatalog(product, pres, 1)
                                }}
                                disabled={stockMax != null && totalCartQtyForProd >= stockMax}
                                className="w-7 h-7 rounded-lg bg-amarillo flex items-center justify-center disabled:opacity-40"
                              >
                                <Plus size={11} className="text-negro" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                if (stockMax != null && totalCartQtyForProd >= stockMax) return
                                addFromCatalog(product, pres, addStep)
                              }}
                              disabled={stockMax != null && totalCartQtyForProd >= stockMax}
                              className="flex items-center gap-1 px-3 py-1.5 bg-negro text-white rounded-lg text-xs font-bold shrink-0 hover:bg-negro/90 transition-colors disabled:opacity-40"
                            >
                              <Plus size={11} /> Agregar
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {visibleProducts.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-10">
              Sin resultados para "{search}".
            </p>
          )}
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-600 font-semibold text-center">{error}</p>
        )}
      </div>

      {/* Barra sticky inferior */}
      <div className="fixed bottom-[60px] left-0 right-0 z-40 px-4 pb-2">
        <div className="bg-negro text-white rounded-xl shadow-panel-lg flex items-center gap-3 px-4 py-3 max-w-[520px] mx-auto">
          <div className="flex-1 min-w-0">
            <p className="text-[0.58rem] text-white/55 uppercase tracking-wider leading-none mb-0.5">Total estimado</p>
            <p className="font-display font-extrabold text-amarillo text-[1.25rem] leading-tight">{formatPrice(total)}</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || cart.length === 0}
            className="bg-amarillo text-negro font-extrabold text-sm px-5 py-2.5 rounded-lg hover:bg-amarillo/90 transition-colors disabled:opacity-50 flex items-center gap-2 shrink-0"
          >
            {saving
              ? <><Loader2 size={14} className="animate-spin" /> Guardando...</>
              : <><Check size={14} /> Guardar cambios</>}
          </button>
        </div>
      </div>
    </>
  )
}
