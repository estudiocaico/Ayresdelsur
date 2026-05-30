// Supabase Edge Function — envía notificaciones push Web Push a uno o todos los clientes.
//
// Uso:
//   supabase functions deploy send-push-notification
//
// Variables de entorno requeridas (Supabase Secrets):
//   VAPID_PUBLIC_KEY   → generada con: npx web-push generate-vapid-keys
//   VAPID_PRIVATE_KEY  → generada con: npx web-push generate-vapid-keys
//
// Payload esperado:
//   { cliente_id: string, title: string, body: string, url?: string }
//   { broadcast: true,    title: string, body: string, url?: string }  ← envía a todos

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// deno-lint-ignore-file no-explicit-any
import webpush from 'npm:web-push'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const vapidPublicKey  = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')

  if (!vapidPublicKey || !vapidPrivateKey) {
    return new Response(
      JSON.stringify({ error: 'VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY no están configuradas' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  webpush.setVapidDetails(
    'mailto:no-reply@ayresdelsur.com',
    vapidPublicKey,
    vapidPrivateKey,
  )

  try {
    const body = await req.json() as {
      cliente_id?: string
      broadcast?:  boolean
      title:       string
      body:        string
      url?:        string
    }

    if (!body.title || !body.body) {
      return new Response(
        JSON.stringify({ error: 'title y body son requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Obtener las suscripciones según el scope
    let subsQuery = supabase.from('push_subscriptions').select('id, subscription')
    if (!body.broadcast) {
      if (!body.cliente_id) {
        return new Response(
          JSON.stringify({ error: 'cliente_id o broadcast son requeridos' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      subsQuery = subsQuery.eq('cliente_id', body.cliente_id)
    }

    const { data: subs } = await subsQuery
    if (!subs?.length) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, reason: 'no_subscriptions' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const payload = JSON.stringify({ title: body.title, body: body.body, url: body.url ?? '/' })
    let sent = 0

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(sub.subscription, payload)
          // Actualizar last_used_at
          await supabase.from('push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', sub.id)
          sent++
        } catch (err: any) {
          const status = err?.statusCode ?? err?.status
          if (status === 410 || status === 404) {
            // Suscripción expirada o cancelada — limpiar
            await supabase.from('push_subscriptions').delete().eq('id', sub.id)
          }
        }
      }),
    )

    return new Response(
      JSON.stringify({ ok: true, sent, total: subs.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
