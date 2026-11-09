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

const VALID_PROGRAMS = ['BSIT', 'BSCS', 'BSCpE', 'BSHM', 'BSTM', 'BSBA'];
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

function sanitize(string $str): string {
    return htmlspecialchars($str, ENT_QUOTES, 'UTF-8');
}

function jsonResponse(array $data, int $code = 200): never {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function formatTime(string $time): string {
    return date('g:i A', strtotime($time));
}

function getStatusBadgeClass(string $status): string {
    switch (strtolower($status)) {
        case 'vacant':
        case 'approved':
            return 'badge-success';
        case 'occupied':
        case 'declined':
            return 'badge-danger';
        case 'reserved':
        case 'pending':
            return 'badge-warning';
        default:
            return 'badge-info';
    }
}
