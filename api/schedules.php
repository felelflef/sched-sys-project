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
    $facultyByEmail = $db->prepare("SELECT user_id FROM users WHERE email = ? AND role IN ('faculty', 'program-head') LIMIT 1");
    $validDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    $availability = loadAvailability($db);
    $rows = [];
    // Which levels each teacher may teach, and each term's level
    $teachingLevels = [];
    try {
        foreach ($db->query("SELECT user_id, teaching_level FROM users")->fetchAll() as $row) {
            $teachingLevels[(int)$row['user_id']] = $row['teaching_level'] ?: 'tertiary';
        }
    } catch (\Throwable $e) {
        // Before the column exists, every teacher counts as college
    }
    $termLevels = [];

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
        // The account email never changes, unlike a display name; the name is only a fallback for older pages
        $facultyEmail = trim((string)($item['faculty_email'] ?? ''));
        if (!$facultyId && $facultyEmail !== '') {
            $facultyByEmail->execute([$facultyEmail]);
            $facultyId = (int)$facultyByEmail->fetchColumn();
        }
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

        $validTimes = isValidClassTime($start, $end);
        if ($subCode === '' || $secName === '' || !in_array($day, $validDays, true) || !$validTimes) {
            jsonResponse(['success' => false, 'message' => "Class '{$subCode}' for section '{$secName}' has invalid details. No changes were made."], 400);
        }

        requireFieldLengths(['Subject code' => [$subCode, 20], 'Section code' => [$secName, 20], 'Subject category' => [$subCat, 50]]);

        if ($qualifications !== null && empty($qualifications[$facultyId][strtoupper($subCode)])) {
            jsonResponse(['success' => false, 'message' => "{$instructor} has no FCC certificate covering {$subCode}'s subject area. No changes were made."], 400);
        }

        if (isset($availability[$facultyId]) && !isWithinAvailability($availability[$facultyId], $day, $start, $end)) {
            jsonResponse(['success' => false, 'message' => "{$instructor} is not available for {$subCode} on {$day} at that time. No changes were made."], 400);
        }

        $rowTermId = $termId ?: (int)($item['termId'] ?? 0);
        if ($rowTermId) {
            $termLevels[$rowTermId] ??= termSchoolLevel($db, $rowTermId);
            $teaches = $teachingLevels[$facultyId] ?? 'tertiary';
            if ($teaches !== 'mixed' && $teaches !== $termLevels[$rowTermId]) {
                $levelName = $termLevels[$rowTermId] === 'shs' ? 'Senior High School' : 'college';
                jsonResponse(['success' => false, 'message' => "{$instructor} isn't set to teach {$levelName} classes, so they can't teach {$subCode} for {$secName}. Change their teaching level in Faculty Profiles. No changes were made."], 400);
            }
        }
        $rows[] = [$rowTermId ?: null, $roomId, $facultyId, $subCode, $subCat, $secName, $day, $start, $end, empty($item['aiPlaced']) ? 0 : 1, empty($item['locked']) ? 0 : 1];
    }
    return $rows;
}

/**
 * Refuses a save that adds a double-booking or puts a teacher over their max load.
 * Problems already saved before are tolerated, so a term that has one can still be edited and fixed.
 */
function requireNoNewClashesOrOverloads(PDO $db, array $rows, int $termId): void {
    $old = $db->prepare("SELECT term_id, room_id, faculty_id, subject_code, subject_category, section_name, day_of_week, start_time, end_time FROM schedules WHERE term_id = ? OR term_id IS NULL");
    $old->execute([$termId]);
    $oldRows = array_map(fn($r) => [null, (int)$r['room_id'], (int)$r['faculty_id'], $r['subject_code'], $r['subject_category'], $r['section_name'], $r['day_of_week'], $r['start_time'], $r['end_time']], $old->fetchAll());

    $sig = fn($r) => implode('|', [$r[2], $r[1], strtoupper($r[5]), $r[6], $r[7], $r[8], strtoupper($r[3])]);
    $clashes = function (array $list) use ($sig): array {
        $found = [];
        foreach ($list as $i => $a) {
            foreach (array_slice($list, $i + 1) as $b) {
                if ($a[6] === $b[6] && $a[7] < $b[8] && $a[8] > $b[7]
                    && ((int)$a[1] === (int)$b[1] || (int)$a[2] === (int)$b[2] || strtoupper($a[5]) === strtoupper($b[5]))) {
                    $pair = [$sig($a), $sig($b)];
                    sort($pair);
                    $found[implode('#', $pair)] = [$a, $b];
                }
            }
        }
        return $found;
    };
    $newClashes = array_diff_key($clashes($rows), $clashes($oldRows));
    if ($newClashes) {
        [$a, $b] = reset($newClashes);
        $time = substr($a[7], 0, 5);
        jsonResponse(['success' => false, 'message' => "Two classes would overlap on {$a[6]} at {$time} ({$a[3]} for {$a[5]} and {$b[3]} for {$b[5]}) in the same room, teacher or section. No changes were made."], 409);
    }

    // Terms whose dates overlap this one run at the same time (such as College 1st Sem and SHS 1st Term):
    // a teacher or room can't be in a class of each at the same hour. Clashes saved before are tolerated.
    $concurrent = [];
    try {
        $findTerms = $db->prepare("SELECT o.term_id, o.term_name, o.level FROM school_terms t JOIN school_terms o ON o.term_id <> t.term_id AND o.start_date <= t.end_date AND o.end_date >= t.start_date WHERE t.term_id = ?");
        $findTerms->execute([$termId]);
        foreach ($findTerms->fetchAll() as $other) $concurrent[(int)$other['term_id']] = $other;
    } catch (\Throwable $e) {
        // Before terms have dates and levels, each term stands alone
    }
    $otherRows = [];
    if ($concurrent) {
        $findOther = $db->prepare("SELECT term_id, room_id, faculty_id, subject_code, subject_category, section_name, day_of_week, start_time, end_time FROM schedules WHERE term_id IN (" . implode(',', array_fill(0, count($concurrent), '?')) . ")");
        $findOther->execute(array_keys($concurrent));
        $otherRows = array_map(fn($r) => [(int)$r['term_id'], (int)$r['room_id'], (int)$r['faculty_id'], $r['subject_code'], $r['subject_category'], $r['section_name'], $r['day_of_week'], $r['start_time'], $r['end_time']], $findOther->fetchAll());
    }
    $crossClashes = function (array $list) use ($otherRows, $sig): array {
        $found = [];
        foreach ($list as $a) {
            foreach ($otherRows as $b) {
                if ($a[6] === $b[6] && $a[7] < $b[8] && $a[8] > $b[7] && ((int)$a[1] === (int)$b[1] || (int)$a[2] === (int)$b[2])) {
                    $found[$sig($a) . '#' . $sig($b)] = [$a, $b];
                }
            }
        }
        return $found;
    };
    $newCross = array_diff_key($crossClashes($rows), $crossClashes($oldRows));
    if ($newCross) {
        [$a, $b] = reset($newCross);
        $other = $concurrent[$b[0]];
        $levelName = ($other['level'] ?? '') === 'shs' ? 'SHS' : 'College';
        $what = (int)$a[2] === (int)$b[2] ? 'teacher' : 'room';
        jsonResponse(['success' => false, 'message' => "The {$what} of {$a[3]} for {$a[5]} is already booked on {$a[6]} at " . substr($b[7], 0, 5) . " for {$b[3]} ({$b[5]}) in {$other['term_name']} ({$levelName}), which runs at the same time. No changes were made."], 409);
    }

    // Loads are in units: each class carries its share of the subject's units (all of a subject's weekly hours
    // add up to its units). SHS subjects count 1 unit per teaching hour. A class whose subject isn't found counts 1 unit per hour.
    $subjectUnits = [];
    try {
        $termIds = array_merge([$termId], array_keys($concurrent));
        $find = $db->prepare("SELECT a.term_id, UPPER(a.section_code) AS sec, UPPER(t.subject_code) AS code, t.units, t.lecture_hours, t.lab_hours, st.level
            FROM academic_sections a JOIN term_subjects t ON t.term_id = a.term_id AND t.program = a.program AND t.year_level = a.year_level
            LEFT JOIN school_terms st ON st.term_id = a.term_id
            WHERE a.term_id IN (" . implode(',', array_fill(0, count($termIds), '?')) . ")");
        $find->execute($termIds);
        foreach ($find->fetchAll() as $s) {
            $weeklyHours = (float)$s['lecture_hours'] + (float)$s['lab_hours'];
            $load = ($s['level'] ?? '') === 'shs' && $weeklyHours > 0 ? $weeklyHours : (float)$s['units'];
            $subjectUnits[(int)$s['term_id'] . '|' . $s['sec'] . '|' . $s['code']] = [$load, ($weeklyHours > 0 ? $weeklyHours : (float)$s['units']) * 60];
        }
    } catch (\Throwable $e) {
        // Without curriculum data every class counts 1 unit per hour
    }
    $units = function (array $list) use ($subjectUnits, $termId): array {
        $load = [];
        foreach ($list as $r) {
            $minutes = (strtotime($r[8]) - strtotime($r[7])) / 60;
            [$subjectTotal, $subjectMinutes] = $subjectUnits[($r[0] ?: $termId) . '|' . strtoupper($r[5]) . '|' . strtoupper($r[3])] ?? [null, null];
            $share = $subjectTotal !== null && $subjectMinutes > 0 ? $subjectTotal * $minutes / $subjectMinutes : $minutes / 60;
            $load[(int)$r[2]] = ($load[(int)$r[2]] ?? 0) + $share;
        }
        return $load;
    };
    $newLoad = $units($rows);
    $oldLoad = $units($oldRows);
    // Units in overlapping terms add up: the busiest overlapping term of each level counts
    $otherLoad = [];
    $busiest = [];
    foreach ($concurrent as $otherId => $other) {
        $level = ($other['level'] ?? '') === 'shs' ? 'shs' : 'tertiary';
        foreach ($units(array_filter($otherRows, fn($r) => $r[0] === $otherId)) as $facultyId => $u) {
            $busiest[$level][$facultyId] = max($busiest[$level][$facultyId] ?? 0, $u);
        }
    }
    foreach ($busiest as $loads) {
        foreach ($loads as $facultyId => $u) $otherLoad[$facultyId] = ($otherLoad[$facultyId] ?? 0) + $u;
    }
    $teachers = $db->query("SELECT user_id, CONCAT(first_name, ' ', last_name) AS name, max_load FROM users")->fetchAll();
    foreach ($teachers as $t) {
        $id = (int)$t['user_id'];
        $limit = (int)$t['max_load'] ?: 30;
        $total = ($newLoad[$id] ?? 0) + ($otherLoad[$id] ?? 0);
        if ($total > $limit + 0.001 && ($newLoad[$id] ?? 0) > ($oldLoad[$id] ?? 0) + 0.001) {
            $loadUnits = round($total, 1);
            $counting = ($otherLoad[$id] ?? 0) > 0 ? ' a week, counting their classes in overlapping terms' : '';
            jsonResponse(['success' => false, 'message' => "{$t['name']} would teach {$loadUnits} units{$counting}, over their {$limit}-unit max load. No changes were made."], 409);
        }
    }
}

/** The school's default loads in units (Faculty Profiles > Default Loads), or the built-in ones */
function loadDefaultLoads(PDO $db): array {
    $loads = ['Full-time' => ['min' => 24, 'max' => 30], 'Part-time' => ['min' => 15, 'max' => 24]];
    try {
        $find = $db->prepare("SELECT setting_value FROM app_settings WHERE setting_key = 'default_loads'");
        $find->execute();
        $saved = json_decode((string)$find->fetchColumn(), true);
        foreach (['Full-time', 'Part-time'] as $status) {
            if (isset($saved[$status]['min'], $saved[$status]['max'])) $loads[$status] = ['min' => (int)$saved[$status]['min'], 'max' => (int)$saved[$status]['max']];
        }
    } catch (\Throwable $e) {
        // Before the settings table exists the built-in defaults apply
    }
    return $loads;
}

function isStatePublished(PDO $db): bool {
    return (bool)$db->query("SELECT COUNT(*) FROM app_settings WHERE setting_key = 'state_published'")->fetchColumn();
}

/** The active term and the terms running alongside it (their dates overlap), such as College 1st Sem and SHS 1st Term. */
const CURRENT_TERMS_SQL = "(t.is_active = 1 OR EXISTS (SELECT 1 FROM school_terms a WHERE a.is_active = 1 AND t.start_date <= a.end_date AND t.end_date >= a.start_date))";

/** Current classes (active term and terms running alongside it) whose teacher would no longer be qualified after the change. */
function classesLosingQualification(PDO $db, array $override): array {
    $before = loadQualifications($db);
    $after = loadQualifications($db, $override);
    $rows = $db->query("SELECT s.schedule_id, s.term_id, s.faculty_id, UPPER(s.subject_code) AS code FROM schedules s JOIN school_terms t ON s.term_id = t.term_id WHERE " . CURRENT_TERMS_SQL)->fetchAll();
    return array_values(array_filter($rows, fn($r) => !empty($before[(int)$r['faculty_id']][$r['code']]) && empty($after[(int)$r['faculty_id']][$r['code']])));
}

function lostClassCodes(array $rows): string {
    return implode(', ', array_unique(array_column($rows, 'code')));
}

/** Takes the given classes off the schedule, inside the caller's transaction. */
function removeScheduleRows(PDO $db, array $rows): void {
    if (!$rows) return;
    $ids = array_map(fn($r) => (int)$r['schedule_id'], $rows);
    $db->prepare("DELETE FROM schedules WHERE schedule_id IN (" . implode(',', array_fill(0, count($ids), '?')) . ")")->execute($ids);
    // Every term that lost a class reloads; rows without a term fall back to the active term
    $termIds = array_unique(array_filter(array_map(fn($r) => (int)($r['term_id'] ?? 0), $rows)));
    if (!$termIds) $termIds = $db->query("SELECT term_id FROM school_terms WHERE is_active = 1")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($termIds as $changedTermId) {
        bumpScheduleVersion($db, (int)$changedTermId);
    }
}

/** A certificate name and its areas, checked against the department list. */
function cleanCertificate(PDO $db, array $input): array {
    $name = preg_replace('/\s+/', ' ', trim((string)($input['cert_name'] ?? '')));
    if ($name === '') rejectInput('Please name the certificate.');
    requireFieldLengths(['Certificate name' => [$name, 60]]);
    requireValidText('Certificate name', $name);
    $areas = array_values(array_unique(array_filter(array_map(fn($a) => trim((string)$a), (array)($input['areas'] ?? [])))));
    if (!$areas) rejectInput('Choose at least one subject area for the certificate.');
    foreach ($areas as $area) requireKnownDepartment($db, $area);
    return [$name, $areas];
}

/** Returns [user_id] => days and shifts, only for part-time teachers who have availability set. */
function loadAvailability(PDO $db): array {
    $map = [];
    foreach ($db->query("SELECT user_id, available_days, available_shifts FROM users WHERE employment_status = 'Part-time' AND available_days <> '' AND available_shifts <> ''")->fetchAll() as $row) {
        $map[(int)$row['user_id']] = ['days' => explode(',', $row['available_days']), 'shifts' => explode(',', $row['available_shifts'])];
    }
    return $map;
}

/** Times are HH:MM:SS. Selected shifts that touch or overlap count as one continuous window. */
function isWithinAvailability(array $availability, string $day, string $start, string $end): bool {
    if (!in_array($day, $availability['days'], true)) {
        return false;
    }
    $from = null;
    $to = null;
    foreach (SHIFT_WINDOWS as $shift => [$shiftStart, $shiftEnd]) {
        if (!in_array($shift, $availability['shifts'], true)) {
            continue;
        }
        if ($from !== null && $shiftStart > $to) {
            if ($start >= $from && $end <= $to) {
                return true;
            }
            $from = null;
        }
        $from = $from ?? $shiftStart;
        $to = $shiftEnd;
    }
    return $from !== null && $start >= $from && $end <= $to;
}

// Managing scheduling data is for the System Administrator and Program Heads
function requireAdminRole(): void {
    if (!in_array($_SESSION['role'] ?? '', ['admin', 'program-head'], true)) {
        jsonResponse(['success' => false, 'message' => 'Only the System Administrator or a Program Head can do this.'], 403);
    }
}

/** Checks one subject of a saved set or a set being loaded, and returns it in a fixed shape. */
function cleanSubjectItem($item): array {
    $item = is_array($item) ? $item : [];
    $code = trim((string)($item['code'] ?? ''));
    $name = trim((string)($item['name'] ?? ''));
    $program = trim((string)($item['program'] ?? ''));
    if ($code === '' || $name === '') {
        rejectInput('Each subject needs a code and a name.');
    }
    requireFieldLengths(['Subject code' => [$code, 20], 'Subject name' => [$name, 100]]);
    requireValidCode('Subject code', $code);
    requireValidText('Subject name', $name);
    requireValidProgram($program);
    return [
        'code' => $code,
        'name' => $name,
        'units' => $units = requireIntInRange('Units', $item['units'] ?? 3, 1, 6),
        'labUnits' => isset($item['labUnits']) && $item['labUnits'] !== '' ? min(requireIntInRange('Lab units', $item['labUnits'], 0, 6), $units) : null,
        'lecHours' => requireValidHours('Lecture hours', $item['lecHours'] ?? 0),
        'labHours' => requireValidHours('Lab hours', $item['labHours'] ?? 0),
        'type' => in_array($item['type'] ?? '', ['lecture', 'lab', 'pe', 'special'], true) ? $item['type'] : 'lecture',
        'program' => $program,
        'year' => requireValidYearLevel($item['year'] ?? 1)
    ];
}

/** A section or subject must use the programs and year levels of its term's level. */
function requireProgramFitsTerm(PDO $db, int $termId, string $program, int $year): void {
    $isShs = termSchoolLevel($db, $termId) === 'shs';
    $programs = $isShs ? SHS_STRANDS : TERTIARY_PROGRAMS;
    $years = $isShs ? [11, 12] : [1, 2, 3, 4];
    if (!in_array($program, $programs, true) || !in_array($year, $years, true)) {
        rejectInput($isShs
            ? 'This is a Senior High School term, so choose a strand (' . implode(', ', SHS_STRANDS) . ') and Grade 11 or 12.'
            : 'This is a college term, so choose a college program (' . implode(', ', TERTIARY_PROGRAMS) . ') and Year 1 to 4.');
    }
    if (isset(PROGRAM_YEARS[$program]) && !in_array($year, PROGRAM_YEARS[$program], true)) {
        rejectInput("{$program} is a " . count(PROGRAM_YEARS[$program]) . '-year program, so choose Year 1 to ' . max(PROGRAM_YEARS[$program]) . '.');
    }
}

/** A section code prefix: BSIT -> IT, HRS -> HRS, B&E -> BE (codes allow only letters, numbers, spaces and hyphens). */
function sectionCodePrefix(string $program): string {
    return str_starts_with($program, 'BS') ? substr($program, 2) : preg_replace('/[^A-Za-z0-9\-]/', '', $program);
}

function requireTermExists(PDO $db, int $termId): void {
    $find = $db->prepare("SELECT COUNT(*) FROM school_terms WHERE term_id = ?");
    $find->execute([$termId]);
    if (!(int)$find->fetchColumn()) {
        jsonResponse(['success' => false, 'message' => 'That school term no longer exists. Please reload and try again.'], 400);
    }
}

/** Keeps a copy of the term's schedule so the last Generate can be undone. */
function saveScheduleSnapshot(PDO $db, int $termId): void {
    $find = $db->prepare("SELECT room_id, faculty_id, subject_code, subject_category, section_name, day_of_week, start_time, end_time, ai_generated FROM schedules WHERE term_id = ? OR term_id IS NULL");
    $find->execute([$termId]);
    $rows = $find->fetchAll();
    if ($rows) {
        $db->prepare("REPLACE INTO schedule_snapshots (term_id, saved_at, schedule_json) VALUES (?, NOW(), ?)")->execute([$termId, json_encode($rows)]);
    }
}

/** Locks the term's version row. Refuses the save if someone else changed the schedule first. */
function lockScheduleVersion(PDO $db, int $termId, $expected): int {
    $lock = $db->prepare("SELECT schedule_version FROM school_terms WHERE term_id = ? FOR UPDATE");
    $lock->execute([$termId]);
    $current = (int)$lock->fetchColumn();
    if ($expected !== null && (int)$expected !== $current) {
        $db->rollBack();
        jsonResponse(['success' => false, 'message' => 'Someone else changed this schedule while you were working. The latest version has been loaded, so please make your change again.'], 409);
    }
    return $current + 1;
}

function bumpScheduleVersion(PDO $db, int $termId): void {
    $db->prepare("UPDATE school_terms SET schedule_version = schedule_version + 1 WHERE term_id = ?")->execute([$termId]);
}

function insertScheduleRows(PDO $db, array $rows): void {
    $ins = $db->prepare("
        INSERT INTO schedules (term_id, room_id, faculty_id, subject_code, subject_category, section_name, day_of_week, start_time, end_time, ai_generated, is_locked)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");
    foreach ($rows as $row) {
        $ins->execute(array_pad(array_slice($row, 0, 11), 11, 0));
    }
}

// Everything here needs a login. Only the System Administrator and Program Heads can make changes.
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    requireAnyRole(['admin', 'program-head']);
    requireCSRF();
} else {
    requireLogin();
}

$db = getDB();

// Ensure lifecycle tables exist. Runs once per SCHEMA_VERSION, not on every request.
if (($GLOBALS['schema_stamps']['schema_lifecycle'] ?? '') !== SCHEMA_VERSION) {
    require __DIR__ . '/../includes/schema_lifecycle.php';
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
            $faculty = $db->query("SELECT user_id, first_name, last_name, email, role, subject_role, employment_status, available_days, available_shifts, max_load, min_load, teaching_level, seasoned FROM users WHERE role IN ('faculty', 'program-head')")->fetchAll();
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

            $snapshots = $db->query("SELECT term_id, saved_at FROM schedule_snapshots")->fetchAll();
            try {
                $certificates = $db->query("SELECT cert_id, cert_name, areas_json FROM fcc_certificates ORDER BY cert_name")->fetchAll();
                $facultyCertificates = $db->query("SELECT u.email, fc.cert_id FROM faculty_certificates fc JOIN users u ON u.user_id = fc.user_id")->fetchAll();
            } catch (Exception $e) {
                $certificates = [];
                $facultyCertificates = [];
            }
            try {
                $subjectSets = $db->query("SELECT set_id, set_name, items_json FROM subject_sets ORDER BY set_name")->fetchAll();
            } catch (Exception $e) {
                $subjectSets = []; // The table could not be created, so there are no sets
            }

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
                    'snapshots' => $snapshots,
                    'subjectSets' => $subjectSets,
                    'certificates' => $certificates,
                    'facultyCertificates' => $facultyCertificates,
                    'defaultLoads' => loadDefaultLoads($db)
                ]
            ]);
        } catch (Exception $e) {
            error_log('schedules.php lifecycle: ' . $e->getMessage());
            jsonResponse(['success' => false, 'error' => 'A server error occurred. Please try again later.'], 500);
        }
    }

    jsonResponse(['success' => false, 'message' => 'Unknown request'], 400);

} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $action = $input['action'] ?? '';
    expectActivity($db, 'schedules', (string)$action, $input);

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
        $certificates = is_array($input['certificates'] ?? null) ? $input['certificates'] : [];
        $subjectSets = [];
        foreach (is_array($input['subject_sets'] ?? null) ? $input['subject_sets'] : [] as $set) {
            $setName = trim((string)($set['name'] ?? ''));
            $setItems = is_array($set['items'] ?? null) ? $set['items'] : [];
            if ($setName !== '' && mb_strlen($setName) <= 60 && $setItems) {
                $subjectSets[$setName] = array_map('cleanSubjectItem', $setItems);
            }
        }

        if (!$years || !$terms) {
            jsonResponse(['success' => false, 'message' => 'School years and terms are required.'], 400);
        }

        $rows = resolveScheduleRows($db, $items, 0);

        $db->beginTransaction();
        try {
            foreach (['schedules', 'academic_sections', 'term_subjects', 'school_terms', 'school_years', 'subject_catalog', 'departments'] as $table) {
                $db->exec("DELETE FROM {$table}");
            }

            $insDept = $db->prepare("INSERT IGNORE INTO departments (department_name) VALUES (?)");
            foreach ($departments as $d) {
                $insDept->execute([$d]);
            }

            $insCatalog = $db->prepare("INSERT INTO subject_catalog (subject_code, subject_title, department, it_only, units, level) VALUES (?, ?, ?, ?, ?, ?)");
            foreach ($catalog as $c) {
                $insCatalog->execute([strtoupper(trim($c['code'])), $c['title'], $c['dept'], !empty($c['itOnly']) ? 1 : 0, (int)($c['units'] ?? 3), in_array($c['level'] ?? '', ['tertiary', 'shs', 'both'], true) ? $c['level'] : 'both']);
            }


            $insYear = $db->prepare("INSERT INTO school_years (year_id, year_code, is_active) VALUES (?, ?, ?)");
            foreach ($years as $y) {
                $insYear->execute([(int)$y['id'], $y['yearCode'], !empty($y['isActive']) ? 1 : 0]);
            }

            $insTerm = $db->prepare("INSERT INTO school_terms (term_id, year_id, term_name, level, start_date, end_date, status, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            foreach ($terms as $t) {
                $insTerm->execute([(int)$t['id'], (int)$t['yearId'], $t['termName'], ($t['level'] ?? '') === 'shs' ? 'shs' : 'tertiary', $t['startDate'], $t['endDate'], $t['status'] ?? 'draft', !empty($t['isActive']) ? 1 : 0]);
            }

            $insSubject = $db->prepare("INSERT INTO term_subjects (subject_id, term_id, subject_code, subject_name, units, lab_units, lecture_hours, lab_hours, subject_type, program, year_level, curriculum, is_included) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            foreach ($subjects as $s) {
                $insSubject->execute([(int)$s['id'], (int)$s['termId'], $s['code'], $s['name'], (int)($s['units'] ?? 3), isset($s['labUnits']) && $s['labUnits'] !== '' ? min(max((int)$s['labUnits'], 0), (int)($s['units'] ?? 3)) : null, (float)($s['lecHours'] ?? 3), (float)($s['labHours'] ?? 0), $s['type'] ?? 'lecture', $s['program'] ?? 'BSIT', (int)($s['year'] ?? 1), $s['curriculum'] ?? '2024 Revised', ($s['isIncluded'] ?? true) ? 1 : 0]);
            }

            $insSection = $db->prepare("INSERT INTO academic_sections (section_id, term_id, section_code, section_name, program, year_level, student_count, adviser, shift, home_room, subject_teachers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            foreach ($sections as $s) {
                $insSection->execute([(int)$s['id'], (int)$s['termId'], $s['code'], $s['name'], $s['program'], (int)$s['year'], (int)$s['studentCount'], mb_substr(trim((string)($s['adviser'] ?? '')), 0, 100) ?: null, $s['shift'] ?? 'AM', mb_substr(trim((string)($s['homeRoom'] ?? '')), 0, 50) ?: null, !empty($s['subjectTeachers']) && is_array($s['subjectTeachers']) ? json_encode($s['subjectTeachers']) : null]);
            }

            insertScheduleRows($db, $rows);
            if ($certificates) {
                $db->exec("DELETE FROM faculty_certificates");
                $db->exec("DELETE FROM fcc_certificates");
            }
            $insCert = $db->prepare("INSERT INTO fcc_certificates (cert_id, cert_name, areas_json) VALUES (?, ?, ?)");
            $insHolder = $db->prepare("INSERT IGNORE INTO faculty_certificates (user_id, cert_id) SELECT user_id, ? FROM users WHERE email = ?");
            $seenCertNames = [];
            foreach ($certificates as $cert) {
                $certName = trim((string)($cert['name'] ?? ''));
                if ($certName === '' || mb_strlen($certName) > 60 || isset($seenCertNames[strtolower($certName)])) continue;
                $seenCertNames[strtolower($certName)] = true;
                $insCert->execute([(int)($cert['id'] ?? 0) ?: null, $certName, json_encode(array_values(array_map('strval', (array)($cert['areas'] ?? []))))]);
                $newCertId = (int)($cert['id'] ?? 0) ?: (int)$db->lastInsertId();
                foreach ((array)($cert['holders'] ?? []) as $email) {
                    $insHolder->execute([$newCertId, (string)$email]);
                }
            }
            $insSet = $db->prepare("INSERT INTO subject_sets (set_name, items_json) VALUES (?, ?) ON DUPLICATE KEY UPDATE items_json = VALUES(items_json)");
            foreach ($subjectSets as $setName => $setItems) {
                $insSet->execute([$setName, json_encode($setItems)]);
            }
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
    // A teacher's FCC certificates, which decide every subject they may teach
    if ($action === 'save_faculty_qualifications') {
        requireAdminRole();

        $findUser = $db->prepare("SELECT user_id FROM users WHERE email = ? AND role IN ('faculty', 'program-head')");
        $findUser->execute([trim($input['email'] ?? '')]);
        $userId = (int)$findUser->fetchColumn();
        if (!$userId) {
            jsonResponse(['success' => false, 'message' => 'That teacher has no user account in the database.'], 404);
        }

        $knownCerts = array_map('intval', $db->query("SELECT cert_id FROM fcc_certificates")->fetchAll(PDO::FETCH_COLUMN));
        $certIds = array_values(array_unique(array_map('intval', is_array($input['cert_ids'] ?? null) ? $input['cert_ids'] : [])));
        if (array_diff($certIds, $knownCerts)) {
            jsonResponse(['success' => false, 'message' => 'One of those FCC certificates no longer exists. Please reload and try again.'], 400);
        }

        // A certificate can't be taken away while this teacher still teaches a subject only it covers this term
        $blocked = classesLosingQualification($db, ['userCerts' => [$userId => $certIds]]);
        if ($blocked && empty($input['remove_classes'])) {
            jsonResponse(['success' => false, 'message' => 'This teacher still has ' . lostClassCodes($blocked) . ' classes this term. Reassign them first. No changes were made.'], 409);
        }

        $db->beginTransaction();
        // The user confirmed removing those classes too, so they never stay with an unqualified teacher
        removeScheduleRows($db, $blocked);
        $db->prepare("DELETE FROM faculty_certificates WHERE user_id = ?")->execute([$userId]);
        $insertCert = $db->prepare("INSERT INTO faculty_certificates (user_id, cert_id) VALUES (?, ?)");
        foreach ($certIds as $certId) {
            $insertCert->execute([$userId, $certId]);
        }
        $db->commit();
        jsonResponse(['success' => true, 'message' => 'FCC certificates saved']);
    }

    // ─── FCC CERTIFICATES ───
    if ($action === 'save_certificate') {
        requireAdminRole();
        $certId = (int)($input['cert_id'] ?? 0);
        [$name, $areas] = cleanCertificate($db, $input);
        $dupe = $db->prepare("SELECT COUNT(*) FROM fcc_certificates WHERE cert_name = ? AND cert_id <> ?");
        $dupe->execute([$name, $certId]);
        if ((int)$dupe->fetchColumn()) {
            jsonResponse(['success' => false, 'message' => 'Another certificate already has that name.'], 409);
        }
        // Narrowing a certificate's areas can't leave its holders teaching subjects it no longer covers
        $blocked = $certId > 0 ? classesLosingQualification($db, ['certAreas' => [$certId => $areas]]) : [];
        if ($blocked && empty($input['remove_classes'])) {
            jsonResponse(['success' => false, 'message' => 'Teachers holding this certificate still have ' . lostClassCodes($blocked) . ' classes this term that it would no longer cover. No changes were made.'], 409);
        }
        $db->beginTransaction();
        removeScheduleRows($db, $blocked);
        if ($certId > 0) {
            $db->prepare("UPDATE fcc_certificates SET cert_name = ?, areas_json = ? WHERE cert_id = ?")->execute([$name, json_encode($areas), $certId]);
        } else {
            $db->prepare("INSERT INTO fcc_certificates (cert_name, areas_json) VALUES (?, ?)")->execute([$name, json_encode($areas)]);
            $certId = (int)$db->lastInsertId();
        }
        $db->commit();
        jsonResponse(['success' => true, 'message' => 'Certificate saved', 'cert_id' => $certId]);
    }

    if ($action === 'delete_certificate') {
        requireAdminRole();
        $certId = (int)($input['cert_id'] ?? 0);
        $blocked = classesLosingQualification($db, ['certAreas' => [$certId => null]]);
        if ($blocked && empty($input['remove_classes'])) {
            jsonResponse(['success' => false, 'message' => 'Teachers still rely on this certificate for ' . lostClassCodes($blocked) . ' classes this term. No changes were made.'], 409);
        }
        $db->beginTransaction();
        removeScheduleRows($db, $blocked);
        $db->prepare("DELETE FROM faculty_certificates WHERE cert_id = ?")->execute([$certId]);
        $db->prepare("DELETE FROM fcc_certificates WHERE cert_id = ?")->execute([$certId]);
        $db->commit();
        jsonResponse(['success' => true, 'message' => 'Certificate deleted']);
    }

    if ($action === 'save_faculty_availability') {
        requireAdminRole();
        $status = $input['status'] ?? '';
        if (!in_array($status, ['Full-time', 'Part-time'], true)) {
            rejectInput('Employment status must be Full-time or Part-time.');
        }

        $sentDays = is_array($input['days'] ?? null) ? $input['days'] : [];
        $sentShifts = is_array($input['shifts'] ?? null) ? $input['shifts'] : [];
        $days = array_values(array_intersect(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], $sentDays));
        $shifts = array_values(array_intersect(array_keys(SHIFT_WINDOWS), $sentShifts));
        if (count($days) !== count($sentDays) || count($shifts) !== count($sentShifts)) {
            rejectInput('Please choose valid days and shifts.');
        }
        if ($status === 'Full-time') {
            $days = [];
            $shifts = [];
        } elseif ((bool)$days !== (bool)$shifts) {
            rejectInput('Choose at least one day and one shift.');
        }

        $findUser = $db->prepare("SELECT user_id FROM users WHERE email = ? AND role IN ('faculty', 'program-head')");
        $findUser->execute([trim((string)($input['email'] ?? ''))]);
        $userId = (int)$findUser->fetchColumn();
        if (!$userId) {
            jsonResponse(['success' => false, 'message' => 'That teacher has no user account in the database.'], 404);
        }

        // Availability can't be narrowed past classes in the active term or a term running alongside it
        if ($days) {
            $classes = $db->prepare("SELECT s.subject_code, s.day_of_week, s.start_time, s.end_time FROM schedules s JOIN school_terms t ON s.term_id = t.term_id WHERE s.faculty_id = ? AND " . CURRENT_TERMS_SQL);
            $classes->execute([$userId]);
            foreach ($classes->fetchAll() as $class) {
                if (!isWithinAvailability(['days' => $days, 'shifts' => $shifts], $class['day_of_week'], $class['start_time'], $class['end_time'])) {
                    jsonResponse(['success' => false, 'message' => "This teacher has {$class['subject_code']} on {$class['day_of_week']} outside that availability. Reassign that class first."], 409);
                }
            }
        }

        // Loads are in units
        $maxLoad = requireIntInRange('Maximum load', $input['max_load'] ?? 30, 3, 40);
        $minLoad = isset($input['min_load']) && $input['min_load'] !== '' ? requireIntInRange('Minimum load', $input['min_load'], 0, 40) : null;
        if ($minLoad !== null && $minLoad > $maxLoad) {
            rejectInput("The minimum load ({$minLoad} units) can't be more than the maximum ({$maxLoad} units).");
        }
        $teachingLevel = in_array($input['teaching_level'] ?? '', TEACHING_LEVELS, true) ? $input['teaching_level'] : 'tertiary';
        $seasoned = !empty($input['seasoned']) ? 1 : 0;
        $db->prepare("UPDATE users SET employment_status = ?, available_days = ?, available_shifts = ?, max_load = ?, min_load = ?, teaching_level = ?, seasoned = ? WHERE user_id = ?")
            ->execute([$status, implode(',', $days), implode(',', $shifts), $maxLoad, $minLoad, $teachingLevel, $seasoned, $userId]);
        jsonResponse(['success' => true, 'message' => 'Availability saved']);
    }

    if ($action === 'save_catalog_subject') {
        requireAdminRole();
        $code = strtoupper(trim($input['subject_code'] ?? ''));
        $title = trim($input['subject_title'] ?? '');
        $department = trim($input['department'] ?? '');
        if ($code === '' || $title === '' || $department === '') {
            jsonResponse(['success' => false, 'message' => 'Subject code, title and department are required.'], 400);
        }
        requireFieldLengths(['Subject code' => [$code, 20], 'Subject title' => [$title, 100], 'Department' => [$department, 100]]);
        requireValidCode('Subject code', $code);
        requireValidText('Subject title', $title);
        requireKnownDepartment($db, $department);
        requireIntInRange('Units', $input['units'] ?? 3, 1, 6);
        $lost = classesLosingQualification($db, ['catalogArea' => [$code => $department]]);
        if ($lost) {
            jsonResponse(['success' => false, 'message' => "Moving {$code} to {$department} would leave teachers who are certified for its current area unqualified for its classes. Reassign those classes first. No changes were made."], 409);
        }
        // College, SHS or both; a page that doesn't send it keeps the subject's current level
        $level = in_array($input['level'] ?? '', ['tertiary', 'shs', 'both'], true) ? $input['level'] : null;
        $stmt = $db->prepare("
            INSERT INTO subject_catalog (subject_code, subject_title, department, it_only, units, level) VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE subject_title = VALUES(subject_title), department = VALUES(department), it_only = VALUES(it_only), units = VALUES(units),
                level = IF(? IS NULL, level, VALUES(level))
        ");
        $stmt->execute([$code, $title, $department, !empty($input['it_only']) ? 1 : 0, (int)($input['units'] ?? 3), $level ?? 'both', $level]);
        jsonResponse(['success' => true, 'message' => 'Subject saved']);
    }

    if ($action === 'delete_catalog_subject') {
        requireAdminRole();
        $code = strtoupper(trim($input['subject_code'] ?? ''));
        if (classesLosingQualification($db, ['catalogArea' => [$code => null]])) {
            jsonResponse(['success' => false, 'message' => "Some {$code} classes are taught through an FCC certificate, which only covers catalog subjects. Reassign them before removing {$code}. No changes were made."], 409);
        }
        $db->beginTransaction();
        $db->prepare("DELETE FROM subject_catalog WHERE subject_code = ?")->execute([$code]);
        $db->commit();
        jsonResponse(['success' => true, 'message' => 'Subject removed']);
    }

    if ($action === 'save_departments') {
        requireAdminRole();
        $names = array_values(array_unique(array_filter(array_map('trim', is_array($input['departments'] ?? null) ? $input['departments'] : []))));
        if (!$names) {
            jsonResponse(['success' => false, 'message' => 'At least one department must remain.'], 400);
        }
        foreach ($names as $name) {
            requireFieldLengths(['Department' => [$name, 100]]);
        }

        $existing = $db->query("SELECT department_name FROM departments")->fetchAll(PDO::FETCH_COLUMN);
        // Only new names are checked, so an older department can't block other changes
        foreach (array_diff($names, $existing) as $name) {
            requireFieldLengths(['Department' => [$name, 50]]);
            requireValidText('Department', $name);
        }
        $db->beginTransaction();
        $moveSubjects = $db->prepare("UPDATE subject_catalog SET department = ? WHERE department = ?");
        $moveUsers = $db->prepare("UPDATE users SET subject_role = ? WHERE subject_role = ?");
        $remove = $db->prepare("DELETE FROM departments WHERE department_name = ?");
        $removedDepartments = array_diff($existing, $names);
        foreach ($removedDepartments as $removed) {
            $moveSubjects->execute([$names[0], $removed]);
            $moveUsers->execute([$names[0], $removed]);
            $remove->execute([$removed]);
        }
        // Certificates follow their subjects to the department they moved to
        if ($removedDepartments) {
            try {
                $updateCert = $db->prepare("UPDATE fcc_certificates SET areas_json = ? WHERE cert_id = ?");
                foreach ($db->query("SELECT cert_id, areas_json FROM fcc_certificates")->fetchAll() as $cert) {
                    $areas = json_decode((string)$cert['areas_json'], true) ?: [];
                    $moved = array_values(array_unique(array_map(fn($a) => in_array($a, $removedDepartments, true) ? $names[0] : $a, $areas)));
                    if ($moved !== $areas) $updateCert->execute([json_encode($moved), (int)$cert['cert_id']]);
                }
            } catch (\Throwable $e) {
                // No certificate table yet
            }
        }
        $add = $db->prepare("INSERT IGNORE INTO departments (department_name) VALUES (?)");
        foreach ($names as $name) {
            $add->execute([$name]);
        }
        $db->commit();
        jsonResponse(['success' => true, 'message' => 'Departments saved']);
    }

    // ─── SAVED SUBJECT SETS ───
    if ($action === 'save_subject_set') {
        requireAdminRole();
        $setId = (int)($input['set_id'] ?? 0);
        $setName = preg_replace('/\s+/', ' ', trim((string)($input['set_name'] ?? '')));
        $items = is_array($input['items'] ?? null) ? $input['items'] : [];
        if ($setName === '') {
            jsonResponse(['success' => false, 'message' => 'Please name the subject set.'], 400);
        }
        requireFieldLengths(['Set name' => [$setName, 60]]);
        requireValidText('Set name', $setName);
        if (!$items || count($items) > 300) {
            jsonResponse(['success' => false, 'message' => 'A subject set needs from 1 to 300 subjects.'], 400);
        }
        $clean = array_map('cleanSubjectItem', $items);
        $dupe = $db->prepare("SELECT COUNT(*) FROM subject_sets WHERE set_name = ? AND set_id <> ?");
        $dupe->execute([$setName, $setId]);
        if ((int)$dupe->fetchColumn()) {
            jsonResponse(['success' => false, 'message' => 'Another subject set already has that name.'], 400);
        }
        if ($setId > 0) {
            $stmt = $db->prepare("UPDATE subject_sets SET set_name = ?, items_json = ? WHERE set_id = ?");
            $stmt->execute([$setName, json_encode($clean), $setId]);
            if (!$stmt->rowCount()) {
                $find = $db->prepare("SELECT COUNT(*) FROM subject_sets WHERE set_id = ?");
                $find->execute([$setId]);
                if (!(int)$find->fetchColumn()) {
                    jsonResponse(['success' => false, 'message' => 'That subject set no longer exists. Please reload and try again.'], 404);
                }
            }
        } else {
            $db->prepare("INSERT INTO subject_sets (set_name, items_json) VALUES (?, ?)")->execute([$setName, json_encode($clean)]);
            $setId = (int)$db->lastInsertId();
        }
        jsonResponse(['success' => true, 'message' => 'Subject set saved', 'set_id' => $setId]);
    }

    if ($action === 'delete_subject_set') {
        requireAdminRole();
        $db->prepare("DELETE FROM subject_sets WHERE set_id = ?")->execute([(int)($input['set_id'] ?? 0)]);
        jsonResponse(['success' => true, 'message' => 'Subject set removed']);
    }

    // Loads chosen subjects of a saved set into a term, skipping any the term already offers
    if ($action === 'add_term_subjects') {
        $termId = (int)($input['term_id'] ?? 0);
        requireTermExists($db, $termId);
        $items = is_array($input['items'] ?? null) ? $input['items'] : [];
        if (!$items || count($items) > 300) {
            jsonResponse(['success' => false, 'message' => 'Choose from 1 to 300 subjects to load.'], 400);
        }
        $clean = array_map('cleanSubjectItem', $items);
        foreach ($clean as $s) {
            requireProgramFitsTerm($db, $termId, $s['program'], $s['year']);
        }
        $exists = $db->prepare("SELECT COUNT(*) FROM term_subjects WHERE term_id = ? AND UPPER(subject_code) = UPPER(?) AND program = ? AND year_level = ?");
        $ins = $db->prepare("INSERT INTO term_subjects (term_id, subject_code, subject_name, units, lab_units, lecture_hours, lab_hours, subject_type, program, year_level, curriculum, is_included) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2024 Revised', 1)");
        $added = 0;
        $db->beginTransaction();
        foreach ($clean as $s) {
            $exists->execute([$termId, $s['code'], $s['program'], $s['year']]);
            if ((int)$exists->fetchColumn()) continue;
            $ins->execute([$termId, $s['code'], $s['name'], $s['units'], $s['labUnits'], $s['lecHours'], $s['labHours'], $s['type'], $s['program'], $s['year']]);
            $added++;
        }
        $db->commit();
        setActivitySummary($added > 0 ? 'Loaded ' . activityCount($added, 'saved subject') . ' into ' . activityTerm($db, $termId) : '');
        jsonResponse(['success' => true, 'message' => "{$added} subject(s) added", 'added' => $added]);
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

        requireFieldLengths(['School year code' => [$year_code, 50]]);
        requireValidSchoolYear($year_code);
        // Each term is College or SHS; a name is used once per level
        $seenTermNames = [];
        foreach ($terms as $i => $t) {
            $terms[$i]['termName'] = requireValidTermName($t['termName'] ?? '');
            $terms[$i]['level'] = ($t['level'] ?? '') === 'shs' ? 'shs' : 'tertiary';
            if (!isValidDate($t['startDate'] ?? null) || !isValidDate($t['endDate'] ?? null) || $t['endDate'] <= $t['startDate']) {
                jsonResponse(['success' => false, 'message' => 'Each term needs an end date after its start date.'], 400);
            }
            $key = $terms[$i]['level'] . '|' . mb_strtolower($terms[$i]['termName']);
            if (isset($seenTermNames[$key])) {
                jsonResponse(['success' => false, 'message' => "Two terms are named {$terms[$i]['termName']}. Each term needs its own name."], 400);
            }
            $seenTermNames[$key] = true;
        }

        $dupYear = $db->prepare("SELECT year_id FROM school_years WHERE year_code = ? AND year_id != ?");
        $dupYear->execute([$year_code, $year_id]);
        if ($dupYear->fetch()) {
            jsonResponse(['success' => false, 'message' => "{$year_code} already exists."], 409);
        }

        $db->beginTransaction();
        if ($is_active) {
            $db->exec("UPDATE school_years SET is_active = 0");
            $db->exec("UPDATE school_terms SET is_active = 0");
        }

        if ($year_id > 0) {
            $stmt = $db->prepare("UPDATE school_years SET year_code = ?, is_active = ? WHERE year_id = ?");
            $stmt->execute([$year_code, $is_active, $year_id]);
            $updTerm = $db->prepare("UPDATE school_terms SET start_date = ?, end_date = ?, is_active = ? WHERE year_id = ? AND term_name = ? AND level = ?");
            foreach ($terms as $t) {
                $updTerm->execute([$t['startDate'], $t['endDate'], !empty($t['isActive']) ? 1 : 0, $year_id, $t['termName'], $t['level']]);
            }
            $db->commit();
            jsonResponse(['success' => true, 'message' => 'School year updated successfully']);
        } else {
            $stmt = $db->prepare("INSERT INTO school_years (year_code, is_active) VALUES (?, ?)");
            $stmt->execute([$year_code, $is_active]);
            $newId = (int)$db->lastInsertId();
            $insTerm = $db->prepare("INSERT INTO school_terms (year_id, term_name, level, start_date, end_date, status, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)");
            foreach ($terms as $t) {
                $insTerm->execute([$newId, $t['termName'], $t['level'], $t['startDate'], $t['endDate'], $t['status'] ?? 'draft', !empty($t['isActive']) ? 1 : 0]);
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
        $stmt = $db->prepare("UPDATE school_terms SET is_active = 1 WHERE year_id = ? ORDER BY start_date, term_id LIMIT 1");
        $stmt->execute([$year_id]);
        $db->commit();
        jsonResponse(['success' => true, 'message' => 'Active school year updated']);
    }

    if ($action === 'delete_school_year') {
        $year_id = (int)($input['year_id'] ?? 0);
        // The year's terms and everything in them go too. Databases made without the foreign key would
        // otherwise keep those terms, sections and classes after the year is gone.
        $db->beginTransaction();
        try {
            $termsOfYear = "SELECT term_id FROM school_terms WHERE year_id = ?";
            foreach (['schedules', 'schedule_snapshots', 'academic_sections', 'term_subjects'] as $table) {
                $db->prepare("DELETE FROM {$table} WHERE term_id IN ({$termsOfYear})")->execute([$year_id]);
            }
            $db->prepare("DELETE FROM school_terms WHERE year_id = ?")->execute([$year_id]);
            $db->prepare("DELETE FROM school_years WHERE year_id = ?")->execute([$year_id]);
            $db->commit();
        } catch (Throwable $e) {
            $db->rollBack();
            throw $e;
        }
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
        $level = ($input['level'] ?? '') === 'shs' ? 'shs' : 'tertiary';
        $levelName = $level === 'shs' ? 'Senior High School' : 'College';

        $term_name = requireValidTermName($term_name);
        // An edit stays in the term's own year, and keeps its level unless sent
        if ($term_id > 0) {
            $own = $db->prepare("SELECT year_id, level FROM school_terms WHERE term_id = ?");
            $own->execute([$term_id]);
            $ownRow = $own->fetch();
            $year_id = $ownRow ? (int)$ownRow['year_id'] : $year_id;
            if (!isset($input['level'])) {
                $level = ($ownRow['level'] ?? '') === 'shs' ? 'shs' : 'tertiary';
                $levelName = $level === 'shs' ? 'Senior High School' : 'College';
            }
            // Sections and subjects follow their term's level, so a term that has them keeps it
            if ($ownRow && ($ownRow['level'] ?: 'tertiary') !== $level) {
                $used = $db->prepare("SELECT (SELECT COUNT(*) FROM academic_sections WHERE term_id = ?) + (SELECT COUNT(*) FROM term_subjects WHERE term_id = ?)");
                $used->execute([$term_id, $term_id]);
                if ((int)$used->fetchColumn() > 0) {
                    jsonResponse(['success' => false, 'message' => 'This term already has sections or subjects, so its level can\'t be changed. No changes were made.'], 409);
                }
            }
        }
        $sameName = $db->prepare("SELECT COUNT(*) FROM school_terms WHERE year_id = ? AND level = ? AND LOWER(term_name) = LOWER(?) AND term_id != ?");
        $sameName->execute([$year_id, $level, $term_name, $term_id]);
        if ((int)$sameName->fetchColumn() > 0) {
            jsonResponse(['success' => false, 'message' => "This school year already has a {$levelName} term named {$term_name}."], 409);
        }
        if (!isValidDate($start_date) || !isValidDate($end_date)) {
            jsonResponse(['success' => false, 'message' => 'Please enter valid term dates.'], 400);
        }
        if ($end_date <= $start_date) {
            jsonResponse(['success' => false, 'message' => 'The term end date must be after its start date.'], 400);
        }

        if ($term_id <= 0) {
            $findYear = $db->prepare("SELECT COUNT(*) FROM school_years WHERE year_id = ?");
            $findYear->execute([$year_id]);
            if (!(int)$findYear->fetchColumn()) {
                jsonResponse(['success' => false, 'message' => 'That school year no longer exists. Please reload and try again.'], 400);
            }
        }

        if ($term_id > 0) {
            // Status and date edits don't send is_active, so only change it when provided.
            if (array_key_exists('is_active', $input)) {
                $stmt = $db->prepare("UPDATE school_terms SET term_name=?, level=?, start_date=?, end_date=?, status=?, is_active=? WHERE term_id=?");
                $stmt->execute([$term_name, $level, $start_date, $end_date, $status, $is_active, $term_id]);
            } else {
                $stmt = $db->prepare("UPDATE school_terms SET term_name=?, level=?, start_date=?, end_date=?, status=? WHERE term_id=?");
                $stmt->execute([$term_name, $level, $start_date, $end_date, $status, $term_id]);
            }
            jsonResponse(['success' => true, 'message' => 'Term updated successfully']);
        } else {
            $stmt = $db->prepare("INSERT INTO school_terms (year_id, term_name, level, start_date, end_date, status, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$year_id, $term_name, $level, $start_date, $end_date, $status, $is_active]);
            jsonResponse(['success' => true, 'message' => 'Term created successfully', 'term_id' => $db->lastInsertId()]);
        }
    }

    // A term can be deleted while it has no sections or classes; its subjects go with it
    if ($action === 'delete_term') {
        $term_id = (int)($input['term_id'] ?? 0);
        $find = $db->prepare("SELECT year_id, is_active FROM school_terms WHERE term_id = ?");
        $find->execute([$term_id]);
        $term = $find->fetch();
        if (!$term) {
            jsonResponse(['success' => false, 'message' => 'That term no longer exists. Please reload and try again.'], 404);
        }
        if ((int)$term['is_active'] === 1) {
            jsonResponse(['success' => false, 'message' => 'This is the active term. Switch to another term before deleting it. No changes were made.'], 409);
        }
        $siblings = $db->prepare("SELECT COUNT(*) FROM school_terms WHERE year_id = ?");
        $siblings->execute([(int)$term['year_id']]);
        if ((int)$siblings->fetchColumn() <= 1) {
            jsonResponse(['success' => false, 'message' => 'A school year needs at least one term. No changes were made.'], 409);
        }
        $inUse = $db->prepare("SELECT (SELECT COUNT(*) FROM academic_sections WHERE term_id = ?) + (SELECT COUNT(*) FROM schedules WHERE term_id = ?)");
        $inUse->execute([$term_id, $term_id]);
        if ((int)$inUse->fetchColumn() > 0) {
            jsonResponse(['success' => false, 'message' => 'This term still has sections or scheduled classes. Remove them first. No changes were made.'], 409);
        }
        $db->beginTransaction();
        $db->prepare("DELETE FROM term_subjects WHERE term_id = ?")->execute([$term_id]);
        $db->prepare("DELETE FROM schedule_snapshots WHERE term_id = ?")->execute([$term_id]);
        $db->prepare("DELETE FROM school_terms WHERE term_id = ?")->execute([$term_id]);
        $db->commit();
        jsonResponse(['success' => true, 'message' => 'Term deleted']);
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
        $lab_units = isset($input['lab_units']) && $input['lab_units'] !== '' ? (int)$input['lab_units'] : null;
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
        requireFieldLengths(['Subject code' => [$subject_code, 20], 'Subject name' => [$subject_name, 100], 'Program' => [$program, 20], 'Curriculum' => [$curriculum, 50]]);
        requireValidCode('Subject code', $subject_code);
        requireValidText('Subject name', $subject_name);
        requireValidText('Curriculum', $curriculum);
        requireValidProgram($program);
        requireIntInRange('Units', $units, 1, 6);
        requireValidYearLevel($year_level);
        requireValidHours('Lecture hours', $lecture_hours);
        requireValidHours('Lab hours', $lab_hours);
        if ($lab_units !== null) {
            requireIntInRange('Lab units', $lab_units, 0, $units);
            if ($lab_units > 0 && $lab_hours <= 0) rejectInput('This subject has lab units, so give it some lab hours a week.');
            if ($lab_units === 0 && $lab_hours > 0) rejectInput('This subject has lab hours but no lab units. Set its lab units, or clear the lab hours.');
            if ($lab_units < $units && $lecture_hours <= 0) rejectInput('This subject has lecture units, so give it some lecture hours a week.');
        }
        if ($subject_id <= 0) {
            requireTermExists($db, $term_id);
        } else {
            $subjectTerm = $db->prepare("SELECT term_id FROM term_subjects WHERE subject_id = ?");
            $subjectTerm->execute([$subject_id]);
            $term_id = (int)$subjectTerm->fetchColumn() ?: $term_id;
        }
        requireProgramFitsTerm($db, $term_id, $program, $year_level);

        if ($subject_id > 0) {
            $stmt = $db->prepare("UPDATE term_subjects SET subject_code=?, subject_name=?, units=?, lab_units=?, lecture_hours=?, lab_hours=?, subject_type=?, program=?, year_level=?, curriculum=?, is_included=? WHERE subject_id=?");
            $stmt->execute([$subject_code, $subject_name, $units, $lab_units, $lecture_hours, $lab_hours, $subject_type, $program, $year_level, $curriculum, $is_included, $subject_id]);
            jsonResponse(['success' => true, 'message' => 'Subject updated']);
        } else {
            $stmt = $db->prepare("INSERT INTO term_subjects (term_id, subject_code, subject_name, units, lab_units, lecture_hours, lab_hours, subject_type, program, year_level, curriculum, is_included) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$term_id, $subject_code, $subject_name, $units, $lab_units, $lecture_hours, $lab_hours, $subject_type, $program, $year_level, $curriculum, $is_included]);
            jsonResponse(['success' => true, 'message' => 'Subject added', 'subject_id' => $db->lastInsertId()]);
        }
    }

    if ($action === 'toggle_term_subject') {
        $subject_id = (int)($input['subject_id'] ?? 0);
        if (isset($input['is_included'])) {
            // Save the value the user sees, so a missed or repeated click can't flip it the wrong way
            $stmt = $db->prepare("UPDATE term_subjects SET is_included = ? WHERE subject_id = ?");
            $stmt->execute([$input['is_included'] ? 1 : 0, $subject_id]);
        } else {
            $stmt = $db->prepare("UPDATE term_subjects SET is_included = NOT is_included WHERE subject_id = ?");
            $stmt->execute([$subject_id]);
        }
        jsonResponse(['success' => true, 'message' => 'Subject inclusion toggled']);
    }

    if ($action === 'set_all_subjects_included') {
        // Only the subjects the user had listed, so other terms are never changed
        $ids = array_values(array_unique(array_filter(array_map('intval', (array)($input['subject_ids'] ?? [])), fn($id) => $id > 0)));
        if (!$ids) {
            jsonResponse(['success' => false, 'message' => 'No subjects were selected. No changes were made.'], 400);
        }
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $db->prepare("UPDATE term_subjects SET is_included = ? WHERE subject_id IN ($marks)");
        $stmt->execute(array_merge([!empty($input['is_included']) ? 1 : 0], $ids));
        jsonResponse(['success' => true, 'message' => 'Subject inclusion updated']);
    }

    if ($action === 'delete_term_subject') {
        $subject_id = (int)($input['subject_id'] ?? 0);
        $stmt = $db->prepare("DELETE FROM term_subjects WHERE subject_id = ?");
        $stmt->execute([$subject_id]);
        jsonResponse(['success' => true, 'message' => 'Subject removed']);
    }

    // ─── 4. SECTION BUILDER ACTIONS ───
    // School-wide default loads in units, used for new teachers and teachers without their own minimum or maximum
    if ($action === 'save_default_loads') {
        requireAdminRole();
        $loads = [];
        foreach (['Full-time' => 'full', 'Part-time' => 'part'] as $status => $key) {
            $min = requireIntInRange("{$status} minimum load", $input["{$key}_min"] ?? null, 0, 40);
            $max = requireIntInRange("{$status} maximum load", $input["{$key}_max"] ?? null, 3, 40);
            if ($min > $max) {
                jsonResponse(['success' => false, 'message' => "The {$status} minimum load can't be more than its maximum."], 400);
            }
            $loads[$status] = ['min' => $min, 'max' => $max];
        }
        $db->prepare("REPLACE INTO app_settings (setting_key, setting_value) VALUES ('default_loads', ?)")->execute([json_encode($loads)]);
        jsonResponse(['success' => true, 'message' => 'Default loads saved']);
    }

    // Rooms & Instructors: a section's room and the instructor chosen for each of its subjects (blank = automatic)
    if ($action === 'save_section_plan') {
        requireAdminRole();
        $find = $db->prepare("SELECT section_id, term_id, section_code, student_count FROM academic_sections WHERE section_id = ?");
        $find->execute([(int)($input['section_id'] ?? 0)]);
        $section = $find->fetch();
        if (!$section) {
            jsonResponse(['success' => false, 'message' => 'That section no longer exists. Please reload and try again.'], 404);
        }
        $homeRoom = trim((string)($input['home_room'] ?? ''));
        if ($homeRoom !== '') {
            $roomSeats = $db->prepare("SELECT capacity FROM classrooms WHERE room_name_number = ?");
            $roomSeats->execute([$homeRoom]);
            $seats = $roomSeats->fetchColumn();
            if ($seats === false) {
                jsonResponse(['success' => false, 'message' => "Room {$homeRoom} no longer exists. Please pick another room."], 400);
            }
            if ((int)$seats < (int)$section['student_count']) {
                jsonResponse(['success' => false, 'message' => "{$homeRoom} seats {$seats}, but {$section['section_code']} has {$section['student_count']} students. Pick a bigger room."], 400);
            }
        }
        $level = termSchoolLevel($db, (int)$section['term_id']);
        $qualifications = loadQualifications($db);
        $findTeacher = $db->prepare("SELECT user_id, CONCAT(first_name, ' ', last_name) AS name, teaching_level FROM users WHERE email = ? AND role IN ('faculty', 'program-head') LIMIT 1");
        $plan = [];
        foreach ((array)($input['subject_teachers'] ?? []) as $code => $email) {
            $code = strtoupper(trim((string)$code));
            $email = trim((string)$email);
            if ($code === '' || $email === '') continue;
            requireFieldLengths(['Subject code' => [$code, 20], 'Instructor email' => [$email, 100]]);
            $findTeacher->execute([$email]);
            $teacher = $findTeacher->fetch();
            if (!$teacher) {
                jsonResponse(['success' => false, 'message' => "The instructor chosen for {$code} no longer has a faculty account. Please choose another."], 400);
            }
            if (empty($qualifications[(int)$teacher['user_id']][$code])) {
                jsonResponse(['success' => false, 'message' => "{$teacher['name']} has no FCC certificate covering {$code}'s subject area, so they can't be chosen for it."], 400);
            }
            $teaches = $teacher['teaching_level'] ?: 'tertiary';
            if ($teaches !== 'mixed' && $teaches !== $level) {
                jsonResponse(['success' => false, 'message' => "{$teacher['name']} isn't set to teach " . ($level === 'shs' ? 'Senior High School' : 'college') . ' classes, so they can\'t be chosen for this section.'], 400);
            }
            $plan[$code] = $email;
        }
        $db->prepare("UPDATE academic_sections SET home_room = ?, subject_teachers = ? WHERE section_id = ?")
            ->execute([$homeRoom !== '' ? $homeRoom : null, $plan ? json_encode($plan) : null, (int)$section['section_id']]);
        jsonResponse(['success' => true, 'message' => 'Rooms and instructors saved']);
    }

    if ($action === 'save_section') {
        $section_id = (int)($input['section_id'] ?? 0);
        $term_id = (int)($input['term_id'] ?? 1);
        $section_code = trim($input['section_code'] ?? '');
        $section_name = trim($input['section_name'] ?? '');
        $program = trim($input['program'] ?? 'BSIT');
        $year_level = (int)($input['year_level'] ?? 1);
        $student_count = (int)($input['student_count'] ?? 35);
        $shift = trim($input['shift'] ?? 'AM');
        if (!in_array($shift, ['AM', 'MIDSHIFT', 'PM'])) $shift = 'AM';

        if (!$section_code || !$section_name) {
            jsonResponse(['success' => false, 'message' => 'Section code and name are required'], 400);
        }
        requireFieldLengths(['Section code' => [$section_code, 20], 'Section name' => [$section_name, 50], 'Program' => [$program, 20]]);
        requireValidCode('Section code', $section_code);
        requireValidText('Section name', $section_name);
        requireValidProgram($program);
        requireIntInRange('Student count', $student_count, 1, 60);
        requireValidYearLevel($year_level);
        if ($section_id <= 0) {
            requireTermExists($db, $term_id);
        } else {
            // An edit stays in the section's own term
            $sectionTerm = $db->prepare("SELECT term_id FROM academic_sections WHERE section_id = ?");
            $sectionTerm->execute([$section_id]);
            $term_id = (int)$sectionTerm->fetchColumn() ?: $term_id;
        }
        requireProgramFitsTerm($db, $term_id, $program, $year_level);

        // The home room must exist and seat the whole section
        $homeRoom = trim((string)($input['home_room'] ?? ''));
        if ($homeRoom !== '') {
            $roomSeats = $db->prepare("SELECT capacity FROM classrooms WHERE room_name_number = ?");
            $roomSeats->execute([$homeRoom]);
            $seats = $roomSeats->fetchColumn();
            if ($seats === false) {
                jsonResponse(['success' => false, 'message' => "Room {$homeRoom} no longer exists. Please pick another home room."], 400);
            }
            if ((int)$seats < $student_count) {
                jsonResponse(['success' => false, 'message' => "{$homeRoom} seats {$seats}, but this section has {$student_count} students. Pick a bigger home room."], 400);
            }
        }
        $homeRoom = $homeRoom !== '' ? $homeRoom : null;

        // The adviser is a teacher's account email, and they must be set to teach this term's level
        $adviser = trim((string)($input['adviser'] ?? ''));
        if ($adviser !== '') {
            $findAdviser = $db->prepare("SELECT CONCAT(first_name, ' ', last_name) AS name, teaching_level FROM users WHERE email = ? AND role IN ('faculty', 'program-head') LIMIT 1");
            $findAdviser->execute([$adviser]);
            $adviserRow = $findAdviser->fetch();
            if (!$adviserRow) {
                jsonResponse(['success' => false, 'message' => 'That adviser no longer has a faculty account. Please pick another adviser.'], 400);
            }
            $sectionLevel = termSchoolLevel($db, $term_id);
            $adviserLevel = $adviserRow['teaching_level'] ?: 'tertiary';
            if ($adviserLevel !== 'mixed' && $adviserLevel !== $sectionLevel) {
                $levelName = $sectionLevel === 'shs' ? 'Senior High School' : 'college';
                jsonResponse(['success' => false, 'message' => "{$adviserRow['name']} isn't set to teach {$levelName} classes, so they can't advise this section. Change their teaching level in Faculty Profiles or pick another adviser."], 400);
            }
        }
        $adviser = $adviser !== '' ? $adviser : null;

        $dupSection = $db->prepare("SELECT section_id FROM academic_sections WHERE section_code = ? AND term_id = ? AND section_id != ?");
        $dupSection->execute([$section_code, $term_id, $section_id]);
        if ($dupSection->fetch()) {
            jsonResponse(['success' => false, 'message' => "Section code {$section_code} already exists in this term."], 409);
        }

        if ($section_id > 0) {
            $findCode = $db->prepare("SELECT section_code FROM academic_sections WHERE section_id = ?");
            $findCode->execute([$section_id]);
            $previousCode = (string)$findCode->fetchColumn();

            $db->beginTransaction();
            $stmt = $db->prepare("UPDATE academic_sections SET section_code=?, section_name=?, program=?, year_level=?, student_count=?, adviser=?, shift=?, home_room=? WHERE section_id=?");
            $stmt->execute([$section_code, $section_name, $program, $year_level, $student_count, $adviser, $shift, $homeRoom, $section_id]);
            // Classes are matched by section code, so they follow a rename
            if ($previousCode !== '' && $previousCode !== $section_code) {
                $db->prepare("UPDATE schedules SET section_name = ? WHERE section_name = ? AND term_id = ?")->execute([$section_code, $previousCode, $term_id]);
                bumpScheduleVersion($db, $term_id);
            }
            $db->commit();
            jsonResponse(['success' => true, 'message' => 'Section updated']);
        } else {
            $stmt = $db->prepare("INSERT INTO academic_sections (term_id, section_code, section_name, program, year_level, student_count, adviser, shift, home_room) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$term_id, $section_code, $section_name, $program, $year_level, $student_count, $adviser, $shift, $homeRoom]);
            jsonResponse(['success' => true, 'message' => 'Section created', 'section_id' => $db->lastInsertId()]);
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

        if ($new_code !== '') {
            requireValidCode('Section code', $new_code);
        }
        if ($new_name !== '') {
            requireValidText('Section name', $new_name);
        }
        $splitCode = $new_code ?: $sec['section_code'] . '-B';
        requireFieldLengths(['Section code' => [$splitCode, 20], 'Section name' => [$new_name ?: $sec['section_name'] . ' (Split)', 50]]);
        $dupSection = $db->prepare("SELECT section_id FROM academic_sections WHERE section_code = ? AND term_id = ?");
        $dupSection->execute([$splitCode, $sec['term_id']]);
        if ($dupSection->fetch()) {
            jsonResponse(['success' => false, 'message' => "Section code {$splitCode} already exists in this term."], 409);
        }

        $remaining = $sec['student_count'] - $split_count;
        $db->prepare("UPDATE academic_sections SET student_count = ? WHERE section_id = ?")->execute([$remaining, $sec_id]);

        $ins = $db->prepare("INSERT INTO academic_sections (term_id, section_code, section_name, program, year_level, student_count, adviser, shift) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $ins->execute([$sec['term_id'], $new_code ?: $sec['section_code'].'-B', $new_name ?: $sec['section_name'].' (Split)', $sec['program'], $sec['year_level'], $split_count, null, $sec['shift'] ?? 'AM']);

        jsonResponse(['success' => true, 'message' => "Section split into {$sec['section_code']} ({$remaining}) and {$new_code} ({$split_count})"]);
    }

    if ($action === 'auto_generate_sections') {
        $programs = is_array($input['programs'] ?? null) ? $input['programs'] : ['BSIT'];
        $years = is_array($input['years'] ?? null) ? $input['years'] : [1];
        $sec_count = (int)($input['sections_per_group'] ?? 2);
        $student_count = (int)($input['students_per_section'] ?? 35);
        $term_id = (int)($input['term_id'] ?? 1);

        if ($sec_count < 1 || $sec_count > 26 || $student_count < 1 || $student_count > 60) {
            jsonResponse(['success' => false, 'message' => 'Enter between 1 and 26 sections, with 1 to 60 students each.'], 400);
        }
        foreach ($programs as $prog) {
            requireValidProgram($prog);
        }
        requireTermExists($db, $term_id);
        // A program shorter than its level (such as 2-year HRS) gets sections only for its own years
        $offers = fn($prog, $yr) => !isset(PROGRAM_YEARS[$prog]) || in_array((int)$yr, PROGRAM_YEARS[$prog], true);
        foreach ($programs as $prog) {
            foreach ($years as $yr) {
                if (!$offers($prog, $yr)) continue;
                requireProgramFitsTerm($db, $term_id, (string)$prog, requireValidYearLevel($yr));
            }
        }

        $letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
        $created = 0;

        foreach ($programs as $prog) {
            foreach ($years as $yr) {
                if (!$offers($prog, $yr)) continue;
                for ($i = 0; $i < $sec_count; $i++) {
                    $letter = $letters[$i] ?? (string)($i + 1);
                    // SHS sections read like HTTO11-A; college sections keep the IT101M pattern
                    $prefix = sectionCodePrefix((string)$prog);
                    if ((int)$yr >= 11) {
                        $code = "{$prefix}{$yr}-{$letter}";
                    } else {
                        $code = "{$prefix}{$yr}0" . ($i + 1) . "M";
                    }
                    $name = "{$prog} {$yr}{$letter}";

                    $check = $db->prepare("SELECT section_id FROM academic_sections WHERE section_code = ? AND term_id = ?");
                    $check->execute([$code, $term_id]);
                    if ($check->fetch()) {
                        $upd = $db->prepare("UPDATE academic_sections SET student_count=?, section_name=? WHERE section_code=? AND term_id=?");
                        $upd->execute([$student_count, $name, $code, $term_id]);
                    } else {
                        $ins = $db->prepare("INSERT INTO academic_sections (term_id, section_code, section_name, program, year_level, student_count) VALUES (?, ?, ?, ?, ?, ?)");
                        $ins->execute([$term_id, $code, $name, $prog, $yr, $student_count]);
                        $created++;
                    }
                }
            }
        }
        jsonResponse(['success' => true, 'message' => "Auto-generation completed ({$created} sections created)"]);
    }

    if ($action === 'delete_section') {
        $section_id = (int)($input['section_id'] ?? 0);
        $findSection = $db->prepare("SELECT section_code, term_id FROM academic_sections WHERE section_id = ?");
        $findSection->execute([$section_id]);
        $section = $findSection->fetch();
        if ($section) {
            $db->beginTransaction();
            $db->prepare("DELETE FROM schedules WHERE section_name = ? AND term_id = ?")->execute([$section['section_code'], $section['term_id']]);
            $db->prepare("DELETE FROM academic_sections WHERE section_id = ?")->execute([$section_id]);
            bumpScheduleVersion($db, (int)$section['term_id']);
            $db->commit();
        }
        jsonResponse(['success' => true, 'message' => 'Section deleted']);
    }

    // ─── 5. BULK BASELINE PERSISTENCE ───
    if ($action === 'generate_baseline' || $action === 'bulk_save_schedules') {
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

        // AI drafts must have no clashes at all; manual edits may still save with a warning
        if (!empty($input['strict'])) {
            foreach ($rows as $i => $a) {
                foreach (array_slice($rows, $i + 1) as $b) {
                    if ($a[6] === $b[6] && $a[7] < $b[8] && $a[8] > $b[7] && ($a[1] === $b[1] || $a[2] === $b[2] || $a[5] === $b[5])) {
                        jsonResponse(['success' => false, 'message' => "This draft has a clash on {$a[6]} at {$a[7]}. No changes were made."], 409);
                    }
                }
            }
        }

        $db->beginTransaction();
        try {
            $newVersion = lockScheduleVersion($db, $term_id, $input['expected_version'] ?? null);
            // Safety net: an edit changes a few classes, so an edit save that would wipe out most of a term is refused
            // (replacing a whole term is done by Generate, which can be undone)
            if ($action === 'bulk_save_schedules') {
                $countExisting = $db->prepare("SELECT COUNT(*) FROM schedules WHERE term_id = ?");
                $countExisting->execute([$term_id]);
                $existing = (int)$countExisting->fetchColumn();
                if ($existing - count($rows) > 10 && count($rows) < $existing / 2) {
                    $db->rollBack();
                    jsonResponse(['success' => false, 'message' => 'This change would remove ' . ($existing - count($rows)) . ' classes at once, so it was stopped and nothing was changed. Reload the page and try again.'], 409);
                }
            }
            // Checked inside the lock, against the rows actually saved now
            requireNoNewClashesOrOverloads($db, $rows, $term_id);
            // A full regenerate can be undone; ordinary edits don't replace the undo copy
            if ($action !== 'bulk_save_schedules') {
                saveScheduleSnapshot($db, $term_id);
            } else {
                // The log says which classes changed; a save that changed nothing isn't logged
                setActivitySummary(describeScheduleChanges($db, $term_id, $rows));
            }
            // Replace this term only. NULL rows are old records saved before terms were tracked.
            $del = $db->prepare("DELETE FROM schedules WHERE term_id = ? OR term_id IS NULL");
            $del->execute([$term_id]);
            insertScheduleRows($db, $rows);
            bumpScheduleVersion($db, $term_id);
            $db->commit();
            jsonResponse(['success' => true, 'message' => 'Baseline schedules successfully persisted to database', 'count' => count($schedules), 'schedule_version' => $newVersion]);
        } catch (Exception $e) {
            $db->rollBack();
            error_log('schedules.php baseline: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => 'Failed to save the schedule. No changes were made.'], 500);
        }
    }

    if ($action === 'restore_schedule') {
        $term_id = (int)($input['term_id'] ?? 0);
        $findSnapshot = $db->prepare("SELECT schedule_json FROM schedule_snapshots WHERE term_id = ?");
        $findSnapshot->execute([$term_id]);
        $saved = json_decode((string)$findSnapshot->fetchColumn(), true);
        if (!$saved) {
            jsonResponse(['success' => false, 'message' => 'There is no earlier schedule to restore for this term.'], 404);
        }

        // Rooms, teachers or rules may have changed since the copy was made
        $roomIds = array_flip($db->query("SELECT room_id FROM classrooms")->fetchAll(PDO::FETCH_COLUMN));
        $userIds = array_flip($db->query("SELECT user_id FROM users")->fetchAll(PDO::FETCH_COLUMN));
        $qualifications = isStatePublished($db) ? loadQualifications($db) : null;
        $availability = loadAvailability($db);
        $rows = [];
        foreach ($saved as $r) {
            $facultyId = (int)$r['faculty_id'];
            $valid = isset($roomIds[$r['room_id']]) && isset($userIds[$r['faculty_id']])
                && ($qualifications === null || !empty($qualifications[$facultyId][strtoupper($r['subject_code'])]))
                && (!isset($availability[$facultyId]) || isWithinAvailability($availability[$facultyId], $r['day_of_week'], $r['start_time'], $r['end_time']));
            if (!$valid) {
                jsonResponse(['success' => false, 'message' => "The earlier schedule can't be restored because {$r['section_name']} {$r['subject_code']} no longer meets the current rooms, qualifications or availability."], 409);
            }
            $rows[] = [$term_id, (int)$r['room_id'], $facultyId, $r['subject_code'], $r['subject_category'], $r['section_name'], $r['day_of_week'], $r['start_time'], $r['end_time'], (int)$r['ai_generated'], (int)($r['is_locked'] ?? 0)];
        }

        $db->beginTransaction();
        try {
            lockScheduleVersion($db, $term_id, $input['expected_version'] ?? null);
            saveScheduleSnapshot($db, $term_id); // Restoring can itself be undone
            $db->prepare("DELETE FROM schedules WHERE term_id = ? OR term_id IS NULL")->execute([$term_id]);
            insertScheduleRows($db, $rows);
            bumpScheduleVersion($db, $term_id);
            $db->commit();
            jsonResponse(['success' => true, 'message' => 'Previous schedule restored']);
        } catch (Exception $e) {
            $db->rollBack();
            error_log('schedules.php restore: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => 'Could not restore the schedule. No changes were made.'], 500);
        }
    }

    jsonResponse(['success' => false, 'message' => 'Invalid action: ' . htmlspecialchars($action)], 400);
} else {
    jsonResponse(['success' => false, 'error' => 'Method not allowed'], 405);
}
