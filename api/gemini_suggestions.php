<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';

header('Content-Type: application/json');

// A login is always required: this endpoint spends API quota and exposes schedule data.
requireLogin();

// Read request payload
$input = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input');
    if (!empty($raw)) {
        $input = json_decode($raw, true) ?: [];
    }
}

// Use the user's own key if supplied, otherwise the server-configured key
$clientKey = trim($input['apiKey'] ?? ($_SERVER['HTTP_X_GEMINI_API_KEY'] ?? ''));
$serverKey = (defined('GEMINI_API_KEY') && GEMINI_API_KEY !== 'your_gemini_api_key_here') ? GEMINI_API_KEY : getenv('GEMINI_API_KEY');
$apiKey = !empty($clientKey) ? $clientKey : $serverKey;

if (empty($apiKey)) {
    jsonResponse([
        'success' => false,
        'code' => 'KEY_REQUIRED',
        'error' => 'Gemini API key is not configured. Please configure GEMINI_API_KEY in your server environment.'
    ], 400);
}

$action = $input['action'] ?? ($_GET['action'] ?? 'full_audit');
$userQuestion = trim($input['question'] ?? ($_GET['question'] ?? ''));

$logsText = "";
$schedText = "";
$roomsText = "";

// Attempt to read live database records; fallback gracefully if DB is offline
try {
    $db = getDB();

    // 1. Fetch recent actual classroom session logs
    $stmtLogs = $db->prepare("
        SELECT c.room_name_number, u.first_name, u.last_name, sl.session_date, sl.actual_start_time, sl.actual_end_time 
        FROM session_logs sl 
        JOIN classrooms c ON sl.room_id = c.room_id 
        JOIN users u ON sl.faculty_id = u.user_id 
        WHERE sl.session_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        ORDER BY sl.session_date DESC
    ");
    $stmtLogs->execute();
    $logs = $stmtLogs->fetchAll();

    foreach ($logs as $log) {
        $endTime = $log['actual_end_time'] ?? 'Ongoing';
        $logsText .= "Room {$log['room_name_number']} | Faculty: {$log['first_name']} {$log['last_name']} | Date: {$log['session_date']} | Start: {$log['actual_start_time']} | End: {$endTime}\n";
    }

    // 2. Fetch all current scheduled classes
    $stmtSched = $db->prepare("
        SELECT c.room_name_number, s.day_of_week, s.start_time, s.end_time, s.subject_code, s.section_name, u.first_name, u.last_name 
        FROM schedules s 
        JOIN classrooms c ON s.room_id = c.room_id 
        JOIN users u ON s.faculty_id = u.user_id
        WHERE s.term_id IS NULL OR s.term_id = (SELECT term_id FROM school_terms WHERE is_active = 1 LIMIT 1)
        ORDER BY s.day_of_week, s.start_time
    ");
    $stmtSched->execute();
    $schedules = $stmtSched->fetchAll();

    foreach ($schedules as $sched) {
        $schedText .= "Room {$sched['room_name_number']} | Day: {$sched['day_of_week']} | Time: {$sched['start_time']}-{$sched['end_time']} | Subject: {$sched['subject_code']} | Section: {$sched['section_name']} | Faculty: {$sched['first_name']} {$sched['last_name']}\n";
    }

    // 3. Fetch campus classroom inventory
    $stmtRooms = $db->query("SELECT room_name_number, room_type, capacity, floor_level FROM classrooms ORDER BY floor_level, room_name_number");
    $rooms = $stmtRooms->fetchAll();
    foreach ($rooms as $r) {
        $roomsText .= "Room {$r['room_name_number']} (Floor {$r['floor_level']}, Type: {$r['room_type']}, Capacity: {$r['capacity']})\n";
    }
} catch (\Throwable $dbErr) {
    // Database connection offline or unconfigured; use schedule and room payload if provided
    if (!empty($input['rooms']) && is_array($input['rooms'])) {
        foreach ($input['rooms'] as $r) {
            $roomsText .= "Room {$r['code']} (Floor {$r['floor']}, Type: {$r['type']}, Capacity: {$r['cap']})\n";
        }
    }
    if (!empty($input['schedule']) && is_array($input['schedule'])) {
        foreach ($input['schedule'] as $s) {
            $schedText .= "Room {$s['room']} | Section: {$s['section']} | Subject: {$s['subjectCode']} | Day: {$s['day']} | Time: {$s['startTime']}-{$s['endTime']} | Faculty: {$s['instructor']}\n";
        }
    }
}

// Strict system guardrail instruction: Only scheduling system domain
$systemGuardrail = "You are the STI College Classroom & Schedule AI Optimization Assistant for STI College Marikina.

CAMPUS ROOM DIRECTORY:
" . (!empty($roomsText) ? $roomsText : "15 Lecture Rooms (LR-101 to LR-306), 4 Computer Labs (CL-101 to CL-104), Kitchen Lab, Tourism Lab.") . "

CURRENT MASTER SCHEDULES:
" . (!empty($schedText) ? $schedText : "Schedules across BSIT, BSCS, BSCpE, BSHM, BSTM, and BSBA collegiate sections.") . "

RECENT ACTUAL OCCUPANCY LOGS (Last 7 Days):
" . (!empty($logsText) ? $logsText : "No manual check-in logs recorded yet.") . "

STRICT DOMAIN GUARDRAILS:
1. You are an expert AI dedicated EXCLUSIVELY to STI College classroom scheduling, room space utilization, faculty timetable assignments, conflict detection, and academic scheduling logistics.
2. You MUST REFUSE to answer any queries or topics unrelated to STI scheduling, room usage, timetables, faculty loads, or campus spaces (for example, general chat, coding, recipes, personal advice, weather, sports, general knowledge, etc.).
3. If an inquiry is NOT strictly about STI scheduling or classroom operations, reply ONLY with:
'I am an assistant dedicated solely to STI College classroom scheduling, room allocation, and space optimization. I cannot answer questions on unrelated topics. Please ask a question related to class schedules, room availability, faculty teaching loads, or campus space utilization.'
4. When answering on-topic questions, format your response cleanly with bold key points, bullet lists, and clear headers using markdown. Be professional, direct, and actionable.";

// Select analysis prompt based on action
$userPrompt = "";
if ($action === 'underutilized') {
    $userPrompt = "Analyze the current schedule and room inventory to identify classrooms and time slots that are consistently underutilized, empty, or have low seat occupancy. Provide specific room numbers and recommendations to balance room usage across floors.";
} elseif ($action === 'peak_hours') {
    $userPrompt = "Analyze the schedule data to identify peak congestion hours across the week, bottleneck facilities (e.g. computer laboratories), and suggest time-shifting strategies to smooth out campus foot traffic.";
} elseif ($action === 'conflicts') {
    $userPrompt = "Analyze the schedule data and session logs to detect any overlapping schedules, potential phantom occupancy, or classroom capacity mismatches.";
} elseif ($action === 'custom_query' || !empty($userQuestion)) {
    $userPrompt = "User question about the STI schedule system:\n" . $userQuestion;
} else {
    // Full audit
    $userPrompt = "Perform a comprehensive space & schedule optimization audit. Provide 3-5 high-impact, actionable recommendations regarding underutilized rooms, peak bottlenecks, room capacity efficiency, and faculty timetable distribution.";
}

$postData = [
    'system_instruction' => [
        'parts' => [
            ['text' => $systemGuardrail]
        ]
    ],
    'contents' => [
        ['parts' => [['text' => $userPrompt]]]
    ],
    'generationConfig' => [
        'temperature' => 0.3,
        'maxOutputTokens' => 2048
    ]
];

$model = getenv('GEMINI_MODEL') ?: 'gemini-2.5-flash';
$url = "https://generativelanguage.googleapis.com/v1beta/models/" . $model . ":generateContent?key=" . urlencode($apiKey);

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($postData));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_TIMEOUT, 40);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    jsonResponse(['success' => false, 'error' => 'Connection to Gemini API failed: ' . $curlError], 500);
}

// Fallback to gemini-2.0-flash if model not found
if ($httpCode === 404) {
    $fallbackUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" . urlencode($apiKey);
    $ch = curl_init($fallbackUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($postData));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 40);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
}

if ($httpCode !== 200 || !$response) {
    $errDetail = '';
    if ($response) {
        $errObj = json_decode($response, true);
        $errDetail = $errObj['error']['message'] ?? ('HTTP ' . $httpCode);
    } else {
        $errDetail = 'HTTP ' . $httpCode;
    }
    jsonResponse(['success' => false, 'error' => 'Gemini API Error: ' . $errDetail], 500);
}

$responseData = json_decode($response, true);
$candidate = $responseData['candidates'][0] ?? null;
$aiText = $candidate['content']['parts'][0]['text'] ?? null;

if (!$aiText) {
    $finishReason = $candidate['finishReason'] ?? 'UNKNOWN';
    if ($finishReason === 'SAFETY') {
        $aiText = "The response was blocked by safety filters.";
    } else {
        $aiText = $responseData['promptFeedback']['blockReason'] ?? 'No insights generated. The API returned an unexpected response format.';
    }
}

jsonResponse(['success' => true, 'data' => $aiText]);
