// Re-exports useCart from CartContext so existing imports keep working.
// All cart state now lives in <CartProvider> (shared across all components).
export { useCart } from '../contexts/CartContext'
