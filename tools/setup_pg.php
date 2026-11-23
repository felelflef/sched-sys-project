<?php
/**
 * One-time setup of a new, empty PostgreSQL database (Aiven) for the scheduling system.
 *
 * Creates every table (sql/schema_pg.sql), the seven subject areas with an FCC certificate each, and the
 * System Administrator account you sign in with. Nothing is deleted or replaced, so running it again is safe:
 * tables and an existing admin account are left as they are.
 *
 * Run it from your own terminal (it refuses to run from a web request):
 *   php -d extension=pdo_pgsql tools/setup_pg.php
 *
 * Connection: the same variables the live site uses (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS, DB_SSL,
 * optional DB_SSL_CA), read from the environment or from a .env file in the project folder.
 * Admin account: ADMIN_PASSWORD (required: 8 to 72 characters with a letter and a number), and optionally
 * ADMIN_EMAIL (default admin@sti.edu), ADMIN_FIRST_NAME and ADMIN_LAST_NAME (default System Administrator).
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
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
if (!extension_loaded('pdo_pgsql')) {
    fwrite(STDERR, "PHP's PostgreSQL driver (pdo_pgsql) is not turned on. Run with: php -d extension=pdo_pgsql tools/setup_pg.php\n");
    exit(1);
}
$host = $cfg('DB_HOST');
if ($host === '') {
    fwrite(STDERR, "DB_HOST is not set. Set DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS and DB_SSL (as on Render) and run again.\n");
    exit(1);
}

/* ───────────── The admin account, checked before anything is changed ───────────── */
$adminEmail = strtolower(trim($cfg('ADMIN_EMAIL', 'admin@sti.edu')));
$adminFirst = trim($cfg('ADMIN_FIRST_NAME', 'System'));
$adminLast = trim($cfg('ADMIN_LAST_NAME', 'Administrator'));
$adminPassword = $cfg('ADMIN_PASSWORD');
// The same rules the app uses for passwords (passwordProblem in includes/functions.php)
$problem = match (true) {
    strlen($adminPassword) < 8 => 'ADMIN_PASSWORD is not set or shorter than 8 characters.',
    strlen($adminPassword) > 72 => 'ADMIN_PASSWORD must be 72 characters or fewer.',
    strcasecmp($adminPassword, 'password') === 0 => 'Please choose a less common ADMIN_PASSWORD.',
    !preg_match('/[A-Za-z]/', $adminPassword) || !preg_match('/\d/', $adminPassword) => 'ADMIN_PASSWORD must include at least one letter and one number.',
    !filter_var($adminEmail, FILTER_VALIDATE_EMAIL) || strlen($adminEmail) > 100 => 'ADMIN_EMAIL is not a valid email address.',
    !preg_match('/^.{1,50}$/u', $adminFirst) || !preg_match('/^.{1,50}$/u', $adminLast) =>'ADMIN_FIRST_NAME and ADMIN_LAST_NAME must be 1 to 50 characters.',
    default => null,
};
if ($problem) {
    fwrite(STDERR, "{$problem}\n");
    exit(1);
}

$options = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false];
$dbName = $cfg('DB_NAME', 'defaultdb');
$dsn = "pgsql:host={$host};port={$cfg('DB_PORT', '5432')};dbname={$dbName}";
if (filter_var($cfg('DB_SSL', 'false'), FILTER_VALIDATE_BOOLEAN)) {
    $ca = $cfg('DB_SSL_CA');
    $dsn .= $ca !== '' ? ";sslmode=verify-full;sslrootcert={$ca}" : ';sslmode=require';
}
try {
    $db = new PDO($dsn, $cfg('DB_USER', 'avnadmin'), $cfg('DB_PASS'), $options);
} catch (PDOException $e) {
    fwrite(STDERR, "Could not connect to {$host}: {$e->getMessage()}\n");
    exit(1);
}
$existingTables = (int)$db->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'")->fetchColumn();
echo "Connected to {$dbName} on {$host} ({$existingTables} tables there now)\n\n";
echo "This creates the scheduling system's tables, the 7 subject areas with their FCC certificates,\n"
    . "and the admin account {$adminEmail}. Nothing is deleted or replaced.\nType SETUP to continue: ";
if (trim((string)fgets(STDIN)) !== 'SETUP') {
    echo "Cancelled. Nothing was changed.\n";
    exit(0);
}

/* ───────────── Tables, subject areas and the admin account, in one transaction ───────────── */
$db->beginTransaction();
try {
    $db->exec((string)file_get_contents("{$projectDir}/sql/schema_pg.sql"));
    $addAdmin = $db->prepare("INSERT INTO users (first_name, last_name, email, password_hash, role, subject_role) VALUES (?, ?, ?, ?, 'admin', NULL)
        ON CONFLICT (email) DO NOTHING");
    $addAdmin->execute([$adminFirst, $adminLast, $adminEmail, password_hash($adminPassword, PASSWORD_DEFAULT)]);
    $adminAdded = $addAdmin->rowCount() === 1;
    // The database is the shared data from the start, so the app shows it (empty) instead of offering
    // to publish the demo data a browser keeps locally
    $db->exec("INSERT INTO app_settings (setting_key, setting_value) VALUES ('state_published', '1') ON CONFLICT DO NOTHING");
    $db->commit();
} catch (Throwable $e) {
    $db->rollBack();
    fwrite(STDERR, "Setup failed and was rolled back, so nothing was changed: {$e->getMessage()}\n");
    exit(1);
}

$tables = (int)$db->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'")->fetchColumn();
$areas = $db->query("SELECT department_name FROM departments ORDER BY department_name")->fetchAll(PDO::FETCH_COLUMN);
echo "\nDONE: {$tables} tables; subject areas: " . implode(', ', $areas) . ".\n"
    . ($adminAdded
        ? "Admin account created: {$adminEmail}. Sign in with it and the password you set.\n"
        : "An account with {$adminEmail} already existed, so it was left as it is (its password did not change).\n")
    . "Next: set the same DB_ values on Render and redeploy, then add rooms, teachers and subjects in the app.\n";
