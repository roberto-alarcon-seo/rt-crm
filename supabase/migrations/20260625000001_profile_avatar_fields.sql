-- Add professional profile fields to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url    TEXT,
  ADD COLUMN IF NOT EXISTS job_title     TEXT,
  ADD COLUMN IF NOT EXISTS bio           TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url  TEXT,
  ADD COLUMN IF NOT EXISTS instagram_url TEXT;

-- user-avatars bucket (public, 5 MB limit, images only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-avatars',
  'user-avatars',
  true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'users can upload own avatar'
  ) THEN
    CREATE POLICY "users can upload own avatar"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'user-avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'users can update own avatar'
  ) THEN
    CREATE POLICY "users can update own avatar"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'user-avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'users can delete own avatar'
  ) THEN
    CREATE POLICY "users can delete own avatar"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'user-avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'public can read avatars'
  ) THEN
    CREATE POLICY "public can read avatars"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'user-avatars');
  END IF;

END $$;
