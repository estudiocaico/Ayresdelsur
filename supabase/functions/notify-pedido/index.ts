// Supabase Edge Function — notifica nuevo prepedido por WhatsApp via Callmebot
// Desplegar con: supabase functions deploy notify-pedido
//
// Callmebot: servicio gratuito de notificaciones WhatsApp.
// Configuración por número (una sola vez):
//   1. Guardar +34 644 59 71 79 como contacto "CallMeBot"
//   2. Enviar "I allow callmebot to send me messages" al contacto
//   3. Recibirás tu API key por WhatsApp
//   4. Ingresar número + API key en Panel Admin > Configuración

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

interface Destino {
  numero: string   // ej: "5491123456789"  (sin +)
  apikey: string   // API key de Callmebot
}

interface Payload {
  destinos: Destino[]
  mensaje:  string
}

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { destinos, mensaje } = (await req.json()) as Payload

    if (!destinos?.length || !mensaje) {
      return new Response(JSON.stringify({ error: 'destinos y mensaje son requeridos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results = await Promise.allSettled(
      destinos.map(async ({ numero, apikey }) => {
        const url = `https://api.callmebot.com/whatsapp.php?` +
          `phone=${encodeURIComponent(numero)}&` +
          `text=${encodeURIComponent(mensaje)}&` +
          `apikey=${encodeURIComponent(apikey)}`

        const res = await fetch(url, { method: 'GET' })
        const text = await res.text()
        return { numero, ok: res.ok, status: res.status, body: text }
      })
    )

    const summary = results.map(r =>
      r.status === 'fulfilled' ? r.value : { error: r.reason?.message ?? 'unknown' }
    )

    return new Response(JSON.stringify({ ok: true, results: summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
