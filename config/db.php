<?php
// Keep PHP warnings out of JSON responses; they still go to the server error log.
ini_set('display_errors', '0');
ini_set('log_errors', '1');


// ─────────────────────────────────────────────────────────
// DATABASE CREDENTIALS
// Reads from environment variables (set in the Render dashboard).
// Aiven PostgreSQL provides: host, port, dbname (defaultdb), user (avnadmin), password,
// and requires SSL (sslmode=require).
// ─────────────────────────────────────────────────────────
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_PORT', getenv('DB_PORT') ?: '5432');
define('DB_NAME', getenv('DB_NAME') ?: 'sti_classroom_system');
define('DB_USER', getenv('DB_USER') ?: 'root');
define('DB_PASS', getenv('DB_PASS') ?: '');

// Aiven requires SSL. Set DB_SSL=true in Render's environment variables.
// Raise this whenever a new database column or table is added
define('SCHEMA_VERSION', '2026-11-23.pg1');
define('DB_SSL', filter_var(getenv('DB_SSL') ?: 'false', FILTER_VALIDATE_BOOLEAN));

// Gemini API
define('GEMINI_API_KEY', getenv('GEMINI_API_KEY') ?: 'your_gemini_api_key_here');
define('GEMINI_MODEL', getenv('GEMINI_MODEL') ?: 'gemini-flash-lite-latest');

// A sign-in lasts until the browser closes, or 8 hours without using the app
define('SESSION_LIFETIME', 8 * 3600);

// Sign-ins are kept in the database. The hosting platform wipes the server's own disk on every deploy,
// which used to sign everyone out after each update.
final class DatabaseSessionHandler implements SessionHandlerInterface {
    public function open(string $path, string $name): bool { return true; }
    public function close(): bool { return true; }
    // A database error must not look like "signed out", so it is passed on and the request answers with an error
    public function read(string $id): string|false {
        $find = getDB()->prepare("SELECT data FROM app_sessions WHERE session_id = ? AND updated_at > ?");
        $find->execute([$id, time() - SESSION_LIFETIME]);
        return (string)($find->fetchColumn() ?: '');
    }
    public function write(string $id, string $data): bool {
        self::dbOutsideTransaction()->prepare("INSERT INTO app_sessions (session_id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT (session_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at")->execute([$id, $data, time()]);
        return true;
    }
    public function destroy(string $id): bool {
        self::dbOutsideTransaction()->prepare("DELETE FROM app_sessions WHERE session_id = ?")->execute([$id]);
        return true;
    }
    // The sign-in is saved as the request ends. A request that stopped part-way through a transaction, such as after
    // an error, left it unfinished; its changes are discarded here (the same happened on MySQL when the connection
    // closed), because PostgreSQL refuses every further statement in a failed transaction.
    private static function dbOutsideTransaction(): PDO {
        $db = getDB();
        if ($db->inTransaction()) $db->rollBack();
        return $db;
    }
    public function gc(int $maxLifetime): int|false {
        $old = getDB()->prepare("DELETE FROM app_sessions WHERE updated_at < ?");
        $old->execute([time() - SESSION_LIFETIME]);
        return $old->rowCount();
    }
}

if (session_status() === PHP_SESSION_NONE) {
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.gc_maxlifetime', (string)SESSION_LIFETIME);
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => $isHttps,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_set_save_handler(new DatabaseSessionHandler(), true);
    try {
        session_start();
    } catch (\Throwable $e) {
        error_log('Session store unavailable: ' . $e->getMessage());
        http_response_code(503);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => "The database can't be reached right now. Please try again in a moment."]);
        exit;
    }
}

// Creates any missing table from sql/schema_pg.sql. Every statement there is safe to run again.
function ensureSchema(PDO $pdo): void {
    $pdo->exec((string)file_get_contents(__DIR__ . '/../sql/schema_pg.sql'));
}

function getDB(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = "pgsql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME;

        // Aiven PostgreSQL requires SSL connections. Set DB_SSL_CA to the CA certificate file from the Aiven
        // console to also check the server's certificate and name; without it the connection is still encrypted.
        if (DB_SSL) {
            $sslCa = getenv('DB_SSL_CA') ?: '';
            $dsn .= $sslCa !== '' ? ";sslmode=verify-full;sslrootcert=" . $sslCa : ";sslmode=require";
        }

        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];

        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);

            // Schema checks are slow over a remote connection, so they run once per SCHEMA_VERSION
            $stamps = [];
            try {
                foreach ($pdo->query("SELECT setting_key, setting_value FROM app_settings WHERE setting_key LIKE 'schema_%'")->fetchAll() as $stamp) {
                    $stamps[$stamp['setting_key']] = $stamp['setting_value'];
                }
            } catch (\Throwable $stampErr) {
                // The settings table doesn't exist yet on a brand new database
            }
            $GLOBALS['schema_stamps'] = $stamps;

            if (($stamps['schema_core'] ?? '') !== SCHEMA_VERSION) {
                try {
                    ensureSchema($pdo);
                    $pdo->prepare("INSERT INTO app_settings (setting_key, setting_value) VALUES ('schema_core', ?)
                        ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value")->execute([SCHEMA_VERSION]);
                } catch (\Throwable $migErr) {
                    // The app keeps running on the tables it has; the reason goes to the server log
                    error_log('Schema setup failed: ' . $migErr->getMessage());
                }
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
