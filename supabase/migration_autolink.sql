-- Ejecutar en Supabase → SQL Editor
-- Vincula automaticamente un nuevo usuario con su registro en clientes por email

CREATE OR REPLACE FUNCTION public.link_client_on_signup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.clientes
  SET user_id = NEW.id
  WHERE email = NEW.email AND user_id IS NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_new_user_link_client
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.link_client_on_signup();
