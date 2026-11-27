-- Excel/CSV imports of students, teachers and parents are recorded alongside marks and attendance imports.
ALTER TABLE data_imports DROP CONSTRAINT IF EXISTS data_imports_kind_check;
ALTER TABLE data_imports ADD CONSTRAINT data_imports_kind_check
  CHECK (kind IN ('marks', 'attendance', 'students', 'teachers', 'parents'));
