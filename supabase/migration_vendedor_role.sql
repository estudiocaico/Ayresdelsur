-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Rol Vendedor con acceso a la app
-- Ejecutar en: Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Ampliar el check de roles en profiles ─────────────────────────────────
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'cliente', 'vendedor'));

-- ── 2. Columnas nuevas en vendedores ─────────────────────────────────────────
ALTER TABLE vendedores
  ADD COLUMN IF NOT EXISTS email    text,
  ADD COLUMN IF NOT EXISTS user_id  uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 3. Columnas nuevas en clientes ───────────────────────────────────────────
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS pendiente_aprobacion    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS creado_por_vendedor_id  uuid REFERENCES vendedores(id) ON DELETE SET NULL;

-- ── 4. Columna en prepedidos ─────────────────────────────────────────────────
ALTER TABLE prepedidos
  ADD COLUMN IF NOT EXISTS tomado_en_visita boolean NOT NULL DEFAULT false;

-- ── 5. Helper: is_vendedor() ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_vendedor()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'vendedor');
$$;

-- ── 6. Helper: my_vendedor_id() ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION my_vendedor_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id FROM vendedores WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ── 7. Trigger: vincular vendedor en signup ──────────────────────────────────
--    El trigger handle_new_user ya crea el profile con role='cliente'.
--    Este trigger lo corrige a 'vendedor' si el email coincide con un vendedor.
CREATE OR REPLACE FUNCTION link_vendedor_on_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM vendedores
  WHERE email = NEW.email AND user_id IS NULL
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE vendedores SET user_id = NEW.id WHERE id = v_id;
    -- El trigger handle_new_user ya insertó el profile; lo actualizamos
    UPDATE profiles SET role = 'vendedor' WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_link_vendedor ON auth.users;
CREATE TRIGGER on_auth_user_created_link_vendedor
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION link_vendedor_on_signup();

-- ── 8. RLS en vendedores (no tenía RLS habilitado) ───────────────────────────
ALTER TABLE vendedores ENABLE ROW LEVEL SECURITY;

-- Todos los autenticados pueden ver vendedores (para joins en MyOrders, etc.)
CREATE POLICY "Usuarios autenticados ven vendedores"
  ON vendedores FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Solo admin puede crear/modificar/borrar vendedores
CREATE POLICY "Admin gestiona vendedores"
  ON vendedores FOR ALL
  USING (is_admin());

-- ── 9. RLS para vendedor en prepedidos ───────────────────────────────────────

-- SELECT: vendedor ve solo sus pedidos asignados
CREATE POLICY "Vendedor ve sus pedidos"
  ON prepedidos FOR SELECT
  USING (is_vendedor() AND vendedor_id = my_vendedor_id());

-- INSERT: vendedor puede crear pedidos asignados a sí mismo
CREATE POLICY "Vendedor crea pedidos"
  ON prepedidos FOR INSERT
  WITH CHECK (is_vendedor() AND vendedor_id = my_vendedor_id());

-- UPDATE: vendedor puede actualizar sus pedidos (ej: marcar cerrado)
CREATE POLICY "Vendedor actualiza sus pedidos"
  ON prepedidos FOR UPDATE
  USING (is_vendedor() AND vendedor_id = my_vendedor_id());

-- ── 10. RLS para vendedor en items_prepedido ─────────────────────────────────

CREATE POLICY "Vendedor ve items de sus pedidos"
  ON items_prepedido FOR SELECT
  USING (
    is_vendedor() AND
    prepedido_id IN (SELECT id FROM prepedidos WHERE vendedor_id = my_vendedor_id())
  );

CREATE POLICY "Vendedor inserta items de sus pedidos"
  ON items_prepedido FOR INSERT
  WITH CHECK (
    is_vendedor() AND
    prepedido_id IN (SELECT id FROM prepedidos WHERE vendedor_id = my_vendedor_id())
  );

-- ── 11. RLS para vendedor en clientes ────────────────────────────────────────

-- Buscar clientes activos existentes + ver los que creó
CREATE POLICY "Vendedor ve clientes activos"
  ON clientes FOR SELECT
  USING (
    is_vendedor() AND
    (activo = true OR creado_por_vendedor_id = my_vendedor_id())
  );

-- Crear clientes nuevos (quedan con pendiente_aprobacion = true)
CREATE POLICY "Vendedor crea clientes"
  ON clientes FOR INSERT
  WITH CHECK (
    is_vendedor() AND
    creado_por_vendedor_id = my_vendedor_id()
  );

-- ── 12. RLS en configuracion (para que vendedor lea whatsapp_destinos) ───────
--    Si la tabla no tiene RLS, esto es no-op. Si lo tiene, agrega la política.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'configuracion' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'configuracion' AND policyname = 'Autenticados leen configuracion'
    ) THEN
      EXECUTE 'CREATE POLICY "Autenticados leen configuracion"
        ON configuracion FOR SELECT
        USING (auth.uid() IS NOT NULL)';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'configuracion' AND policyname = 'Admin gestiona configuracion'
    ) THEN
      EXECUTE 'CREATE POLICY "Admin gestiona configuracion"
        ON configuracion FOR ALL
        USING (is_admin())';
    END IF;
  END IF;
END
$$;

-- ── 13. Índices útiles ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_prepedidos_vendedor ON prepedidos(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_clientes_creado_por ON clientes(creado_por_vendedor_id);
CREATE INDEX IF NOT EXISTS idx_vendedores_user_id  ON vendedores(user_id);
