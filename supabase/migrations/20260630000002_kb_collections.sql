-- Knowledge Base: Collections + Rich Entry Types + File Storage

-- 1. New columns on ai_knowledge_base
ALTER TABLE public.ai_knowledge_base
  ADD COLUMN IF NOT EXISTS collection text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS entry_type text NOT NULL DEFAULT 'qa',
  ADD COLUMN IF NOT EXISTS url text,
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS media_type text;

-- Index for collection filtering
CREATE INDEX IF NOT EXISTS idx_ai_kb_collection ON public.ai_knowledge_base (tenant_id, collection);

-- 2. Collections table
CREATE TABLE IF NOT EXISTS public.kb_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  icon text DEFAULT '📁',
  color text DEFAULT '#6366F1',
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, name)
);

ALTER TABLE public.kb_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_collections_tenant_access" ON public.kb_collections
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "kb_collections_tenant_insert" ON public.kb_collections
  FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "kb_collections_tenant_update" ON public.kb_collections
  FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "kb_collections_tenant_delete" ON public.kb_collections
  FOR DELETE USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_collections TO authenticated;

-- 3. Supabase Storage bucket for KB files (50MB max)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kb-files',
  'kb-files',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
) ON CONFLICT (id) DO NOTHING;

-- Storage policies: tenants can only access their own folder
CREATE POLICY "kb_files_tenant_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'kb-files'
    AND (storage.foldername(name))[1] = (SELECT tenant_id::text FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "kb_files_tenant_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'kb-files'
    AND (storage.foldername(name))[1] = (SELECT tenant_id::text FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "kb_files_tenant_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'kb-files'
    AND (storage.foldername(name))[1] = (SELECT tenant_id::text FROM public.profiles WHERE id = auth.uid())
  );
