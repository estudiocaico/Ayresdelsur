-- migration_variant_prices.sql
-- Ejecutar en Supabase > SQL Editor

-- Agrega precios independientes por lista a cada variante de producto.
-- precio_adicional queda en la tabla pero ya no se usa en la lógica nueva.

ALTER TABLE variantes_producto ADD COLUMN IF NOT EXISTS precio_minorista NUMERIC(12,2);
ALTER TABLE variantes_producto ADD COLUMN IF NOT EXISTS precio_mediano    NUMERIC(12,2);
ALTER TABLE variantes_producto ADD COLUMN IF NOT EXISTS precio_mayorista  NUMERIC(12,2);
