-- migration_whatsapp_destinos.sql
-- Ejecutar en Supabase > SQL Editor
-- Agrega la nueva clave de configuración para los destinos de WhatsApp automáticos.
-- Reemplaza whatsapp_numeros (solo números) por whatsapp_destinos (número + API key por entrada).

-- Si ya existe whatsapp_numeros, la app la migra automáticamente al nuevo formato
-- la primera vez que el admin guarda en Panel > Configuración.
-- Este INSERT agrega la clave nueva vacía si no existe; no toca la vieja.

INSERT INTO configuracion (clave, valor)
VALUES ('whatsapp_destinos', '[]')
ON CONFLICT (clave) DO NOTHING;
