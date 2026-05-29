import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useAuth } from './AuthContext'

const CartContext = createContext(null)
const CART_KEY = 'ads_cart_'

/**
 * Calcula el total de un ítem del carrito aplicando la lógica de promo si corresponde.
 *
 * NxM: cada grupo de N unidades paga M. Unidades fuera de un grupo completo
 *   pagan el precio base.  Ej: 4u de un 3x2 → 1 grupo (paga 2) + 1 suelta = 3× precio.
 *
 * Cantidad mínima: si qty >= promoQtyMin todas las unidades obtienen el descuento;
 *   si qty < promoQtyMin se cobra el precio base completo.
 */
export function calcItemTotal(item) {
  // ── NxM ──────────────────────────────────────────────────────────────────
  if (item.promoN && item.promoM && item.qty > 0) {
    const groups    = Math.floor(item.qty / item.promoN)
    const remainder = item.qty % item.promoN
    return (groups * item.promoM + remainder) * item.price
  }
  // ── Cantidad mínima ───────────────────────────────────────────────────────
  if (item.promoQtyMin && item.promoDesc != null && item.qty > 0) {
    const unitPrice = item.qty >= item.promoQtyMin
      ? item.price * (1 - item.promoDesc / 100)
      : item.price
    return unitPrice * item.qty
  }
  return item.price * item.qty
}

export function CartProvider({ children }) {
  const { user } = useAuth()
  const storageKey = CART_KEY + (user?.id ?? 'guest')

  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') ?? []
    } catch { return [] }
  })

  const [toast, setToast] = useState(null) // { message, exiting, id }
  const timerRef  = useRef(null)
  const itemsRef  = useRef(items)

  useEffect(() => { itemsRef.current = items }, [items])

  // Persist to sessionStorage whenever items change
  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(items))
  }, [items, storageKey])

  // Re-hydrate when user switches (storageKey changes)
  useEffect(() => {
    try {
      setItems(JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') ?? [])
    } catch { setItems([]) }
  }, [storageKey])

  /* ── Toast ──────────────────────────────────────────────────── */
  function showToast(message) {
    if (timerRef.current) clearTimeout(timerRef.current)
    // id único en cada llamada → React remonta el nodo → animación reinicia siempre
    setToast({ message, exiting: false, id: Date.now() })
    timerRef.current = setTimeout(() => {
      setToast(t => t ? { ...t, exiting: true } : null)
      setTimeout(() => setToast(null), 380)
    }, 2600)
  }

  /* ── Cart operations ────────────────────────────────────────── */
  // presentacion: 'unidad' | 'pack' | 'pallet'  — included in key so each
  // presentation is an independent cart line (e.g. 1 unidad + 1 pack = 2 lines)
  // promoMeta: { promoN, promoM } para promociones NxM — el price debe ser el precio
  // base (sin dividir por N) para que calcItemTotal pueda aplicar la lógica correcta.
  function addItem(product, qty = 1, variantId = null, variantLabel = '', price = null, presentacion = 'unidad', promoMeta = null) {
    const effectivePrice = price !== null ? price : product.precio
    const key = `${product.id}-${variantId ?? 'base'}-${presentacion}`

    // Read current qty from ref so toast shows correct number
    const existing = itemsRef.current.find(i => i.key === key)
    const newQty   = (existing?.qty ?? 0) + qty

    setItems(prev => {
      if (existing) {
        return prev.map(i => i.key === key ? { ...i, qty: i.qty + qty } : i)
      }
      return [...prev, {
        key,
        productId:    product.id,
        name:         product.nombre,
        description:  product.descripcion,
        price:        effectivePrice,
        variantId,
        variantLabel,
        presentacion,
        qty,
        unit:         product.unidad,
        categoryName: product.categorias?.nombre ?? null,
        promoN:       promoMeta?.promoN      ?? null,
        promoM:       promoMeta?.promoM      ?? null,
        promoQtyMin:  promoMeta?.promoQtyMin ?? null,
        promoDesc:    promoMeta?.promoDesc   ?? null,
      }]
    })

    const label = variantLabel
      ? `${product.nombre} · ${variantLabel}`
      : product.nombre
    showToast(`${newQty}× ${label}`)
  }

  function updateQty(key, qty) {
    if (qty <= 0) { removeItem(key); return }
    setItems(prev => prev.map(i => i.key === key ? { ...i, qty } : i))
    const item = itemsRef.current.find(i => i.key === key)
    if (item) {
      const label = item.variantLabel ? `${item.name} · ${item.variantLabel}` : item.name
      showToast(`${qty}× ${label}`)
    }
  }

  function removeItem(key) {
    setItems(prev => prev.filter(i => i.key !== key))
  }

  function clearCart() {
    setItems([])
  }

  const total     = items.reduce((s, i) => s + calcItemTotal(i), 0)
  const itemCount = items.reduce((s, i) => s + i.qty, 0)

  return (
    <CartContext.Provider value={{ items, total, itemCount, addItem, updateQty, removeItem, clearCart }}>
      {children}

      {/* ── Toast notification ──────────────────────────── */}
      {toast && (
        <div
          key={toast.id}
          className={`fixed bottom-8 left-1/2 z-[300] flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-negro text-white text-sm font-semibold shadow-lg max-w-[calc(100vw-2rem)] ${toast.exiting ? 'animate-toast-out' : 'animate-toast-in'}`}
          role="status"
          aria-live="polite"
        >
          🛒 <span className="truncate">{toast.message} en tu carrito</span>
        </div>
      )}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}
