<?php
// Any unexpected failure still returns JSON the app can show, with details kept in the log
set_exception_handler(function (Throwable $e): void {
    error_log('Unhandled error: ' . $e->getMessage());
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json');
    }
    echo json_encode(['success' => false, 'message' => 'A server error occurred. Please check your entry and try again.']);
});

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
