-- migration_pack_pallet_units.sql
-- Adds units-per-presentation columns so the catalog can show:
-- "$1.050 → ×25 u. $26.250"
-- Run in Supabase SQL Editor AFTER migration_pack_pallet.sql

ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS unidades_pack   INTEGER,
  ADD COLUMN IF NOT EXISTS unidades_pallet INTEGER;

-- Note: unidades_pack / unidades_pallet live only on productos.
-- The quantity per pack is a product property, not a variant one.
-- Variants can have independent unit prices (precio_pack) but the
-- pack size (unidades_pack) is shared across all variants.
