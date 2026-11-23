<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';

header('Content-Type: application/json');

// The change history is read-only and visible to the System Administrator and Program Heads
requireLogin();
requireAnyRole(['admin', 'program-head']);
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

$limit = max(1, min(200, (int)($_GET['limit'] ?? 100)));
$before = (int)($_GET['before'] ?? 0);
$category = trim((string)($_GET['category'] ?? ''));
$search = trim((string)($_GET['q'] ?? ''));

$where = [];
$params = [];
if ($before > 0) {
    $where[] = 'log_id < ?';
    $params[] = $before;
}
if (in_array($category, ['Schedule', 'Setup', 'Resources', 'Accounts', 'Sign-in'], true)) {
    $where[] = 'category = ?';
    $params[] = $category;
}
if ($search !== '') {
    $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], mb_substr($search, 0, 100)) . '%';
    // ILIKE ignores capital letters, as the search did on MySQL
    $where[] = '(summary ILIKE ? OR user_name ILIKE ? OR user_email ILIKE ?)';
    array_push($params, $like, $like, $like);
}

try {
    // Seconds since 1970 give the moment itself, so the browser shows it in the viewer's own time
    $stmt = getDB()->prepare(
        "SELECT log_id, CAST(EXTRACT(EPOCH FROM created_at) AS BIGINT) AS at, user_email, user_name, user_role, category, summary FROM activity_log"
        . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
        . " ORDER BY log_id DESC LIMIT {$limit}"
    );
    $stmt->execute($params);
    jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
} catch (PDOException $e) {
    // Before the first change is recorded the table may not exist yet
    if (($e->errorInfo[0] ?? '') === '42P01') { // undefined_table
        jsonResponse(['success' => true, 'data' => []]);
    }
    error_log('activity.php: ' . $e->getMessage());
    jsonResponse(['success' => false, 'message' => 'Could not load the activity log. Please try again.'], 500);
}
