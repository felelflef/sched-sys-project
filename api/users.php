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

if ($action === 'add') {
    $firstName = trim($input['first_name'] ?? '');
    $lastName = trim($input['last_name'] ?? '');
    $email = trim($input['email'] ?? '');
    $password = trim($input['password'] ?? '');
    $role = $input['role'] ?? 'faculty';
    $subjectRole = trim($input['subject_role'] ?? 'IT');

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
            $subjectRole = 'IT';
        }
        requireKnownDepartment($db, $subjectRole, ['IT']);
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
            $stmt = $db->prepare("DELETE FROM users WHERE email = ?");
            $stmt->execute([$email]);
        } elseif ($userId > 0) {
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
