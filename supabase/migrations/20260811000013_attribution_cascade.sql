-- La atribución impedía borrar contactos y empresas.
--
-- attribution.contact_id y attribution.account_id apuntaban a contacts/accounts
-- sin acción de borrado, así que un DELETE del contacto fallaba con
-- "violates foreign key constraint attribution_contact_id_fkey". Solo se notaba
-- con contactos que TIENEN atribución, es decir los capturados por el widget
-- web y por los enlaces de campaña: justo los que más entran.
--
-- La atribución no tiene vida propia sin su contacto, así que se borra con él.
-- account_id se pone en NULL: la atribución del contacto sigue siendo válida
-- aunque su empresa desaparezca.

ALTER TABLE public.attribution DROP CONSTRAINT IF EXISTS attribution_contact_id_fkey;
ALTER TABLE public.attribution
  ADD CONSTRAINT attribution_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;

ALTER TABLE public.attribution DROP CONSTRAINT IF EXISTS attribution_account_id_fkey;
ALTER TABLE public.attribution
  ADD CONSTRAINT attribution_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;
