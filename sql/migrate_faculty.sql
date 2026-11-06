-- ─────────────────────────────────────────────────────────────
-- Adds the four frontend faculty profiles that have no database
-- record, so schedules can be saved against them.
--
-- These records cannot log in: the '!' password never matches.
-- Existing emails are skipped, so this is safe to run again.
-- ─────────────────────────────────────────────────────────────

INSERT IGNORE INTO users (first_name, last_name, email, password_hash, role, subject_role) VALUES
('Prof.', 'GenEd Instructor', 'gened@sti.edu', '!', 'faculty', 'General Education'),
('Chef', 'Hospitality Faculty', 'hospitality@sti.edu', '!', 'faculty', 'Hospitality'),
('Prof.', 'Business Faculty', 'business@sti.edu', '!', 'faculty', 'Business Admin'),
('Engr.', 'Faculty Member', 'engr@sti.edu', '!', 'faculty', 'Engineering');
