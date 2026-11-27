ALTER TABLE data_imports DROP CONSTRAINT data_imports_kind_check;
ALTER TABLE data_imports ADD CONSTRAINT data_imports_kind_check CHECK (kind IN ('marks', 'attendance', 'records'));

-- Stable external keys make re-uploading new records safe, including invoices and payments.
CREATE TABLE record_import_keys (
  resource text NOT NULL,
  import_key text NOT NULL,
  record_id integer NOT NULL,
  PRIMARY KEY (resource, import_key)
);
