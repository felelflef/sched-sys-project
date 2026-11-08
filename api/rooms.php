<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';

header('Content-Type: application/json');

requireRole('admin');

$db = getDB();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

requireCSRF();

$input = json_decode(file_get_contents('php://input'), true);
$action = $input['action'] ?? '';

$validTypes = ['Lecture', 'Lab', 'Kitchen', 'Bar', 'Special', 'CompLab'];

if ($action === 'add') {
    $room_name_number = trim($input['room_name_number'] ?? '');
    $room_type = trim($input['room_type'] ?? '');
    $floor_level = (int)($input['floor_level'] ?? 0);
    $capacity = (int)($input['capacity'] ?? 0);

    if (!$room_name_number || !$room_type || $floor_level < 1 || $capacity < 1) {
        jsonResponse(['success' => false, 'message' => 'All fields are required and must have valid positive values'], 400);
    }
    requireFieldLengths(['Room name' => [$room_name_number, 50]]);

    if (!in_array($room_type, $validTypes)) {
        jsonResponse(['success' => false, 'message' => 'Invalid room type'], 400);
    }

    // Check duplicate room name
    $checkStmt = $db->prepare("SELECT room_id FROM classrooms WHERE room_name_number = ?");
    $checkStmt->execute([$room_name_number]);
    if ($checkStmt->fetch()) {
        jsonResponse(['success' => false, 'message' => 'A room with this name or number already exists'], 409);
    }

    $stmt = $db->prepare("INSERT INTO classrooms (room_name_number, room_type, capacity, floor_level, current_status) VALUES (?, ?, ?, ?, 'Vacant')");
    $stmt->execute([$room_name_number, $room_type, $capacity, $floor_level]);

    jsonResponse(['success' => true, 'message' => 'Room added successfully', 'room_id' => $db->lastInsertId()]);

} elseif ($action === 'edit') {
    $room_id = (int)($input['room_id'] ?? 0);
    $room_name_number = trim($input['room_name_number'] ?? '');
    $room_type = trim($input['room_type'] ?? '');
    $floor_level = (int)($input['floor_level'] ?? 0);
    $capacity = (int)($input['capacity'] ?? 0);

    if (!$room_id || !$room_name_number || !$room_type || $floor_level < 1 || $capacity < 1) {
        jsonResponse(['success' => false, 'message' => 'All fields are required and must have valid positive values'], 400);
    }
    requireFieldLengths(['Room name' => [$room_name_number, 50]]);

    if (!in_array($room_type, $validTypes)) {
        jsonResponse(['success' => false, 'message' => 'Invalid room type'], 400);
    }

    // Verify room exists
    $checkStmt = $db->prepare("SELECT room_id FROM classrooms WHERE room_id = ?");
    $checkStmt->execute([$room_id]);
    if (!$checkStmt->fetch()) {
        jsonResponse(['success' => false, 'message' => 'Room not found'], 404);
    }

    // Check duplicate name for other rooms
    $dupStmt = $db->prepare("SELECT room_id FROM classrooms WHERE room_name_number = ? AND room_id != ?");
    $dupStmt->execute([$room_name_number, $room_id]);
    if ($dupStmt->fetch()) {
        jsonResponse(['success' => false, 'message' => 'Another room already uses this name or number'], 409);
    }

    $stmt = $db->prepare("UPDATE classrooms SET room_name_number = ?, room_type = ?, capacity = ?, floor_level = ? WHERE room_id = ?");
    $stmt->execute([$room_name_number, $room_type, $capacity, $floor_level, $room_id]);

    jsonResponse(['success' => true, 'message' => 'Room updated successfully']);

} elseif ($action === 'delete') {
    $room_id = (int)($input['room_id'] ?? 0);
    if (!$room_id) {
        jsonResponse(['success' => false, 'message' => 'Room ID is required'], 400);
    }

    // Deleting a room cascades to its classes, so a room in use must be cleared first
    $useStmt = $db->prepare("SELECT COUNT(*) FROM schedules WHERE room_id = ?");
    $useStmt->execute([$room_id]);
    if ($useStmt->fetchColumn() > 0) {
        jsonResponse(['success' => false, 'message' => 'This room still has scheduled classes. Move them to another room first.'], 409);
    }

    $stmt = $db->prepare("DELETE FROM classrooms WHERE room_id = ?");
    $stmt->execute([$room_id]);
    jsonResponse(['success' => true, 'message' => 'Room removed successfully']);

} else {
    jsonResponse(['success' => false, 'message' => 'Invalid action'], 400);
}
