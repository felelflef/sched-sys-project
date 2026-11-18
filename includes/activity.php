<?php
/**
 * Change history. Each API marks the change a request is about to make; when the request
 * succeeds, jsonResponse records who made it as one plain sentence in activity_log.
 * Logging problems are only written to the error log, so they never change a reply.
 */

const ACTIVITY_TABLE_SQL = "CREATE TABLE IF NOT EXISTS activity_log (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_email VARCHAR(100) NOT NULL,
    user_name VARCHAR(101) NOT NULL,
    user_role VARCHAR(20) NOT NULL,
    category VARCHAR(20) NOT NULL,
    summary VARCHAR(500) NOT NULL,
    INDEX idx_activity_time (created_at)
)";

$GLOBALS['activity_pending'] = null;

/**
 * Notes the change this request will make. Names are looked up now, before a delete removes them,
 * and the user is noted now, since signing out clears the session.
 */
function expectActivity(?PDO $db, string $area, string $action, array $input = []): void {
    try {
        $described = describeActivity($db, "{$area}:{$action}", $input);
    } catch (\Throwable $e) {
        error_log('activity describe: ' . $e->getMessage());
        $described = null;
    }
    if (!$described) {
        $GLOBALS['activity_pending'] = null;
        return;
    }
    $GLOBALS['activity_pending'] = [
        'category' => $described[0],
        'summary' => $described[1],
        'email' => (string)($_SESSION['email'] ?? ''),
        'name' => trim(($_SESSION['first_name'] ?? '') . ' ' . ($_SESSION['last_name'] ?? '')),
        'role' => (string)($_SESSION['role'] ?? '')
    ];
}

/** Replaces the noted sentence with one only known during the change. An empty sentence means nothing changed. */
function setActivitySummary(string $summary): void {
    if ($GLOBALS['activity_pending']) {
        $GLOBALS['activity_pending']['summary'] = $summary;
    }
}

/** Called by jsonResponse for a successful reply. */
function recordPendingActivity(): void {
    $entry = $GLOBALS['activity_pending'];
    $GLOBALS['activity_pending'] = null;
    if (!$entry || $entry['summary'] === '' || $entry['email'] === '') {
        return;
    }
    $values = [
        mb_substr($entry['email'], 0, 100),
        mb_substr($entry['name'] !== '' ? $entry['name'] : $entry['email'], 0, 101),
        mb_substr($entry['role'], 0, 20),
        $entry['category'],
        mb_substr($entry['summary'], 0, 500)
    ];
    $sql = "INSERT INTO activity_log (user_email, user_name, user_role, category, summary) VALUES (?, ?, ?, ?, ?)";
    try {
        $db = getDB();
        try {
            $db->prepare($sql)->execute($values);
        } catch (\PDOException $e) {
            // The table may not exist yet on this database
            $db->exec(ACTIVITY_TABLE_SQL);
            $db->prepare($sql)->execute($values);
        }
    } catch (\Throwable $e) {
        error_log('activity record: ' . $e->getMessage());
    }
}

function activityLookup(?PDO $db, string $sql, array $params): string {
    if (!$db) return '';
    try {
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        return (string)($stmt->fetchColumn() ?: '');
    } catch (\Throwable $e) {
        return '';
    }
}

function activityTerm(?PDO $db, $termId): string {
    $label = activityLookup($db, "SELECT CONCAT(t.term_name, ' ', y.year_code) FROM school_terms t JOIN school_years y ON y.year_id = t.year_id WHERE t.term_id = ?", [(int)$termId]);
    return $label !== '' ? $label : 'a term';
}

function activityPerson(?PDO $db, $email): string {
    $name = activityLookup($db, "SELECT CONCAT(first_name, ' ', last_name) FROM users WHERE email = ?", [(string)$email]);
    return $name !== '' ? "{$name} ({$email})" : (string)$email;
}

// "Year 2" for college, "Grade 11" for SHS
function activityYearLevel($year): string {
    $n = (int)$year;
    return $n >= 11 ? "Grade {$n}" : "Year {$n}";
}

function activityCount(int $n, string $word): string {
    return $n . ' ' . $word . ($n === 1 ? '' : (str_ends_with($word, 's') ? 'es' : 's'));
}

/** Returns [category, sentence] for a change, or null for requests that aren't recorded. */
function describeActivity(?PDO $db, string $key, array $in): ?array {
    $text = fn($name) => trim((string)($in[$name] ?? ''));
    switch ($key) {
        // Signing in and out, and passwords
        case 'auth:login': return ['Sign-in', 'Signed in'];
        case 'auth:logout': return ['Sign-in', 'Signed out'];
        case 'auth:change_password': return ['Accounts', 'Changed their own password'];
        case 'auth:admin_reset_password': return ['Accounts', 'Reset the password of ' . activityPerson($db, $text('email'))];

        // Accounts
        case 'users:add': return ['Accounts', "Created a Faculty / Professor account for {$text('first_name')} {$text('last_name')} ({$text('email')})"];
        case 'users:edit_user': return ['Accounts', 'Updated the account of ' . activityPerson($db, $text('email'))];
        case 'users:delete':
        case 'users:delete_by_email':
            $email = $text('email') !== '' ? $text('email') : activityLookup($db, "SELECT email FROM users WHERE user_id = ?", [(int)($in['user_id'] ?? 0)]);
            return ['Accounts', 'Removed the account of ' . activityPerson($db, $email)];

        // Rooms
        case 'rooms:add': return ['Resources', "Added room {$text('room_name_number')} ({$text('room_type')}, " . (int)($in['capacity'] ?? 0) . ' seats)'];
        case 'rooms:edit': return ['Resources', "Updated room {$text('room_name_number')} ({$text('room_type')}, " . (int)($in['capacity'] ?? 0) . ' seats)'];
        case 'rooms:delete':
            $room = activityLookup($db, "SELECT room_name_number FROM classrooms WHERE room_id = ?", [(int)($in['room_id'] ?? 0)]);
            return ['Resources', 'Removed room ' . ($room !== '' ? $room : '#' . (int)($in['room_id'] ?? 0))];

        // Faculty, subjects and saved subject sets
        case 'schedules:save_faculty_qualifications':
            return ['Resources', 'Updated the FCC certificates of ' . activityPerson($db, $text('email')) . ' (' . activityCount(count((array)($in['cert_ids'] ?? [])), 'certificate') . ')'];
        case 'schedules:save_faculty_availability':
            return ['Resources', 'Updated the status, availability and max load of ' . activityPerson($db, $text('email')) . " ({$text('status')}, " . (isset($in['min_load']) ? (int)$in['min_load'] . '–' : '') . (int)($in['max_load'] ?? 0) . ' units' . (!empty($in['seasoned']) ? ', seasoned' : '') . ')'];
        case 'schedules:save_catalog_subject':
            $code = strtoupper($text('subject_code'));
            $exists = activityLookup($db, "SELECT subject_code FROM subject_catalog WHERE subject_code = ?", [$code]) !== '';
            return ['Resources', ($exists ? 'Updated' : 'Added') . " subject {$code} – {$text('subject_title')} " . ($exists ? 'in' : 'to') . ' the Subject Catalog'];
        case 'schedules:save_certificate':
            return ['Resources', ((int)($in['cert_id'] ?? 0) > 0 ? 'Updated' : 'Created') . " the FCC certificate \"{$text('cert_name')}\" (" . implode(', ', array_map('strval', (array)($in['areas'] ?? []))) . ')'];
        case 'schedules:delete_certificate':
            $cert = activityLookup($db, "SELECT cert_name FROM fcc_certificates WHERE cert_id = ?", [(int)($in['cert_id'] ?? 0)]);
            return ['Resources', 'Deleted the FCC certificate' . ($cert !== '' ? " \"{$cert}\"" : '')];

        case 'schedules:delete_catalog_subject': return ['Resources', 'Removed subject ' . strtoupper($text('subject_code')) . ' from the Subject Catalog'];
        case 'schedules:save_departments': return ['Resources', 'Updated the list of departments (' . activityCount(count((array)($in['departments'] ?? [])), 'department') . ')'];
        case 'schedules:save_subject_set':
            return ['Resources', ((int)($in['set_id'] ?? 0) > 0 ? 'Updated' : 'Created') . " the saved subject set \"{$text('set_name')}\" (" . activityCount(count((array)($in['items'] ?? [])), 'subject') . ')'];
        case 'schedules:delete_subject_set':
            $set = activityLookup($db, "SELECT set_name FROM subject_sets WHERE set_id = ?", [(int)($in['set_id'] ?? 0)]);
            return ['Resources', 'Removed the saved subject set' . ($set !== '' ? " \"{$set}\"" : '')];

        // Term setup
        case 'schedules:publish_state': return ['Setup', 'Published the scheduling data in their browser to the shared database'];
        case 'schedules:save_school_year':
            return ['Setup', ((int)($in['year_id'] ?? 0) > 0 ? 'Updated' : 'Added') . " school year {$text('year_code')}"];
        case 'schedules:set_active_year':
            return ['Setup', 'Made ' . (activityLookup($db, "SELECT year_code FROM school_years WHERE year_id = ?", [(int)($in['year_id'] ?? 0)]) ?: 'a school year') . ' the active school year'];
        case 'schedules:delete_school_year':
            return ['Setup', 'Deleted school year ' . (activityLookup($db, "SELECT year_code FROM school_years WHERE year_id = ?", [(int)($in['year_id'] ?? 0)]) ?: '#' . (int)($in['year_id'] ?? 0))];
        case 'schedules:save_term':
            $year = activityLookup($db, "SELECT year_code FROM school_years WHERE year_id = ?", [(int)($in['year_id'] ?? 0)]);
            return ['Setup', ((int)($in['term_id'] ?? 0) > 0 ? 'Updated' : 'Added') . " the term {$text('term_name')}" . ($year !== '' ? " for {$year}" : '')];
        case 'schedules:set_active_term': return ['Setup', 'Made ' . activityTerm($db, $in['term_id'] ?? 0) . ' the active term'];
        case 'schedules:delete_term': return ['Setup', 'Deleted the term ' . activityTerm($db, $in['term_id'] ?? 0)];
        case 'schedules:save_term_subject':
            $where = "{$text('program')} " . activityYearLevel($in['year_level'] ?? 1);
            return ['Setup', (int)($in['subject_id'] ?? 0) > 0
                ? "Updated subject {$text('subject_code')} – {$text('subject_name')} for {$where}"
                : "Added subject {$text('subject_code')} – {$text('subject_name')} to " . activityTerm($db, $in['term_id'] ?? 0) . " for {$where}"];
        case 'schedules:toggle_term_subject':
        case 'schedules:delete_term_subject':
            $id = (int)($in['subject_id'] ?? 0);
            $subjectLevel = activityLookup($db, "SELECT year_level FROM term_subjects WHERE subject_id = ?", [$id]);
            $subject = activityLookup($db, "SELECT CONCAT(subject_code, ' for ', program) FROM term_subjects WHERE subject_id = ?", [$id]);
            $subject = $subject !== '' ? "{$subject} " . activityYearLevel($subjectLevel) : 'a subject';
            $term = activityTerm($db, activityLookup($db, "SELECT term_id FROM term_subjects WHERE subject_id = ?", [$id]));
            if ($key === 'schedules:delete_term_subject') return ['Setup', "Removed {$subject} from {$term}"];
            $verb = !isset($in['is_included']) ? 'Changed whether' : (!empty($in['is_included']) ? 'Included' : 'Excluded');
            return ['Setup', $verb === 'Changed whether' ? "Changed whether {$subject} is included in {$term}" : "{$verb} {$subject} in {$term}"];
        case 'schedules:set_all_subjects_included':
            return ['Setup', (!empty($in['is_included']) ? 'Included ' : 'Excluded ') . activityCount(count((array)($in['subject_ids'] ?? [])), 'subject') . ' at once'];
        case 'schedules:add_term_subjects': return ['Setup', 'Loaded saved subjects into ' . activityTerm($db, $in['term_id'] ?? 0)];
        case 'schedules:save_section':
            return ['Setup', (int)($in['section_id'] ?? 0) > 0
                ? "Updated section {$text('section_code')} ({$text('program')} " . activityYearLevel($in['year_level'] ?? 1) . ', ' . (int)($in['student_count'] ?? 0) . ' students' . ($text('home_room') !== '' ? ", home room {$text('home_room')}" : '') . ')'
                : "Added section {$text('section_code')} to " . activityTerm($db, $in['term_id'] ?? 0)];
        case 'schedules:save_section_plan':
            $section = activityLookup($db, "SELECT section_code FROM academic_sections WHERE section_id = ?", [(int)($in['section_id'] ?? 0)]) ?: 'a section';
            return ['Schedule', "Updated the room and instructors of section {$section}" . ($text('home_room') !== '' ? " (room {$text('home_room')})" : '')];
        case 'schedules:split_section':
            $section = activityLookup($db, "SELECT section_code FROM academic_sections WHERE section_id = ?", [(int)($in['section_id'] ?? 0)]) ?: 'a section';
            return ['Setup', "Split section {$section}, moving " . activityCount((int)($in['split_student_count'] ?? 0), 'student') . " to new section {$text('new_section_code')}"];
        case 'schedules:auto_generate_sections':
            $programs = implode(', ', array_map('strval', (array)($in['programs'] ?? [])));
            $years = implode(', ', array_map('activityYearLevel', (array)($in['years'] ?? [])));
            return ['Setup', 'Created ' . activityCount((int)($in['sections_per_group'] ?? 0), 'section') . " each for {$programs} {$years} in " . activityTerm($db, $in['term_id'] ?? 0)];
        case 'schedules:delete_section':
            $id = (int)($in['section_id'] ?? 0);
            $section = activityLookup($db, "SELECT section_code FROM academic_sections WHERE section_id = ?", [$id]) ?: 'a section';
            return ['Setup', "Deleted section {$section} from " . activityTerm($db, activityLookup($db, "SELECT term_id FROM academic_sections WHERE section_id = ?", [$id]))];

        // The timetable
        case 'schedules:generate_baseline':
            $items = (array)($in['schedules'] ?? []);
            $byAi = count(array_filter($items, fn($c) => is_array($c) && !empty($c['aiPlaced']))) > 0;
            return ['Schedule', ($byAi ? 'Applied an AI-drafted schedule for ' : 'Generated the schedule for ') . activityTerm($db, $in['term_id'] ?? 0) . ' (' . activityCount(count($items), 'class') . ')'];
        case 'schedules:bulk_save_schedules': return ['Schedule', 'Saved timetable changes for ' . activityTerm($db, $in['term_id'] ?? 0)];
        case 'schedules:restore_schedule': return ['Schedule', 'Undid the last generate for ' . activityTerm($db, $in['term_id'] ?? 0)];
    }
    return null;
}

/**
 * Describes what a timetable save changed, comparing the saved classes with the new ones.
 * New rows are [term, room, faculty, subject, category, section, day, start, end, ai].
 */
function describeScheduleChanges(PDO $db, int $termId, array $rows): string {
    $find = $db->prepare("SELECT room_id, faculty_id, subject_code, section_name, day_of_week, start_time, end_time FROM schedules WHERE term_id = ? OR term_id IS NULL");
    $find->execute([$termId]);
    $old = [];
    foreach ($find->fetchAll() as $r) {
        $c = ['room' => (int)$r['room_id'], 'faculty' => (int)$r['faculty_id'], 'subject' => $r['subject_code'], 'section' => $r['section_name'], 'day' => $r['day_of_week'], 'start' => substr($r['start_time'], 0, 5), 'end' => substr($r['end_time'], 0, 5)];
        $old[implode('|', $c)] = $c;
    }
    $new = [];
    foreach ($rows as $r) {
        $c = ['room' => (int)$r[1], 'faculty' => (int)$r[2], 'subject' => $r[3], 'section' => $r[5], 'day' => $r[6], 'start' => substr((string)$r[7], 0, 5), 'end' => substr((string)$r[8], 0, 5)];
        $new[implode('|', $c)] = $c;
    }
    $added = array_values(array_diff_key($new, $old));
    $removed = array_values(array_diff_key($old, $new));
    if (!$added && !$removed) {
        return '';
    }

    $rooms = [];
    foreach ($db->query("SELECT room_id, room_name_number FROM classrooms")->fetchAll() as $r) $rooms[(int)$r['room_id']] = $r['room_name_number'];
    $people = [];
    foreach ($db->query("SELECT user_id, CONCAT(first_name, ' ', last_name) AS name FROM users")->fetchAll() as $r) $people[(int)$r['user_id']] = $r['name'];
    $when = fn($c) => "{$c['day']} " . date('g:i A', strtotime($c['start'])) . '–' . date('g:i A', strtotime($c['end'])) . ', ' . ($rooms[$c['room']] ?? 'a room') . ', ' . ($people[$c['faculty']] ?? 'a professor');
    $term = activityTerm($db, $termId);

    if (count($added) === 1 && count($removed) === 1 && $added[0]['subject'] === $removed[0]['subject'] && $added[0]['section'] === $removed[0]['section']) {
        return "Changed {$added[0]['subject']} for {$added[0]['section']} in {$term}: {$when($removed[0])} → {$when($added[0])}";
    }
    $parts = [];
    foreach ($added as $c) $parts[] = "added {$c['subject']} for {$c['section']} ({$when($c)})";
    foreach ($removed as $c) $parts[] = "removed {$c['subject']} for {$c['section']} ({$when($c)})";
    $shown = array_slice($parts, 0, 3);
    $more = count($parts) - count($shown);
    return "Edited the {$term} timetable: " . implode('; ', $shown) . ($more > 0 ? "; and {$more} more change" . ($more === 1 ? '' : 's') : '');
}
