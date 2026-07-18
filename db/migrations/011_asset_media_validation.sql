ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS detected_format text,
  ADD COLUMN IF NOT EXISTS pixel_width integer,
  ADD COLUMN IF NOT EXISTS pixel_height integer;

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_pixel_dimensions_check;
ALTER TABLE assets ADD CONSTRAINT assets_pixel_dimensions_check CHECK (
  (pixel_width IS NULL AND pixel_height IS NULL) OR
  (pixel_width > 0 AND pixel_height > 0)
);
