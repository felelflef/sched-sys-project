<?php
// Any unexpected failure still returns JSON the app can show, with details kept in the log
set_exception_handler(function (Throwable $e): void {
    error_log('Unhandled error: ' . $e->getMessage());
    // A wrong value type, such as a list where text belongs, is bad input rather than a server fault
    $badInput = $e instanceof TypeError;
    if (!headers_sent()) {
        http_response_code($badInput ? 400 : 500);
        header('Content-Type: application/json');
    }
    echo json_encode(['success' => false, 'message' => $badInput ? 'One of the values entered is not valid.' : 'A server error occurred. Please check your entry and try again.']);
});

require_once __DIR__ . '/activity.php';

// STI's programs. College programs use Years 1-4 (HRS is a 2-year program); SHS strands use Grades 11-12.
const TERTIARY_PROGRAMS = ['BSCS', 'BSIT', 'BSTM', 'HRS', 'TEM'];
const SHS_STRANDS = ['IT-MAWD', 'CUART', 'TOPER'];
const VALID_PROGRAMS = [...TERTIARY_PROGRAMS, ...SHS_STRANDS];
// Programs shorter than their level's usual years
const PROGRAM_YEARS = ['HRS' => [1, 2]];
const SCHOOL_LEVELS = ['tertiary', 'shs'];
const TEACHING_LEVELS = ['tertiary', 'shs', 'mixed'];
const SCHOOL_DAY_START = '07:00:00';
const SCHOOL_DAY_END = '20:30:00';
const SHIFT_WINDOWS = [
    'AM' => ['07:00:00', '13:00:00'],
    'MIDSHIFT' => ['10:00:00', '16:00:00'],
    'PM' => ['13:00:00', '20:30:00'],
];

function rejectInput(string $message): void {
    jsonResponse(['success' => false, 'message' => $message], 400);
}

/** Letters (including accents), spaces and . ' - only, so titles like "Prof." still pass. */
function requireValidName(string $label, string $value): void {
    if (!preg_match("/^\p{L}[\p{L}\p{M} .'\-]*$/u", $value)) {
        rejectInput("{$label} can only contain letters, spaces, periods, apostrophes and hyphens.");
    }
}

function requireValidCode(string $label, string $value): void {
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9 \-]*$/', $value)) {
        rejectInput("{$label} can only contain letters, numbers, spaces and hyphens.");
    }
}

/** For titles and labels, which may use ordinary punctuation but must contain a letter. */
function requireValidText(string $label, string $value): void {
    if (!preg_match("/^[\p{L}\p{N}][\p{L}\p{M}\p{N} .,:;&\/()'+#\-]*$/u", $value) || !preg_match('/\p{L}/u', $value)) {
        rejectInput("{$label} must contain a letter and only ordinary punctuation.");
    }
}

function requireIntInRange(string $label, $value, int $min, int $max): int {
    $number = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => $min, 'max_range' => $max]]);
    if ($number === false) {
        rejectInput("{$label} must be a whole number from {$min} to {$max}.");
    }
    return $number;
}

function requireValidHours(string $label, $value): float {
    if (!is_numeric($value) || $value < 0 || $value > 6 || fmod((float)$value * 2, 1) != 0) {
        rejectInput("{$label} must be from 0 to 6, in steps of 0.5.");
    }
    return (float)$value;
}

function requireValidProgram($program): void {
    if (!in_array($program, VALID_PROGRAMS, true)) {
        rejectInput('Please choose a valid program.');
    }
}

/** Year 1-4 for college, Grade 11-12 for Senior High School. */
function requireValidYearLevel($value): int {
    $year = filter_var($value, FILTER_VALIDATE_INT);
    if ($year === false || !in_array($year, [1, 2, 3, 4, 11, 12], true)) {
        rejectInput('Year level must be Year 1 to 4, or Grade 11 or 12.');
    }
    return $year;
}

/** A term's own name, such as "1st Sem" or "3rd Term". */
function requireValidTermName($name): string {
    $name = preg_replace('/\s+/', ' ', trim((string)$name));
    if ($name === '' || mb_strlen($name) > 30 || !preg_match('/^[\p{L}\p{N}][\p{L}\p{N} .\'\-]*$/u', $name)) {
        rejectInput('Term name must be 1 to 30 letters, numbers, spaces, periods, apostrophes or hyphens.');
    }
    return $name;
}

function requireValidSchoolYear(string $code): void {
    if (!preg_match('/^AY (20\d{2})-(20\d{2})$/', $code, $m) || (int)$m[2] !== (int)$m[1] + 1) {
        rejectInput('School year must look like AY 2026-2027, and the second year must follow the first.');
    }
}

/** Times must be HH:MM:SS, in order, and inside the school day. */
function isValidClassTime(string $start, string $end): bool {
    $format = '/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/';
    return preg_match($format, $start) && preg_match($format, $end) && $start < $end
        && $start >= SCHOOL_DAY_START && $end <= SCHOOL_DAY_END;
}

/** An empty department list means the shared data isn't set up yet, so there is nothing to check against. */
function requireKnownDepartment(PDO $db, string $department, array $alsoAllowed = []): void {
    if (in_array($department, $alsoAllowed, true)) {
        return;
    }
    try {
        $total = (int)$db->query("SELECT COUNT(*) FROM departments")->fetchColumn();
        $find = $db->prepare("SELECT COUNT(*) FROM departments WHERE department_name = ?");
        $find->execute([$department]);
    } catch (PDOException $e) {
        return;
    }
    if ($total > 0 && !(int)$find->fetchColumn()) {
        rejectInput('Please choose a department from the list.');
    }
}

/** Stops the request with a clear message if a field is too long for its column. */
function requireFieldLengths(array $fields): void {
    foreach ($fields as $label => [$value, $max]) {
        if (mb_strlen((string)$value) > $max) {
            jsonResponse(['success' => false, 'message' => "{$label} must be {$max} characters or fewer."], 400);
        }
    }
}

function isValidDate($date): bool {
    if (!is_string($date)) {
        return false;
    }
    $parsed = DateTime::createFromFormat('Y-m-d', $date);
    return $parsed !== false && $parsed->format('Y-m-d') === $date;
}

/** Returns an error message, or null if the new password is acceptable. */
function passwordProblem(string $password): ?string {
    if (strlen($password) < 8) {
        return 'Password must be at least 8 characters.';
    }
    if (strlen($password) > 72) {
        return 'Password must be 72 characters or fewer.';
    }
    if (strcasecmp($password, 'password') === 0) {
        return 'Please choose a less common password.';
    }
    if (!preg_match('/[A-Za-z]/', $password) || !preg_match('/\d/', $password)) {
        return 'Password must include at least one letter and one number.';
    }
    return null;
}

function generateCSRF(): string {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function validateCSRF(): bool {
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['csrf_token'] ?? null);
    if (!$token) {
        $input = json_decode(file_get_contents('php://input'), true);
        $token = $input['csrf_token'] ?? null;
    }
    $expected = $_SESSION['csrf_token'] ?? '';
    return is_string($token) && $token !== '' && $expected !== '' && hash_equals($expected, $token);
}

function requireCSRF(): void {
    if (!validateCSRF()) {
        jsonResponse(['success' => false, 'code' => 'CSRF_INVALID', 'message' => 'Your session token is invalid. Please refresh the page and try again.'], 403);
    }
}

function jsonResponse(array $data, int $code = 200): never {
    // A change that succeeded goes into the activity log
    if ($code < 400 && !empty($data['success'])) {
        recordPendingActivity();
    }
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

/**
 * [user_id][SUBJECT CODE] => true for what each teacher may teach: every catalog subject in an area (department)
 * covered by one of their FCC certificates.
 * $override tests a change before it is saved:
 *   'userCerts' => [user_id => cert ids], 'certAreas' => [cert_id => areas, or null when deleted],
 *   'catalogArea' => [code => area, or null when removed]
 */
function loadQualifications(PDO $db, array $override = []): array {
    $map = [];
    try {
        $certAreas = [];
        foreach ($db->query("SELECT cert_id, areas_json FROM fcc_certificates")->fetchAll() as $cert) {
            $certAreas[(int)$cert['cert_id']] = json_decode((string)$cert['areas_json'], true) ?: [];
        }
        foreach ($override['certAreas'] ?? [] as $certId => $areas) {
            if ($areas === null) unset($certAreas[(int)$certId]);
            else $certAreas[(int)$certId] = $areas;
        }
        $userCerts = [];
        foreach ($db->query("SELECT user_id, cert_id FROM faculty_certificates")->fetchAll() as $row) {
            $userCerts[(int)$row['user_id']][] = (int)$row['cert_id'];
        }
        foreach ($override['userCerts'] ?? [] as $userId => $ids) {
            $userCerts[(int)$userId] = array_map('intval', $ids);
        }
        $areaOfCode = [];
        foreach ($db->query("SELECT UPPER(subject_code) AS code, department FROM subject_catalog")->fetchAll() as $subject) {
            $areaOfCode[$subject['code']] = $subject['department'];
        }
        foreach ($override['catalogArea'] ?? [] as $code => $area) {
            if ($area === null) unset($areaOfCode[strtoupper($code)]);
            else $areaOfCode[strtoupper($code)] = $area;
        }
        $codesByArea = [];
        foreach ($areaOfCode as $code => $area) {
            $codesByArea[$area][] = $code;
        }
        foreach ($userCerts as $userId => $ids) {
            foreach ($ids as $certId) {
                foreach ($certAreas[$certId] ?? [] as $area) {
                    foreach ($codesByArea[$area] ?? [] as $code) {
                        $map[$userId][$code] = true;
                    }
                }
            }
        }
    } catch (\Throwable $e) {
        // Before the certificate tables exist, no one is qualified yet
    }
    return $map;
}

/** 'shs' or 'tertiary', from the term itself. Terms saved before levels existed are college terms. */
function termSchoolLevel(PDO $db, int $termId): string {
    try {
        $find = $db->prepare("SELECT level FROM school_terms WHERE term_id = ?");
        $find->execute([$termId]);
        return $find->fetchColumn() === 'shs' ? 'shs' : 'tertiary';
    } catch (\Throwable $e) {
        return 'tertiary';
    }
}
