import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import ClientNavbar from '../../components/ClientNavbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

function formatPrice(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

export default function OrderConfirmed() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const [pedido, setPedido] = useState(null)

  useEffect(() => {
    supabase
      .from('prepedidos')
      .select(`
        numero_referencia, total, created_at,
        clientes(nombre_negocio),
        items_prepedido(
          cantidad, precio_unitario,
          productos(nombre),
          variantes_producto(valor)
        )
      `)
      .eq('id', id)
      .single()
      .then(({ data }) => { if (data) setPedido(data) })
  }, [id])

  const fecha = pedido
    ? new Date(pedido.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <>
      <ClientNavbar />

      <div className="max-w-[500px] mx-auto px-4 py-9 text-center">

        {/* Logo + animated checkmark */}
        <img src="/logo-circular.png" alt="Ayres del Sur" className="h-20 w-auto mx-auto mb-4" />

        <div className="w-[56px] h-[56px] mx-auto mb-4 text-green-600">
          <svg viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <circle
              cx="26" cy="26" r="25"
              stroke="currentColor" strokeWidth="2"
              className="animate-check-circle"
            />
            <path
              d="M14 27l8 8 16-16"
              stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
              className="animate-check-path"
            />
          </svg>
        </div>

        <h2 className="text-2xl font-extrabold text-negro mb-2">¡Prepedido enviado!</h2>
        <p className="text-muted-foreground text-sm leading-relaxed mb-6">
          Tu pedido fue recibido. El vendedor se comunicará con vos para cerrar la venta.
        </p>

        {pedido && (
          <Card className="text-left shadow-card rounded-[14px] mb-7">
            <CardContent className="pt-5 pb-5">
              {[
                { label: 'Número de pedido', value: <strong>{pedido.numero_referencia}</strong> },
                { label: 'Cliente', value: <strong>{pedido.clientes?.nombre_negocio}</strong> },
                { label: 'Total estimado', value: <strong className="text-amarillo font-display text-lg">{formatPrice(pedido.total)}</strong> },
                { label: 'Fecha', value: <span className="text-sm">{fecha}</span> },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-start py-2.5 border-b border-cream-dark last:border-none text-sm gap-3">
                  <span className="text-muted-foreground shrink-0 mr-3">{label}</span>
                  <span className="text-right">{value}</span>
                </div>
              ))}

              {pedido.items_prepedido?.length > 0 && (
                <div className="mt-3.5 border-t border-cream-dark pt-3 flex flex-col gap-1.5">
                  {pedido.items_prepedido.map((item, i) => {
                    const v = item.variantes_producto?.valor
                    return (
                      <div key={i} className="flex items-baseline gap-1.5 text-sm">
                        <span className="font-display font-bold text-amarillo shrink-0 min-w-[26px]">{item.cantidad}×</span>
                        <span className="flex-1 text-negro">
                          {item.productos?.nombre}{v ? ` · ${v}` : ''}
                        </span>
                        <span className="text-muted-foreground text-xs shrink-0">
                          {formatPrice(item.precio_unitario * item.cantidad)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Button
          onClick={() => navigate('/')}
          className="w-full h-12 bg-amarillo text-negro hover:bg-amarillo/90 font-bold text-base mb-3"
        >
          Volver al catálogo
        </Button>
        <Button
          variant="ghost"
          className="w-full text-muted-foreground text-sm"
          onClick={() => navigate('/mis-pedidos')}
        >
          Ver mis pedidos
        </Button>
      </div>
    </>
  )
}
