-- ═════════════════════════════════════════════════════════════════════════════
-- Consentimiento configurable y opt-out real (§7.3 del documento)
--
-- Lo que había: la pestaña "Reglas automáticas" de la pantalla de Consentimiento
-- definía palabras de baja y un mensaje de confirmación en constantes del
-- frontend, y su handleSaveRules era un stub que solo mostraba un toast
-- ("For now, just show success"). Nada se guardaba, y ninguna edge function
-- leía palabras de baja ni escribía en contact_consents: responder "BAJA" por
-- WhatsApp no tenía ningún efecto.
--
-- Tampoco existía en ninguna tabla el texto de consentimiento ni el aviso de
-- privacidad que el §7.3 pide mostrar al capturar datos.
--
-- Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tenant_consent_settings (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Palabras que, recibidas por WhatsApp, dan de baja al contacto.
  opt_out_keywords text[] NOT NULL DEFAULT ARRAY['baja','stop','alto','cancelar','unsubscribe','no molestar'],
  -- Respuesta automática al darse de baja. Es el último mensaje que se envía.
  opt_out_confirmation_message text NOT NULL DEFAULT 'Listo, no volveremos a enviarte mensajes. Si deseas volver a recibir comunicaciones, escríbenos.',
  opt_out_detection_enabled boolean NOT NULL DEFAULT true,

  -- Texto legal que se muestra al capturar datos (§7.3).
  consent_text          text,
  privacy_policy_url    text,
  privacy_contact_email text,
  -- Si el widget web debe mostrarlo bajo el formulario de captura.
  show_consent_in_widget boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_consent_settings IS
  'Reglas de consentimiento: palabras de baja, mensaje de confirmación y texto legal del §7.3.';

DROP TRIGGER IF EXISTS trg_tenant_consent_settings_updated_at ON public.tenant_consent_settings;
CREATE TRIGGER trg_tenant_consent_settings_updated_at
  BEFORE UPDATE ON public.tenant_consent_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tenant_consent_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_consent_settings_select" ON public.tenant_consent_settings;
CREATE POLICY "tenant_consent_settings_select" ON public.tenant_consent_settings
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "tenant_consent_settings_write" ON public.tenant_consent_settings;
CREATE POLICY "tenant_consent_settings_write" ON public.tenant_consent_settings
  FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_any_tenant_role(auth.uid(), ARRAY['owner','administrador']::public.tenant_role[]))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_any_tenant_role(auth.uid(), ARRAY['owner','administrador']::public.tenant_role[]));

DROP POLICY IF EXISTS "tenant_consent_settings_super_admin" ON public.tenant_consent_settings;
CREATE POLICY "tenant_consent_settings_super_admin" ON public.tenant_consent_settings
  FOR ALL USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_consent_settings TO authenticated, service_role;

INSERT INTO public.tenant_consent_settings (tenant_id)
SELECT id FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- Texto de consentimiento de Random Truffle (§7.3)
-- El documento pide verificar la liga y el correo antes de publicar; se cargan
-- los del documento y quedan editables desde la pantalla.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.tenant_consent_settings s
SET consent_text = 'Al compartir tus datos aceptas que Random Truffle te contacte por WhatsApp, email o teléfono sobre tu solicitud. Tus datos se usan solo para atenderte y nunca se venden a terceros. Puedes pedir su eliminación en cualquier momento respondiendo "BAJA" o escribiendo a privacy@randomtruffle.com.',
    privacy_policy_url    = 'https://www.randomtruffle.com/privacy',
    privacy_contact_email = 'privacy@randomtruffle.com',
    updated_at = now()
FROM public.tenants t
WHERE t.id = s.tenant_id
  AND t.partner_id = 'randomtruffle'
  AND s.consent_text IS NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: ¿se le puede escribir a este contacto?
-- El único gate que existía antes de enviar era can_send_message (créditos y
-- wallet). El consentimiento no se consultaba en ningún punto.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_contact_can_receive(p_contact_id uuid, p_channel text DEFAULT 'whatsapp')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.contact_consents c
    WHERE c.contact_id = p_contact_id
      AND c.channel::text = p_channel
      AND (
        c.status IN ('opted_out', 'blocked')
        OR (c.status = 'dnd' AND (c.dnd_until IS NULL OR c.dnd_until > now()))
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.contacts k
    WHERE k.id = p_contact_id AND k.opt_in_status = 'opt_out'
  );
$$;

COMMENT ON FUNCTION public.fn_contact_can_receive IS
  'True si el contacto no está dado de baja, bloqueado ni en DND vigente para ese canal.';

GRANT EXECUTE ON FUNCTION public.fn_contact_can_receive(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
