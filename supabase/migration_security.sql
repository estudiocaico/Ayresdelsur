-- Ejecutar en Supabase → SQL Editor
-- Refuerza las políticas de seguridad en la tabla profiles

-- Eliminar políticas existentes para recrearlas limpias
DROP POLICY IF EXISTS "Users read own profile"       ON public.profiles;
DROP POLICY IF EXISTS "Only admin updates profiles"  ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile."  ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;

-- 1. Cada usuario solo puede leer su propio perfil
CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- 2. Solo el admin puede modificar roles (un cliente no puede auto-promoverse)
CREATE POLICY "Only admin updates profiles"
  ON public.profiles FOR UPDATE
  USING (
    -- El admin puede modificar cualquier perfil
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- 3. Nadie puede insertar profiles manualmente: el trigger handle_new_user
--    usa SECURITY DEFINER y bypasea RLS, así que no necesita política de INSERT.
--    Si existe una política de INSERT permisiva, la eliminamos:
DROP POLICY IF EXISTS "Users can insert own profile." ON public.profiles;

-- Verificacion: mostrar las políticas activas
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'profiles';
