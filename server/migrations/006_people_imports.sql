-- Student, teacher and parent imports (matched by admission number, employee number or email) are recorded too.
ALTER TABLE data_imports DROP CONSTRAINT IF EXISTS data_imports_kind_check;
ALTER TABLE data_imports ADD CONSTRAINT data_imports_kind_check
  CHECK (kind IN ('marks', 'attendance', 'records', 'students', 'teachers', 'parents'));
