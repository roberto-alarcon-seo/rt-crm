-- ====================================================================
-- FIX: Storage RLS para property-images y property-documents
--
-- PROBLEMA:
--   Las políticas originales solo verifican auth.role() = 'authenticated'
--   sin filtrar por tenant. Cualquier usuario autenticado (de cualquier
--   tenant) podía subir, modificar o eliminar archivos de otro tenant.
--
-- SOLUCIÓN:
--   El path de cada archivo es {property_id}/{filename}.
--   Verificamos que el property_id del path pertenece al tenant del
--   usuario actual usando un subquery contra public.properties.
--
-- NOTA sobre SELECT en property-images:
--   El bucket es PUBLIC (public=true), por lo que las imágenes son
--   accesibles por URL directa de todos modos. Mantenemos el SELECT
--   abierto intencionalmente para que las imágenes de propiedades
--   puedan mostrarse en portales y sitios externos sin autenticación.
--   El aislamiento real (impedir escritura cruzada) está en INSERT/UPDATE/DELETE.
-- ====================================================================

-- ─── property-images ─────────────────────────────────────────────

-- 1. Eliminar políticas inseguras existentes
DROP POLICY IF EXISTS "Authenticated users can upload property images"   ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view property images"                  ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update property images"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete property images"   ON storage.objects;

-- 2. SELECT: mantener público (bucket es public=true — acceso por URL directa)
CREATE POLICY "Anyone can view property images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'property-images');

-- 3. INSERT: solo si el property_id del path pertenece al tenant del usuario
CREATE POLICY "Tenant users can upload property images to their folder"
ON storage.objects FOR INSERT TO public
WITH CHECK (
  bucket_id = 'property-images'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text
    FROM public.properties
    WHERE tenant_id = get_user_tenant_id(auth.uid())
  )
);

-- 4. UPDATE: misma verificación de tenant
CREATE POLICY "Tenant users can update their property images"
ON storage.objects FOR UPDATE TO public
USING (
  bucket_id = 'property-images'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text
    FROM public.properties
    WHERE tenant_id = get_user_tenant_id(auth.uid())
  )
);

-- 5. DELETE: misma verificación de tenant
CREATE POLICY "Tenant users can delete their property images"
ON storage.objects FOR DELETE TO public
USING (
  bucket_id = 'property-images'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text
    FROM public.properties
    WHERE tenant_id = get_user_tenant_id(auth.uid())
  )
);

-- 6. Super admins gestionan todo
CREATE POLICY "Super admins can manage all property images"
ON storage.objects FOR ALL TO public
USING (
  bucket_id = 'property-images'
  AND is_super_admin(auth.uid())
);


-- ─── property-documents ──────────────────────────────────────────

-- 1. Eliminar políticas inseguras existentes
DROP POLICY IF EXISTS "Authenticated users can upload property documents"  ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view property documents"    ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update property documents"  ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete property documents"  ON storage.objects;

-- 2. SELECT: bucket privado — solo usuarios del mismo tenant pueden ver documentos
CREATE POLICY "Tenant users can view their property documents"
ON storage.objects FOR SELECT TO public
USING (
  bucket_id = 'property-documents'
  AND auth.role() = 'authenticated'
  AND (
    is_super_admin(auth.uid())
    OR (storage.foldername(name))[1] IN (
      SELECT id::text
      FROM public.properties
      WHERE tenant_id = get_user_tenant_id(auth.uid())
    )
  )
);

-- 3. INSERT: solo si el property_id del path pertenece al tenant del usuario
CREATE POLICY "Tenant users can upload property documents to their folder"
ON storage.objects FOR INSERT TO public
WITH CHECK (
  bucket_id = 'property-documents'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text
    FROM public.properties
    WHERE tenant_id = get_user_tenant_id(auth.uid())
  )
);

-- 4. UPDATE
CREATE POLICY "Tenant users can update their property documents"
ON storage.objects FOR UPDATE TO public
USING (
  bucket_id = 'property-documents'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text
    FROM public.properties
    WHERE tenant_id = get_user_tenant_id(auth.uid())
  )
);

-- 5. DELETE
CREATE POLICY "Tenant users can delete their property documents"
ON storage.objects FOR DELETE TO public
USING (
  bucket_id = 'property-documents'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text
    FROM public.properties
    WHERE tenant_id = get_user_tenant_id(auth.uid())
  )
);

-- 6. Super admins gestionan todo
CREATE POLICY "Super admins can manage all property documents"
ON storage.objects FOR ALL TO public
USING (
  bucket_id = 'property-documents'
  AND is_super_admin(auth.uid())
);
