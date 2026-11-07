<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';

header('Content-Type: application/json');

/**
 * Validates schedule items and converts them to insert rows.
 * Runs before any delete, so a bad item stops the save with nothing changed.
 */
function resolveScheduleRows(PDO $db, array $items, int $termId, ?array $qualifications = null): array {
    $roomStmt = $db->prepare("SELECT room_id FROM classrooms WHERE room_name_number = ? LIMIT 1");
    $facultyStmt = $db->prepare("SELECT user_id FROM users WHERE CONCAT(first_name, ' ', last_name) = ? LIMIT 1");
    $validDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    $rows = [];

    foreach ($items as $item) {
        $roomName = (string)($item['room'] ?? '');
        $roomId = (int)($item['room_id'] ?? 0);
        if (!$roomId && $roomName !== '') {
            $roomStmt->execute([$roomName]);
            $roomId = (int)$roomStmt->fetchColumn();
        }
        if (!$roomId) {
            jsonResponse(['success' => false, 'message' => "Room '{$roomName}' was not found in the database. No changes were made."], 400);
        }

        $instructor = (string)($item['instructor'] ?? '');
        $facultyId = (int)($item['faculty_id'] ?? 0);
        if (!$facultyId && $instructor !== '') {
            $facultyStmt->execute([$instructor]);
            $facultyId = (int)$facultyStmt->fetchColumn();
        }
        if (!$facultyId) {
            jsonResponse(['success' => false, 'message' => "Faculty '{$instructor}' has no user account in the database. No changes were made."], 400);
        }

        $subCode = trim((string)($item['subject_code'] ?? ($item['subjectCode'] ?? '')));
        $subCat = (string)($item['subject_category'] ?? ($item['program'] ?? 'IT'));
        $secName = trim((string)($item['section_name'] ?? ($item['section'] ?? '')));
        $day = (string)($item['day_of_week'] ?? ($item['day'] ?? ''));
        $start = (string)($item['start_time'] ?? ($item['startTime'] ?? ''));
        $end = (string)($item['end_time'] ?? ($item['endTime'] ?? ''));

        if (strlen($start) === 5) $start .= ':00';
        if (strlen($end) === 5) $end .= ':00';

        $validTimes = preg_match('/^\d{2}:\d{2}:\d{2}$/', $start) && preg_match('/^\d{2}:\d{2}:\d{2}$/', $end) && $start < $end;
        if ($subCode === '' || $secName === '' || !in_array($day, $validDays, true) || !$validTimes) {
            jsonResponse(['success' => false, 'message' => "Class '{$subCode}' for section '{$secName}' has invalid details. No changes were made."], 400);
        }

        if ($qualifications !== null && empty($qualifications[$facultyId][strtoupper($subCode)])) {
            jsonResponse(['success' => false, 'message' => "{$instructor} does not have {$subCode} in their main qualifications. No changes were made."], 400);
        }

        $rowTermId = $termId ?: (int)($item['termId'] ?? 0);
        $rows[] = [$rowTermId ?: null, $roomId, $facultyId, $subCode, $subCat, $secName, $day, $start, $end];
    }
    return $rows;
}

function isStatePublished(PDO $db): bool {
    return (bool)$db->query("SELECT COUNT(*) FROM app_settings WHERE setting_key = 'state_published'")->fetchColumn();
}

/** Returns allowed subjects as [user_id][SUBJECT CODE] => true. */
function loadQualifications(PDO $db): array {
    $map = [];
    foreach ($db->query("SELECT user_id, subject_code FROM faculty_qualifications")->fetchAll() as $row) {
        $map[(int)$row['user_id']][strtoupper($row['subject_code'])] = true;
    }
    return $map;
}

function requireAdminRole(): void {
    if (($_SESSION['role'] ?? '') !== 'admin') {
        jsonResponse(['success' => false, 'message' => 'Only an administrator can do this.'], 403);
    }
}

function insertQualifications(PDO $db, int $userId, array $subjects): void {
    $ins = $db->prepare("INSERT IGNORE INTO faculty_qualifications (user_id, subject_code) VALUES (?, ?)");
    foreach ($subjects as $code) {
        $code = strtoupper(trim((string)$code));
        if ($code !== '') {
            $ins->execute([$userId, $code]);
        }
    }
}

function insertScheduleRows(PDO $db, array $rows): void {
    $ins = $db->prepare("
        INSERT INTO schedules (term_id, room_id, faculty_id, subject_code, subject_category, section_name, day_of_week, start_time, end_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");
    foreach ($rows as $row) {
        $ins->execute($row);
    }
}

// Everything here needs a login. Changes are limited to scheduling staff.
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    requireAnyRole(['admin', 'academic-head', 'program-head']);
    requireCSRF();
} else {
    requireLogin();
}

$db = getDB();

// Ensure lifecycle tables exist (Self-healing schema migration)
try {
    $db->exec("
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
            is_active TINYINT(1) DEFAULT 0
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
            is_included TINYINT(1) DEFAULT 1
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
            shift VARCHAR(20) DEFAULT 'AM'
        );
    ");

    $db->exec("CREATE TABLE IF NOT EXISTS app_settings (setting_key VARCHAR(50) PRIMARY KEY, setting_value VARCHAR(255) NOT NULL)");
    $db->exec("CREATE TABLE IF NOT EXISTS departments (department_name VARCHAR(100) PRIMARY KEY)");
    $db->exec("CREATE TABLE IF NOT EXISTS subject_catalog (subject_code VARCHAR(20) PRIMARY KEY, subject_title VARCHAR(100) NOT NULL, department VARCHAR(100) NOT NULL, it_only TINYINT(1) DEFAULT 0, units INT NOT NULL DEFAULT 3)");
    $db->exec("CREATE TABLE IF NOT EXISTS faculty_qualifications (user_id INT NOT NULL, subject_code VARCHAR(20) NOT NULL, PRIMARY KEY (user_id, subject_code), FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE)");

    try { $db->exec("ALTER TABLE academic_sections ADD COLUMN shift VARCHAR(20) DEFAULT 'AM'"); } catch (Exception $e) {}

    // Seed school years if empty
    $checkSY = $db->query("SELECT COUNT(*) FROM school_years")->fetchColumn();
    if ($checkSY == 0) {
        $db->exec("
            INSERT INTO school_years (year_id, year_code, is_active) VALUES (1, 'AY 2026-2027', 1), (2, 'AY 2027-2028', 0);
            INSERT INTO school_terms (term_id, year_id, term_name, start_date, end_date, status, is_active) VALUES
            (1, 1, '1st Sem', '2026-08-17', '2026-12-18', 'active', 1),
            (2, 1, '2nd Sem', '2027-01-11', '2027-05-28', 'draft', 0),
            (3, 1, 'Summer',  '2027-06-07', '2027-07-23', 'draft', 0);
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
        ");
    }
} catch (Exception $e) {
    // Non-fatal if DB permissions restrict DDL
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $action = $_GET['action'] ?? '';

    // Full lifecycle fetch
    if ($action === 'get_lifecycle' || isset($_GET['lifecycle'])) {
        try {
            $years = $db->query("SELECT * FROM school_years ORDER BY created_at DESC")->fetchAll();
            $terms = $db->query("SELECT * FROM school_terms ORDER BY term_id ASC")->fetchAll();
            $subjects = $db->query("SELECT * FROM term_subjects ORDER BY year_level ASC, subject_code ASC")->fetchAll();
            $sections = $db->query("SELECT * FROM academic_sections ORDER BY year_level ASC, section_code ASC")->fetchAll();
            $rooms = $db->query("SELECT room_id, room_name_number, room_type, capacity, floor_level, current_status FROM classrooms ORDER BY floor_level, room_name_number")->fetchAll();
            $faculty = $db->query("SELECT user_id, first_name, last_name, email, role, subject_role FROM users WHERE role IN ('faculty', 'academic-head', 'program-head')")->fetchAll();
            $schedules = $db->query("
                SELECT s.*, c.room_name_number, CONCAT(u.first_name, ' ', u.last_name) AS faculty_name
                FROM schedules s
                JOIN classrooms c ON s.room_id = c.room_id
                JOIN users u ON s.faculty_id = u.user_id
                ORDER BY s.day_of_week, s.start_time
            ")->fetchAll();
            $initialized = isStatePublished($db);
            $catalog = $db->query("SELECT * FROM subject_catalog ORDER BY subject_code")->fetchAll();
            $departments = $db->query("SELECT department_name FROM departments ORDER BY department_name")->fetchAll(PDO::FETCH_COLUMN);
            $qualifications = $db->query("
                SELECT u.email, q.subject_code
                FROM faculty_qualifications q
                JOIN users u ON q.user_id = u.user_id
                ORDER BY q.subject_code
            ")->fetchAll();

            jsonResponse([
                'success' => true,
                'data' => [
                    'initialized' => $initialized,
                    'years' => $years,
                    'terms' => $terms,
                    'subjects' => $subjects,
                    'sections' => $sections,
                    'rooms' => $rooms,
                    'faculty' => $faculty,
                    'schedules' => $schedules,
                    'catalog' => $catalog,
                    'departments' => $departments,
                    'qualifications' => $qualifications
                ]
            ]);
        } catch (Exception $e) {
            error_log('schedules.php lifecycle: ' . $e->getMessage());
            jsonResponse(['success' => false, 'error' => 'A server error occurred. Please try again later.'], 500);
        }
    }

    if (!isset($_GET['day'])) {
        // Return all raw schedules if no specific day filter
        $stmt = $db->query("SELECT s.*, c.room_name_number, CONCAT(u.first_name, ' ', u.last_name) AS faculty_name FROM schedules s JOIN classrooms c ON s.room_id = c.room_id JOIN users u ON s.faculty_id = u.user_id");
        jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
    }

    $day = $_GET['day'];
    $floor = (isset($_GET['floor']) && $_GET['floor'] !== 'all') ? (int)$_GET['floor'] : null;
    $room_id = isset($_GET['room_id']) ? (int)$_GET['room_id'] : null;

    // Build room query
    $roomQuery = "SELECT room_id, room_name_number, floor_level FROM classrooms";
    $roomParams = [];
    $conditions = [];

    if ($floor) {
        $conditions[] = "floor_level = ?";
        $roomParams[] = $floor;
    }
    if ($room_id) {
        $conditions[] = "room_id = ?";
        $roomParams[] = $room_id;
    }
    if ($conditions) {
        $roomQuery .= " WHERE " . implode(" AND ", $conditions);
    }
    $roomQuery .= " ORDER BY floor_level, room_name_number";

    $stmt = $db->prepare($roomQuery);
    $stmt->execute($roomParams);
    $rooms = $stmt->fetchAll();

    // Get schedules for the day
    $schedQuery = "SELECT s.schedule_id, s.room_id, s.faculty_id, s.subject_code, s.subject_category, s.section_name,
                          s.day_of_week, s.start_time, s.end_time,
                          CONCAT(u.first_name, ' ', u.last_name) AS faculty_name,
                          u.subject_role AS faculty_subject_role
                   FROM schedules s
                   JOIN users u ON s.faculty_id = u.user_id
                   WHERE s.day_of_week = ?";
    $schedParams = [$day];

    if ($room_id) {
        $schedQuery .= " AND s.room_id = ?";
        $schedParams[] = $room_id;
    }

    $stmt = $db->prepare($schedQuery);
    $stmt->execute($schedParams);
    $schedules = $stmt->fetchAll();

    // Group schedules by room_id
    $schedByRoom = [];
    foreach ($schedules as $s) {
        $schedByRoom[$s['room_id']][] = $s;
    }

    // Build grouped response
    $result = [];
    foreach ($rooms as $room) {
        $result[] = [
            'room_id' => $room['room_id'],
            'room_name_number' => $room['room_name_number'],
            'floor_level' => $room['floor_level'],
            'schedules' => $schedByRoom[$room['room_id']] ?? []
        ];
    }

    jsonResponse(['success' => true, 'data' => $result]);

} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $action = $input['action'] ?? '';

    // ─── 0. ONE-TIME PUBLISH OF AN ADMIN BROWSER'S DATA ───
    if ($action === 'publish_state') {
        requireAdminRole();
        if (isStatePublished($db)) {
            jsonResponse(['success' => false, 'message' => 'Scheduling data has already been published.'], 409);
        }

        $years = is_array($input['years'] ?? null) ? $input['years'] : [];
        $terms = is_array($input['terms'] ?? null) ? $input['terms'] : [];
        $subjects = is_array($input['subjects'] ?? null) ? $input['subjects'] : [];
        $sections = is_array($input['sections'] ?? null) ? $input['sections'] : [];
        $items = is_array($input['schedules'] ?? null) ? $input['schedules'] : [];
        $catalog = is_array($input['catalog'] ?? null) ? $input['catalog'] : [];
        $departments = is_array($input['departments'] ?? null) ? $input['departments'] : [];
        $qualifications = is_array($input['qualifications'] ?? null) ? $input['qualifications'] : [];

        if (!$years || !$terms) {
            jsonResponse(['success' => false, 'message' => 'School years and terms are required.'], 400);
        }

        $rows = resolveScheduleRows($db, $items, 0);

        $db->beginTransaction();
        try {
            foreach (['schedules', 'academic_sections', 'term_subjects', 'school_terms', 'school_years', 'faculty_qualifications', 'subject_catalog', 'departments'] as $table) {
                $db->exec("DELETE FROM {$table}");
            }

            $insDept = $db->prepare("INSERT IGNORE INTO departments (department_name) VALUES (?)");
            foreach ($departments as $d) {
                $insDept->execute([$d]);
            }

            $insCatalog = $db->prepare("INSERT INTO subject_catalog (subject_code, subject_title, department, it_only, units) VALUES (?, ?, ?, ?, ?)");
            foreach ($catalog as $c) {
                $insCatalog->execute([strtoupper(trim($c['code'])), $c['title'], $c['dept'], !empty($c['itOnly']) ? 1 : 0, (int)($c['units'] ?? 3)]);
            }

            $findUser = $db->prepare("SELECT user_id FROM users WHERE email = ?");
            foreach ($qualifications as $q) {
                $findUser->execute([$q['email'] ?? '']);
                $userId = (int)$findUser->fetchColumn();
                if ($userId) {
                    insertQualifications($db, $userId, is_array($q['subjects'] ?? null) ? $q['subjects'] : []);
                }
            }

            $insYear = $db->prepare("INSERT INTO school_years (year_id, year_code, is_active) VALUES (?, ?, ?)");
            foreach ($years as $y) {
                $insYear->execute([(int)$y['id'], $y['yearCode'], !empty($y['isActive']) ? 1 : 0]);
            }

            $insTerm = $db->prepare("INSERT INTO school_terms (term_id, year_id, term_name, start_date, end_date, status, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)");
            foreach ($terms as $t) {
                $insTerm->execute([(int)$t['id'], (int)$t['yearId'], $t['termName'], $t['startDate'], $t['endDate'], $t['status'] ?? 'draft', !empty($t['isActive']) ? 1 : 0]);
            }

            $insSubject = $db->prepare("INSERT INTO term_subjects (subject_id, term_id, subject_code, subject_name, units, lecture_hours, lab_hours, subject_type, program, year_level, curriculum, is_included) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            foreach ($subjects as $s) {
                $insSubject->execute([(int)$s['id'], (int)$s['termId'], $s['code'], $s['name'], (int)($s['units'] ?? 3), (float)($s['lecHours'] ?? 3), (float)($s['labHours'] ?? 0), $s['type'] ?? 'lecture', $s['program'] ?? 'BSIT', (int)($s['year'] ?? 1), $s['curriculum'] ?? '2024 Revised', ($s['isIncluded'] ?? true) ? 1 : 0]);
            }

            $insSection = $db->prepare("INSERT INTO academic_sections (section_id, term_id, section_code, section_name, program, year_level, student_count, adviser, shift) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            foreach ($sections as $s) {
                $insSection->execute([(int)$s['id'], (int)$s['termId'], $s['code'], $s['name'], $s['program'], (int)$s['year'], (int)$s['studentCount'], $s['adviser'] ?? null, $s['shift'] ?? 'AM']);
            }

            insertScheduleRows($db, $rows);
            $db->exec("INSERT INTO app_settings (setting_key, setting_value) VALUES ('state_published', '1')");
            $db->commit();
            jsonResponse(['success' => true, 'message' => 'Scheduling data published.']);
        } catch (Exception $e) {
            $db->rollBack();
            error_log('schedules.php publish: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => 'Publishing failed. No changes were made.'], 500);
        }
    }

    // ─── 0b. QUALIFICATIONS, SUBJECT CATALOG, DEPARTMENTS ───
    if ($action === 'save_faculty_qualifications') {
        requireAdminRole();
        $subjects = is_array($input['subjects'] ?? null) ? $input['subjects'] : [];

        $findUser = $db->prepare("SELECT user_id FROM users WHERE email = ? AND role IN ('faculty', 'academic-head', 'program-head')");
        $findUser->execute([trim($input['email'] ?? '')]);
        $userId = (int)$findUser->fetchColumn();
        if (!$userId) {
            jsonResponse(['success' => false, 'message' => 'That teacher has no user account in the database.'], 404);
        }

        $known = $db->query("SELECT UPPER(subject_code) FROM subject_catalog UNION SELECT UPPER(subject_code) FROM term_subjects")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($subjects as $code) {
            $code = strtoupper(trim((string)$code));
            if ($code !== '' && !in_array($code, $known, true)) {
                jsonResponse(['success' => false, 'message' => "{$code} is not in the subject catalog or curriculum. No changes were made."], 400);
            }
        }

        $db->beginTransaction();
        $db->prepare("DELETE FROM faculty_qualifications WHERE user_id = ?")->execute([$userId]);
        insertQualifications($db, $userId, $subjects);
        $db->commit();
        jsonResponse(['success' => true, 'message' => 'Qualifications saved']);
    }

    if ($action === 'save_catalog_subject') {
        requireAdminRole();
        $code = strtoupper(trim($input['subject_code'] ?? ''));
        $title = trim($input['subject_title'] ?? '');
        $department = trim($input['department'] ?? '');
        if ($code === '' || $title === '' || $department === '') {
            jsonResponse(['success' => false, 'message' => 'Subject code, title and department are required.'], 400);
        }
        $stmt = $db->prepare("
            INSERT INTO subject_catalog (subject_code, subject_title, department, it_only, units) VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE subject_title = VALUES(subject_title), department = VALUES(department), it_only = VALUES(it_only), units = VALUES(units)
        ");
        $stmt->execute([$code, $title, $department, !empty($input['it_only']) ? 1 : 0, (int)($input['units'] ?? 3)]);
        jsonResponse(['success' => true, 'message' => 'Subject saved']);
    }

    if ($action === 'delete_catalog_subject') {
        requireAdminRole();
        $code = strtoupper(trim($input['subject_code'] ?? ''));
        $db->beginTransaction();
        $db->prepare("DELETE FROM subject_catalog WHERE subject_code = ?")->execute([$code]);
        // A subject still in a curriculum stays teachable, so its qualifications are kept
        $db->prepare("DELETE FROM faculty_qualifications WHERE subject_code = ? AND NOT EXISTS (SELECT 1 FROM term_subjects WHERE UPPER(subject_code) = ?)")->execute([$code, $code]);
        $db->commit();
        jsonResponse(['success' => true, 'message' => 'Subject removed']);
    }

    if ($action === 'save_departments') {
        requireAdminRole();
        $names = array_values(array_unique(array_filter(array_map('trim', is_array($input['departments'] ?? null) ? $input['departments'] : []))));
        if (!$names) {
            jsonResponse(['success' => false, 'message' => 'At least one department must remain.'], 400);
        }

        $existing = $db->query("SELECT department_name FROM departments")->fetchAll(PDO::FETCH_COLUMN);
        $db->beginTransaction();
        $moveSubjects = $db->prepare("UPDATE subject_catalog SET department = ? WHERE department = ?");
        $moveUsers = $db->prepare("UPDATE users SET subject_role = ? WHERE subject_role = ?");
        $remove = $db->prepare("DELETE FROM departments WHERE department_name = ?");
        foreach (array_diff($existing, $names) as $removed) {
            $moveSubjects->execute([$names[0], $removed]);
            $moveUsers->execute([$names[0], $removed]);
            $remove->execute([$removed]);
        }
        $add = $db->prepare("INSERT IGNORE INTO departments (department_name) VALUES (?)");
        foreach ($names as $name) {
            $add->execute([$name]);
        }
        $db->commit();
        jsonResponse(['success' => true, 'message' => 'Departments saved']);
    }

    // ─── 1. SCHOOL YEAR ACTIONS ───
    if ($action === 'save_school_year') {
        $year_id = (int)($input['year_id'] ?? 0);
        $year_code = trim($input['year_code'] ?? '');
        $is_active = !empty($input['is_active']) ? 1 : 0;

        if (!$year_code) {
            jsonResponse(['success' => false, 'message' => 'Year code is required (e.g., AY 2026-2027)'], 400);
        }

        $terms = is_array($input['terms'] ?? null) ? $input['terms'] : [];

        $dupYear = $db->prepare("SELECT year_id FROM school_years WHERE year_code = ? AND year_id != ?");
        $dupYear->execute([$year_code, $year_id]);
        if ($dupYear->fetch()) {
            jsonResponse(['success' => false, 'message' => "School year {$year_code} already exists."], 409);
        }

        $db->beginTransaction();
        if ($is_active) {
            $db->exec("UPDATE school_years SET is_active = 0");
            $db->exec("UPDATE school_terms SET is_active = 0");
        }

        if ($year_id > 0) {
            $stmt = $db->prepare("UPDATE school_years SET year_code = ?, is_active = ? WHERE year_id = ?");
            $stmt->execute([$year_code, $is_active, $year_id]);
            $updTerm = $db->prepare("UPDATE school_terms SET start_date = ?, end_date = ?, is_active = ? WHERE year_id = ? AND term_name = ?");
            foreach ($terms as $t) {
                $updTerm->execute([$t['startDate'], $t['endDate'], !empty($t['isActive']) ? 1 : 0, $year_id, $t['termName']]);
            }
            $db->commit();
            jsonResponse(['success' => true, 'message' => 'School year updated successfully']);
        } else {
            $stmt = $db->prepare("INSERT INTO school_years (year_code, is_active) VALUES (?, ?)");
            $stmt->execute([$year_code, $is_active]);
            $newId = (int)$db->lastInsertId();
            $insTerm = $db->prepare("INSERT INTO school_terms (year_id, term_name, start_date, end_date, status, is_active) VALUES (?, ?, ?, ?, ?, ?)");
            foreach ($terms as $t) {
                $insTerm->execute([$newId, $t['termName'], $t['startDate'], $t['endDate'], $t['status'] ?? 'draft', !empty($t['isActive']) ? 1 : 0]);
            }
            $db->commit();
            jsonResponse(['success' => true, 'message' => 'School year created successfully', 'year_id' => $newId]);
        }
    }

    if ($action === 'set_active_year') {
        $year_id = (int)($input['year_id'] ?? 0);
        if (!$year_id) jsonResponse(['success' => false, 'message' => 'year_id required'], 400);

        $db->beginTransaction();
        $db->exec("UPDATE school_years SET is_active = 0");
        $stmt = $db->prepare("UPDATE school_years SET is_active = 1 WHERE year_id = ?");
        $stmt->execute([$year_id]);
        // The year's first term becomes the working term, matching the frontend
        $db->exec("UPDATE school_terms SET is_active = 0");
        $stmt = $db->prepare("UPDATE school_terms SET is_active = 1 WHERE year_id = ? ORDER BY FIELD(term_name, '1st Sem', '2nd Sem', 'Summer') LIMIT 1");
        $stmt->execute([$year_id]);
        $db->commit();
        jsonResponse(['success' => true, 'message' => 'Active school year updated']);
    }

    if ($action === 'delete_school_year') {
        $year_id = (int)($input['year_id'] ?? 0);
        $stmt = $db->prepare("DELETE FROM school_years WHERE year_id = ?");
        $stmt->execute([$year_id]);
        jsonResponse(['success' => true, 'message' => 'School year removed']);
    }

    // ─── 2. SCHOOL TERM ACTIONS ───
    if ($action === 'save_term') {
        $term_id = (int)($input['term_id'] ?? 0);
        $year_id = (int)($input['year_id'] ?? 1);
        $term_name = $input['term_name'] ?? '1st Sem';
        $start_date = $input['start_date'] ?? date('Y-m-d');
        $end_date = $input['end_date'] ?? date('Y-m-d', strtotime('+4 months'));
        $status = in_array($input['status'] ?? '', ['draft', 'active', 'closed']) ? $input['status'] : 'draft';
        $is_active = !empty($input['is_active']) ? 1 : 0;

        if ($end_date <= $start_date) {
            jsonResponse(['success' => false, 'message' => 'The term end date must be after its start date.'], 400);
        }

        if ($term_id > 0) {
            // Status and date edits don't send is_active, so only change it when provided.
            if (array_key_exists('is_active', $input)) {
                $stmt = $db->prepare("UPDATE school_terms SET term_name=?, start_date=?, end_date=?, status=?, is_active=? WHERE term_id=?");
                $stmt->execute([$term_name, $start_date, $end_date, $status, $is_active, $term_id]);
            } else {
                $stmt = $db->prepare("UPDATE school_terms SET term_name=?, start_date=?, end_date=?, status=? WHERE term_id=?");
                $stmt->execute([$term_name, $start_date, $end_date, $status, $term_id]);
            }
            jsonResponse(['success' => true, 'message' => 'Term updated successfully']);
        } else {
            $stmt = $db->prepare("INSERT INTO school_terms (year_id, term_name, start_date, end_date, status, is_active) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([$year_id, $term_name, $start_date, $end_date, $status, $is_active]);
            jsonResponse(['success' => true, 'message' => 'Term created successfully', 'term_id' => $db->lastInsertId()]);
        }
    }

    if ($action === 'set_active_term') {
        $term_id = (int)($input['term_id'] ?? 0);
        if (!$term_id) jsonResponse(['success' => false, 'message' => 'term_id required'], 400);

        $db->beginTransaction();
        $db->exec("UPDATE school_terms SET is_active = 0");
        $stmt = $db->prepare("UPDATE school_terms SET is_active = 1 WHERE term_id = ?");
        $stmt->execute([$term_id]);
        // The term's parent year must be the active year, matching the frontend
        $db->exec("UPDATE school_years SET is_active = 0");
        $stmt = $db->prepare("UPDATE school_years SET is_active = 1 WHERE year_id = (SELECT year_id FROM school_terms WHERE term_id = ?)");
        $stmt->execute([$term_id]);
        $db->commit();
        jsonResponse(['success' => true, 'message' => 'Active term set']);
    }

    // ─── 3. LOAD & CURRICULUM SUBJECTS ACTIONS ───
    if ($action === 'save_term_subject') {
        $subject_id = (int)($input['subject_id'] ?? 0);
        $term_id = (int)($input['term_id'] ?? 1);
        $subject_code = trim($input['subject_code'] ?? '');
        $subject_name = trim($input['subject_name'] ?? '');
        $units = (int)($input['units'] ?? 3);
        $lecture_hours = (float)($input['lecture_hours'] ?? 3.0);
        $lab_hours = (float)($input['lab_hours'] ?? 0.0);
        $subject_type = in_array($input['subject_type'] ?? '', ['lecture', 'lab', 'pe', 'special']) ? $input['subject_type'] : 'lecture';
        $program = trim($input['program'] ?? 'BSIT');
        $year_level = (int)($input['year_level'] ?? 1);
        $curriculum = trim($input['curriculum'] ?? '2024 Revised');
        $is_included = isset($input['is_included']) ? ($input['is_included'] ? 1 : 0) : 1;

        if (!$subject_code || !$subject_name) {
            jsonResponse(['success' => false, 'message' => 'Subject code and title are required'], 400);
        }

        if ($subject_id > 0) {
            $stmt = $db->prepare("UPDATE term_subjects SET subject_code=?, subject_name=?, units=?, lecture_hours=?, lab_hours=?, subject_type=?, program=?, year_level=?, curriculum=?, is_included=? WHERE subject_id=?");
            $stmt->execute([$subject_code, $subject_name, $units, $lecture_hours, $lab_hours, $subject_type, $program, $year_level, $curriculum, $is_included, $subject_id]);
            jsonResponse(['success' => true, 'message' => 'Subject updated']);
        } else {
            $stmt = $db->prepare("INSERT INTO term_subjects (term_id, subject_code, subject_name, units, lecture_hours, lab_hours, subject_type, program, year_level, curriculum, is_included) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$term_id, $subject_code, $subject_name, $units, $lecture_hours, $lab_hours, $subject_type, $program, $year_level, $curriculum, $is_included]);
            jsonResponse(['success' => true, 'message' => 'Subject added', 'subject_id' => $db->lastInsertId()]);
        }
    }

    if ($action === 'toggle_term_subject') {
        $subject_id = (int)($input['subject_id'] ?? 0);
        $stmt = $db->prepare("UPDATE term_subjects SET is_included = NOT is_included WHERE subject_id = ?");
        $stmt->execute([$subject_id]);
        jsonResponse(['success' => true, 'message' => 'Subject inclusion toggled']);
    }

    if ($action === 'set_all_subjects_included') {
        $stmt = $db->prepare("UPDATE term_subjects SET is_included = ?");
        $stmt->execute([!empty($input['is_included']) ? 1 : 0]);
        jsonResponse(['success' => true, 'message' => 'Subject inclusion updated']);
    }

    if ($action === 'delete_term_subject') {
        $subject_id = (int)($input['subject_id'] ?? 0);
        $stmt = $db->prepare("DELETE FROM term_subjects WHERE subject_id = ?");
        $stmt->execute([$subject_id]);
        jsonResponse(['success' => true, 'message' => 'Subject removed']);
    }

    // ─── 4. SECTION BUILDER ACTIONS ───
    if ($action === 'save_section') {
        $section_id = (int)($input['section_id'] ?? 0);
        $term_id = (int)($input['term_id'] ?? 1);
        $section_code = trim($input['section_code'] ?? '');
        $section_name = trim($input['section_name'] ?? '');
        $program = trim($input['program'] ?? 'BSIT');
        $year_level = (int)($input['year_level'] ?? 1);
        $student_count = (int)($input['student_count'] ?? 35);
        $adviser = trim($input['adviser'] ?? '');
        $shift = trim($input['shift'] ?? 'AM');
        if (!in_array($shift, ['AM', 'MIDSHIFT', 'PM'])) $shift = 'AM';

        if (!$section_code || !$section_name) {
            jsonResponse(['success' => false, 'message' => 'Section code and name are required'], 400);
        }

        // An edit stays in the section's own term
        if ($section_id > 0) {
            $findTerm = $db->prepare("SELECT term_id FROM academic_sections WHERE section_id = ?");
            $findTerm->execute([$section_id]);
            $term_id = (int)$findTerm->fetchColumn();
        }
        $dupSection = $db->prepare("SELECT section_id FROM academic_sections WHERE section_code = ? AND term_id = ? AND section_id != ?");
        $dupSection->execute([$section_code, $term_id, $section_id]);
        if ($dupSection->fetch()) {
            jsonResponse(['success' => false, 'message' => "Section code {$section_code} already exists in this term."], 409);
        }

        if ($section_id > 0) {
            $stmt = $db->prepare("UPDATE academic_sections SET section_code=?, section_name=?, program=?, year_level=?, student_count=?, adviser=?, shift=? WHERE section_id=?");
            $stmt->execute([$section_code, $section_name, $program, $year_level, $student_count, $adviser, $shift, $section_id]);
            jsonResponse(['success' => true, 'message' => 'Section updated']);
        } else {
            $stmt = $db->prepare("INSERT INTO academic_sections (term_id, section_code, section_name, program, year_level, student_count, adviser, shift) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$term_id, $section_code, $section_name, $program, $year_level, $student_count, $adviser, $shift]);
            jsonResponse(['success' => true, 'message' => 'Section created', 'section_id' => $db->lastInsertId()]);
        }
    }

    if ($action === 'merge_sections') {
        $sec1_id = (int)($input['primary_section_id'] ?? 0);
        $sec2_id = (int)($input['secondary_section_id'] ?? 0);

        if (!$sec1_id || !$sec2_id) {
            jsonResponse(['success' => false, 'message' => 'Two section IDs required to merge'], 400);
        }

        $s1 = $db->prepare("SELECT * FROM academic_sections WHERE section_id = ?");
        $s1->execute([$sec1_id]);
        $row1 = $s1->fetch();

        $s2 = $db->prepare("SELECT * FROM academic_sections WHERE section_id = ?");
        $s2->execute([$sec2_id]);
        $row2 = $s2->fetch();

        if ($row1 && $row2) {
            $mergedCount = $row1['student_count'] + $row2['student_count'];
            $stmt = $db->prepare("UPDATE academic_sections SET student_count = ? WHERE section_id = ?");
            $stmt->execute([$mergedCount, $sec1_id]);

            // Re-point any schedules from sec2 to sec1
            $updSched = $db->prepare("UPDATE schedules SET section_name = ? WHERE section_name = ? AND (term_id = ? OR term_id IS NULL)");
            $updSched->execute([$row1['section_code'], $row2['section_code'], $row2['term_id']]);

            $del = $db->prepare("DELETE FROM academic_sections WHERE section_id = ?");
            $del->execute([$sec2_id]);

            jsonResponse(['success' => true, 'message' => "Sections merged into {$row1['section_code']} (Total Students: {$mergedCount})"]);
        } else {
            jsonResponse(['success' => false, 'message' => 'Sections not found'], 404);
        }
    }

    if ($action === 'split_section') {
        $sec_id = (int)($input['section_id'] ?? 0);
        $split_count = (int)($input['split_student_count'] ?? 0);
        $new_code = trim($input['new_section_code'] ?? '');
        $new_name = trim($input['new_section_name'] ?? '');

        $stmt = $db->prepare("SELECT * FROM academic_sections WHERE section_id = ?");
        $stmt->execute([$sec_id]);
        $sec = $stmt->fetch();

        if (!$sec) jsonResponse(['success' => false, 'message' => 'Source section not found'], 404);
        if ($split_count <= 0 || $split_count >= $sec['student_count']) {
            jsonResponse(['success' => false, 'message' => 'Split count must be between 1 and ' . ($sec['student_count'] - 1)], 400);
        }

        $splitCode = $new_code ?: $sec['section_code'] . '-B';
        $dupSection = $db->prepare("SELECT section_id FROM academic_sections WHERE section_code = ? AND term_id = ?");
        $dupSection->execute([$splitCode, $sec['term_id']]);
        if ($dupSection->fetch()) {
            jsonResponse(['success' => false, 'message' => "Section code {$splitCode} already exists in this term."], 409);
        }

        $remaining = $sec['student_count'] - $split_count;
        $db->prepare("UPDATE academic_sections SET student_count = ? WHERE section_id = ?")->execute([$remaining, $sec_id]);

        $ins = $db->prepare("INSERT INTO academic_sections (term_id, section_code, section_name, program, year_level, student_count, adviser, shift) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $ins->execute([$sec['term_id'], $new_code ?: $sec['section_code'].'-B', $new_name ?: $sec['section_name'].' (Split)', $sec['program'], $sec['year_level'], $split_count, $sec['adviser'], $sec['shift'] ?? 'AM']);

        jsonResponse(['success' => true, 'message' => "Section split into {$sec['section_code']} ({$remaining}) and {$new_code} ({$split_count})"]);
    }

    if ($action === 'auto_generate_sections') {
        $programs = is_array($input['programs'] ?? null) ? $input['programs'] : ['BSIT'];
        $years = is_array($input['years'] ?? null) ? $input['years'] : [1];
        $sec_count = (int)($input['sections_per_group'] ?? 2);
        $student_count = (int)($input['students_per_section'] ?? 35);
        $term_id = (int)($input['term_id'] ?? 1);

        $letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
        $advisers = ['Prof. Academic Head', 'Prof. Program Head', 'Prof. Faculty Member', 'Engr. Faculty Member'];
        $created = 0;

        foreach ($programs as $prog) {
            foreach ($years as $yr) {
                for ($i = 0; $i < $sec_count; $i++) {
                    $letter = $letters[$i] ?? (string)($i + 1);
                    $prefix = substr($prog, 2) ?: $prog;
                    $code = "{$prefix}{$yr}0" . ($i + 1) . "M";
                    $name = "{$prog} {$yr}{$letter}";
                    $adviser = $advisers[$i % count($advisers)];

                    $check = $db->prepare("SELECT section_id FROM academic_sections WHERE section_code = ? AND term_id = ?");
                    $check->execute([$code, $term_id]);
                    if ($check->fetch()) {
                        $upd = $db->prepare("UPDATE academic_sections SET student_count=?, section_name=? WHERE section_code=? AND term_id=?");
                        $upd->execute([$student_count, $name, $code, $term_id]);
                    } else {
                        $ins = $db->prepare("INSERT INTO academic_sections (term_id, section_code, section_name, program, year_level, student_count, adviser) VALUES (?, ?, ?, ?, ?, ?, ?)");
                        $ins->execute([$term_id, $code, $name, $prog, $yr, $student_count, $adviser]);
                        $created++;
                    }
                }
            }
        }
        jsonResponse(['success' => true, 'message' => "Auto-generation completed ({$created} sections created)"]);
    }

    if ($action === 'delete_section') {
        $section_id = (int)($input['section_id'] ?? 0);
        $stmt = $db->prepare("DELETE FROM academic_sections WHERE section_id = ?");
        $stmt->execute([$section_id]);
        jsonResponse(['success' => true, 'message' => 'Section deleted']);
    }

    // ─── 5. BULK BASELINE PERSISTENCE ───
    if ($action === 'generate_baseline' || $action === 'bulk_save_schedules' || $action === 'generate_schedule') {
        $schedules = is_array($input['schedules'] ?? null) ? $input['schedules'] : [];
        $term_id = (int)($input['term_id'] ?? 0);
        if (!$term_id) {
            jsonResponse(['success' => false, 'message' => 'term_id is required to save schedules'], 400);
        }
        // Only an edit save may empty a term, for example after deleting its last class
        if (empty($schedules) && $action !== 'bulk_save_schedules') {
            jsonResponse(['success' => false, 'message' => 'No schedules provided for baseline save'], 400);
        }

        // Qualifications apply once the shared data has been published
        $rows = resolveScheduleRows($db, $schedules, $term_id, isStatePublished($db) ? loadQualifications($db) : null);

        $db->beginTransaction();
        try {
            // Replace this term only. NULL rows are old records saved before terms were tracked.
            $del = $db->prepare("DELETE FROM schedules WHERE term_id = ? OR term_id IS NULL");
            $del->execute([$term_id]);
            insertScheduleRows($db, $rows);
            $db->commit();
            jsonResponse(['success' => true, 'message' => 'Baseline schedules successfully persisted to database', 'count' => count($schedules)]);
        } catch (Exception $e) {
            $db->rollBack();
            error_log('schedules.php baseline: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => 'Failed to save the schedule. No changes were made.'], 500);
        }
    }

    // ─── 6. STANDARD SCHEDULE CRUD (Add, Edit, Delete) ───
    if ($action === 'add' || $action === 'edit') {
        $room_id = (int)($input['room_id'] ?? 0);
        $faculty_id = (int)($input['faculty_id'] ?? 0);
        $subject_code = trim($input['subject_code'] ?? '');
        $subject_category = trim($input['subject_category'] ?? 'IT');
        $section_name = trim($input['section_name'] ?? '');
        $day_of_week = $input['day_of_week'] ?? '';
        $start_time = $input['start_time'] ?? '';
        $end_time = $input['end_time'] ?? '';

        if (!$room_id || !$faculty_id || !$subject_code || !$section_name || !$day_of_week || !$start_time || !$end_time) {
            jsonResponse(['success' => false, 'message' => 'All fields are required'], 400);
        }

        $validDays = ['Mon','Tue','Wed','Thu','Fri','Sat'];
        if (!in_array($day_of_week, $validDays)) {
            jsonResponse(['success' => false, 'message' => 'Invalid day of week'], 400);
        }

        // Validate Faculty Subject Role Restriction
        $facultyStmt = $db->prepare("SELECT user_id, first_name, last_name, role, subject_role FROM users WHERE user_id = ?");
        $facultyStmt->execute([$faculty_id]);
        $facultyUser = $facultyStmt->fetch();

        if (!$facultyUser) {
            jsonResponse(['success' => false, 'message' => 'Selected faculty does not exist'], 400);
        }

        // A teacher may only teach subjects in their main qualifications
        if (isStatePublished($db) && empty(loadQualifications($db)[$faculty_id][strtoupper($subject_code)])) {
            $facultyName = $facultyUser['first_name'] . ' ' . $facultyUser['last_name'];
            jsonResponse(['success' => false, 'message' => "{$facultyName} does not have {$subject_code} in their main qualifications."], 400);
        }

        // Check time conflict (same room, same day, overlapping time)
        $conflictQuery = "SELECT schedule_id FROM schedules
                          WHERE room_id = ? AND day_of_week = ?
                          AND start_time < ? AND end_time > ?";
        $conflictParams = [$room_id, $day_of_week, $end_time, $start_time];

        if ($action === 'edit') {
            $schedule_id = (int)($input['schedule_id'] ?? 0);
            if (!$schedule_id) {
                jsonResponse(['success' => false, 'message' => 'schedule_id required for edit'], 400);
            }
            $conflictQuery .= " AND schedule_id != ?";
            $conflictParams[] = $schedule_id;
        }

        $stmt = $db->prepare($conflictQuery);
        $stmt->execute($conflictParams);
        if ($stmt->fetch()) {
            jsonResponse(['success' => false, 'message' => 'Time conflict: another class is scheduled in this room at the same time'], 409);
        }

        // Check faculty schedule overlap (same faculty, same day, overlapping time across ANY room)
        $facConflictQuery = "SELECT s.schedule_id, c.room_name_number FROM schedules s
                             JOIN classrooms c ON s.room_id = c.room_id
                             WHERE s.faculty_id = ? AND s.day_of_week = ?
                             AND s.start_time < ? AND s.end_time > ?";
        $facConflictParams = [$faculty_id, $day_of_week, $end_time, $start_time];
        if ($action === 'edit') {
            $facConflictQuery .= " AND s.schedule_id != ?";
            $facConflictParams[] = $schedule_id;
        }

        $stmt = $db->prepare($facConflictQuery);
        $stmt->execute($facConflictParams);
        $facConflict = $stmt->fetch();
        if ($facConflict) {
            jsonResponse([
                'success' => false,
                'message' => "Faculty schedule overlap: This instructor is already scheduled in Room {$facConflict['room_name_number']} on {$day_of_week} at this time."
            ], 409);
        }

        if ($action === 'add') {
            $stmt = $db->prepare("INSERT INTO schedules (room_id, faculty_id, subject_code, subject_category, section_name, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$room_id, $faculty_id, $subject_code, $subject_category, $section_name, $day_of_week, $start_time, $end_time]);
            jsonResponse(['success' => true, 'message' => 'Schedule added', 'schedule_id' => $db->lastInsertId()]);
        } else {
            $stmt = $db->prepare("UPDATE schedules SET room_id=?, faculty_id=?, subject_code=?, subject_category=?, section_name=?, day_of_week=?, start_time=?, end_time=? WHERE schedule_id=?");
            $stmt->execute([$room_id, $faculty_id, $subject_code, $subject_category, $section_name, $day_of_week, $start_time, $end_time, $schedule_id]);
            jsonResponse(['success' => true, 'message' => 'Schedule updated']);
        }

    } elseif ($action === 'delete') {
        $schedule_id = (int)($input['schedule_id'] ?? 0);
        if (!$schedule_id) {
            jsonResponse(['success' => false, 'message' => 'schedule_id required'], 400);
        }
        $stmt = $db->prepare("DELETE FROM schedules WHERE schedule_id = ?");
        $stmt->execute([$schedule_id]);
        jsonResponse(['success' => true, 'message' => 'Schedule deleted']);

    } else {
        jsonResponse(['success' => false, 'message' => 'Invalid action: ' . htmlspecialchars($action)], 400);
    }
} else {
    jsonResponse(['success' => false, 'error' => 'Method not allowed'], 405);
}
