-- Bunk Calculator — Additional PostgreSQL Optimizations
-- Run these after `prisma migrate dev` to add extra performance indexes

-- Fast subject attendance lookups
CREATE INDEX IF NOT EXISTS idx_attendance_subject_date
  ON attendance_records(subject_id, class_date);

-- Fast bunk calculation reads
CREATE INDEX IF NOT EXISTS idx_bunk_calc_subject
  ON bunk_calculations(subject_id);

-- Fast user subject lookups
CREATE INDEX IF NOT EXISTS idx_subjects_user_id
  ON subjects(user_id);

-- Verify constraints
SELECT 
  tc.table_name, 
  kcu.column_name, 
  tc.constraint_type,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type IN ('UNIQUE', 'FOREIGN KEY')
ORDER BY tc.table_name;
