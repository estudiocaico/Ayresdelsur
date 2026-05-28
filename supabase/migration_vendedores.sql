-- Ejecutar en Supabase → SQL Editor

-- 1. Tabla de vendedores
CREATE TABLE IF NOT EXISTS public.vendedores (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true
);

ALTER TABLE public.vendedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manages vendedores" ON public.vendedores
  FOR ALL USING (is_admin());

CREATE POLICY "Authenticated read vendedores" ON public.vendedores
  FOR SELECT TO authenticated USING (true);

-- 2. Agregar vendedor_id a prepedidos
ALTER TABLE public.prepedidos
  ADD COLUMN IF NOT EXISTS vendedor_id uuid REFERENCES public.vendedores(id) ON DELETE SET NULL;

-- 3. Vendedores de ejemplo (editá los nombres según tu equipo)
INSERT INTO public.vendedores (nombre) VALUES
  ('Juan'),
  ('María'),
  ('Carlos');
