-- Permite entry_source = 'web_widget' en contacts.
--
-- Bug que corrige: la edge function widget-chat inserta el lead capturado por el
-- widget web con entry_source = 'web_widget', valor que el CHECK vigente no
-- permitía. El INSERT fallaba y, como el código no revisaba el error, el lead
-- simplemente nunca se creaba y la sesión nunca se marcaba como convertida.
-- Es decir: el widget web no capturaba leads.

ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_entry_source_check;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_entry_source_check
  CHECK (
    entry_source IS NULL
    OR entry_source IN (
      'digital',      -- campañas y formularios digitales
      'web_widget',   -- chat del sitio web (Ruffle)
      'referral',     -- referido
      'phone',        -- llamada entrante
      'site_visit',   -- legacy inmobiliario (Brokia / MLS LATAM)
      'walk_in'       -- legacy inmobiliario (Brokia / MLS LATAM)
    )
  );

COMMENT ON COLUMN public.contacts.entry_source IS
  'Canal por el que entró el contacto. web_widget lo escribe la edge function widget-chat. site_visit y walk_in son legacy inmobiliario y se conservan por los partners que aún los usan.';
