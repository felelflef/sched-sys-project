<?php
// Ensure session is started
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

/**
 * Validates that this session is the single active instance registered in MySQL.
 * If another instance (e.g. phone or another browser) logged in, the active token
 * in the database will no longer match this session's token.
 */
function validateActiveSession(): bool {
    if (!isset($_SESSION['user_id'])) {
        return false;
    }

    // If session_token is not set in PHP session, it cannot be validated
    if (empty($_SESSION['session_token'])) {
        return true;
    }

    try {
        require_once __DIR__ . '/../config/db.php';
        $db = getDB();
        $stmt = $db->prepare("SELECT active_session_token FROM users WHERE user_id = ? LIMIT 1");
        $stmt->execute([$_SESSION['user_id']]);
        $row = $stmt->fetch();

        // If a token is recorded in DB and does not match this session, it was superseded
        if ($row && !empty($row['active_session_token'])) {
            if (!hash_equals($row['active_session_token'], $_SESSION['session_token'])) {
                // Invalidate this superseded session
                $_SESSION = [];
                if (session_status() === PHP_SESSION_ACTIVE) {
                    session_destroy();
                }
                return false;
            }
        }
    } catch (\Throwable $e) {
        // If DB is temporarily unreachable, fallback to keeping session intact
    }

    return true;
}

const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_IP_ATTEMPT_LIMIT = 30;
const LOGIN_ATTEMPT_WINDOW = 900; // 15 minutes

/** The address added by the hosting proxy; earlier forwarded entries can be faked by the client. */
function clientIp(): string {
    $forwarded = array_map('trim', explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''));
    return end($forwarded) ?: ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

/** Returns the seconds left in a lockout, or 0 if attempts are allowed. */
function attemptLockSeconds(PDO $db, string $key, int $limit): int {
    $stmt = $db->prepare("SELECT attempts, window_start FROM login_attempts WHERE attempt_key = ?");
    $stmt->execute([$key]);
    $row = $stmt->fetch();
    if (!$row || (int)$row['attempts'] < $limit) {
        return 0;
    }
    return max(0, (int)$row['window_start'] + LOGIN_ATTEMPT_WINDOW - time());
}

function recordFailedAttempt(PDO $db, string $key): void {
    $now = time();
    $expired = $now - LOGIN_ATTEMPT_WINDOW;
    $stmt = $db->prepare("
        INSERT INTO login_attempts (attempt_key, attempts, window_start) VALUES (?, 1, ?)
        ON DUPLICATE KEY UPDATE
            attempts = IF(window_start < ?, 1, attempts + 1),
            window_start = IF(window_start < ?, ?, window_start)
    ");
    $stmt->execute([$key, $now, $expired, $expired, $now]);
}

function clearFailedAttempts(PDO $db, string $key): void {
    $db->prepare("DELETE FROM login_attempts WHERE attempt_key = ? OR window_start < ?")->execute([$key, time() - LOGIN_ATTEMPT_WINDOW]);
}

function requireLogin() {
    $isApi = str_contains($_SERVER['REQUEST_URI'] ?? '', '/api/') || 
             (isset($_SERVER['HTTP_ACCEPT']) && str_contains($_SERVER['HTTP_ACCEPT'], 'application/json'));

    if (!isset($_SESSION['user_id'])) {
        if ($isApi) {
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'code' => 'AUTH_REQUIRED', 'message' => 'Authentication required']);
            exit;
        }
        header('Location: /sti_scheduling_dashboard.html');
        exit;
    }

    // Verify single active instance
    if (!validateActiveSession()) {
        if ($isApi) {
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode([
                'success' => false,
                'code' => 'SESSION_SUPERSEDED',
                'message' => 'Your account was logged in from another device/instance (e.g. phone). You have been logged out.'
            ]);
            exit;
        }
        header('Location: /sti_scheduling_dashboard.html?superseded=1');
        exit;
    }
}

function requireRole(string $role) {
    requireLogin();
    if (!isset($_SESSION['role']) || $_SESSION['role'] !== $role) {
        $isApi = str_contains($_SERVER['REQUEST_URI'] ?? '', '/api/') || 
                 (isset($_SERVER['HTTP_ACCEPT']) && str_contains($_SERVER['HTTP_ACCEPT'], 'application/json'));
        if ($isApi) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'message' => 'Forbidden: You do not have permission to perform this action']);
            exit;
        }
        http_response_code(403);
        die('Forbidden: You do not have permission to access this page.');
    }
}

function requireAnyRole(array $roles) {
    requireLogin();
    if (!in_array($_SESSION['role'] ?? '', $roles, true)) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'code' => 'FORBIDDEN', 'message' => 'Forbidden: You do not have permission to perform this action']);
        exit;
    }
}

function currentUser(): ?array {
    if (isset($_SESSION['user_id'])) {
        return [
            'user_id' => $_SESSION['user_id'],
            'role' => $_SESSION['role'],
            'first_name' => $_SESSION['first_name'],
            'last_name' => $_SESSION['last_name'],
            'email' => $_SESSION['email']
        ];
    }
    return null;
}

function isLoggedIn(): bool {
    return isset($_SESSION['user_id']) && validateActiveSession();
}

function isAdmin(): bool {
    return isLoggedIn() && isset($_SESSION['role']) && $_SESSION['role'] === 'admin';
}
