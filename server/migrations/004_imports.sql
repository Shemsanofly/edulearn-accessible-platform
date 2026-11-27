-- Explicit "absent" and "exempt" marks, and a record of Excel imports.

-- A grade is either a score or a status, never both. Existing rows all have a score, so they stay valid.
CREATE TYPE grade_status AS ENUM ('absent', 'exempt');
ALTER TABLE grades ADD COLUMN status grade_status;
ALTER TABLE grades ALTER COLUMN score DROP NOT NULL;
ALTER TABLE grades ADD CONSTRAINT grades_score_or_status
  CHECK ((score IS NOT NULL AND status IS NULL) OR (score IS NULL AND status IS NOT NULL));

-- Who imported what, when, and exactly which records changed (before and after values).
CREATE TABLE data_imports (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind           text        NOT NULL CHECK (kind IN ('marks', 'attendance')),
  context        jsonb       NOT NULL,
  filename       text,
  file_sha256    text        NOT NULL,
  imported_by    integer     REFERENCES users(id) ON DELETE SET NULL,
  imported_at    timestamptz NOT NULL DEFAULT now(),
  created_count  integer     NOT NULL DEFAULT 0,
  updated_count  integer     NOT NULL DEFAULT 0,
  unchanged_count integer    NOT NULL DEFAULT 0,
  changes        jsonb       NOT NULL DEFAULT '[]'
);
CREATE INDEX data_imports_imported_at_idx ON data_imports (imported_at DESC);
