-- migration_features.sql
-- Ejecutar en Supabase > SQL Editor

-- 1. Tabla de configuracion global (pedido minimo, WhatsApp)
CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

INSERT INTO configuracion (clave, valor) VALUES
  ('pedido_minimo', '50000'),
  ('whatsapp_numeros', '[]')
ON CONFLICT (clave) DO NOTHING;

ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos leen config" ON configuracion
  FOR SELECT USING (true);

CREATE POLICY "Solo admin inserta config" ON configuracion
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "Solo admin actualiza config" ON configuracion
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

-- 2. Fecha de visita del vendedor en prepedidos
ALTER TABLE prepedidos ADD COLUMN IF NOT EXISTS fecha_visita DATE;

-- 3. Lista de precios por cliente (minorista / mediano / mayorista)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS lista_precios TEXT
  DEFAULT 'minorista'
  CHECK (lista_precios IN ('minorista', 'mediano', 'mayorista'));

-- 4. Precios diferenciados en productos
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_mediano NUMERIC(12,2);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_mayorista NUMERIC(12,2);
