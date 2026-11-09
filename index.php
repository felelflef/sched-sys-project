<?php
// The dashboard is shown at the main address. Any other unknown path returns here.
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if ($path !== '/' && $path !== '/index.php') {
    header('Location: /');
    exit;
}

// Each script and stylesheet link carries a fingerprint, so browsers fetch new files after an update
header('Cache-Control: no-cache');
echo preg_replace_callback('#(assets/(?:css|js)/[a-z_]+\.(?:css|js))"#', function (array $match): string {
    $file = __DIR__ . '/' . $match[1];
    return $match[1] . (is_file($file) ? '?v=' . substr(md5_file($file), 0, 8) : '') . '"';
}, file_get_contents(__DIR__ . '/sti_scheduling_dashboard.html'));
