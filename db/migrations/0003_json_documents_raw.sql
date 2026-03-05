ALTER TABLE json_documents
ADD COLUMN IF NOT EXISTS is_valid_json BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS raw_content TEXT;

CREATE INDEX IF NOT EXISTS idx_json_documents_validity ON json_documents(is_valid_json);