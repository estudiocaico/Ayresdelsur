// Re-exports from CartContext so existing imports keep working.
// All cart state now lives in <CartProvider> (shared across all components).
export { useCart, calcItemTotal } from '../contexts/CartContext'
