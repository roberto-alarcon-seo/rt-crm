-- Temporarily disable the trigger
ALTER TABLE user_roles DISABLE TRIGGER prevent_role_escalation;

-- Insert super admin role only if the user exists in auth.users
-- (safe for fresh environments where this UUID doesn't exist)
DO $$
BEGIN
  INSERT INTO user_roles (user_id, global_role)
  VALUES ('b42a5fe1-6f05-4385-bf74-76fce7454324', 'super_admin')
  ON CONFLICT (user_id) DO UPDATE SET global_role = 'super_admin';
EXCEPTION WHEN foreign_key_violation THEN
  RAISE NOTICE 'Super admin user not found in this environment, skipping role assignment';
END;
$$;

-- Re-enable the trigger
ALTER TABLE user_roles ENABLE TRIGGER prevent_role_escalation;