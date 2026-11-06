<?php
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
