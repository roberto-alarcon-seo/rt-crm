-- ═════════════════════════════════════════════════════════════════════════════
-- Apellido materno en contactos
--
-- Hasta ahora había un solo campo de apellidos (`last_name`). Para el mercado
-- mexicano se separa: `last_name` pasa a significar "apellido paterno" (solo
-- cambia el label en la UI) y se agrega `second_last_name` = "apellido materno".
--
-- `name` sigue siendo NOT NULL y el display en toda la app; se compone en el
-- front como Nombre + Paterno + Materno. Sin backfill: los apellidos existentes
-- quedan tal cual en `last_name` (paterno).
--
-- Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS second_last_name TEXT;

COMMENT ON COLUMN public.contacts.last_name IS 'Apellido paterno (histórico: "apellidos" en un solo campo).';
COMMENT ON COLUMN public.contacts.second_last_name IS 'Apellido materno.';

NOTIFY pgrst, 'reload schema';
