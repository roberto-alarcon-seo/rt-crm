-- Add contextual lead source fields to contacts
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS source_context text,
  ADD COLUMN IF NOT EXISTS referrer_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_referrer_contact_id
  ON contacts(referrer_contact_id);

COMMENT ON COLUMN contacts.source_context IS
  'Contextual detail about lead origin: digital platform, flyer description, referrer note, etc.';
COMMENT ON COLUMN contacts.referrer_contact_id IS
  'Contact who referred this lead (for referral origin)';
