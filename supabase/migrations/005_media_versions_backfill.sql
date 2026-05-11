-- ============================================================================
-- BACKY CMS - MEDIA VERSION HISTORY BACKFILL
-- ============================================================================
--
-- Moves existing metadata-only replacement history into media_versions after
-- the media_type enum and media_versions table have been committed.
-- ============================================================================

WITH legacy_versions AS (
  SELECT
    media.id AS media_id,
    media.site_id,
    legacy.version,
    legacy.ordinality
  FROM public.media
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(media.metadata -> 'replacementVersions') = 'array'
        THEN media.metadata -> 'replacementVersions'
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS legacy(version, ordinality)
  WHERE jsonb_typeof(legacy.version) = 'object'
)
INSERT INTO public.media_versions (
  site_id,
  media_id,
  filename,
  original_name,
  mime_type,
  size_bytes,
  type,
  url,
  thumbnail_url,
  storage_path,
  storage_provider,
  replaced_at,
  replaced_by,
  reason,
  metadata,
  created_at
)
SELECT
  legacy_versions.site_id,
  legacy_versions.media_id,
  COALESCE(NULLIF(legacy_versions.version ->> 'filename', ''), 'legacy-version-' || legacy_versions.ordinality),
  COALESCE(NULLIF(legacy_versions.version ->> 'originalName', ''), NULLIF(legacy_versions.version ->> 'filename', ''), 'Legacy version'),
  COALESCE(NULLIF(legacy_versions.version ->> 'mimeType', ''), 'application/octet-stream'),
  CASE
    WHEN legacy_versions.version ->> 'sizeBytes' ~ '^[0-9]+$'
      THEN (legacy_versions.version ->> 'sizeBytes')::BIGINT
    ELSE 0
  END,
  CASE
    WHEN legacy_versions.version ->> 'type' IN ('image', 'video', 'audio', 'document', 'font', 'other')
      THEN (legacy_versions.version ->> 'type')::media_type
    ELSE 'other'::media_type
  END,
  COALESCE(NULLIF(legacy_versions.version ->> 'url', ''), ''),
  NULLIF(legacy_versions.version ->> 'thumbnailUrl', ''),
  NULLIF(legacy_versions.version ->> 'storagePath', ''),
  NULLIF(legacy_versions.version ->> 'storageProvider', ''),
  CASE
    WHEN legacy_versions.version ->> 'replacedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      THEN (legacy_versions.version ->> 'replacedAt')::TIMESTAMPTZ
    ELSE NOW()
  END,
  NULLIF(legacy_versions.version ->> 'replacedBy', ''),
  NULLIF(legacy_versions.version ->> 'reason', ''),
  jsonb_build_object(
    'source', 'media.metadata.replacementVersions',
    'retainedMetadataVersionId', legacy_versions.version ->> 'id',
    'legacyOrdinal', legacy_versions.ordinality,
    'legacyVersion', legacy_versions.version
  ),
  CASE
    WHEN legacy_versions.version ->> 'createdAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      THEN (legacy_versions.version ->> 'createdAt')::TIMESTAMPTZ
    ELSE NOW()
  END
FROM legacy_versions
WHERE NOT EXISTS (
  SELECT 1
  FROM public.media_versions existing
  WHERE existing.media_id = legacy_versions.media_id
    AND legacy_versions.version ? 'id'
    AND existing.metadata ->> 'retainedMetadataVersionId' = legacy_versions.version ->> 'id'
);
