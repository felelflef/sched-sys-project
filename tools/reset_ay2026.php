<?php
/**
 * Reset the scheduling data to a fresh, complete school year (AY 2026-2027 unless --year says otherwise) for College
 * and Senior High School.
 *
 * Run it from your own terminal (it refuses to run from a web request):
 *   php tools/reset_ay2026.php                 Dry run: shows what would change, changes nothing
 *   php tools/reset_ay2026.php --apply         Resets, after you type RESET
 *   add --year=2027-2028                       Builds that school year instead (the term dates move with it)
 *   add --add-teachers                         Replaces the sample teaching records (no login) an earlier run added with
 *                                              the fewest new ones that cover the shortfall, Mixed (College and SHS) where possible
 *   add --add-only                             Deletes nothing: keeps the school year, terms, rooms, catalog, subject sets,
 *                                              sections, timetables, activity log and teachers, and only adds what is
 *                                              missing (with --add-teachers, only the teachers still needed)
 *
 * Connection: the same variables the live site uses (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS, DB_SSL,
 * optional DB_SSL_CA), read from the environment or from a .env file in the project folder.
 *
 * Kept as they are: every user account and password, FCC certificates and who holds them, departments, app settings
 * (with --add-teachers, only the earlier sample teaching records are replaced).
 * Replaced: school years, terms, subjects, sections, rooms, the subject catalog, subject sets, timetables
 * and the activity log. A backup of everything it deletes is written to tools/backups/ first, and the
 * whole reset runs in one transaction, so a failure part-way changes nothing.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$args = array_slice($argv, 1);
$apply = in_array('--apply', $args, true);
$addTeachers = in_array('--add-teachers', $args, true);
$addOnly = in_array('--add-only', $args, true);
$yearArg = null;
foreach ($args as $a) {
    if (preg_match('/^--year=(\d{4})-(\d{4})$/', $a, $m) && (int)$m[2] === (int)$m[1] + 1) {
        $yearArg = [(int)$m[1], (int)$m[2]];
        continue;
    }
    if (!in_array($a, ['--apply', '--add-teachers', '--add-only'], true)) {
        fwrite(STDERR, str_starts_with($a, '--year') ? "Write the school year like --year=2027-2028.\n" : "Unknown option: {$a}\n");
        exit(2);
    }
}
[$FIRST_YEAR, $SECOND_YEAR] = $yearArg ?? [2026, 2027];
$YEAR_CODE = "AY {$FIRST_YEAR}-{$SECOND_YEAR}";
$projectDir = dirname(__DIR__);

/* ───────────── Connection ───────────── */
$env = [];
if (is_file("{$projectDir}/.env")) {
    foreach (file("{$projectDir}/.env", FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (preg_match('/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/', $line, $m) && $line[0] !== '#') {
            $env[$m[1]] = trim($m[2], "\"'");
        }
    }
}
$cfg = fn(string $key, string $default = '') => getenv($key) !== false && getenv($key) !== '' ? getenv($key) : ($env[$key] ?? $default);
if (!extension_loaded('pdo_mysql')) {
    fwrite(STDERR, "PHP's MySQL driver (pdo_mysql) is not turned on. Run with: php -d extension=pdo_mysql tools/reset_ay2026.php\n");
    exit(1);
}
$host = $cfg('DB_HOST');
if ($host === '') {
    fwrite(STDERR, "DB_HOST is not set. Set DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS and DB_SSL (as on Render) and run again.\n");
    exit(1);
}
$options = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false];
if (filter_var($cfg('DB_SSL', 'false'), FILTER_VALIDATE_BOOLEAN)) {
    $ca = $cfg('DB_SSL_CA');
    $options[PDO::MYSQL_ATTR_SSL_CA] = $ca;
    $options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = $ca !== '';
}
$dbName = $cfg('DB_NAME', 'sti_classroom_system');
try {
    $db = new PDO("mysql:host={$host};port={$cfg('DB_PORT', '3306')};dbname={$dbName};charset=utf8mb4", $cfg('DB_USER', 'root'), $cfg('DB_PASS'), $options);
} catch (PDOException $e) {
    fwrite(STDERR, "Could not connect to {$host}: {$e->getMessage()}\n");
    exit(1);
}
echo "Connected to {$dbName} on {$host}\n\n";

/* ───────────── The database must be on this version of the app ───────────── */
preg_match("/define\('SCHEMA_VERSION', '([^']+)'\)/", (string)file_get_contents("{$projectDir}/config/db.php"), $m);
$schemaVersion = $m[1] ?? '';
$stamp = $db->query("SELECT setting_value FROM app_settings WHERE setting_key = 'schema_lifecycle'")->fetchColumn();
$needed = ['school_terms' => 'level', 'academic_sections' => 'subject_teachers', 'subject_catalog' => 'level', 'term_subjects' => 'lab_units', 'users' => 'teaching_level'];
$missing = [];
foreach ($needed as $table => $column) {
    if (!$db->query("SHOW COLUMNS FROM `{$table}` LIKE '{$column}'")->fetch()) $missing[] = "{$table}.{$column}";
}
if ($missing || $stamp !== $schemaVersion) {
    fwrite(STDERR, "This database isn't on this version of the app yet (it is on " . ($stamp ?: 'an unknown version') . ", this script needs {$schemaVersion}"
        . ($missing ? '; missing ' . implode(', ', $missing) : '') . ").\nDeploy this version, open the site once and sign in as admin, then run this again.\n");
    exit(1);
}

/* ───────────── The school year (term dates below are for AY 2026-2027 and move with --year) ───────────── */
$AREAS = ['IT / Computing', 'Tourism', 'Hospitality & Culinary', 'Business & Entrepreneurship', 'Arts & Social Sciences', 'General Education', 'PE & NSTP'];
// The Subject Catalog: [code, title, area, units]. Standard CHED / TESDA / DepEd subject names.
$CATALOG = [
  // General Education (CHED)
  ['GE 1', 'Understanding the Self', 'General Education', 3],
  ['GE 2', 'Readings in Philippine History', 'General Education', 3],
  ['GE 3', 'The Contemporary World', 'General Education', 3],
  ['GE 4', 'Mathematics in the Modern World', 'General Education', 3],
  ['GE 5', 'Purposive Communication', 'General Education', 3],
  ['GE 6', 'Art Appreciation', 'General Education', 3],
  ['GE 7', 'Science, Technology and Society', 'General Education', 3],
  ['GE 8', 'Ethics', 'General Education', 3],
  ['GE 9', 'Life and Works of Rizal', 'General Education', 3],
  // PE & NSTP
  ['PATHFIT 1', 'Movement Competency Training', 'PE & NSTP', 2],
  ['PATHFIT 2', 'Exercise-based Fitness Activities', 'PE & NSTP', 2],
  ['PATHFIT 3', 'Sports and Dance', 'PE & NSTP', 2],
  ['PATHFIT 4', 'Outdoor and Adventure Activities', 'PE & NSTP', 2],
  ['NSTP 1', 'National Service Training Program 1', 'PE & NSTP', 3],
  ['NSTP 2', 'National Service Training Program 2', 'PE & NSTP', 3],
  // IT / Computing: shared (CMO 25)
  ['COMP 101', 'Introduction to Computing', 'IT / Computing', 3],
  ['COMP 102', 'Computer Programming 1', 'IT / Computing', 3],
  ['COMP 103', 'Computer Programming 2', 'IT / Computing', 3],
  ['COMP 104', 'Data Structures and Algorithms', 'IT / Computing', 3],
  ['COMP 105', 'Information Management', 'IT / Computing', 3],
  ['COMP 106', 'Applications Development and Emerging Technologies', 'IT / Computing', 3],
  // BSIT
  ['IT 102', 'Human Computer Interaction', 'IT / Computing', 3],
  ['IT 103', 'Networking 1', 'IT / Computing', 3],
  ['IT 104', 'Networking 2', 'IT / Computing', 3],
  ['IT 105', 'Web Systems and Technologies', 'IT / Computing', 3],
  ['IT 106', 'Integrative Programming and Technologies', 'IT / Computing', 3],
  ['IT 107', 'Information Assurance and Security', 'IT / Computing', 3],
  ['IT 108', 'Systems Integration and Architecture', 'IT / Computing', 3],
  ['IT 109', 'Systems Administration and Maintenance', 'IT / Computing', 3],
  ['IT 110', 'Mobile Application Development', 'IT / Computing', 3],
  ['IT 111', 'Cloud Computing', 'IT / Computing', 3],
  ['IT 112', 'Capstone Project 1', 'IT / Computing', 3],
  ['IT 113', 'Capstone Project 2', 'IT / Computing', 3],
  // BSCS
  ['CS 101', 'Discrete Structures 1', 'IT / Computing', 3],
  ['CS 102', 'Discrete Structures 2', 'IT / Computing', 3],
  ['CS 103', 'Object-Oriented Programming', 'IT / Computing', 3],
  ['CS 104', 'Algorithms and Complexity', 'IT / Computing', 3],
  ['CS 105', 'Automata Theory and Formal Languages', 'IT / Computing', 3],
  ['CS 106', 'Programming Languages', 'IT / Computing', 3],
  ['CS 107', 'Software Engineering 1', 'IT / Computing', 3],
  ['CS 108', 'Software Engineering 2', 'IT / Computing', 3],
  ['CS 109', 'Operating Systems', 'IT / Computing', 3],
  ['CS 110', 'Architecture and Organization', 'IT / Computing', 3],
  ['CS 111', 'Networks and Communications', 'IT / Computing', 3],
  ['CS 112', 'Machine Learning', 'IT / Computing', 3],
  ['CS 113', 'Data Science and Analytics', 'IT / Computing', 3],
  ['CS 114', 'Thesis 1', 'IT / Computing', 3],
  ['CS 115', 'Thesis 2', 'IT / Computing', 3],
  // ICT-SCPT (SHS)
  ['SCPT 101', 'Computer Systems Servicing', 'IT / Computing', 3],
  ['SCPT 102', 'Computer Programming (SHS) 1', 'IT / Computing', 3],
  ['SCPT 103', 'Computer Programming (SHS) 2', 'IT / Computing', 3],
  ['SCPT 104', 'Web Development', 'IT / Computing', 3],
  // Tourism: BSTM (CMO 62)
  ['THC 101', 'Macro Perspective of Tourism and Hospitality', 'Tourism', 3],
  ['THC 102', 'Risk Management as Applied to Safety, Security and Sanitation', 'Tourism', 3],
  ['THC 103', 'Quality Service Management in Tourism and Hospitality', 'Tourism', 3],
  ['THC 104', 'Philippine Culture and Tourism Geography', 'Tourism', 3],
  ['THC 105', 'Micro Perspective of Tourism and Hospitality', 'Tourism', 3],
  ['THC 106', 'Tourism and Hospitality Marketing', 'Tourism', 3],
  ['THC 107', 'Legal Aspects in Tourism and Hospitality', 'Tourism', 3],
  ['THC 108', 'Multicultural Diversity in the Workplace', 'Tourism', 3],
  ['THC 109', 'Entrepreneurship in Tourism and Hospitality', 'Tourism', 3],
  ['TPC 101', 'Tour and Travel Management', 'Tourism', 3],
  ['TPC 102', 'Sustainable Tourism', 'Tourism', 3],
  ['TPC 103', 'Global Culture and Tourism Geography', 'Tourism', 3],
  ['TPC 104', 'Transportation Management', 'Tourism', 3],
  ['TPC 105', 'Tourism Policy Planning and Development', 'Tourism', 3],
  ['TPC 106', 'Applied Business Tools and Technologies (GDS)', 'Tourism', 3],
  ['TPC 107', 'Introduction to MICE', 'Tourism', 3],
  ['TPC 108', 'Airline Management and Operations', 'Tourism', 3],
  ['TPC 109', 'Research in Tourism', 'Tourism', 3],
  // HTTO (SHS)
  ['HTTO 101', 'Travel and Tour Services', 'Tourism', 3],
  ['HTTO 102', 'Local Guiding Services', 'Tourism', 3],
  ['HTTO 103', 'Front Office Services (SHS)', 'Tourism', 3],
  ['HTTO 104', 'Events Management', 'Tourism', 3],
  // Hospitality & Culinary: HRS (TESDA NC II)
  ['HRS 101', 'Cookery', 'Hospitality & Culinary', 3],
  ['HRS 102', 'Food and Beverage Services', 'Hospitality & Culinary', 3],
  ['HRS 103', 'Bread and Pastry Production', 'Hospitality & Culinary', 3],
  ['HRS 104', 'Housekeeping', 'Hospitality & Culinary', 3],
  ['HRS 105', 'Front Office Services', 'Hospitality & Culinary', 3],
  ['HRS 106', 'Customer Communication Services', 'Hospitality & Culinary', 3],
  // HTCUA (SHS)
  ['HTCUA 101', 'Kitchen Safety and Sanitation', 'Hospitality & Culinary', 3],
  ['HTCUA 102', 'Culinary Cookery', 'Hospitality & Culinary', 3],
  ['HTCUA 103', 'Baking and Pastry', 'Hospitality & Culinary', 3],
  ['HTCUA 104', 'Food and Beverage Service (SHS)', 'Hospitality & Culinary', 3],
  // Business & Entrepreneurship (SHS B&E)
  ['BE 101', 'Fundamentals of Accountancy, Business and Management 1', 'Business & Entrepreneurship', 3],
  ['BE 102', 'Fundamentals of Accountancy, Business and Management 2', 'Business & Entrepreneurship', 3],
  ['BE 103', 'Business Finance', 'Business & Entrepreneurship', 3],
  ['BE 104', 'Principles of Marketing', 'Business & Entrepreneurship', 3],
  ['BE 105', 'Applied Economics', 'Business & Entrepreneurship', 3],
  ['BE 106', 'Business Ethics and Social Responsibility', 'Business & Entrepreneurship', 3],
  ['BE 107', 'Entrepreneurship', 'Business & Entrepreneurship', 3],
  // SHS core
  ['SHS 101', 'Effective Communication', 'General Education', 3],
  ['SHS 102', 'General Mathematics', 'General Education', 3],
  ['SHS 103', 'General Science', 'General Education', 3],
  ['SHS 104', 'Life and Career Skills', 'General Education', 3],
  ['SHS 105', 'Pag-aaral ng Kasaysayan at Lipunang Pilipino', 'General Education', 3],
  ['SHS 106', 'Physical Education and Health', 'PE & NSTP', 2],
];
$SHS_PREFIXES = ['SCPT', 'HTTO', 'HTCUA', 'BE', 'ASSH', 'SHS'];
$catalogLevel = fn(string $code) => in_array(strtok($code, ' '), $SHS_PREFIXES, true) ? 'shs' : 'tertiary';
$catalogByCode = [];
foreach ($CATALOG as [$code, $title, $area, $units]) $catalogByCode[$code] = ['title' => $title, 'area' => $area, 'units' => $units];

// Weekly hours: [units, lab units, lecture hours, lab hours, type]. A lab unit is 3 lab hours, a lecture unit 1 hour.
function subjectHours(string $code): array {
    $lab1 = [3, 1, 2, 3];   // 2 hours lecture + 3 hours lab
    $lab2 = [3, 2, 1, 6];   // 1 hour lecture + 6 hours lab
    $lecture = [3, 0, 3, 0];
    if (preg_match('/^PATHFIT|^SHS 106$/', $code)) return [2, 0, 2, 0, 'pe'];
    // SHS subjects meet 4.5 hours a week: lecture only, or 1.5 hours lecture + 3 hours lab
    if (preg_match('/^(SCPT|HTCUA 10[234]|HTTO 10[134])$|^SCPT /', $code)) return [3, 1, 1.5, 3, preg_match('/^HTCUA/', $code) ? 'lab' : 'lecture'];
    if (preg_match('/^(SHS|BE|ASSH|HTTO|HTCUA) /', $code)) return [3, 0, 4.5, 0, 'lecture'];
    if (str_starts_with($code, 'NSTP')) return [3, 0, 3, 0, 'special'];
    if (in_array($code, ['IT 112', 'IT 113', 'CS 114', 'CS 115', 'CS 101', 'CS 102', 'CS 104', 'CS 105', 'CS 106'], true)) return [...$lecture, 'lecture'];
    if (preg_match('/^(COMP|IT|CS|SCPT) /', $code)) return [...$lab1, 'lecture'];
    if (in_array($code, ['TPC 101', 'TPC 106', 'TPC 108', 'HTTO 101', 'HTTO 103', 'HTTO 104'], true)) return [...$lab1, 'lecture'];
    if (in_array($code, ['HRS 101', 'HRS 103', 'HTCUA 102', 'HTCUA 103'], true)) return [...$lab2, 'lab'];
    if (in_array($code, ['HRS 102', 'HRS 104', 'HRS 105', 'HTCUA 104'], true)) return [...$lab1, 'lab'];
    return [...$lecture, 'lecture'];
}

// Terms, as the app makes them for a new school year
$TERMS = [
    'tertiary' => [['1st Sem', '2026-08-16', '2026-12-17'], ['2nd Sem', '2027-01-10', '2027-05-26'], ['Summer', '2027-06-07', '2027-07-23']],
    'shs'      => [['1st Term', '2026-08-16', '2026-11-14'], ['2nd Term', '2026-11-23', '2027-02-26'], ['3rd Term', '2027-03-08', '2027-05-28'], ['Summer', '2027-06-07', '2027-07-23']],
];
// Another school year keeps the same calendar, moved by whole years
$yearShift = $FIRST_YEAR - 2026;
if ($yearShift !== 0) {
    foreach ($TERMS as &$levelTerms) {
        foreach ($levelTerms as &$term) {
            foreach ([1, 2] as $i) $term[$i] = date('Y-m-d', strtotime("{$yearShift} years", strtotime($term[$i])));
        }
        unset($term);
    }
    unset($levelTerms);
}
// Curriculum: the subjects each program and year takes each term
$CURRICULUM = [
    'BSIT' => [
        1 => ['1st Sem' => ['COMP 101', 'COMP 102', 'GE 1', 'GE 4', 'GE 5', 'PATHFIT 1', 'NSTP 1'], '2nd Sem' => ['COMP 103', 'IT 102', 'GE 2', 'GE 3', 'GE 6', 'PATHFIT 2', 'NSTP 2']],
        2 => ['1st Sem' => ['COMP 104', 'IT 103', 'IT 105', 'GE 7', 'PATHFIT 3'], '2nd Sem' => ['COMP 105', 'IT 104', 'IT 106', 'GE 8', 'PATHFIT 4']],
        3 => ['1st Sem' => ['IT 107', 'IT 108', 'COMP 106', 'GE 9'], '2nd Sem' => ['IT 109', 'IT 110', 'IT 111']],
        4 => ['1st Sem' => ['IT 112', 'CS 113'], '2nd Sem' => ['IT 113']],
    ],
    'BSCS' => [
        1 => ['1st Sem' => ['COMP 101', 'COMP 102', 'CS 101', 'GE 1', 'GE 4', 'PATHFIT 1', 'NSTP 1'], '2nd Sem' => ['COMP 103', 'CS 102', 'GE 2', 'GE 5', 'PATHFIT 2', 'NSTP 2']],
        2 => ['1st Sem' => ['COMP 104', 'CS 103', 'CS 110', 'GE 3', 'PATHFIT 3'], '2nd Sem' => ['COMP 105', 'CS 104', 'CS 109', 'GE 6', 'PATHFIT 4']],
        3 => ['1st Sem' => ['CS 105', 'CS 106', 'CS 107', 'CS 111', 'GE 7'], '2nd Sem' => ['CS 108', 'CS 112', 'COMP 106', 'GE 8']],
        4 => ['1st Sem' => ['CS 113', 'CS 114', 'GE 9'], '2nd Sem' => ['CS 115']],
    ],
    'BSTM' => [
        1 => ['1st Sem' => ['THC 101', 'THC 104', 'GE 1', 'GE 4', 'GE 5', 'PATHFIT 1', 'NSTP 1'], '2nd Sem' => ['THC 102', 'THC 105', 'TPC 101', 'GE 2', 'PATHFIT 2', 'NSTP 2']],
        2 => ['1st Sem' => ['THC 103', 'TPC 102', 'TPC 103', 'GE 3', 'PATHFIT 3'], '2nd Sem' => ['THC 106', 'TPC 104', 'TPC 106', 'GE 6', 'PATHFIT 4']],
        3 => ['1st Sem' => ['THC 107', 'TPC 105', 'TPC 107', 'GE 7'], '2nd Sem' => ['THC 108', 'TPC 108', 'GE 8']],
        4 => ['1st Sem' => ['TPC 109', 'GE 9'], '2nd Sem' => ['THC 109']],
    ],
    'HRS' => [
        1 => ['1st Sem' => ['HRS 101', 'GE 1', 'GE 4', 'GE 5', 'PATHFIT 1', 'NSTP 1'], '2nd Sem' => ['HRS 102', 'HRS 103', 'GE 2', 'PATHFIT 2', 'NSTP 2']],
        2 => ['1st Sem' => ['HRS 104', 'HRS 105', 'GE 3', 'PATHFIT 3'], '2nd Sem' => ['HRS 106', 'GE 6', 'PATHFIT 4']],
    ],
];
// SHS: core subjects for every strand, plus each strand's own
$SHS_CORE = [
    11 => ['1st Term' => ['SHS 101', 'SHS 102', 'SHS 106'], '2nd Term' => ['SHS 103', 'SHS 104', 'SHS 106'], '3rd Term' => ['SHS 105', 'SHS 106']],
    12 => ['1st Term' => ['SHS 105', 'SHS 106'], '2nd Term' => ['SHS 104', 'SHS 106'], '3rd Term' => ['SHS 103', 'SHS 106']],
];
$SHS_STRAND = [
    'HTCUA'    => [11 => ['1st Term' => ['HTCUA 101'], '2nd Term' => ['HTCUA 102'], '3rd Term' => ['HTCUA 103']], 12 => ['1st Term' => ['HTCUA 103', 'HTCUA 104'], '2nd Term' => ['HTCUA 104', 'HTCUA 102'], '3rd Term' => ['HTCUA 104']]],
    'HTTO'     => [11 => ['1st Term' => ['HTTO 101'], '2nd Term' => ['HTTO 102'], '3rd Term' => ['HTTO 103']], 12 => ['1st Term' => ['HTTO 103', 'HTTO 104'], '2nd Term' => ['HTTO 104', 'HTTO 102'], '3rd Term' => ['HTTO 104']]],
    'ICT-SCPT' => [11 => ['1st Term' => ['SCPT 101'], '2nd Term' => ['SCPT 102'], '3rd Term' => ['SCPT 103']], 12 => ['1st Term' => ['SCPT 103', 'SCPT 104'], '2nd Term' => ['SCPT 104', 'SCPT 102'], '3rd Term' => ['SCPT 104']]],
    'B&E'      => [11 => ['1st Term' => ['BE 101'], '2nd Term' => ['BE 102'], '3rd Term' => ['BE 104']], 12 => ['1st Term' => ['BE 103', 'BE 105'], '2nd Term' => ['BE 106'], '3rd Term' => ['BE 107']]],
];
foreach ($SHS_STRAND as $strand => $years) {
    foreach ($years as $grade => $terms) {
        foreach ($terms as $term => $codes) $CURRICULUM[$strand][$grade][$term] = array_merge($SHS_CORE[$grade][$term], $codes);
    }
}
$PROGRAM_LEVEL = ['BSIT' => 'tertiary', 'BSCS' => 'tertiary', 'BSTM' => 'tertiary', 'HRS' => 'tertiary',
    'HTCUA' => 'shs', 'HTTO' => 'shs', 'ICT-SCPT' => 'shs', 'B&E' => 'shs', 'ASSH' => 'shs'];
// Sections per program and year; each regular term of the level has the same sections
$SECTION_COUNTS = ['BSIT' => [1 => 3, 2 => 3, 3 => 3, 4 => 3], 'BSCS' => [1 => 3, 2 => 3, 3 => 3, 4 => 3], 'BSTM' => [1 => 3, 2 => 3, 3 => 3, 4 => 3], 'HRS' => [1 => 3, 2 => 3],
    'HTCUA' => [11 => 3, 12 => 3], 'HTTO' => [11 => 3, 12 => 3], 'ICT-SCPT' => [11 => 3, 12 => 3], 'B&E' => [11 => 3, 12 => 3]];
const SECTION_STUDENTS = 30;
$ROOMS = [];
// Floors 1-3: the app's room form and server accept floors 1 to 3 only
foreach ([1, 2, 3] as $floor) for ($n = 1; $n <= 6; $n++) $ROOMS[] = [sprintf('LR-%d%02d', $floor, $n), 'Lecture', 45, $floor];
for ($n = 1; $n <= 6; $n++) $ROOMS[] = [sprintf('CL-1%02d', $n), 'CompLab', 40, 1];
$ROOMS[] = ['Kitchen Lab 1', 'Special', 35, 1];
$ROOMS[] = ['Kitchen Lab 2', 'Special', 35, 1];
$ROOMS[] = ['Tourism Lab 1', 'Special', 40, 2];
$ROOMS[] = ['Tourism Lab 2', 'Special', 40, 2];

function sectionCode(string $program, int $year, int $i): string {
    $prefix = str_starts_with($program, 'BS') ? substr($program, 2) : preg_replace('/[^A-Za-z0-9-]/', '', $program);
    return $year >= 11 ? "{$prefix}{$year}-" . chr(65 + $i) : "{$prefix}{$year}0" . ($i + 1) . 'M';
}
$sections = [];   // [program, year, code, name, students, shift]
foreach ($SECTION_COUNTS as $program => $years) {
    foreach ($years as $year => $count) {
        for ($i = 0; $i < $count; $i++) {
            $students = SECTION_STUDENTS;
            $shift = $year >= 11 ? ($year === 12 || $i === 1 ? 'PM' : 'AM') : ['AM', 'PM', 'MIDSHIFT'][$i % 3];
            $label = $year >= 11 ? "{$program} {$year}" . chr(65 + $i) : "{$program} {$year}" . chr(65 + $i);
            $sections[] = [$program, $year, sectionCode($program, $year, $i), $label, $students, $shift];
        }
    }
}

/* ───────────── Teachers: what the terms need against who can teach ───────────── */
// Weekly units each subject area needs, per level, for each term (SHS subjects count 1 unit per teaching hour)
$need = [];
foreach ($sections as [$program, $year]) {
    $level = $PROGRAM_LEVEL[$program];
    foreach ($CURRICULUM[$program][$year] as $term => $codes) {
        foreach ($codes as $code) {
            $h = subjectHours($code);
            $need[$level][$term][$catalogByCode[$code]['area']] = ($need[$level][$term][$catalogByCode[$code]['area']] ?? 0) + ($level === 'shs' ? $h[2] + $h[3] : $h[0]);
        }
    }
}
// A teacher's load adds up across terms running at the same time, so the busiest overlap counts:
// College 1st Sem runs with SHS 1st and 2nd Term, College 2nd Sem with SHS 2nd and 3rd Term
$windows = ['College 1st Sem with SHS 1st or 2nd Term' => ['1st Sem', ['1st Term', '2nd Term']], 'College 2nd Sem with SHS 2nd or 3rd Term' => ['2nd Sem', ['2nd Term', '3rd Term']]];
$demand = [];   // [area][level] = busiest units
foreach ($windows as [$collegeTerm, $shsTerms]) {
    foreach ($AREAS as $area) {
        $demand[$area]['tertiary'] = max($demand[$area]['tertiary'] ?? 0, $need['tertiary'][$collegeTerm][$area] ?? 0);
        $demand[$area]['shs'] = max($demand[$area]['shs'] ?? 0, max(array_map(fn($t) => $need['shs'][$t][$area] ?? 0, $shsTerms)));
    }
}
// A mixed teacher can take both levels, so per area what counts is College plus the busiest SHS term beside it
$combined = [];   // [area] = busiest units of both levels together
foreach ($windows as [$collegeTerm, $shsTerms]) {
    foreach ($AREAS as $area) {
        $both = ($need['tertiary'][$collegeTerm][$area] ?? 0) + max(array_map(fn($t) => $need['shs'][$t][$area] ?? 0, $shsTerms));
        $combined[$area] = max($combined[$area] ?? 0, $both);
    }
}
// Sample teaching records (no login) made by an earlier reset with --add-teachers are replaced by a fresh set
$SAMPLE_RECORD = "u.email LIKE 'sample.%@sti.edu' AND u.password_hash = '!'";
$oldSamples = (int)$db->query("SELECT COUNT(*) FROM users u WHERE {$SAMPLE_RECORD}")->fetchColumn();
// With --add-only the earlier sample records stay and count as teachers; otherwise they are replaced
$replaceSamples = $addTeachers && !$addOnly && $oldSamples > 0;
if ($addOnly) $oldSamples = 0;
$teachers = $db->query("
    SELECT u.user_id, u.email, u.max_load, u.teaching_level, GROUP_CONCAT(c.areas_json SEPARATOR '|') AS areas
    FROM users u LEFT JOIN faculty_certificates fc ON fc.user_id = u.user_id LEFT JOIN fcc_certificates c ON c.cert_id = fc.cert_id
    WHERE u.role IN ('faculty', 'program-head')" . ($replaceSamples ? " AND NOT ({$SAMPLE_RECORD})" : '') . " GROUP BY u.user_id")->fetchAll();
$teacherAreas = function (array $t): array {
    $areas = [];
    foreach (explode('|', (string)$t['areas']) as $json) foreach (json_decode($json, true) ?: [] as $a) $areas[$a] = true;
    return array_keys($areas);
};
// Hand each teacher's units to the areas and levels they can teach (one-level teachers first). The generator
// can't pack loads perfectly, so a teacher counts for 90% of their max load: with 3 sections of 30 everywhere
// that gave the fewest teachers (37) whose days stayed healthy (no day over 8 hours, longest 7.5); one fewer
// still placed every class but left some 9-hour days.
const LOAD_PACKING = 0.9;
// Demo teachers carry a regular full-time load (the app's default maximum, about 6 teaching hours a day)
const SAMPLE_MAX_LOAD = 30;
function shortages(array $teachers, array $demand, callable $teacherAreas): array {
    $left = $demand;
    usort($teachers, fn($a, $b) => (($a['teaching_level'] ?: 'tertiary') === 'mixed') <=> (($b['teaching_level'] ?: 'tertiary') === 'mixed'));
    foreach ($teachers as $t) {
        $capacity = LOAD_PACKING * (int)$t['max_load'];
        $levels = ($t['teaching_level'] ?: 'tertiary') === 'mixed' ? ['tertiary', 'shs'] : [$t['teaching_level'] ?: 'tertiary'];
        foreach ($teacherAreas($t) as $area) {
            foreach ($levels as $level) {
                $take = min($capacity, $left[$area][$level] ?? 0);
                $left[$area][$level] = ($left[$area][$level] ?? 0) - $take;
                $capacity -= $take;
            }
        }
    }
    return $left;
}
$left = shortages($teachers, $demand, $teacherAreas);
$sampleTeachers = [];
// Old sample records are replaced, so only a real account's email counts as taken
$emailTaken = $db->prepare("SELECT COUNT(*) FROM users u WHERE u.email = ?" . ($replaceSamples ? " AND NOT ({$SAMPLE_RECORD})" : ''));
$slug =fn(string $area) => trim(preg_replace('/[^a-z]+/', '-', strtolower(explode(' ', $area)[0])), '-');
// As few new teachers as cover the shortfall: Mixed (College and SHS) wherever the area has both levels' classes
foreach ($AREAS as $area) {
    $shortCollege = max(0, $left[$area]['tertiary'] ?? 0);
    $shortShs = max(0, $left[$area]['shs'] ?? 0);
    if ($shortCollege + $shortShs <= 0.001) continue;
    $level = $shortCollege > 0.001 && $shortShs > 0.001 ? 'mixed' : ($shortShs > 0.001 ? 'shs' : 'tertiary');
    // Both levels together peak lower than each level's own peak added up, since the peaks fall in different terms
    $coveredByOthers = ($demand[$area]['tertiary'] ?? 0) + ($demand[$area]['shs'] ?? 0) - $shortCollege - $shortShs;
    $short = $level === 'mixed' ? max(0, ($combined[$area] ?? 0) - $coveredByOthers) : $shortCollege + $shortShs;
    $wanted = (int)ceil($short / (LOAD_PACKING * SAMPLE_MAX_LOAD));
    $prefix = $level === 'mixed' ? '' : ($level === 'shs' ? 'SHS ' : 'College ');
    // A number an account already uses is skipped, so the shortfall is really added
    for ($n = 1; $wanted > 0; $n++) {
        $email = "sample.{$slug($area)}." . ($level === 'mixed' ? 'mixed' : ($level === 'shs' ? 'shs' : 'college')) . ".{$n}@sti.edu";
        $emailTaken->execute([$email]);
        if ((int)$emailTaken->fetchColumn() > 0) continue;
        $sampleTeachers[] = ['first' => 'Sample', 'last' => "{$prefix}{$area} Teacher {$n}", 'area' => $area, 'level' => $level, 'email' => $email];
        $wanted--;
    }
}

/* ───────────── Report ───────────── */
$tables = ['schedules', 'schedule_snapshots', 'academic_sections', 'term_subjects', 'school_terms', 'school_years', 'subject_sets', 'subject_catalog', 'classrooms', 'faculty_qualifications', 'activity_log'];
echo $addOnly ? "ADD ONLY: nothing is deleted. Keeps everything below and adds only what is missing:\n" : "WILL DELETE (a backup is saved first):\n";
foreach ($tables as $t) printf("  %-22s %6d rows\n", $t, $db->query("SELECT COUNT(*) FROM `{$t}`")->fetchColumn());
echo "\nKEEPS: " . $db->query("SELECT COUNT(*) FROM users")->fetchColumn() . " user accounts (logins and passwords unchanged), "
    . $db->query("SELECT COUNT(*) FROM fcc_certificates")->fetchColumn() . " FCC certificates and who holds them, departments, app settings.\n";
$termCount = count($TERMS['tertiary']) + count($TERMS['shs']);
$subjectRows = 0;
foreach ($CURRICULUM as $years) foreach ($years as $terms) foreach ($terms as $codes) $subjectRows += count($codes);
$collegeSecs = count(array_filter($sections, fn($s) => $PROGRAM_LEVEL[$s[0]] === 'tertiary'));
$shsSecs = count($sections) - $collegeSecs;
echo "\nWILL ADD: {$YEAR_CODE} (active) with {$termCount} terms (College 1st Sem, 2nd Sem, Summer; SHS 1st, 2nd, 3rd Term, Summer),\n"
    . "  {$collegeSecs} College and {$shsSecs} SHS sections in each regular term, {$subjectRows} curriculum entries, " . count($CATALOG) . " catalog subjects, "
    . count($ROOMS) . ' rooms (' . implode(', ', array_map(fn($type, $n) => "{$n} {$type}", array_keys(array_count_values(array_column($ROOMS, 1))), array_count_values(array_column($ROOMS, 1)))) . ").\n"
    . "  Active term: College 1st Sem (SHS 1st Term runs alongside it). Timetables are empty, ready to generate in Step 7.\n";
echo "\nTEACHERS: weekly units needed at the busiest time against what the current faculty can teach\n";
printf("  %-30s %-9s %8s %10s\n", 'Subject area', 'Level', 'Needed', 'Short by');
$anyShort = false;
foreach ($AREAS as $area) {
    foreach (['tertiary' => 'College', 'shs' => 'SHS'] as $level => $label) {
        if (($demand[$area][$level] ?? 0) <= 0) continue;
        $short = max(0, $left[$area][$level] ?? 0);
        $anyShort = $anyShort || $short > 0.001;
        printf("  %-30s %-9s %8d %10s\n", $area, $label, $demand[$area][$level], $short > 0.001 ? (string)round($short) : '-');
    }
}
if ($anyShort) {
    echo $addTeachers
        ? "\n  --add-teachers: will " . ($oldSamples ? "replace the {$oldSamples} sample teaching records from an earlier run with " : 'add ') . count($sampleTeachers)
            . ' teaching records (no login, max ' . SAMPLE_MAX_LOAD . ' units, ' . count(array_filter($sampleTeachers, fn($t) => $t['level'] === 'mixed')) . " of them Mixed) holding the right certificate, to cover the shortfall.\n"
        : "\n  Some areas are short. Give more teachers the FCC certificate for those areas (Faculty Profiles), or run again\n  with --add-teachers to add teaching records (no login) that cover the shortfall.\n";
}

if (!$apply) {
    echo "\nDRY RUN: nothing was changed. Run again with --apply to reset.\n";
    exit(0);
}

$confirmWord = $addOnly ? 'ADD' : 'RESET';
echo $addOnly
    ? "\nThis adds the missing data to {$dbName} on {$host} and deletes nothing.\nType ADD to continue: "
    : "\nThis permanently replaces the scheduling data in {$dbName} on {$host}.\nClose every open tab of the app first. Type RESET to continue: ";
if (trim((string)fgets(STDIN)) !== $confirmWord) {
    echo "Cancelled. Nothing was changed.\n";
    exit(0);
}

/* ───────────── Backup ───────────── */
$backupDir = __DIR__ . '/backups';
if (!is_dir($backupDir)) mkdir($backupDir, 0700, true);
$backup = ['database' => $dbName, 'host' => $host, 'saved_at' => date('c'), 'tables' => []];
foreach (array_merge($tables, ['fcc_certificates', 'faculty_certificates', 'departments', 'app_settings']) as $t) {
    $backup['tables'][$t] = $db->query("SELECT * FROM `{$t}`")->fetchAll();
}
// The sample teaching records this run replaces (they have no password)
if ($addTeachers) $backup['tables']['users (sample teaching records)'] = $db->query("SELECT * FROM users u WHERE {$SAMPLE_RECORD}")->fetchAll();
$backupFile = "{$backupDir}/backup_" . date('Ymd_His') . '.json';
if (file_put_contents($backupFile, json_encode($backup, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) === false) {
    fwrite(STDERR, "Could not write the backup, so nothing was changed.\n");
    exit(1);
}
echo "Backup saved: {$backupFile}\n";

/* ───────────── Reset, in one transaction ───────────── */
$db->beginTransaction();
try {
    if (!$addOnly) foreach ($tables as $t) $db->exec("DELETE FROM `{$t}`");
    // With --add-only, a row that is already there is kept and not added again
    $exists = function (string $sql, array $params) use ($db, $addOnly): bool {
        if (!$addOnly) return false;
        $q = $db->prepare($sql);
        $q->execute($params);
        return (bool)$q->fetchColumn();
    };
    $added = ['rooms' => 0, 'terms' => 0, 'curriculum entries' => 0, 'subject sets' => 0, 'sections' => 0];

    $insDept = $db->prepare("INSERT IGNORE INTO departments (department_name) VALUES (?)");
    $insCert = $db->prepare("INSERT IGNORE INTO fcc_certificates (cert_name, areas_json) VALUES (?, ?)");
    $findCert = $db->prepare("SELECT cert_id FROM fcc_certificates WHERE cert_name = ?");
    $certOf = [];
    foreach ($AREAS as $area) {
        $insDept->execute([$area]);
        $insCert->execute(["FCC - {$area}", json_encode([$area])]);
        $findCert->execute(["FCC - {$area}"]);
        $certOf[$area] = (int)$findCert->fetchColumn();
    }
    $insCat = $db->prepare("INSERT IGNORE INTO subject_catalog (subject_code, subject_title, department, it_only, units, level) VALUES (?, ?, ?, 0, ?, ?)");
    foreach ($CATALOG as [$code, $title, $area, $units]) $insCat->execute([$code, $title, $area, $units, $catalogLevel($code)]);

    $insRoom = $db->prepare("INSERT INTO classrooms (room_name_number, room_type, capacity, floor_level, current_status) VALUES (?, ?, ?, ?, 'Vacant')");
    foreach ($ROOMS as $r) {
        if ($exists("SELECT COUNT(*) FROM classrooms WHERE room_name_number = ?", [$r[0]])) continue;
        $insRoom->execute($r);
        $added['rooms']++;
    }

    $yearId = 0;
    if ($addOnly) {
        $findYear = $db->prepare("SELECT year_id FROM school_years WHERE year_code = ?");
        $findYear->execute([$YEAR_CODE]);
        $yearId = (int)$findYear->fetchColumn();
    }
    if (!$yearId) {
        // A new year added beside existing ones does not take over as the active year
        $db->prepare("INSERT INTO school_years (year_code, is_active) VALUES (?, ?)")->execute([$YEAR_CODE, $addOnly ? 0 : 1]);
        $yearId = (int)$db->lastInsertId();
    }
    $findTerm = $db->prepare("SELECT term_id FROM school_terms WHERE year_id = ? AND term_name = ? AND level = ?");
    $insTerm = $db->prepare("INSERT INTO school_terms (year_id, term_name, level, start_date, end_date, status, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)");
    $insSection = $db->prepare("INSERT INTO academic_sections (term_id, section_code, section_name, program, year_level, student_count, adviser, shift) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)");
    $insSubject = $db->prepare("INSERT INTO term_subjects (term_id, subject_code, subject_name, units, lab_units, lecture_hours, lab_hours, subject_type, program, year_level, curriculum, is_included) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)");
    $insSet = $db->prepare("INSERT INTO subject_sets (set_name, items_json) VALUES (?, ?)");
    foreach ($TERMS as $level => $list) {
        foreach ($list as [$termName, $start, $end]) {
            $first = $termName === '1st Sem' || $termName === '1st Term';
            $findTerm->execute([$yearId, $termName, $level]);
            $termId = $addOnly ? (int)$findTerm->fetchColumn() : 0;
            if (!$termId) {
                $insTerm->execute([$yearId, $termName, $level, $start, $end, $first ? 'active' : 'draft', $termName === '1st Sem' && !$addOnly ? 1 : 0]);
                $termId = (int)$db->lastInsertId();
                $added['terms']++;
            }
            foreach ($CURRICULUM as $program => $years) {
                if ($PROGRAM_LEVEL[$program] !== $level) continue;
                foreach ($years as $year => $terms) {
                    if (empty($terms[$termName])) continue;
                    $items = [];
                    foreach ($terms[$termName] as $code) {
                        [$units, $labUnits, $lec, $lab, $type] = subjectHours($code);
                        if (!$exists("SELECT COUNT(*) FROM term_subjects WHERE term_id = ? AND program = ? AND year_level = ? AND subject_code = ?", [$termId, $program, $year, $code])) {
                            $insSubject->execute([$termId, $code, $catalogByCode[$code]['title'], $units, $labUnits ?: null, $lec, $lab, $type, $program, $year, $level === 'shs' ? 'K to 12' : '2024 Revised']);
                            $added['curriculum entries']++;
                        }
                        $items[] = ['code' => $code, 'name' => $catalogByCode[$code]['title'], 'units' => $units, 'labUnits' => $labUnits ?: null, 'lecHours' => $lec, 'labHours' => $lab, 'type' => $type, 'program' => $program, 'year' => $year];
                    }
                    $setName = mb_substr("{$program} " . ($year >= 11 ? "Grade {$year}" : "Year {$year}") . " · {$termName}", 0, 60);
                    if ($termName !== 'Summer' && !$exists("SELECT COUNT(*) FROM subject_sets WHERE set_name = ?", [$setName])) {
                        $insSet->execute([$setName, json_encode($items)]);
                        $added['subject sets']++;
                    }
                    foreach ($sections as [$sp, $sy, $code, $name, $students, $shift]) {
                        if ($sp !== $program || $sy !== $year) continue;
                        if ($exists("SELECT COUNT(*) FROM academic_sections WHERE term_id = ? AND section_code = ?", [$termId, $code])) continue;
                        $insSection->execute([$termId, $code, $name, $program, $year, $students, $shift]);
                        $added['sections']++;
                    }
                }
            }
        }
    }

    if ($replaceSamples) {
        $db->exec("DELETE fc FROM faculty_certificates fc JOIN users u ON u.user_id = fc.user_id WHERE {$SAMPLE_RECORD}");
        $db->exec("DELETE u FROM users u WHERE {$SAMPLE_RECORD}");
    }
    if ($addTeachers && $sampleTeachers) {
        $insUser = $db->prepare("INSERT IGNORE INTO users (first_name, last_name, email, password_hash, role, subject_role, employment_status, max_load, min_load, teaching_level)
            VALUES (?, ?, ?, '!', 'faculty', ?, 'Full-time', ?, 24, ?)");
        $findUser = $db->prepare("SELECT user_id FROM users WHERE email = ?");
        $giveCert = $db->prepare("INSERT IGNORE INTO faculty_certificates (user_id, cert_id) VALUES (?, ?)");
        foreach ($sampleTeachers as $t) {
            $insUser->execute([$t['first'], mb_substr($t['last'], 0, 50), $t['email'], $t['area'], SAMPLE_MAX_LOAD, $t['level']]);
            $findUser->execute([$t['email']]);
            $giveCert->execute([(int)$findUser->fetchColumn(), $certOf[$t['area']]]);
        }
    }

    // Keeps a browser's old local copy from being published over this data
    $db->exec("REPLACE INTO app_settings (setting_key, setting_value) VALUES ('state_published', '1')");
    $db->prepare("INSERT INTO activity_log (user_email, user_name, user_role, category, summary) VALUES ('system', 'Database reset', 'admin', 'Schedule', ?)")
        ->execute([($addOnly ? "Added the missing {$YEAR_CODE} scheduling data for College and SHS" : "Reset the scheduling data to a fresh {$YEAR_CODE} for College and SHS") . ($addTeachers && $sampleTeachers ? ' (added ' . count($sampleTeachers) . ' teaching records)' : '')]);
    $db->commit();
} catch (Throwable $e) {
    $db->rollBack();
    fwrite(STDERR, "The reset failed and was rolled back, so nothing was changed: {$e->getMessage()}\n");
    exit(1);
}
if ($addOnly) {
    echo "\nADDED (nothing was deleted): " . implode(', ', array_map(fn($what, $n) => "{$n} {$what}", array_keys($added), $added))
        . ($addTeachers ? ', ' . count($sampleTeachers) . ' teaching records' : '') . ".\n";
}
echo "\nDONE: the database now holds " . ($addOnly ? "a complete {$YEAR_CODE}" : "a fresh {$YEAR_CODE}") . ". Everyone should reload the app.\n"
    . "Next, in Master Schedule: check Step 5 (Rooms & Instructors), Step 6 (Validate Resources), then Generate in Step 7\n"
    . "for College 1st Sem and for SHS 1st Term.\n";
