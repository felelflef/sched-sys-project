<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';

header('Content-Type: application/json');

// A login is always required: this endpoint spends API quota and exposes schedule data.
requireLogin();
// The session token stops another site from sending questions in a signed-in user's name
requireCSRF();

// Read request payload
$input = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input');
    if (!empty($raw)) {
        $input = json_decode($raw, true) ?: [];
    }
}

// Only the server-configured key is used
$serverKey = (defined('GEMINI_API_KEY') && GEMINI_API_KEY !== 'your_gemini_api_key_here') ? GEMINI_API_KEY : getenv('GEMINI_API_KEY');
$apiKey = $serverKey;

if (empty($apiKey)) {
    jsonResponse([
        'success' => false,
        'code' => 'KEY_REQUIRED',
        'error' => 'Gemini API key is not configured. Please configure GEMINI_API_KEY in your server environment.'
    ], 400);
}

$action = $input['action'] ?? ($_GET['action'] ?? 'full_audit');
$userQuestion = trim($input['question'] ?? ($_GET['question'] ?? ''));

$schedText = "";
$roomsText = "";

// Attempt to read live database records; fallback gracefully if DB is offline
try {
    $db = getDB();

    // Fetch all current scheduled classes
    $stmtSched = $db->prepare("
        SELECT c.room_name_number, s.day_of_week, s.start_time, s.end_time, s.subject_code, s.section_name, u.first_name, u.last_name 
        FROM schedules s 
        JOIN classrooms c ON s.room_id = c.room_id 
        JOIN users u ON s.faculty_id = u.user_id
        WHERE s.term_id = COALESCE(NULLIF(?, 0), (SELECT term_id FROM school_terms WHERE is_active = 1 LIMIT 1))
        ORDER BY s.day_of_week, s.start_time
    ");
    // The term the person is working on, or the school's current term
    $stmtSched->execute([(int)($input['term_id'] ?? 0)]);
    $schedules = $stmtSched->fetchAll();

    foreach ($schedules as $sched) {
        $schedText .= "Room {$sched['room_name_number']} | Day: {$sched['day_of_week']} | Time: {$sched['start_time']}-{$sched['end_time']} | Subject: {$sched['subject_code']} | Section: {$sched['section_name']} | Faculty: {$sched['first_name']} {$sched['last_name']}\n";
    }

    // Fetch campus classroom inventory
    $stmtRooms = $db->query("SELECT room_name_number, room_type, capacity, floor_level FROM classrooms ORDER BY floor_level, room_name_number");
    $rooms = $stmtRooms->fetchAll();
    foreach ($rooms as $r) {
        $roomsText .= "Room {$r['room_name_number']} (Floor {$r['floor_level']}, Type: {$r['room_type']}, Capacity: {$r['capacity']})\n";
    }
} catch (\Throwable $dbErr) {
    // The AI still answers general questions if schedule data can't be read
}

// Strict system guardrail instruction: Only scheduling system domain
$systemGuardrail = "You are the STI College Classroom & Schedule AI Optimization Assistant for STI College Marikina.

CAMPUS ROOM DIRECTORY:
" . (!empty($roomsText) ? $roomsText : "15 Lecture Rooms (LR-101 to LR-306), 4 Computer Labs (CL-101 to CL-104), Kitchen Lab, Tourism Lab.") . "

CURRENT MASTER SCHEDULES:
" . (!empty($schedText) ? $schedText : "Schedules across BSCS, BSIT, BSTM, HRS and TEM college sections and IT-MAWD, CUART and TOPER senior high sections.") . "

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

$model = getenv('GEMINI_MODEL') ?: 'gemini-flash-lite-latest';
$url = "https://generativelanguage.googleapis.com/v1beta/models/" . $model . ":generateContent?key=" . urlencode($apiKey);

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($postData));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_TIMEOUT, 40);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
// PHP on Windows has no certificate list of its own, so it checks Google's certificate against Windows' list
if (PHP_OS_FAMILY === 'Windows') curl_setopt($ch, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);

// Try the backup model if the main one is retired, busy, or times out
if ($curlError || in_array($httpCode, [404, 429, 500, 503], true)) {
    $fallbackUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=" . urlencode($apiKey);
    $ch = curl_init($fallbackUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($postData));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 40);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    if (PHP_OS_FAMILY === 'Windows') curl_setopt($ch, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
}

if ($curlError) {
    error_log('Gemini connection failed: ' . $curlError);
    jsonResponse(['success' => false, 'error' => 'Could not reach the AI service. Please try again.'], 500);
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
