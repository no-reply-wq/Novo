-- Wave 9: PDF template designer storage
CREATE TABLE platform.pdf_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES platform.apps(id) ON DELETE CASCADE,
  name text NOT NULL,
  config jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pdf_templates_app_id ON platform.pdf_templates(app_id);

CREATE TABLE platform.pdf_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES platform.pdf_templates(id),
  record_id text NOT NULL,
  table_id uuid NOT NULL,
  storage_key text, -- S3/R2 key once uploaded
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pdf_generations_template_id ON platform.pdf_generations(template_id);
CREATE INDEX idx_pdf_generations_record_id ON platform.pdf_generations(record_id);
