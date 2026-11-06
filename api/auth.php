<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // If user is currently flagged as logged in in PHP session, check if active token in DB is valid
    if (isset($_SESSION['user_id'])) {
        if (!validateActiveSession()) {
            jsonResponse([
                'success' => false,
                'logged_in' => false,
                'code' => 'SESSION_SUPERSEDED',
                'message' => 'Your account was logged in from another device/instance (e.g. phone). This session has been terminated.',
                'csrf_token' => generateCSRF()
            ]);
        }

        $user = currentUser();
        $initials = strtoupper(substr($user['first_name'] ?? '', 0, 1) . substr($user['last_name'] ?? '', 0, 1));
        if (empty($initials)) $initials = 'ST';
        jsonResponse([
            'success' => true,
            'logged_in' => true,
            'session_token' => $_SESSION['session_token'] ?? null,
            'user' => [
                'user_id' => $user['user_id'],
                'first_name' => $user['first_name'],
                'last_name' => $user['last_name'],
                'name' => trim($user['first_name'] . ' ' . $user['last_name']),
                'email' => $user['email'],
                'role' => $user['role'],
                'initials' => $initials
            ],
            'csrf_token' => generateCSRF()
        ]);
    } else {
        jsonResponse([
            'success' => true,
            'logged_in' => false,
            'csrf_token' => generateCSRF()
        ]);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        $input = $_POST;
    }

    $action = $input['action'] ?? 'login';

    if ($action === 'logout') {
        try {
            if (isset($_SESSION['user_id'])) {
                $db = getDB();
                $clearStmt = $db->prepare("UPDATE users SET active_session_token = NULL WHERE user_id = ?");
                $clearStmt->execute([$_SESSION['user_id']]);
            }
        } catch (\Throwable $e) {
            // Ignore DB errors during logout cleanup
        }

        $_SESSION = [];
        if (ini_get("session.use_cookies")) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000,
                $params["path"], $params["domain"],
                $params["secure"], $params["httponly"]
            );
        }
        session_destroy();
        jsonResponse(['success' => true, 'message' => 'Logged out successfully']);
    }

    $email = trim($input['email'] ?? '');
    $password = trim($input['password'] ?? '');

    if (empty($email) || empty($password)) {
        jsonResponse(['success' => false, 'message' => 'Email and password are required'], 400);
    }

    try {
        $db = getDB();
        $stmt = $db->prepare("SELECT user_id, first_name, last_name, email, password_hash, role, subject_role FROM users WHERE email = ? LIMIT 1");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if ($user && password_verify($password, $user['password_hash'])) {
            // Generate a fresh unique session token for this new login instance
            $sessionToken = bin2hex(random_bytes(32));

            // Set this session token in MySQL as the single active instance.
            // Any prior active instance (e.g. desktop) will now fail validation and log out.
            $updateTokenStmt = $db->prepare("UPDATE users SET active_session_token = ? WHERE user_id = ?");
            $updateTokenStmt->execute([$sessionToken, $user['user_id']]);

            // Issue a new session ID at login to prevent session fixation.
            session_regenerate_id(true);

            $_SESSION['user_id'] = $user['user_id'];
            $_SESSION['session_token'] = $sessionToken;
            $_SESSION['role'] = $user['role'];
            $_SESSION['first_name'] = $user['first_name'];
            $_SESSION['last_name'] = $user['last_name'];
            $_SESSION['email'] = $user['email'];
            $_SESSION['subject_role'] = $user['subject_role'];

            $initials = strtoupper(substr($user['first_name'], 0, 1) . substr($user['last_name'], 0, 1));
            if (empty($initials)) $initials = 'ST';

            jsonResponse([
                'success' => true,
                'message' => 'Authentication successful',
                'session_token' => $sessionToken,
                'user' => [
                    'user_id' => $user['user_id'],
                    'first_name' => $user['first_name'],
                    'last_name' => $user['last_name'],
                    'name' => trim($user['first_name'] . ' ' . $user['last_name']),
                    'email' => $user['email'],
                    'role' => $user['role'],
                    'initials' => $initials,
                    'subject_role' => $user['subject_role']
                ],
                'csrf_token' => generateCSRF()
            ]);
        } else {
            jsonResponse(['success' => false, 'message' => 'Invalid email or password'], 401);
        }
    } catch (PDOException $e) {
        error_log('Login failed: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'A server error occurred. Please try again later.'], 500);
    }
}

jsonResponse(['success' => false, 'message' => 'Invalid request method'], 405);
