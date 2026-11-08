<?php
// The dashboard is shown at the main address. Any other unknown path returns here.
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if ($path !== '/' && $path !== '/index.php') {
    header('Location: /');
    exit;
}

readfile(__DIR__ . '/sti_scheduling_dashboard.html');
