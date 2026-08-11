-- Formaliza en migración las columnas avanzadas de widget_settings.
--
-- Contexto: SettingsWidget.tsx, useWidgetSettings.ts, widget-init y widget.js ya
-- leen y escriben estas 7 columnas, pero nunca existió una migración que las
-- creara. En dev no existían en absoluto (la pantalla del widget fallaba al
-- guardar). Se escribe idempotente para que sea segura en cualquier entorno,
-- incluido prod si allí ya se aplicaron a mano.

ALTER TABLE public.widget_settings
  ADD COLUMN IF NOT EXISTS display_mode    text  NOT NULL DEFAULT 'floating',
  ADD COLUMN IF NOT EXISTS bubble_icon     text  NOT NULL DEFAULT 'logo',
  ADD COLUMN IF NOT EXISTS theme           text  NOT NULL DEFAULT 'light',
  ADD COLUMN IF NOT EXISTS header_subtitle text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS powered_by_text text  NOT NULL DEFAULT 'Random Truffle',
  ADD COLUMN IF NOT EXISTS product_chips   jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cta_buttons     jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Constraints de dominio. Se recrean para que la migración sea reejecutable.
ALTER TABLE public.widget_settings DROP CONSTRAINT IF EXISTS widget_settings_display_mode_chk;
ALTER TABLE public.widget_settings
  ADD CONSTRAINT widget_settings_display_mode_chk
  CHECK (display_mode IN ('floating', 'sidebar'));

ALTER TABLE public.widget_settings DROP CONSTRAINT IF EXISTS widget_settings_bubble_icon_chk;
ALTER TABLE public.widget_settings
  ADD CONSTRAINT widget_settings_bubble_icon_chk
  CHECK (bubble_icon IN ('logo', 'sparkles', 'bot', 'zap'));

ALTER TABLE public.widget_settings DROP CONSTRAINT IF EXISTS widget_settings_theme_chk;
ALTER TABLE public.widget_settings
  ADD CONSTRAINT widget_settings_theme_chk
  CHECK (theme IN ('light', 'dark'));

ALTER TABLE public.widget_settings DROP CONSTRAINT IF EXISTS widget_settings_position_chk;
ALTER TABLE public.widget_settings
  ADD CONSTRAINT widget_settings_position_chk
  CHECK ("position" IN ('bottom-right', 'bottom-left'));

-- product_chips y cta_buttons deben ser arreglos JSON, no objetos ni escalares.
ALTER TABLE public.widget_settings DROP CONSTRAINT IF EXISTS widget_settings_product_chips_is_array;
ALTER TABLE public.widget_settings
  ADD CONSTRAINT widget_settings_product_chips_is_array
  CHECK (jsonb_typeof(product_chips) = 'array');

ALTER TABLE public.widget_settings DROP CONSTRAINT IF EXISTS widget_settings_cta_buttons_is_array;
ALTER TABLE public.widget_settings
  ADD CONSTRAINT widget_settings_cta_buttons_is_array
  CHECK (jsonb_typeof(cta_buttons) = 'array');

ALTER TABLE public.widget_settings DROP CONSTRAINT IF EXISTS widget_settings_initial_suggestions_is_array;
ALTER TABLE public.widget_settings
  ADD CONSTRAINT widget_settings_initial_suggestions_is_array
  CHECK (jsonb_typeof(initial_suggestions) = 'array');

COMMENT ON COLUMN public.widget_settings.display_mode    IS 'floating = burbuja flotante; sidebar = barra lateral.';
COMMENT ON COLUMN public.widget_settings.bubble_icon     IS 'Ícono del botón lanzador: logo | sparkles | bot | zap.';
COMMENT ON COLUMN public.widget_settings.theme           IS 'Tema visual del widget: light | dark.';
COMMENT ON COLUMN public.widget_settings.header_subtitle IS 'Subtítulo bajo el nombre del asistente en el header.';
COMMENT ON COLUMN public.widget_settings.powered_by_text IS 'Texto del pie del widget ("Powered by ...").';
COMMENT ON COLUMN public.widget_settings.product_chips   IS 'Arreglo de {label, icon, color, url}. Máx 8 en UI. url vacía = envía el label como mensaje al chat.';
COMMENT ON COLUMN public.widget_settings.cta_buttons     IS 'Arreglo de {label, icon, url}. Máx 4 en UI. Siempre abren la URL en pestaña nueva.';
