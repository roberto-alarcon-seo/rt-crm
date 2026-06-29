-- ═══════════════════════════════════════════════════════════════
-- RT CRM — Primer Super Admin
-- Proyecto: rt-crm-prd (intsmpmsvrwigdnpmvaj)
--
-- INSTRUCCIONES:
--   1. Ve a Supabase Dashboard → Authentication → Users → Add User
--   2. Email: roberto@randomtruffle.com
--   3. Password: (el que definiste)
--   4. Marca "Auto Confirm User"
--   5. Luego ejecuta ESTE script en SQL Editor
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user_id UUID;
BEGIN
  -- 1. Encontrar el usuario que acabas de crear
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'roberto@randomtruffle.com';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION
      'Usuario roberto@randomtruffle.com no encontrado. '
      'Créalo primero en Authentication → Users → Add User.';
  END IF;

  RAISE NOTICE 'Usuario encontrado: %', v_user_id;

  -- 2. Asegurar que el perfil exista (puede haberlo creado el trigger)
  INSERT INTO public.profiles (id, name, email, tenant_id, status)
  VALUES (v_user_id, 'Roberto', 'roberto@randomtruffle.com', NULL, 'active')
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = NULL,
    name      = 'Roberto',
    email     = 'roberto@randomtruffle.com';

  RAISE NOTICE 'Perfil configurado.';

  -- 3. Asignar global_role = super_admin
  --    Desactivamos los triggers de seguridad temporalmente porque el guard
  --    bloquea la asignación de super_admin desde la app (auth.uid() != null).
  --    Desde el SQL Editor corremos como postgres (auth.uid() = null), pero
  --    el trigger puede dispararse igual. Lo desactivamos para el bootstrap.
  ALTER TABLE public.user_roles DISABLE TRIGGER ALL;

  INSERT INTO public.user_roles (user_id, global_role, tenant_id, tenant_role)
  VALUES (v_user_id, 'super_admin', NULL, NULL)
  ON CONFLICT (user_id) DO UPDATE SET
    global_role = 'super_admin',
    tenant_id   = NULL,
    tenant_role = NULL;

  ALTER TABLE public.user_roles ENABLE TRIGGER ALL;

  RAISE NOTICE '✓ Super admin configurado para roberto@randomtruffle.com (%)', v_user_id;
END;
$$;

-- Verificar resultado
SELECT
  u.email,
  p.name,
  p.tenant_id,
  ur.global_role,
  ur.tenant_role,
  u.email_confirmed_at IS NOT NULL AS email_confirmed
FROM auth.users u
JOIN public.profiles   p  ON p.id = u.id
JOIN public.user_roles ur ON ur.user_id = u.id
WHERE u.email = 'roberto@randomtruffle.com';
