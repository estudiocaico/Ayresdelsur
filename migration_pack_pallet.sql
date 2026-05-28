-- migration_pack_pallet.sql
-- Adds pack and pallet presentation pricing to productos and variantes_producto.
-- Run this in the Supabase SQL editor.

-- Pack and pallet prices on productos
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS precio_mediano    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS precio_pack       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS precio_pack_mediano   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS precio_pack_mayorista NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS precio_pallet         NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS precio_pallet_mediano  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS precio_pallet_mayorista NUMERIC(12,2);

-- Pack and pallet prices on variantes_producto
ALTER TABLE variantes_producto
  ADD COLUMN IF NOT EXISTS precio_pack       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS precio_pack_mediano   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS precio_pack_mayorista NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS precio_pallet         NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS precio_pallet_mediano  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS precio_pallet_mayorista NUMERIC(12,2);

-- NOTE: precio_mayorista already existed on productos from schema.sql.
-- NOTE: precio_minorista, precio_mediano, precio_mayorista already existed
--       on variantes_producto from migration_variant_prices.sql.
