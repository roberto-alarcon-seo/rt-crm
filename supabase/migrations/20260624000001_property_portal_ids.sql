-- IDs secundarios de portales inmobiliarios por propiedad.
-- Permite registrar el ID con el que aparece una propiedad en portales externos
-- (Fincaraiz, Metrocuadrado, Inmuebles24, etc.) para que la IA los reconozca
-- cuando el lead los mencione en WhatsApp.

CREATE TABLE public.property_portal_ids (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid        NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  portal_id   text        NOT NULL,
  portal_name text,
  portal_url  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_portal_ids_tenant_portal_unique UNIQUE (tenant_id, portal_id)
);

CREATE INDEX idx_property_portal_ids_property ON public.property_portal_ids(property_id);
CREATE INDEX idx_property_portal_ids_lookup   ON public.property_portal_ids(tenant_id, portal_id);

ALTER TABLE public.property_portal_ids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_read_property_portal_ids" ON public.property_portal_ids
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "admin_write_property_portal_ids" ON public.property_portal_ids
  FOR ALL USING (
    (
      tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
      AND has_any_tenant_role(auth.uid(), ARRAY['owner'::tenant_role, 'administrador'::tenant_role])
    )
    OR is_super_admin(auth.uid())
  );

GRANT ALL ON public.property_portal_ids TO service_role;
GRANT ALL ON public.property_portal_ids TO authenticated;
GRANT SELECT ON public.property_portal_ids TO anon;
