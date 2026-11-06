<?php
// Keep PHP warnings out of JSON responses; they still go to the server error log.
ini_set('display_errors', '0');
ini_set('log_errors', '1');

if (session_status() === PHP_SESSION_NONE) {
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    ini_set('session.use_strict_mode', '1');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => $isHttps,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

// ─────────────────────────────────────────────────────────
// DATABASE CREDENTIALS
// Reads from environment variables (set in Koyeb dashboard).
// Aiven MySQL provides: host, port, dbname, user, password,
// and requires SSL (sslmode=required).
// ─────────────────────────────────────────────────────────
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_PORT', getenv('DB_PORT') ?: '3306');
define('DB_NAME', getenv('DB_NAME') ?: 'sti_classroom_system');
define('DB_USER', getenv('DB_USER') ?: 'root');
define('DB_PASS', getenv('DB_PASS') ?: '');

// Aiven requires SSL. Set DB_SSL=true in Koyeb env vars.
define('DB_SSL', filter_var(getenv('DB_SSL') ?: 'false', FILTER_VALIDATE_BOOLEAN));

// Gemini API
define('GEMINI_API_KEY', getenv('GEMINI_API_KEY') ?: 'your_gemini_api_key_here');
define('GEMINI_MODEL', getenv('GEMINI_MODEL') ?: 'gemini-2.0-flash');

function getDB(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4";

        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];

        // Aiven MySQL requires SSL connections
        if (DB_SSL) {
            // Set DB_SSL_CA to the provider's CA file path to verify the server certificate.
            $sslCa = getenv('DB_SSL_CA') ?: '';
            $options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = $sslCa !== '';
            $options[PDO::MYSQL_ATTR_SSL_CA] = $sslCa;
        }

        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);

            // Self-healing schema migration for subject roles and subject categories
            static $migrated = false;
            if (!$migrated) {
                try {
                    $checkUsers = $pdo->query("SHOW COLUMNS FROM users LIKE 'subject_role'")->fetch();
                    if (!$checkUsers) {
                        $pdo->exec("ALTER TABLE users ADD COLUMN subject_role VARCHAR(50) DEFAULT 'IT'");
                    }
                    $checkSchedules = $pdo->query("SHOW COLUMNS FROM schedules LIKE 'subject_category'")->fetch();
                    if (!$checkSchedules) {
                        $pdo->exec("ALTER TABLE schedules ADD COLUMN subject_category VARCHAR(50) DEFAULT 'IT'");
                    }
                    $checkTerm = $pdo->query("SHOW COLUMNS FROM schedules LIKE 'term_id'")->fetch();
                    if (!$checkTerm) {
                        $pdo->exec("ALTER TABLE schedules ADD COLUMN term_id INT NULL, ADD INDEX idx_schedules_term_day (term_id, day_of_week)");
                    }
                    $checkRole = $pdo->query("SHOW COLUMNS FROM users LIKE 'role'")->fetch();
                    if ($checkRole && strpos($checkRole['Type'], 'academic-head') === false) {
                        $pdo->exec("ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'academic-head', 'program-head', 'faculty') NOT NULL");
                    }
                    $checkSession = $pdo->query("SHOW COLUMNS FROM users LIKE 'active_session_token'")->fetch();
                    if (!$checkSession) {
                        $pdo->exec("ALTER TABLE users ADD COLUMN active_session_token VARCHAR(255) DEFAULT NULL");
                    }
                } catch (\Throwable $migErr) {
                    // Silently ignore schema check errors to avoid blocking execution if restricted
                }
                $migrated = true;
            }
        } catch (PDOException $e) {
            error_log('Database connection failed: ' . $e->getMessage());
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'message' => 'Database connection failed. Please try again later.']);
            exit;
        }
    }
    return $pdo;
}
