<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

requireAnyRole(['admin', 'program-head']);
requireCSRF();

$apiKey = getenv('GEMINI_API_KEY') ?: '';
if ($apiKey === '') {
    jsonResponse(['success' => false, 'code' => 'KEY_REQUIRED', 'message' => 'The AI service is not configured. Set GEMINI_API_KEY on the server.'], 503);
}

// Gemini can take many seconds; don't hold the session and block this user's other requests
session_write_close();
set_time_limit(120); // Room for the main model and its backup to each reach their 45-second timeout

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$termId = (int)($input['term_id'] ?? 0);
$sectionCodes = is_array($input['section_codes'] ?? null) ? array_slice($input['section_codes'], 0, 12) : [];
$booked = is_array($input['booked'] ?? null) ? $input['booked'] : [];
$limits = is_array($input['limits'] ?? null) ? $input['limits'] : [];
$instructions = trim((string)($input['instructions'] ?? ''));

if (!$termId || !$sectionCodes) {
    jsonResponse(['success' => false, 'message' => 'A term and at least one section are required.'], 400);
}
requireFieldLengths(['Instructions' => [$instructions, 500]]);

$db = getDB();

$placeholders = implode(',', array_fill(0, count($sectionCodes), '?'));
try {
    $stmt = $db->prepare("SELECT section_code, program, year_level, student_count, shift, home_room FROM academic_sections WHERE term_id = ? AND section_code IN ($placeholders)");
    $stmt->execute(array_merge([$termId], array_map('strval', $sectionCodes)));
} catch (\Throwable $e) {
    // Before the home room column exists
    $stmt = $db->prepare("SELECT section_code, program, year_level, student_count, shift FROM academic_sections WHERE term_id = ? AND section_code IN ($placeholders)");
    $stmt->execute(array_merge([$termId], array_map('strval', $sectionCodes)));
}
$sections = $stmt->fetchAll();
if (!$sections) {
    jsonResponse(['success' => false, 'message' => 'None of those sections exist in this term.'], 400);
}

$stmt = $db->prepare("SELECT subject_code, subject_name, units, lecture_hours, lab_hours, subject_type, program, year_level FROM term_subjects WHERE term_id = ? AND is_included = 1");
$stmt->execute([$termId]);
$subjects = $stmt->fetchAll();

$rooms = $db->query("SELECT room_name_number, room_type, capacity, floor_level FROM classrooms ORDER BY floor_level, room_name_number")->fetchAll();

// Each teacher's subjects use the same rule as the save check: the areas their FCC certificates cover.
// Only subjects these sections need are listed, and only teachers set to teach this term's level.
$neededCodes = [];
foreach ($subjects as $subject) {
    foreach ($sections as $section) {
        if ($subject['program'] === $section['program'] && (int)$subject['year_level'] === (int)$section['year_level']) {
            $neededCodes[strtoupper($subject['subject_code'])] = $subject['subject_code'];
        }
    }
}
$qualifications = loadQualifications($db);
$termLevel = termSchoolLevel($db, $termId);
$teachers = [];
foreach ($db->query("
    SELECT user_id, email, CONCAT(first_name, ' ', last_name) AS name, employment_status, available_days, available_shifts, teaching_level, seasoned
    FROM users WHERE role IN ('faculty', 'program-head')
    ORDER BY email
")->fetchAll() as $row) {
    $level = $row['teaching_level'] ?: 'tertiary';
    if ($level !== 'mixed' && $level !== $termLevel) {
        continue;
    }
    $codes = array_values(array_intersect_key($neededCodes, $qualifications[(int)$row['user_id']] ?? []));
    if (!$codes) {
        continue;
    }
    $limited = $row['employment_status'] === 'Part-time' && $row['available_days'] !== '' && $row['available_shifts'] !== '';
    $teachers[$row['email']] = [
        'name' => $row['name'],
        'subjects' => $codes,
        'availability' => $limited ? " [only {$row['available_days']}, " . (preg_match('/^\d\d:\d\d-\d\d:\d\d$/', $row['available_shifts']) ? "hours {$row['available_shifts']}" : "shifts {$row['available_shifts']}") . "]" : '',
        'tags' => implode(', ', array_keys(array_filter(['part-time' => $row['employment_status'] === 'Part-time', 'seasoned' => !empty($row['seasoned'])]))),
    ];
}

// Short teacher IDs keep the response small; emails are never sent to the AI
$teacherNames = [];
$teacherLines = [];
foreach (array_values($teachers) as $index => $teacher) {
    $id = 'T' . ($index + 1);
    $teacherNames[$id] = $teacher['name'];
    $maxUnits = (int)($limits[$teacher['name']] ?? 30);
    $tags = $teacher['tags'] !== '' ? ", {$teacher['tags']}" : '';
    $teacherLines[] = "{$id} = {$teacher['name']} (max {$maxUnits} units{$tags}){$teacher['availability']}: " . implode(', ', $teacher['subjects']);
}
$teacherIds = array_flip($teacherNames);

$sectionLines = [];
foreach ($sections as $section) {
    $needs = [];
    foreach ($subjects as $subject) {
        if ($subject['program'] === $section['program'] && (int)$subject['year_level'] === (int)$section['year_level']) {
            // Lecture hours meet in a lecture room and lab hours in a lab, as separate meetings
            $lec = (float)$subject['lecture_hours'];
            $lab = (float)$subject['lab_hours'];
            if ($subject['subject_type'] === 'lab' && $lab <= 0) {
                [$lec, $lab] = [0.0, $lec ?: (float)($subject['units'] ?: 3)];
            } elseif ($lec + $lab <= 0) {
                $lec = (float)($subject['units'] ?: 3);
            }
            $parts = [];
            if ($lec > 0) $parts[] = "{$lec} hrs lecture room";
            if ($lab > 0) $parts[] = "{$lab} hrs lab";
            $needs[] = "{$subject['subject_code']} ({$subject['units']} units: " . implode(' + ', $parts) . ")";
        }
    }
    if ($needs) {
        $homeRoom = !empty($section['home_room']) ? ", home room {$section['home_room']}" : '';
        $sectionLines[] = "{$section['section_code']} ({$section['program']}, {$section['student_count']} students, {$section['shift']} shift{$homeRoom}): " . implode('; ', $needs);
    }
}
if (!$sectionLines) {
    jsonResponse(['success' => true, 'data' => ['classes' => []]]);
}

$roomLines = array_map(fn($r) => "{$r['room_name_number']} ({$r['room_type']}, {$r['capacity']} seats, floor {$r['floor_level']})", $rooms);

$bookedLines = [];
foreach ($booked as $b) {
    if (is_array($b)) {
        $teacherId = $teacherIds[$b['teacher'] ?? ''] ?? '?';
        $bookedLines[] = implode(' ', array_map('strval', [$b['day'] ?? '', $b['start'] ?? '', $b['end'] ?? '', $b['room'] ?? '', $teacherId]));
    }
}

$prompt = "Create a weekly class timetable.\n\n"
    . "SECTIONS AND REQUIRED SUBJECTS:\n" . implode("\n", $sectionLines) . "\n\n"
    . "ROOMS:\n" . implode("\n", $roomLines) . "\n\n"
    . "TEACHERS AND THE ONLY SUBJECTS EACH MAY TEACH:\n" . implode("\n", $teacherLines) . "\n\n"
    . "ALREADY BOOKED (day start end room teacher), never overlap these:\n" . ($bookedLines ? implode("\n", $bookedLines) : 'none') . "\n\n"
    . "RULES:\n"
    . "- Give every subject of every section its full weekly lecture and lab hours, in meetings of 1 to 4 hours on different days.\n"
    . "- Use only days Mon, Tue, Wed, Thu, Fri, Sat and times from 07:00 to 19:00 in 24-hour HH:MM format.\n"
    . "- A room, teacher or section can never be in two classes at overlapping times.\n"
    . "- A teacher may only be given subjects listed for them, and must stay within their maximum units. A subject's meetings carry its units in proportion to their hours.\n"
    . "- A teacher marked [only ...] may only teach on those days and within those hours (or shifts: AM is 07:00-13:00, MIDSHIFT is 10:00-16:00, PM is 13:00-19:00).\n"
    . "- The room must seat all the section's students. Lecture hours use Lecture rooms. Lab hours use CompLab rooms, except HRS and HTCUA use the Kitchen Lab and BSTM and HTTO use the Tourism Lab. A subject with both gets separate lecture and lab meetings, preferably with the same teacher.\n"
    . "- Keep each section mostly within its shift: AM is morning, MIDSHIFT is midday, PM is afternoon and evening.\n"
    . "- Keep each section in one room per room type as much as possible: use its home room when the room type fits, otherwise reuse the same room for its other classes.\n"
    . "- Give part-time teachers their classes first, since their available times are limited.\n"
    . "- When several teachers may teach a subject, prefer seasoned teachers, but keep loads balanced.\n"
    . "- Spread the classes of different sections across the suitable rooms and across the week.\n";

if ($instructions !== '') {
    $prompt .= "\nSCHEDULER'S PREFERENCES (follow them when they don't break a rule above):\n" . $instructions . "\n";
}

$payload = [
    'contents' => [['parts' => [['text' => $prompt]]]],
    'generationConfig' => [
        'temperature' => 0.2,
        'maxOutputTokens' => 8192,
        'responseMimeType' => 'application/json',
        'responseSchema' => [
            'type' => 'ARRAY',
            'items' => [
                'type' => 'OBJECT',
                'properties' => array_fill_keys(['section', 'subject', 'room', 'teacher', 'day', 'start', 'end'], ['type' => 'STRING']),
                'required' => ['section', 'subject', 'room', 'teacher', 'day', 'start', 'end'],
            ],
        ],
    ],
];

function callGemini(string $model, array $payload, string $apiKey): array {
    $ch = curl_init("https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'x-goog-api-key: ' . $apiKey],
        CURLOPT_TIMEOUT => 45,
        CURLOPT_CONNECTTIMEOUT => 10,
    ]);
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    return [$status, $error, is_string($body) ? json_decode($body, true) : null];
}

$model = getenv('GEMINI_MODEL') ?: 'gemini-flash-lite-latest';
[$status, $error, $result] = callGemini($model, $payload, $apiKey);
if ($error || in_array($status, [404, 429, 500, 503], true)) {
    [$status, $error, $result] = callGemini('gemini-3.5-flash', $payload, $apiKey);
}

if ($error || $status !== 200) {
    error_log('AI schedule failed: HTTP ' . $status . ' ' . $error . ' ' . ($result['error']['message'] ?? ''));
    jsonResponse(['success' => false, 'message' => 'The AI service could not create a draft right now.'], 502);
}

$candidate = $result['candidates'][0] ?? [];
$classes = json_decode($candidate['content']['parts'][0]['text'] ?? '', true);
if (!is_array($classes)) {
    error_log('AI schedule unusable response. Finish reason: ' . ($candidate['finishReason'] ?? 'unknown'));
    jsonResponse(['success' => false, 'message' => 'The AI returned an incomplete draft.'], 502);
}

// Hand back real teacher names; every class is still checked before it can be used
$draft = [];
foreach ($classes as $class) {
    if (is_array($class)) {
        $class['teacher'] = $teacherNames[$class['teacher'] ?? ''] ?? (string)($class['teacher'] ?? '');
        $draft[] = $class;
    }
}

jsonResponse(['success' => true, 'data' => ['classes' => $draft]]);
