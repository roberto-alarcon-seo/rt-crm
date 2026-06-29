-- Create required storage buckets (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('support-attachments', 'support-attachments', false, 52428800, NULL),
  ('template-media',      'template-media',      false, 52428800, NULL),
  ('inbox-media',         'inbox-media',         false, 52428800, NULL),
  ('property-images',     'property-images',     false, 52428800, NULL),
  ('property-documents',  'property-documents',  false, 52428800, NULL),
  ('partner-logos',       'partner-logos',       true,  5242880,  ARRAY['image/jpeg','image/png','image/webp','image/svg+xml'])
ON CONFLICT (id) DO NOTHING;
