-- Storage RLS policies created outside migrations (via Supabase dashboard).
-- Covers: support-attachments, template-media, inbox-media buckets.

-- support-attachments: SELECT
DROP POLICY IF EXISTS "Owners can view their tenant support attachments" ON storage.objects;
CREATE POLICY "Owners can view their tenant support attachments"
ON storage.objects FOR SELECT TO public
USING (
  (bucket_id = 'support-attachments'::text)
  AND (is_super_admin(auth.uid()) OR has_tenant_role(auth.uid(), 'owner'::tenant_role))
);

DROP POLICY IF EXISTS "Users can read support attachments from their tenant" ON storage.objects;
CREATE POLICY "Users can read support attachments from their tenant"
ON storage.objects FOR SELECT TO public
USING (
  (bucket_id = 'support-attachments'::text)
  AND (auth.role() = 'authenticated'::text)
  AND (((storage.foldername(name))[1] = (get_user_tenant_id(auth.uid()))::text) OR is_super_admin(auth.uid()))
);

DROP POLICY IF EXISTS "Users can view their tenant support attachments" ON storage.objects;
CREATE POLICY "Users can view their tenant support attachments"
ON storage.objects FOR SELECT TO public
USING (
  (bucket_id = 'support-attachments'::text)
  AND (is_super_admin(auth.uid()) OR ((storage.foldername(name))[1] = (get_user_tenant_id(auth.uid()))::text))
);

-- support-attachments: INSERT
DROP POLICY IF EXISTS "Users can upload support attachments" ON storage.objects;
CREATE POLICY "Users can upload support attachments"
ON storage.objects FOR INSERT TO public
WITH CHECK (
  (bucket_id = 'support-attachments'::text)
  AND (auth.role() = 'authenticated'::text)
);

DROP POLICY IF EXISTS "Users can upload support attachments to their tenant folder" ON storage.objects;
CREATE POLICY "Users can upload support attachments to their tenant folder"
ON storage.objects FOR INSERT TO public
WITH CHECK (
  (bucket_id = 'support-attachments'::text)
  AND (auth.role() = 'authenticated'::text)
  AND ((storage.foldername(name))[1] = (get_user_tenant_id(auth.uid()))::text)
);

DROP POLICY IF EXISTS "Owners can upload support attachments" ON storage.objects;
CREATE POLICY "Owners can upload support attachments"
ON storage.objects FOR INSERT TO public
WITH CHECK (
  (bucket_id = 'support-attachments'::text)
  AND has_tenant_role(auth.uid(), 'owner'::tenant_role)
);

DROP POLICY IF EXISTS "Super admins can upload all support attachments" ON storage.objects;
CREATE POLICY "Super admins can upload all support attachments"
ON storage.objects FOR INSERT TO public
WITH CHECK (
  (bucket_id = 'support-attachments'::text)
  AND is_super_admin(auth.uid())
);

-- support-attachments: DELETE
DROP POLICY IF EXISTS "Super admins can delete support attachments" ON storage.objects;
CREATE POLICY "Super admins can delete support attachments"
ON storage.objects FOR DELETE TO public
USING (
  (bucket_id = 'support-attachments'::text)
  AND is_super_admin(auth.uid())
);

-- support-attachments: ALL
DROP POLICY IF EXISTS "Super admins can manage all support attachments" ON storage.objects;
CREATE POLICY "Super admins can manage all support attachments"
ON storage.objects FOR ALL TO public
USING (
  (bucket_id = 'support-attachments'::text)
  AND is_super_admin(auth.uid())
);

-- template-media: SELECT
DROP POLICY IF EXISTS "Users can view template media in their tenant" ON storage.objects;
CREATE POLICY "Users can view template media in their tenant"
ON storage.objects FOR SELECT TO public
USING (
  (bucket_id = 'template-media'::text)
  AND ((storage.foldername(name))[1] IN (
    SELECT (tenants.id)::text AS id
    FROM tenants
    WHERE tenants.id = get_user_tenant_id(auth.uid())
  ))
);

-- template-media: INSERT
DROP POLICY IF EXISTS "Users with marketer or owner role can upload template media" ON storage.objects;
CREATE POLICY "Users with marketer or owner role can upload template media"
ON storage.objects FOR INSERT TO public
WITH CHECK (
  (bucket_id = 'template-media'::text)
  AND has_any_tenant_role(auth.uid(), ARRAY['owner'::tenant_role, 'marketer'::tenant_role])
  AND ((storage.foldername(name))[1] = (get_user_tenant_id(auth.uid()))::text)
);

-- template-media: UPDATE
DROP POLICY IF EXISTS "Users with marketer or owner role can update template media" ON storage.objects;
CREATE POLICY "Users with marketer or owner role can update template media"
ON storage.objects FOR UPDATE TO public
USING (
  (bucket_id = 'template-media'::text)
  AND has_any_tenant_role(auth.uid(), ARRAY['owner'::tenant_role, 'marketer'::tenant_role])
  AND ((storage.foldername(name))[1] = (get_user_tenant_id(auth.uid()))::text)
);

-- template-media: DELETE
DROP POLICY IF EXISTS "Users with marketer or owner role can delete template media" ON storage.objects;
CREATE POLICY "Users with marketer or owner role can delete template media"
ON storage.objects FOR DELETE TO public
USING (
  (bucket_id = 'template-media'::text)
  AND has_any_tenant_role(auth.uid(), ARRAY['owner'::tenant_role, 'marketer'::tenant_role])
  AND ((storage.foldername(name))[1] = (get_user_tenant_id(auth.uid()))::text)
);

-- template-media: ALL
DROP POLICY IF EXISTS "Super admins can manage all template media" ON storage.objects;
CREATE POLICY "Super admins can manage all template media"
ON storage.objects FOR ALL TO public
USING (
  (bucket_id = 'template-media'::text)
  AND is_super_admin(auth.uid())
);

-- inbox-media: SELECT
DROP POLICY IF EXISTS "Tenant users can view inbox media" ON storage.objects;
CREATE POLICY "Tenant users can view inbox media"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'inbox-media'::text);

-- inbox-media: INSERT
DROP POLICY IF EXISTS "Tenant users can upload inbox media" ON storage.objects;
CREATE POLICY "Tenant users can upload inbox media"
ON storage.objects FOR INSERT TO public
WITH CHECK (
  (bucket_id = 'inbox-media'::text)
  AND (auth.role() = 'authenticated'::text)
);

-- inbox-media: UPDATE
DROP POLICY IF EXISTS "Tenant users can update inbox media" ON storage.objects;
CREATE POLICY "Tenant users can update inbox media"
ON storage.objects FOR UPDATE TO public
USING (
  (bucket_id = 'inbox-media'::text)
  AND (auth.role() = 'authenticated'::text)
);

-- inbox-media: DELETE
DROP POLICY IF EXISTS "Tenant users can delete inbox media" ON storage.objects;
CREATE POLICY "Tenant users can delete inbox media"
ON storage.objects FOR DELETE TO public
USING (
  (bucket_id = 'inbox-media'::text)
  AND (auth.role() = 'authenticated'::text)
);
