<?php
// Makes sure every table exists (sql/schema_pg.sql, which also adds the subject areas and their FCC certificates once).
// api/schedules.php loads this once per SCHEMA_VERSION, with its $db connection. School years, terms, subjects,
// sections, rooms and teachers are entered in the app; nothing else is added here.
if (!isset($db) || !($db instanceof PDO)) { http_response_code(404); exit; }

try {
    ensureSchema($db);
    $db->prepare("INSERT INTO app_settings (setting_key, setting_value) VALUES ('schema_lifecycle', ?)
        ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value")->execute([SCHEMA_VERSION]);
} catch (\Throwable $e) {
    // The app keeps running on the tables it has; the reason goes to the server log
    error_log('Schema setup failed: ' . $e->getMessage());
}
