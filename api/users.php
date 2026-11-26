<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';
header('Content-Type: application/json');
requireLogin();
$db = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    requireAnyRole(['admin', 'program-head']);
    try {
        $stmt = $db->query("SELECT user_id, first_name, last_name, email, role, subject_role, created_at FROM users ORDER BY user_id ASC");
        $users = $stmt->fetchAll();
        jsonResponse(['success' => true, 'data' => $users]);
    } catch (PDOException $e) {
        error_log('users.php: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'A server error occurred. Please try again later.'], 500);
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['success' => false, 'message' => 'Invalid request method'], 405);
}

requireAnyRole(['admin', 'program-head']);
requireCSRF();

$input = json_decode(file_get_contents('php://input'), true);
if (!$input || !isset($input['action'])) {
    jsonResponse(['success' => false, 'message' => 'Missing action parameter'], 400);
}

$action = $input['action'];

// User Management is for the System Administrator. A Program Head may only update a teacher's
// name and department from Faculty Profiles, and never a System Administrator's account.
if (($_SESSION['role'] ?? '') !== 'admin') {
    $target = $db->prepare("SELECT role FROM users WHERE email = ?");
    $target->execute([trim((string)($input['email'] ?? ''))]);
    if ($action !== 'edit_user' || !in_array($target->fetchColumn(), ['faculty', 'program-head'], true)) {
        jsonResponse(['success' => false, 'message' => 'Only the System Administrator can manage user accounts.'], 403);
    }
}
expectActivity($db, 'users', (string)$action, $input);

/**
 * Checks one imported faculty row and returns its cleaned values, its problems (row can't be saved) and its
 * warnings (row can be saved, but have a look). $lists holds the departments and FCC certificates by lowercase name.
 */
function checkImportRow(array $row, array $lists, array $defaultLoads): array {
    $text = fn(string $key) => trim(preg_replace('/\s+/u', ' ', (string)($row[$key] ?? '')));
    $errors = [];
    $warnings = [];
    $first = $text('first_name');
    $last = $text('last_name');
    $email = strtolower($text('email'));
    foreach (['First name' => $first, 'Last name' => $last, 'Email' => $email] as $label => $value) {
        if ($value === '') $errors[] = "{$label} is missing";
    }
    if ($first !== '' && (mb_strlen($first) > 50 || !preg_match("/^\p{L}[\p{L}\p{M} .'\-]*$/u", $first))) $errors[] = 'First name can only have letters, spaces, periods, apostrophes and hyphens (50 at most)';
    if ($last !== '' && (mb_strlen($last) > 50 || !preg_match("/^\p{L}[\p{L}\p{M} .'\-]*$/u", $last))) $errors[] = 'Last name can only have letters, spaces, periods, apostrophes and hyphens (50 at most)';
    if ($email !== '' && (mb_strlen($email) > 100 || !filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^[a-z0-9._-]+@sti\.edu$/', $email))) $errors[] = 'Email must be an @sti.edu address';

    $deptIn = $text('department');
    $department = $lists['departments'][mb_strtolower($deptIn)] ?? null;
    if ($deptIn === '') $errors[] = 'Department is missing';
    elseif ($department === null) $errors[] = "Department \"{$deptIn}\" isn't in the list";

    $roleIn = strtolower($text('role'));
    $role = match (true) {
        $roleIn === '' || in_array($roleIn, ['faculty', 'professor', 'faculty / professor', 'teacher'], true) => 'faculty',
        in_array($roleIn, ['program head', 'program-head', 'programhead'], true) => 'program-head',
        default => null,
    };
    if ($role === null) $errors[] = 'Role must be Faculty or Program Head';

    $statusIn = strtolower(str_replace(['-', '_'], ' ', $text('employment_status')));
    $status = match (true) {
        $statusIn === '' || in_array($statusIn, ['full time', 'fulltime', 'ft'], true) => 'Full-time',
        in_array($statusIn, ['part time', 'parttime', 'pt'], true) => 'Part-time',
        default => null,
    };
    if ($status === null) $errors[] = 'Employment status must be Full-time or Part-time';

    // Available days: Mon to Sat, written short or in full, separated by commas, slashes, semicolons or spaces
    $days = [];
    foreach (preg_split('/[\s,;\/]+/', $text('available_days'), -1, PREG_SPLIT_NO_EMPTY) as $token) {
        $short = ucfirst(strtolower(substr($token, 0, 3)));
        if (in_array($short, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], true)) {
            if (!in_array($short, $days, true)) $days[] = $short;
        } else {
            $errors[] = "\"{$token}\" isn't a school day (Mon to Sat)";
        }
    }
    $days = array_values(array_intersect(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], $days));
    // Available hours: 1:00 PM, 1 PM, 13:00 or 1300
    $toTime = function (string $value): ?string {
        if (!preg_match('/^(\d{1,2})(?::?(\d{2}))?\s*([ap]\.?m\.?)?$/i', trim($value), $m)) return null;
        $h = (int)$m[1];
        $min = isset($m[2]) && $m[2] !== '' ? (int)$m[2] : 0;
        $ampm = strtolower(str_replace('.', '', $m[3] ?? ''));
        if ($ampm !== '') {
            if ($h < 1 || $h > 12) return null;
            $h = $h % 12 + ($ampm === 'pm' ? 12 : 0);
        }
        return $h <= 23 && $min <= 59 ? sprintf('%02d:%02d', $h, $min) : null;
    };
    $fromIn = $text('available_from');
    $toIn = $text('available_to');
    $from = $fromIn === '' ? null : $toTime($fromIn);
    $to = $toIn === '' ? null : $toTime($toIn);
    if ($fromIn !== '' && $from === null) $errors[] = "Available From \"{$fromIn}\" isn't a time";
    if ($toIn !== '' && $to === null) $errors[] = "Available To \"{$toIn}\" isn't a time";
    $shifts = [];
    if ($status === 'Part-time') {
        if (!$days || $fromIn === '' || $toIn === '') {
            $errors[] = 'A part-time teacher needs available days, Available From and Available To';
        } elseif ($from !== null && $to !== null) {
            $window = availabilityWindow("{$from}-{$to}");
            if ($window === null || $window[0] < SCHOOL_DAY_START || $window[1] > SCHOOL_DAY_END || strtotime("1970-01-01 {$window[1]}") - strtotime("1970-01-01 {$window[0]}") < 3600) {
                $errors[] = 'Available hours must be between 7:00 AM and 8:30 PM and at least 1 hour long';
            } else {
                $shifts = ["{$from}-{$to}"];
            }
        }
    } elseif ($status === 'Full-time' && ($days || $fromIn !== '' || $toIn !== '')) {
        $warnings[] = 'Full-time teachers are available all week, so the days and hours were ignored';
        $days = [];
    }

    // Loads in units; blank uses the school's default loads for the status
    $loads = $defaultLoads[$status ?? 'Full-time'];
    $max = $loads['max'];
    $min = $loads['min'];
    foreach (['max' => 'max_load', 'min' => 'min_load'] as $which => $key) {
        $value = $text($key);
        if ($value === '') continue;
        if (!preg_match('/^\d{1,2}$/', $value)) { $errors[] = ($which === 'max' ? 'Max' : 'Min') . " load \"{$value}\" isn't a whole number"; continue; }
        if ($which === 'max') $max = (int)$value; else $min = (int)$value;
    }
    if ($max < 3 || $max > 40) $errors[] = 'Max load must be 3 to 40 units';
    if ($min < 0 || $min > 40) $errors[] = 'Min load must be 0 to 40 units';
    if ($min > $max) $errors[] = "Min load ({$min}) can't be more than max load ({$max})";

    $levelIn = strtolower($text('teaches'));
    $level = match (true) {
        $levelIn === '' || in_array($levelIn, ['college', 'tertiary'], true) => 'tertiary',
        in_array($levelIn, ['shs', 'senior high', 'senior high school'], true) => 'shs',
        in_array($levelIn, ['both', 'mixed', 'college and shs', 'shs and college'], true) => 'mixed',
        default => null,
    };
    if ($level === null) $errors[] = 'Teaches must be College, SHS or Both';

    // FCC certificates: full names ("FCC - Tourism") or just the area ("Tourism"), separated by semicolons or commas
    $certIds = [];
    foreach (preg_split('/\s*[;,]\s*/', $text('fcc_certificates'), -1, PREG_SPLIT_NO_EMPTY) as $name) {
        $key = mb_strtolower($name);
        $id = $lists['certificates'][$key] ?? $lists['certificates']['fcc - ' . $key] ?? null;
        if ($id === null) $errors[] = "FCC certificate \"{$name}\" isn't in the list";
        elseif (!in_array($id, $certIds, true)) $certIds[] = $id;
    }
    if (!$certIds && !$errors) $warnings[] = 'No FCC certificate, so the generator gives this teacher no classes until one is added';

    return [
        'values' => ['first_name' => $first, 'last_name' => $last, 'email' => $email, 'department' => $department, 'role' => $role,
            'employment_status' => $status, 'available_days' => implode(',', $days), 'available_shifts' => implode(',', $shifts),
            'max_load' => $max, 'min_load' => $min, 'teaching_level' => $level, 'cert_ids' => $certIds],
        'errors' => $errors,
        'warnings' => $warnings,
    ];
}

/** A random temporary password that passes passwordProblem(): 10 characters with letters and digits, no look-alikes. */
function temporaryPassword(): string {
    $letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
    $digits = '23456789';
    do {
        $password = '';
        for ($i = 0; $i < 10; $i++) {
            $pool = $i % 3 === 2 ? $digits : $letters;
            $password .= $pool[random_int(0, strlen($pool) - 1)];
        }
    } while (passwordProblem($password) !== null);
    return $password;
}

// Faculty import: "check" validates every row and saves nothing; "save" checks again and saves only the ready rows,
// in one transaction, each with a temporary password that is returned once
if ($action === 'import_faculty') {
    $rows = $input['rows'] ?? null;
    $mode = ($input['mode'] ?? 'check') === 'save' ? 'save' : 'check';
    if (!is_array($rows) || !$rows) {
        rejectInput('The file has no faculty rows.');
    }
    if (count($rows) > 500) {
        rejectInput('Import at most 500 faculty at a time.');
    }
    $lists = ['departments' => [], 'certificates' => []];
    foreach ($db->query("SELECT department_name FROM departments")->fetchAll(PDO::FETCH_COLUMN) as $name) $lists['departments'][mb_strtolower($name)] = $name;
    foreach ($db->query("SELECT cert_id, cert_name FROM fcc_certificates")->fetchAll() as $cert) $lists['certificates'][mb_strtolower($cert['cert_name'])] = (int)$cert['cert_id'];
    $existing = [];
    $existingNames = [];
    foreach ($db->query("SELECT email, first_name, last_name FROM users")->fetchAll() as $u) {
        $existing[strtolower($u['email'])] = true;
        $existingNames[mb_strtolower(trim($u['first_name'] . ' ' . $u['last_name']))] = $u['email'];
    }
    $defaultLoads = loadDefaultLoads($db);

    $results = [];
    $seenEmails = [];
    $seenNames = [];
    foreach (array_values($rows) as $i => $row) {
        $line = (int)(is_array($row) ? ($row['line'] ?? $i + 2) : $i + 2);
        $check = checkImportRow(is_array($row) ? $row : [], $lists, $defaultLoads);
        $v = $check['values'];
        $status = $check['errors'] ? 'error' : 'ready';
        $notes = array_merge($check['errors'], $check['warnings']);
        if ($v['email'] !== '') {
            // A skipped row only needs the reason it is skipped
            if (isset($existing[$v['email']])) {
                $status = 'duplicate';
                $notes = ['Already has an account, so it will be skipped'];
            } elseif (isset($seenEmails[$v['email']])) {
                $status = 'duplicate';
                $notes = ["Same email as row {$seenEmails[$v['email']]}, so it will be skipped"];
            } else {
                $seenEmails[$v['email']] = $line;
            }
        }
        $fullName = mb_strtolower(trim("{$v['first_name']} {$v['last_name']}"));
        if ($status === 'ready' && $fullName !== '') {
            if (isset($existingNames[$fullName])) $notes[] = "Same name as the existing account {$existingNames[$fullName]}: check it isn't the same person";
            elseif (isset($seenNames[$fullName])) $notes[] = "Same name as row {$seenNames[$fullName]}: check it isn't the same person";
        }
        if ($fullName !== '' && !isset($seenNames[$fullName])) $seenNames[$fullName] = $line;
        $results[] = ['line' => $line, 'status' => $status, 'notes' => $notes, 'values' => $v];
    }
    $counts = ['ready' => 0, 'error' => 0, 'duplicate' => 0];
    foreach ($results as $r) $counts[$r['status']]++;

    if ($mode === 'check') {
        jsonResponse(['success' => true, 'data' => ['rows' => array_map(fn($r) => array_diff_key($r, ['values' => 0]) + ['name' => trim("{$r['values']['first_name']} {$r['values']['last_name']}"), 'email' => $r['values']['email']], $results), 'counts' => $counts]]);
    }
    if ($counts['ready'] === 0) {
        rejectInput('No rows are ready to import. Fix the rows marked with problems and check the file again.');
    }

    $created = [];
    $db->beginTransaction();
    try {
        $insUser = $db->prepare("INSERT INTO users (first_name, last_name, email, password_hash, role, subject_role, employment_status, available_days, available_shifts, max_load, min_load, teaching_level)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $insCert = $db->prepare("INSERT INTO faculty_certificates (user_id, cert_id) VALUES (?, ?) ON CONFLICT DO NOTHING");
        foreach ($results as $r) {
            if ($r['status'] !== 'ready') continue;
            $v = $r['values'];
            $password = temporaryPassword();
            $insUser->execute([$v['first_name'], $v['last_name'], $v['email'], password_hash($password, PASSWORD_BCRYPT), $v['role'], $v['department'],
                $v['employment_status'], $v['available_days'], $v['available_shifts'], $v['max_load'], $v['min_load'], $v['teaching_level']]);
            $userId = (int)$db->lastInsertId();
            foreach ($v['cert_ids'] as $certId) $insCert->execute([$userId, $certId]);
            $created[] = ['name' => "{$v['first_name']} {$v['last_name']}", 'email' => $v['email'], 'role' => $v['role'], 'temporary_password' => $password];
        }
        $db->commit();
    } catch (PDOException $e) {
        $db->rollBack();
        error_log('users.php import: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'The import failed and nothing was saved. Please try again.'], 500);
    }
    setActivitySummary('Imported ' . count($created) . ' faculty account' . (count($created) === 1 ? '' : 's') . ' from a file'
        . ($counts['duplicate'] + $counts['error'] ? ' (' . ($counts['duplicate'] + $counts['error']) . ' rows skipped)' : ''));
    jsonResponse(['success' => true, 'data' => ['created' => $created, 'counts' => $counts]]);
}

if ($action === 'add') {
    $firstName = trim($input['first_name'] ?? '');
    $lastName = trim($input['last_name'] ?? '');
    $email = trim($input['email'] ?? '');
    $password = trim($input['password'] ?? '');
    $role = $input['role'] ?? 'faculty';
    $subjectRole = trim($input['subject_role'] ?? 'IT / Computing');

    // Validate required fields
    if (empty($firstName) || empty($lastName) || empty($email)) {
        jsonResponse(['success' => false, 'message' => 'First name, last name, and email are required'], 400);
    }
    requireFieldLengths(['First name' => [$firstName, 50], 'Last name' => [$lastName, 50], 'Email' => [$email, 100], 'Department' => [$subjectRole, 50]]);

    // Validate email format
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['success' => false, 'message' => 'Invalid email format'], 400);
    }
    if (!preg_match('/^[a-z0-9._-]+@sti\.edu$/i', $email)) {
        jsonResponse(['success' => false, 'message' => 'Only @sti.edu email addresses using letters, numbers, dots, hyphens or underscores are permitted.'], 400);
    }
    requireValidName('First name', $firstName);
    requireValidName('Last name', $lastName);

    // The roles: System Administrator, Program Head and Faculty / Professor
    if (!in_array($role, ['admin', 'program-head', 'faculty'], true)) {
        jsonResponse(['success' => false, 'message' => 'Choose Faculty / Professor, Program Head or System Administrator.'], 400);
    }

    // Program Heads and faculty belong to a department; the System Administrator doesn't
    if ($role === 'admin') {
        $subjectRole = null;
    } else {
        if (empty($subjectRole)) {
            $subjectRole = 'IT / Computing';
        }
        requireKnownDepartment($db, $subjectRole, ['IT', 'IT / Computing']);
    }

    // Validate password length
    if ($passwordError = passwordProblem($password)) {
        jsonResponse(['success' => false, 'message' => $passwordError], 400);
    }

    // Check if email already exists
    $stmt = $db->prepare("SELECT user_id FROM users WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        jsonResponse(['success' => false, 'message' => 'A user with this email already exists'], 400);
    }

    // Hash password and insert
    $passwordHash = password_hash($password, PASSWORD_BCRYPT);

    try {
        $stmt = $db->prepare("INSERT INTO users (first_name, last_name, email, password_hash, role, subject_role) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$firstName, $lastName, $email, $passwordHash, $role, $subjectRole]);
        $teachingLevel = in_array($input['teaching_level'] ?? '', TEACHING_LEVELS, true) ? $input['teaching_level'] : 'tertiary';
        try {
            $db->prepare("UPDATE users SET teaching_level = ? WHERE email = ?")->execute([$teachingLevel, $email]);
        } catch (\Throwable $e) {
            // Before the column exists, the teacher counts as college
        }

        jsonResponse([
            'success' => true,
            'message' => 'User created successfully',
            'user_id' => $db->lastInsertId()
        ]);
    } catch (PDOException $e) {
        error_log('users.php: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'A server error occurred. Please try again later.'], 500);
    }
} elseif ($action === 'edit_user') {
    $email = trim($input['email'] ?? '');
    $firstName = trim($input['first_name'] ?? '');
    $lastName = trim($input['last_name'] ?? '');
    $subjectRole = isset($input['subject_role']) ? trim($input['subject_role']) : null;

    if (empty($email) || empty($firstName)) {
        jsonResponse(['success' => false, 'message' => 'Email and first name are required'], 400);
    }
    if (empty($lastName)) {
        $lastName = $firstName;
    }
    requireFieldLengths(['First name' => [$firstName, 50], 'Last name' => [$lastName, 50], 'Department' => [$subjectRole, 50]]);
    requireValidName('First name', $firstName);
    requireValidName('Last name', $lastName);
    if ($subjectRole !== null) {
        $current = $db->prepare("SELECT subject_role FROM users WHERE email = ?");
        $current->execute([$email]);
        requireKnownDepartment($db, $subjectRole, [(string)$current->fetchColumn()]);
    }

    try {
        if ($subjectRole !== null) {
            $stmt = $db->prepare("UPDATE users SET first_name = ?, last_name = ?, subject_role = ? WHERE email = ?");
            $stmt->execute([$firstName, $lastName, $subjectRole, $email]);
        } else {
            $stmt = $db->prepare("UPDATE users SET first_name = ?, last_name = ? WHERE email = ?");
            $stmt->execute([$firstName, $lastName, $email]);
        }
        jsonResponse(['success' => true, 'message' => 'User account updated successfully']);
    } catch (PDOException $e) {
        error_log('users.php: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'A server error occurred. Please try again later.'], 500);
    }
} elseif ($action === 'delete' || $action === 'delete_by_email') {
    $userId = (int)($input['user_id'] ?? 0);
    $email = trim($input['email'] ?? '');
    $current = currentUser();

    if ($userId > 0 && empty($email)) {
        $lookup = $db->prepare("SELECT email FROM users WHERE user_id = ?");
        $lookup->execute([$userId]);
        $email = (string)$lookup->fetchColumn();
    }

    if (strcasecmp($email, 'admin@sti.edu') === 0 || ($current && strcasecmp($email, $current['email']) === 0)) {
        jsonResponse(['success' => false, 'message' => 'Cannot delete the primary administrator account'], 400);
    }

    if ($userId > 0 && $current && $userId === (int)$current['user_id']) {
        jsonResponse(['success' => false, 'message' => 'Cannot delete your own account'], 400);
    }

    // The schedules table cascades, so deleting a teacher would silently delete their classes
    $classCheck = $db->prepare("SELECT COUNT(*) FROM schedules s JOIN users u ON s.faculty_id = u.user_id WHERE u.email = ?");
    $classCheck->execute([$email]);
    $classCount = (int)$classCheck->fetchColumn();
    if ($classCount > 0) {
        jsonResponse(['success' => false, 'message' => "This user still has {$classCount} scheduled class(es). Reassign them first."], 409);
    }

    try {
        if (!empty($email)) {
            $db->prepare("UPDATE academic_sections SET adviser = NULL WHERE adviser = ?")->execute([$email]);
            $stmt = $db->prepare("DELETE FROM users WHERE email = ?");
            $stmt->execute([$email]);
        } elseif ($userId > 0) {
            $db->prepare("UPDATE academic_sections SET adviser = NULL WHERE adviser = (SELECT email FROM users WHERE user_id = ?)")->execute([$userId]);
            $stmt = $db->prepare("DELETE FROM users WHERE user_id = ?");
            $stmt->execute([$userId]);
        } else {
            jsonResponse(['success' => false, 'message' => 'User ID or Email is required'], 400);
        }

        jsonResponse(['success' => true, 'message' => 'Account removed successfully']);
    } catch (PDOException $e) {
        error_log('users.php: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'A server error occurred. Please try again later.'], 500);
    }
} else {
    jsonResponse(['success' => false, 'message' => 'Unknown action: ' . $action], 400);
}
