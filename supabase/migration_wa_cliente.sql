-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Notificaciones WhatsApp para clientes via Callmebot
-- Ejecutar en: Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Nuevas columnas en clientes
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS whatsapp_callmebot_apikey  text,
  ADD COLUMN IF NOT EXISTS whatsapp_notificaciones    boolean NOT NULL DEFAULT true;

-- 2. Clave global de fallback en configuración
--    Se usa cuando el cliente no tiene su propia API key de Callmebot.
INSERT INTO configuracion (clave, valor)
VALUES ('callmebot_apikey_global', '')
ON CONFLICT (clave) DO NOTHING;
