// Supabase Edge Function — invita a un vendedor por email via Supabase Auth
// Desplegar con: supabase functions deploy invite-vendedor
//
// Variables de entorno necesarias en Vercel:
//   SUPABASE_SERVICE_ROLE_KEY  (nunca exponer en el frontend)
//   SUPABASE_URL               (disponible automáticamente en Edge Functions)
//   SITE_URL                   (URL pública del sitio, ej: https://ayresdelsur.vercel.app)

import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, vendedorId } = await req.json() as { email: string; vendedorId: string }

    if (!email || !vendedorId) {
      return new Response(JSON.stringify({ error: 'email y vendedorId son requeridos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
    // El secret se llama SERVICE_ROLE_KEY porque Supabase no permite el prefijo SUPABASE_ en custom secrets
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')!
    const siteUrl        = Deno.env.get('SITE_URL') ?? 'https://ayresdelsur.vercel.app'

    if (!serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'SERVICE_ROLE_KEY no configurado en los secrets de la Edge Function' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 1. Invitar al usuario via Supabase Auth (envía email automáticamente)
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      { redirectTo: `${siteUrl}/vendedor` }
    )

    if (inviteError) throw inviteError
    const userId = inviteData.user?.id
    if (!userId) throw new Error('No se obtuvo el ID del usuario invitado')

    // 2. Vincular el usuario al registro de vendedor y setear el rol
    //    (el trigger link_vendedor_on_signup también lo hace, pero lo hacemos
    //     explícitamente para garantizar consistencia en todos los casos)
    const [{ error: vErr }, { error: pErr }] = await Promise.all([
      adminClient.from('vendedores').update({ user_id: userId }).eq('id', vendedorId),
      adminClient.from('profiles').upsert({ id: userId, role: 'vendedor' }),
    ])

    if (vErr) throw vErr
    if (pErr) throw pErr

    return new Response(JSON.stringify({ ok: true, userId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
