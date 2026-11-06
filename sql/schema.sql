-- ─────────────────────────────────────────────────────────────
-- Scheduling System — Database Schema
-- Import this into your Aiven MySQL database via the Aiven
-- web console (Query Editor) or via mysql CLI:
--   mysql -h HOST -P PORT -u USER -p --ssl-mode=REQUIRED DB < schema.sql
-- ─────────────────────────────────────────────────────────────
-- NOTE: On Aiven, the database is pre-created (default: 'defaultdb').
-- If using a local MySQL for dev, run:
--   CREATE DATABASE IF NOT EXISTS sti_classroom_system;
--   USE sti_classroom_system;
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS classrooms (
    room_id INT AUTO_INCREMENT PRIMARY KEY,
    room_name_number VARCHAR(50) NOT NULL,
    room_type ENUM('Lecture', 'Lab', 'CompLab', 'Kitchen', 'Bar', 'Special') NOT NULL,
    capacity INT NOT NULL,
    floor_level INT NOT NULL,
    current_status ENUM('Vacant', 'Occupied', 'Reserved') DEFAULT 'Vacant'
);

CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'academic-head', 'program-head', 'faculty') NOT NULL,
    subject_role VARCHAR(50) DEFAULT 'IT',
    active_session_token VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS school_years (
    year_id INT AUTO_INCREMENT PRIMARY KEY,
    year_code VARCHAR(50) NOT NULL UNIQUE,
    is_active TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS school_terms (
    term_id INT AUTO_INCREMENT PRIMARY KEY,
    year_id INT NOT NULL,
    term_name ENUM('1st Sem', '2nd Sem', 'Summer') NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status ENUM('draft', 'active', 'closed') DEFAULT 'draft',
    is_active TINYINT(1) DEFAULT 0,
    FOREIGN KEY (year_id) REFERENCES school_years(year_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS term_subjects (
    subject_id INT AUTO_INCREMENT PRIMARY KEY,
    term_id INT NOT NULL,
    subject_code VARCHAR(20) NOT NULL,
    subject_name VARCHAR(100) NOT NULL,
    units INT NOT NULL DEFAULT 3,
    lecture_hours DECIMAL(4,1) NOT NULL DEFAULT 3.0,
    lab_hours DECIMAL(4,1) NOT NULL DEFAULT 0.0,
    subject_type ENUM('lecture', 'lab', 'pe', 'special') DEFAULT 'lecture',
    program VARCHAR(20) NOT NULL DEFAULT 'BSIT',
    year_level INT NOT NULL DEFAULT 1,
    curriculum VARCHAR(50) DEFAULT '2024 Revised',
    is_included TINYINT(1) DEFAULT 1,
    FOREIGN KEY (term_id) REFERENCES school_terms(term_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS academic_sections (
    section_id INT AUTO_INCREMENT PRIMARY KEY,
    term_id INT NOT NULL,
    section_code VARCHAR(20) NOT NULL,
    section_name VARCHAR(50) NOT NULL,
    program VARCHAR(20) NOT NULL,
    year_level INT NOT NULL,
    student_count INT NOT NULL DEFAULT 35,
    adviser VARCHAR(100) DEFAULT NULL,
    shift VARCHAR(20) DEFAULT 'AM',
    FOREIGN KEY (term_id) REFERENCES school_terms(term_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS schedules (
    schedule_id INT AUTO_INCREMENT PRIMARY KEY,
    term_id INT NULL,
    room_id INT NOT NULL,
    faculty_id INT NOT NULL,
    subject_code VARCHAR(20) NOT NULL,
    subject_category VARCHAR(50) DEFAULT 'IT',
    section_name VARCHAR(20) NOT NULL,
    day_of_week ENUM('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat') NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    INDEX idx_schedules_term_day (term_id, day_of_week),
    FOREIGN KEY (room_id) REFERENCES classrooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (faculty_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
    setting_key VARCHAR(50) PRIMARY KEY,
    setting_value VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS departments (
    department_name VARCHAR(100) PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS subject_catalog (
    subject_code VARCHAR(20) PRIMARY KEY,
    subject_title VARCHAR(100) NOT NULL,
    department VARCHAR(100) NOT NULL,
    it_only TINYINT(1) DEFAULT 0,
    units INT NOT NULL DEFAULT 3
);

-- The subjects each teacher is allowed to teach
CREATE TABLE IF NOT EXISTS faculty_qualifications (
    user_id INT NOT NULL,
    subject_code VARCHAR(20) NOT NULL,
    PRIMARY KEY (user_id, subject_code),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS room_requests (
    request_id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    faculty_id INT NOT NULL,
    request_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    purpose TEXT NOT NULL,
    status ENUM('Pending', 'Approved', 'Declined') DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES classrooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (faculty_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    faculty_id INT NOT NULL,
    session_date DATE NOT NULL,
    actual_start_time DATETIME NOT NULL,
    actual_end_time DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES classrooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (faculty_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Seed Data: Classrooms
INSERT INTO classrooms (room_name_number, room_type, capacity, floor_level) VALUES
('CL-101', 'CompLab', 35, 1),
('CL-102', 'CompLab', 35, 1),
('CL-103', 'CompLab', 40, 1),
('CL-104', 'CompLab', 30, 1),
('LR-101', 'Lecture', 40, 1),
('LR-102', 'Lecture', 40, 1),
('LR-103', 'Lecture', 40, 1),
('Kitchen Lab', 'Special', 25, 1),
('LR-201', 'Lecture', 40, 2),
('LR-202', 'Lecture', 40, 2),
('LR-203', 'Lecture', 40, 2),
('LR-204', 'Lecture', 40, 2),
('LR-205', 'Lecture', 40, 2),
('LR-206', 'Lecture', 40, 2),
('LR-301', 'Lecture', 40, 3),
('LR-302', 'Lecture', 40, 3),
('LR-303', 'Lecture', 40, 3),
('LR-304', 'Lecture', 40, 3),
('LR-305', 'Lecture', 40, 3),
('LR-306', 'Lecture', 40, 3),
('Tourism Lab', 'Special', 30, 3);

-- Seed Data: Users
INSERT INTO users (first_name, last_name, email, password_hash, role, subject_role) VALUES
('System', 'Administrator', 'admin@sti.edu', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', NULL),
('Academic', 'Head', 'acah@sti.edu', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'academic-head', 'IT'),
('Program', 'Head', 'proh@sti.edu', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'program-head', 'IT'),
('Faculty', 'Member', 'faculty@sti.edu', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'faculty', 'IT'),
-- Teaching records with no usable password ('!' never matches a hash)
('Prof.', 'GenEd Instructor', 'gened@sti.edu', '!', 'faculty', 'General Education'),
('Chef', 'Hospitality Faculty', 'hospitality@sti.edu', '!', 'faculty', 'Hospitality'),
('Prof.', 'Business Faculty', 'business@sti.edu', '!', 'faculty', 'Business Admin'),
('Engr.', 'Faculty Member', 'engr@sti.edu', '!', 'faculty', 'Engineering');

-- Seed Data: School Years & Terms
INSERT INTO school_years (year_id, year_code, is_active) VALUES
(1, 'AY 2026-2027', 1),
(2, 'AY 2027-2028', 0);

INSERT INTO school_terms (term_id, year_id, term_name, start_date, end_date, status, is_active) VALUES
(1, 1, '1st Sem', '2026-08-17', '2026-12-18', 'active', 1),
(2, 1, '2nd Sem', '2027-01-11', '2027-05-28', 'draft', 0),
(3, 1, 'Summer',  '2027-06-07', '2027-07-23', 'draft', 0);

-- Seed Data: Academic Sections
INSERT INTO academic_sections (section_id, term_id, section_code, section_name, program, year_level, student_count, adviser) VALUES
(1, 1, 'IT701M',  'BSIT 1A',  'BSIT',  1, 38, 'Prof. Academic Head'),
(2, 1, 'IT702M',  'BSIT 1B',  'BSIT',  1, 36, 'Prof. Faculty Member'),
(3, 1, 'IT801M',  'BSIT 2A',  'BSIT',  2, 35, 'Prof. Program Head'),
(4, 1, 'IT802M',  'BSIT 2B',  'BSIT',  2, 34, 'Prof. Faculty Member'),
(5, 1, 'CS701M',  'BSCS 1A',  'BSCS',  1, 32, 'Prof. Program Head'),
(6, 1, 'CPE701M', 'BSCpE 1A', 'BSCpE', 1, 30, 'Engr. Faculty Member'),
(7, 1, 'HM701M',  'BSHM 1A',  'BSHM',  1, 40, 'Chef Faculty Member'),
(8, 1, 'TM701M',  'BSTM 1A',  'BSTM',  1, 34, 'Prof. Academic Head'),
(9, 1, 'BA701M',  'BSBA 1A',  'BSBA',  1, 35, 'Prof. Academic Head');

-- Seed Data: Term Subjects
INSERT INTO term_subjects (term_id, subject_code, subject_name, units, lecture_hours, lab_hours, subject_type, program, year_level, curriculum, is_included) VALUES
(1, 'ITE 101', 'Introduction to Computing', 3, 2.0, 3.0, 'lecture', 'BSIT', 1, '2024 Revised', 1),
(1, 'CC 103',  'Computer Programming 1', 3, 2.0, 3.0, 'lecture', 'BSIT', 1, '2024 Revised', 1),
(1, 'GE 107',  'Ethics', 3, 3.0, 0.0, 'lecture', 'BSIT', 1, '2024 Revised', 1),
(1, 'GE 201',  'Purposive Communication', 3, 3.0, 0.0, 'lecture', 'BSIT', 1, '2024 Revised', 1),
(1, 'PE 102',  'Physical Fitness', 2, 2.0, 0.0, 'pe', 'BSIT', 1, '2024 Revised', 1),
(1, 'NSTP 1',  'National Service Training Program', 3, 3.0, 0.0, 'special', 'BSIT', 1, '2024 Revised', 1),
(1, 'ITE 301', 'Data Structures & Algorithms', 3, 2.0, 3.0, 'lecture', 'BSIT', 2, '2024 Revised', 1),
(1, 'IM 101',  'Database Management Systems', 3, 2.0, 3.0, 'lecture', 'BSIT', 2, '2024 Revised', 1),
(1, 'CS 201',  'Discrete Mathematics', 3, 3.0, 0.0, 'lecture', 'BSCS', 1, '2024 Revised', 1),
(1, 'HM 201',  'Food & Beverage Service', 3, 1.0, 4.0, 'special', 'BSHM', 1, '2024 Revised', 1),
(1, 'TM 301',  'Tourism Planning', 3, 3.0, 0.0, 'lecture', 'BSTM', 1, '2024 Revised', 1),
(1, 'BA 101',  'Principles of Management', 3, 3.0, 0.0, 'lecture', 'BSBA', 1, '2024 Revised', 1);

-- Seed Data: Schedules
INSERT INTO schedules (room_id, faculty_id, subject_code, subject_category, section_name, day_of_week, start_time, end_time) VALUES
(1, 2, 'IT101', 'IT', 'BSIT-1A', 'Mon', '08:00:00', '10:00:00'),
(9, 3, 'GE101', 'General Education', 'BSIT-1B', 'Tue', '10:30:00', '12:00:00'),
(8, 3, 'HM101', 'Hospitality', 'BSHM-1A', 'Wed', '13:00:00', '16:00:00'),
(21, 3, 'HM102', 'Hospitality', 'BSTM-1A', 'Thu', '09:00:00', '11:00:00'),
(2, 2, 'IT201', 'IT', 'BSIT-2A', 'Fri', '14:00:00', '16:00:00'),
(15, 3, 'GE102', 'General Education', 'BSIT-2B', 'Mon', '11:00:00', '13:00:00'),
(10, 2, 'IT301', 'IT', 'BSIT-3A', 'Tue', '07:30:00', '09:30:00'),
(8, 2, 'HM201', 'Hospitality', 'BSHM-2A', 'Wed', '16:00:00', '18:00:00'),
(3, 2, 'IT401', 'IT', 'BSIT-4A', 'Sat', '08:00:00', '12:00:00'),
(18, 3, 'GE201', 'General Education', 'BSIT-1A', 'Thu', '14:00:00', '15:30:00');
