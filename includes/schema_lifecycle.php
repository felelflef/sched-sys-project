<?php
// Creates and upgrades the database tables and adds the starting data (subject areas, catalog, certificates,
// subject sets). api/schedules.php loads this once per SCHEMA_VERSION, with its $db connection.
if (!isset($db) || !($db instanceof PDO)) { http_response_code(404); exit; }

try {
    $db->exec("
        CREATE TABLE IF NOT EXISTS school_years (
            year_id INT AUTO_INCREMENT PRIMARY KEY,
            year_code VARCHAR(50) NOT NULL,
            is_active TINYINT(1) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_year_code (year_code)
        );
        CREATE TABLE IF NOT EXISTS school_terms (
            term_id INT AUTO_INCREMENT PRIMARY KEY,
            year_id INT NOT NULL,
            term_name VARCHAR(30) NOT NULL,
            level VARCHAR(10) NOT NULL DEFAULT 'tertiary',
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            status ENUM('draft', 'active', 'closed') DEFAULT 'draft',
            is_active TINYINT(1) DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS term_subjects (
            subject_id INT AUTO_INCREMENT PRIMARY KEY,
            term_id INT NOT NULL,
            subject_code VARCHAR(20) NOT NULL,
            subject_name VARCHAR(100) NOT NULL,
            units INT NOT NULL DEFAULT 3,
            lecture_hours DECIMAL(4,1) NOT NULL DEFAULT 3.0,
            lab_hours DECIMAL(4,1) NOT NULL DEFAULT 0.0,
            subject_type ENUM('lecture', 'lab', 'pe', 'special') DEFAULT 'lecture',
            program VARCHAR(20) NOT NULL DEFAULT 'BSIT',
            year_level INT NOT NULL DEFAULT 1,
            curriculum VARCHAR(50) DEFAULT '2024 Revised',
            is_included TINYINT(1) DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS academic_sections (
            section_id INT AUTO_INCREMENT PRIMARY KEY,
            term_id INT NOT NULL,
            section_code VARCHAR(20) NOT NULL,
            section_name VARCHAR(50) NOT NULL,
            program VARCHAR(20) NOT NULL,
            year_level INT NOT NULL,
            student_count INT NOT NULL DEFAULT 35,
            adviser VARCHAR(100) DEFAULT NULL,
            shift VARCHAR(20) DEFAULT 'AM'
        );
    ");

    $db->exec("CREATE TABLE IF NOT EXISTS app_settings (setting_key VARCHAR(50) PRIMARY KEY, setting_value VARCHAR(255) NOT NULL)");
    $db->exec("CREATE TABLE IF NOT EXISTS departments (department_name VARCHAR(100) PRIMARY KEY)");
    $db->exec("CREATE TABLE IF NOT EXISTS subject_catalog (subject_code VARCHAR(20) PRIMARY KEY, subject_title VARCHAR(100) NOT NULL, department VARCHAR(100) NOT NULL, it_only TINYINT(1) DEFAULT 0, units INT NOT NULL DEFAULT 3)");
    $db->exec("CREATE TABLE IF NOT EXISTS faculty_qualifications (user_id INT NOT NULL, subject_code VARCHAR(20) NOT NULL, PRIMARY KEY (user_id, subject_code), FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE)");

    try { $db->exec("ALTER TABLE academic_sections ADD COLUMN shift VARCHAR(20) DEFAULT 'AM'"); } catch (Exception $e) {}

    // Seed school years if empty
    $checkSY = $db->query("SELECT COUNT(*) FROM school_years")->fetchColumn();
    if ($checkSY == 0) {
        $db->exec("
            INSERT INTO school_years (year_id, year_code, is_active) VALUES (1, 'AY 2026-2027', 1), (2, 'AY 2027-2028', 0);
            INSERT INTO school_terms (term_id, year_id, term_name, start_date, end_date, status, is_active) VALUES
            (1, 1, '1st Sem', '2026-08-17', '2026-12-18', 'active', 1),
            (2, 1, '2nd Sem', '2027-01-11', '2027-05-28', 'draft', 0),
            (3, 1, 'Summer',  '2027-06-07', '2027-07-23', 'draft', 0);
            INSERT INTO academic_sections (section_id, term_id, section_code, section_name, program, year_level, student_count, adviser) VALUES
            (1, 1, 'IT101M',  'BSIT 1A',  'BSIT',  1, 38, NULL),
            (2, 1, 'IT102M',  'BSIT 1B',  'BSIT',  1, 36, NULL),
            (3, 1, 'IT201M',  'BSIT 2A',  'BSIT',  2, 35, NULL),
            (4, 1, 'CS101M',  'BSCS 1A',  'BSCS',  1, 32, NULL),
            (5, 1, 'TM101M',  'BSTM 1A',  'BSTM',  1, 34, NULL),
            (6, 1, 'HRS101M', 'HRS 1A',   'HRS',   1, 35, NULL);
            INSERT INTO term_subjects (term_id, subject_code, subject_name, units, lecture_hours, lab_hours, subject_type, program, year_level, curriculum, is_included) VALUES
            (1, 'COMP 101', 'Introduction to Computing', 3, 2.0, 3.0, 'lecture', 'BSIT', 1, '2024 Revised', 1),
            (1, 'COMP 102', 'Computer Programming 1', 3, 2.0, 3.0, 'lecture', 'BSIT', 1, '2024 Revised', 1),
            (1, 'GE 1', 'Understanding the Self', 3, 3.0, 0.0, 'lecture', 'BSIT', 1, '2024 Revised', 1),
            (1, 'GE 5', 'Purposive Communication', 3, 3.0, 0.0, 'lecture', 'BSIT', 1, '2024 Revised', 1),
            (1, 'PATHFIT 1', 'Movement Competency Training', 2, 2.0, 0.0, 'pe', 'BSIT', 1, '2024 Revised', 1),
            (1, 'NSTP 1', 'National Service Training Program 1', 3, 3.0, 0.0, 'special', 'BSIT', 1, '2024 Revised', 1),
            (1, 'COMP 104', 'Data Structures and Algorithms', 3, 2.0, 3.0, 'lecture', 'BSIT', 2, '2024 Revised', 1),
            (1, 'IT 103', 'Networking 1', 3, 2.0, 3.0, 'lecture', 'BSIT', 2, '2024 Revised', 1),
            (1, 'COMP 101', 'Introduction to Computing', 3, 2.0, 3.0, 'lecture', 'BSCS', 1, '2024 Revised', 1),
            (1, 'CS 101', 'Discrete Structures 1', 3, 3.0, 0.0, 'lecture', 'BSCS', 1, '2024 Revised', 1),
            (1, 'THC 101', 'Macro Perspective of Tourism and Hospitality', 3, 3.0, 0.0, 'lecture', 'BSTM', 1, '2024 Revised', 1),
            (1, 'THC 104', 'Philippine Culture and Tourism Geography', 3, 3.0, 0.0, 'lecture', 'BSTM', 1, '2024 Revised', 1),
            (1, 'HRS 101', 'Cookery', 3, 1.0, 6.0, 'lab', 'HRS', 1, '2024 Revised', 1),
            (1, 'HRS 102', 'Food and Beverage Services', 3, 2.0, 3.0, 'lab', 'HRS', 1, '2024 Revised', 1);
        ");
    }

    $db->exec("CREATE TABLE IF NOT EXISTS schedule_snapshots (term_id INT PRIMARY KEY, saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, schedule_json MEDIUMTEXT NOT NULL)");
    if (!$db->query("SHOW COLUMNS FROM school_terms LIKE 'schedule_version'")->fetch()) {
        $db->exec("ALTER TABLE school_terms ADD COLUMN schedule_version INT NOT NULL DEFAULT 0");
    }
    // FCC certificates: each covers one or more subject areas (departments), and teachers can hold several
    $db->exec("CREATE TABLE IF NOT EXISTS fcc_certificates (cert_id INT AUTO_INCREMENT PRIMARY KEY, cert_name VARCHAR(60) NOT NULL UNIQUE, areas_json TEXT NOT NULL)");
    $db->exec("CREATE TABLE IF NOT EXISTS faculty_certificates (user_id INT NOT NULL, cert_id INT NOT NULL, PRIMARY KEY (user_id, cert_id), FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE, FOREIGN KEY (cert_id) REFERENCES fcc_certificates(cert_id) ON DELETE CASCADE)");
    // Tourism is a subject area of its own
    $db->exec("INSERT IGNORE INTO departments (department_name) VALUES ('Tourism')");
    // Start with one certificate per subject area, which the admin can rename, widen or delete
    if ((int)$db->query("SELECT COUNT(*) FROM fcc_certificates")->fetchColumn() === 0) {
        $seedCert = $db->prepare("INSERT IGNORE INTO fcc_certificates (cert_name, areas_json) VALUES (?, ?)");
        foreach ($db->query("SELECT department_name FROM departments ORDER BY department_name")->fetchAll(PDO::FETCH_COLUMN) as $dept) {
            $seedCert->execute([mb_substr("FCC - {$dept}", 0, 60), json_encode([$dept])]);
        }
    }
    // Single-subject Main Qualifications are replaced by FCC certificates. Once, each teacher gets the certificate for
    // every area their subjects belong to, creating "FCC - {area}" when no single-area certificate exists. A subject
    // missing from the catalog joins it under the teacher's department first. The old list is kept, unused.
    if (!$db->query("SELECT COUNT(*) FROM app_settings WHERE setting_key = 'quals_to_certificates'")->fetchColumn()) {
        $db->exec("INSERT IGNORE INTO subject_catalog (subject_code, subject_title, department, it_only, units)
            SELECT q.code, COALESCE(MAX(t.subject_name), q.code), MIN(d.department_name), MIN(d.department_name) = 'IT / CS', COALESCE(MAX(t.units), 3)
            FROM (SELECT DISTINCT q.user_id, UPPER(q.subject_code) AS code FROM faculty_qualifications q) q
            JOIN users u ON u.user_id = q.user_id
            JOIN departments d ON d.department_name = u.subject_role
            LEFT JOIN term_subjects t ON UPPER(t.subject_code) = q.code
            WHERE NOT EXISTS (SELECT 1 FROM subject_catalog c WHERE UPPER(c.subject_code) = q.code)
            GROUP BY q.code");
        $certForArea = [];
        foreach ($db->query("SELECT cert_id, cert_name, areas_json FROM fcc_certificates ORDER BY cert_id")->fetchAll() as $cert) {
            $areas = json_decode((string)$cert['areas_json'], true) ?: [];
            if (count($areas) === 1 && !isset($certForArea[$areas[0]])) $certForArea[$areas[0]] = (int)$cert['cert_id'];
        }
        $newCert = $db->prepare("INSERT INTO fcc_certificates (cert_name, areas_json) VALUES (?, ?)");
        $giveCert = $db->prepare("INSERT IGNORE INTO faculty_certificates (user_id, cert_id) VALUES (?, ?)");
        foreach ($db->query("SELECT DISTINCT q.user_id, c.department FROM faculty_qualifications q JOIN subject_catalog c ON UPPER(c.subject_code) = UPPER(q.subject_code)")->fetchAll() as $row) {
            $area = $row['department'];
            if (!isset($certForArea[$area])) {
                // A certificate named like that but covering other areas keeps its name; this one says which area it covers
                $name = mb_substr("FCC - {$area}", 0, 60);
                $taken = $db->prepare("SELECT COUNT(*) FROM fcc_certificates WHERE cert_name = ?");
                $taken->execute([$name]);
                if ((int)$taken->fetchColumn()) $name = mb_substr("FCC - {$area} only", 0, 60);
                $newCert->execute([$name, json_encode([$area])]);
                $certForArea[$area] = (int)$db->lastInsertId();
            }
            $giveCert->execute([(int)$row['user_id'], $certForArea[$area]]);
        }
        $db->exec("INSERT INTO app_settings (setting_key, setting_value) VALUES ('quals_to_certificates', '1')");
    }
    // Programs and subject areas follow STI's current offerings. Once: old areas are renamed in the catalog,
    // certificates and teacher departments; PE and NSTP subjects get their own area; every area gets an
    // "FCC - {area}" certificate; and the standard subjects are added to the catalog. Nothing is deleted.
    if (!$db->query("SELECT COUNT(*) FROM app_settings WHERE setting_key = 'areas_2026'")->fetchColumn()) {
        $areas = ['IT / Computing', 'Tourism', 'Hospitality & Culinary', 'Business & Entrepreneurship', 'Arts & Social Sciences', 'General Education', 'PE & NSTP'];
        $renames = ['IT / CS' => 'IT / Computing', 'IT' => 'IT / Computing', 'Engineering' => 'IT / Computing', 'Hospitality' => 'Hospitality & Culinary', 'Business Admin' => 'Business & Entrepreneurship'];
        $addDept = $db->prepare("INSERT IGNORE INTO departments (department_name) VALUES (?)");
        foreach ($areas as $area) $addDept->execute([$area]);
        foreach ($renames as $old => $new) {
            $db->prepare("UPDATE subject_catalog SET department = ? WHERE department = ?")->execute([$new, $old]);
            $db->prepare("UPDATE users SET subject_role = ? WHERE subject_role = ?")->execute([$new, $old]);
            $db->prepare("DELETE FROM departments WHERE department_name = ?")->execute([$old]);
        }
        $db->exec("UPDATE subject_catalog SET department = 'PE & NSTP' WHERE department = 'General Education'
            AND (UPPER(subject_code) LIKE 'PE %' OR UPPER(subject_code) LIKE 'PE%' OR UPPER(subject_code) LIKE 'NSTP%' OR UPPER(subject_code) LIKE 'PATHFIT%')");
        // Certificates take the new area names; "FCC - IT / CS" becomes "FCC - IT / Computing" when that name is free
        $nameTaken = $db->prepare("SELECT COUNT(*) FROM fcc_certificates WHERE cert_name = ? AND cert_id <> ?");
        $updCert = $db->prepare("UPDATE fcc_certificates SET cert_name = ?, areas_json = ? WHERE cert_id = ?");
        foreach ($db->query("SELECT cert_id, cert_name, areas_json FROM fcc_certificates ORDER BY cert_id")->fetchAll() as $cert) {
            $certAreas = array_values(array_unique(array_map(fn($a) => $renames[$a] ?? $a, json_decode((string)$cert['areas_json'], true) ?: [])));
            $name = $cert['cert_name'];
            if (preg_match('/^FCC - (.+)$/', $name, $m) && isset($renames[$m[1]])) {
                $candidate = mb_substr('FCC - ' . $renames[$m[1]], 0, 60);
                $nameTaken->execute([$candidate, (int)$cert['cert_id']]);
                if (!(int)$nameTaken->fetchColumn()) $name = $candidate;
            }
            $updCert->execute([$name, json_encode($certAreas), (int)$cert['cert_id']]);
        }
        // Two certificates now covering the same single area become one; holders keep their coverage
        $singles = [];
        foreach ($db->query("SELECT cert_id, cert_name, areas_json FROM fcc_certificates ORDER BY cert_id")->fetchAll() as $cert) {
            $certAreas = json_decode((string)$cert['areas_json'], true) ?: [];
            if (count($certAreas) === 1) $singles[$certAreas[0]][] = $cert;
        }
        $moveHolders = $db->prepare("INSERT IGNORE INTO faculty_certificates (user_id, cert_id) SELECT user_id, ? FROM faculty_certificates WHERE cert_id = ?");
        $dropCert = $db->prepare("DELETE FROM fcc_certificates WHERE cert_id = ?");
        $certForArea = [];
        foreach ($singles as $area => $list) {
            usort($list, fn($a, $b) => (($b['cert_name'] === "FCC - {$area}") <=> ($a['cert_name'] === "FCC - {$area}")) ?: ((int)$a['cert_id'] <=> (int)$b['cert_id']));
            $keep = (int)array_shift($list)['cert_id'];
            foreach ($list as $dup) {
                $moveHolders->execute([$keep, (int)$dup['cert_id']]);
                $dropCert->execute([(int)$dup['cert_id']]);
            }
            $certForArea[$area] = $keep;
        }
        $newCert = $db->prepare("INSERT INTO fcc_certificates (cert_name, areas_json) VALUES (?, ?)");
        foreach ($areas as $area) {
            if (isset($certForArea[$area])) continue;
            $name = mb_substr("FCC - {$area}", 0, 60);
            $nameTaken->execute([$name, 0]);
            if ((int)$nameTaken->fetchColumn()) $name = mb_substr("FCC - {$area} only", 0, 60);
            $newCert->execute([$name, json_encode([$area])]);
            $certForArea[$area] = (int)$db->lastInsertId();
        }
        // PE and NSTP moved out of General Education, so General Education holders also get the PE & NSTP certificate
        $giveCert = $db->prepare("INSERT IGNORE INTO faculty_certificates (user_id, cert_id) VALUES (?, ?)");
        foreach ($db->query("SELECT fc.user_id, c.areas_json FROM faculty_certificates fc JOIN fcc_certificates c ON c.cert_id = fc.cert_id")->fetchAll() as $held) {
            if (in_array('General Education', json_decode((string)$held['areas_json'], true) ?: [], true)) {
                $giveCert->execute([(int)$held['user_id'], $certForArea['PE & NSTP']]);
            }
        }
        // The standard subjects for STI's programs; a code already in the catalog is left as it is
        $addSubject = $db->prepare("INSERT IGNORE INTO subject_catalog (subject_code, subject_title, department, it_only, units) VALUES (?, ?, ?, 0, ?)");
        foreach ([
            ['GE 1', 'Understanding the Self', 'General Education', 3],
            ['GE 2', 'Readings in Philippine History', 'General Education', 3],
            ['GE 3', 'The Contemporary World', 'General Education', 3],
            ['GE 4', 'Mathematics in the Modern World', 'General Education', 3],
            ['GE 5', 'Purposive Communication', 'General Education', 3],
            ['GE 6', 'Art Appreciation', 'General Education', 3],
            ['GE 7', 'Science, Technology and Society', 'General Education', 3],
            ['GE 8', 'Ethics', 'General Education', 3],
            ['GE 9', 'Life and Works of Rizal', 'General Education', 3],
            ['PATHFIT 1', 'Movement Competency Training', 'PE & NSTP', 2],
            ['PATHFIT 2', 'Exercise-based Fitness Activities', 'PE & NSTP', 2],
            ['PATHFIT 3', 'Sports and Dance', 'PE & NSTP', 2],
            ['PATHFIT 4', 'Outdoor and Adventure Activities', 'PE & NSTP', 2],
            ['NSTP 1', 'National Service Training Program 1', 'PE & NSTP', 3],
            ['NSTP 2', 'National Service Training Program 2', 'PE & NSTP', 3],
            ['COMP 101', 'Introduction to Computing', 'IT / Computing', 3],
            ['COMP 102', 'Computer Programming 1', 'IT / Computing', 3],
            ['COMP 103', 'Computer Programming 2', 'IT / Computing', 3],
            ['COMP 104', 'Data Structures and Algorithms', 'IT / Computing', 3],
            ['COMP 105', 'Information Management', 'IT / Computing', 3],
            ['COMP 106', 'Applications Development and Emerging Technologies', 'IT / Computing', 3],
            ['IT 102', 'Human Computer Interaction', 'IT / Computing', 3],
            ['IT 103', 'Networking 1', 'IT / Computing', 3],
            ['IT 104', 'Networking 2', 'IT / Computing', 3],
            ['IT 105', 'Web Systems and Technologies', 'IT / Computing', 3],
            ['IT 106', 'Integrative Programming and Technologies', 'IT / Computing', 3],
            ['IT 107', 'Information Assurance and Security', 'IT / Computing', 3],
            ['IT 108', 'Systems Integration and Architecture', 'IT / Computing', 3],
            ['IT 109', 'Systems Administration and Maintenance', 'IT / Computing', 3],
            ['IT 110', 'Mobile Application Development', 'IT / Computing', 3],
            ['IT 111', 'Cloud Computing', 'IT / Computing', 3],
            ['IT 112', 'Capstone Project 1', 'IT / Computing', 3],
            ['IT 113', 'Capstone Project 2', 'IT / Computing', 3],
            ['CS 101', 'Discrete Structures 1', 'IT / Computing', 3],
            ['CS 102', 'Discrete Structures 2', 'IT / Computing', 3],
            ['CS 103', 'Object-Oriented Programming', 'IT / Computing', 3],
            ['CS 104', 'Algorithms and Complexity', 'IT / Computing', 3],
            ['CS 105', 'Automata Theory and Formal Languages', 'IT / Computing', 3],
            ['CS 106', 'Programming Languages', 'IT / Computing', 3],
            ['CS 107', 'Software Engineering 1', 'IT / Computing', 3],
            ['CS 108', 'Software Engineering 2', 'IT / Computing', 3],
            ['CS 109', 'Operating Systems', 'IT / Computing', 3],
            ['CS 110', 'Architecture and Organization', 'IT / Computing', 3],
            ['CS 111', 'Networks and Communications', 'IT / Computing', 3],
            ['CS 112', 'Machine Learning', 'IT / Computing', 3],
            ['CS 113', 'Data Science and Analytics', 'IT / Computing', 3],
            ['CS 114', 'Thesis 1', 'IT / Computing', 3],
            ['CS 115', 'Thesis 2', 'IT / Computing', 3],
            ['SCPT 101', 'Computer Systems Servicing', 'IT / Computing', 3],
            ['SCPT 102', 'Computer Programming (SHS) 1', 'IT / Computing', 3],
            ['SCPT 103', 'Computer Programming (SHS) 2', 'IT / Computing', 3],
            ['SCPT 104', 'Web Development', 'IT / Computing', 3],
            ['THC 101', 'Macro Perspective of Tourism and Hospitality', 'Tourism', 3],
            ['THC 102', 'Risk Management as Applied to Safety, Security and Sanitation', 'Tourism', 3],
            ['THC 103', 'Quality Service Management in Tourism and Hospitality', 'Tourism', 3],
            ['THC 104', 'Philippine Culture and Tourism Geography', 'Tourism', 3],
            ['THC 105', 'Micro Perspective of Tourism and Hospitality', 'Tourism', 3],
            ['THC 106', 'Tourism and Hospitality Marketing', 'Tourism', 3],
            ['THC 107', 'Legal Aspects in Tourism and Hospitality', 'Tourism', 3],
            ['THC 108', 'Multicultural Diversity in the Workplace', 'Tourism', 3],
            ['THC 109', 'Entrepreneurship in Tourism and Hospitality', 'Tourism', 3],
            ['TPC 101', 'Tour and Travel Management', 'Tourism', 3],
            ['TPC 102', 'Sustainable Tourism', 'Tourism', 3],
            ['TPC 103', 'Global Culture and Tourism Geography', 'Tourism', 3],
            ['TPC 104', 'Transportation Management', 'Tourism', 3],
            ['TPC 105', 'Tourism Policy Planning and Development', 'Tourism', 3],
            ['TPC 106', 'Applied Business Tools and Technologies (GDS)', 'Tourism', 3],
            ['TPC 107', 'Introduction to MICE', 'Tourism', 3],
            ['TPC 108', 'Airline Management and Operations', 'Tourism', 3],
            ['TPC 109', 'Research in Tourism', 'Tourism', 3],
            ['HTTO 101', 'Travel and Tour Services', 'Tourism', 3],
            ['HTTO 102', 'Local Guiding Services', 'Tourism', 3],
            ['HTTO 103', 'Front Office Services (SHS)', 'Tourism', 3],
            ['HTTO 104', 'Events Management', 'Tourism', 3],
            ['HRS 101', 'Cookery', 'Hospitality & Culinary', 3],
            ['HRS 102', 'Food and Beverage Services', 'Hospitality & Culinary', 3],
            ['HRS 103', 'Bread and Pastry Production', 'Hospitality & Culinary', 3],
            ['HRS 104', 'Housekeeping', 'Hospitality & Culinary', 3],
            ['HRS 105', 'Front Office Services', 'Hospitality & Culinary', 3],
            ['HRS 106', 'Customer Communication Services', 'Hospitality & Culinary', 3],
            ['HTCUA 101', 'Kitchen Safety and Sanitation', 'Hospitality & Culinary', 3],
            ['HTCUA 102', 'Culinary Cookery', 'Hospitality & Culinary', 3],
            ['HTCUA 103', 'Baking and Pastry', 'Hospitality & Culinary', 3],
            ['HTCUA 104', 'Food and Beverage Service (SHS)', 'Hospitality & Culinary', 3],
            ['BE 101', 'Fundamentals of Accountancy, Business and Management 1', 'Business & Entrepreneurship', 3],
            ['BE 102', 'Fundamentals of Accountancy, Business and Management 2', 'Business & Entrepreneurship', 3],
            ['BE 103', 'Business Finance', 'Business & Entrepreneurship', 3],
            ['BE 104', 'Principles of Marketing', 'Business & Entrepreneurship', 3],
            ['BE 105', 'Applied Economics', 'Business & Entrepreneurship', 3],
            ['BE 106', 'Business Ethics and Social Responsibility', 'Business & Entrepreneurship', 3],
            ['BE 107', 'Entrepreneurship', 'Business & Entrepreneurship', 3],
            ['ASSH 101', 'Creative Writing', 'Arts & Social Sciences', 3],
            ['ASSH 102', 'Malikhaing Pagsulat', 'Arts & Social Sciences', 3],
            ['ASSH 103', 'Introduction to the Philosophy of the Human Person', 'Arts & Social Sciences', 3],
            ['ASSH 104', 'Disciplines and Ideas in the Social Sciences', 'Arts & Social Sciences', 3],
            ['ASSH 105', 'Philippine Politics and Governance', 'Arts & Social Sciences', 3],
            ['ASSH 106', 'Community Engagement, Solidarity and Citizenship', 'Arts & Social Sciences', 3],
            ['ASSH 107', 'Trends, Networks and Critical Thinking', 'Arts & Social Sciences', 3],
            ['SHS 101', 'Effective Communication', 'General Education', 3],
            ['SHS 102', 'General Mathematics', 'General Education', 3],
            ['SHS 103', 'General Science', 'General Education', 3],
            ['SHS 104', 'Life and Career Skills', 'General Education', 3],
            ['SHS 105', 'Pag-aaral ng Kasaysayan at Lipunang Pilipino', 'General Education', 3],
            ['SHS 106', 'Physical Education and Health', 'PE & NSTP', 2]
        ] as [$code, $title, $area, $units]) {
            $addSubject->execute([$code, $title, $area, $units]);
        }
        $db->exec("INSERT INTO app_settings (setting_key, setting_value) VALUES ('areas_2026', '1')");
    }
    // Catalog subjects are for College, SHS or both. Once: the column is added (everything starts as both)
    // and the standard subjects get their usual level.
    if (!$db->query("SHOW COLUMNS FROM subject_catalog LIKE 'level'")->fetch()) {
        $db->exec("ALTER TABLE subject_catalog ADD COLUMN level VARCHAR(10) NOT NULL DEFAULT 'both'");
    }
    if (!$db->query("SELECT COUNT(*) FROM app_settings WHERE setting_key = 'catalog_levels'")->fetchColumn()) {
        $setLevel = $db->prepare("UPDATE subject_catalog SET level = ? WHERE subject_code = ? AND level = 'both'");
        foreach ([
            'GE 1' => 'tertiary',
            'GE 2' => 'tertiary',
            'GE 3' => 'tertiary',
            'GE 4' => 'tertiary',
            'GE 5' => 'tertiary',
            'GE 6' => 'tertiary',
            'GE 7' => 'tertiary',
            'GE 8' => 'tertiary',
            'GE 9' => 'tertiary',
            'PATHFIT 1' => 'tertiary',
            'PATHFIT 2' => 'tertiary',
            'PATHFIT 3' => 'tertiary',
            'PATHFIT 4' => 'tertiary',
            'NSTP 1' => 'tertiary',
            'NSTP 2' => 'tertiary',
            'COMP 101' => 'tertiary',
            'COMP 102' => 'tertiary',
            'COMP 103' => 'tertiary',
            'COMP 104' => 'tertiary',
            'COMP 105' => 'tertiary',
            'COMP 106' => 'tertiary',
            'IT 102' => 'tertiary',
            'IT 103' => 'tertiary',
            'IT 104' => 'tertiary',
            'IT 105' => 'tertiary',
            'IT 106' => 'tertiary',
            'IT 107' => 'tertiary',
            'IT 108' => 'tertiary',
            'IT 109' => 'tertiary',
            'IT 110' => 'tertiary',
            'IT 111' => 'tertiary',
            'IT 112' => 'tertiary',
            'IT 113' => 'tertiary',
            'CS 101' => 'tertiary',
            'CS 102' => 'tertiary',
            'CS 103' => 'tertiary',
            'CS 104' => 'tertiary',
            'CS 105' => 'tertiary',
            'CS 106' => 'tertiary',
            'CS 107' => 'tertiary',
            'CS 108' => 'tertiary',
            'CS 109' => 'tertiary',
            'CS 110' => 'tertiary',
            'CS 111' => 'tertiary',
            'CS 112' => 'tertiary',
            'CS 113' => 'tertiary',
            'CS 114' => 'tertiary',
            'CS 115' => 'tertiary',
            'SCPT 101' => 'shs',
            'SCPT 102' => 'shs',
            'SCPT 103' => 'shs',
            'SCPT 104' => 'shs',
            'THC 101' => 'tertiary',
            'THC 102' => 'tertiary',
            'THC 103' => 'tertiary',
            'THC 104' => 'tertiary',
            'THC 105' => 'tertiary',
            'THC 106' => 'tertiary',
            'THC 107' => 'tertiary',
            'THC 108' => 'tertiary',
            'THC 109' => 'tertiary',
            'TPC 101' => 'tertiary',
            'TPC 102' => 'tertiary',
            'TPC 103' => 'tertiary',
            'TPC 104' => 'tertiary',
            'TPC 105' => 'tertiary',
            'TPC 106' => 'tertiary',
            'TPC 107' => 'tertiary',
            'TPC 108' => 'tertiary',
            'TPC 109' => 'tertiary',
            'HTTO 101' => 'shs',
            'HTTO 102' => 'shs',
            'HTTO 103' => 'shs',
            'HTTO 104' => 'shs',
            'HRS 101' => 'tertiary',
            'HRS 102' => 'tertiary',
            'HRS 103' => 'tertiary',
            'HRS 104' => 'tertiary',
            'HRS 105' => 'tertiary',
            'HRS 106' => 'tertiary',
            'HTCUA 101' => 'shs',
            'HTCUA 102' => 'shs',
            'HTCUA 103' => 'shs',
            'HTCUA 104' => 'shs',
            'BE 101' => 'shs',
            'BE 102' => 'shs',
            'BE 103' => 'shs',
            'BE 104' => 'shs',
            'BE 105' => 'shs',
            'BE 106' => 'shs',
            'BE 107' => 'shs',
            'ASSH 101' => 'shs',
            'ASSH 102' => 'shs',
            'ASSH 103' => 'shs',
            'ASSH 104' => 'shs',
            'ASSH 105' => 'shs',
            'ASSH 106' => 'shs',
            'ASSH 107' => 'shs',
            'SHS 101' => 'shs',
            'SHS 102' => 'shs',
            'SHS 103' => 'shs',
            'SHS 104' => 'shs',
            'SHS 105' => 'shs',
            'SHS 106' => 'shs'
        ] as $code => $level) {
            $setLevel->execute([$level, $code]);
        }
        $db->exec("INSERT INTO app_settings (setting_key, setting_value) VALUES ('catalog_levels', '1')");
    }
    // How many of a subject's units are lab units; NULL for subjects saved before the split
    if (!$db->query("SHOW COLUMNS FROM term_subjects LIKE 'lab_units'")->fetch()) {
        $db->exec("ALTER TABLE term_subjects ADD COLUMN lab_units TINYINT DEFAULT NULL AFTER units");
    }
    // A section's preferred room, which the generator tries first for its classes
    if (!$db->query("SHOW COLUMNS FROM academic_sections LIKE 'home_room'")->fetch()) {
        $db->exec("ALTER TABLE academic_sections ADD COLUMN home_room VARCHAR(50) DEFAULT NULL");
    }
    // Rooms & Instructors: the instructor chosen for each of a section's subjects, as {"SUBJECT CODE": "email"}
    if (!$db->query("SHOW COLUMNS FROM academic_sections LIKE 'subject_teachers'")->fetch()) {
        $db->exec("ALTER TABLE academic_sections ADD COLUMN subject_teachers TEXT DEFAULT NULL");
    }
    // Each term is college (tertiary) or Senior High School, so one school year holds both kinds of terms.
    // Terms take the level their school year used to have.
    if (!$db->query("SHOW COLUMNS FROM school_terms LIKE 'level'")->fetch()) {
        $db->exec("ALTER TABLE school_terms ADD COLUMN level VARCHAR(10) NOT NULL DEFAULT 'tertiary' AFTER term_name");
        if ($db->query("SHOW COLUMNS FROM school_years LIKE 'level'")->fetch()) {
            $db->exec("UPDATE school_terms t JOIN school_years y ON y.year_id = t.year_id SET t.level = y.level");
        }
    }
    // A year code that existed once for college and once for SHS becomes one year: the terms move to the
    // older record, which stays active if either was, and the emptied copy is removed
    foreach ($db->query("SELECT year_code, MIN(year_id) AS keep_id, MAX(is_active) AS active FROM school_years GROUP BY year_code HAVING COUNT(*) > 1")->fetchAll() as $dup) {
        $db->prepare("UPDATE school_terms t JOIN school_years y ON y.year_id = t.year_id SET t.year_id = ? WHERE y.year_code = ? AND y.year_id <> ?")
            ->execute([(int)$dup['keep_id'], $dup['year_code'], (int)$dup['keep_id']]);
        $db->prepare("UPDATE school_years SET is_active = ? WHERE year_id = ?")->execute([(int)$dup['active'], (int)$dup['keep_id']]);
        $db->prepare("DELETE FROM school_years WHERE year_code = ? AND year_id <> ?")->execute([$dup['year_code'], (int)$dup['keep_id']]);
    }
    if ($db->query("SHOW INDEX FROM school_years WHERE Key_name = 'uniq_year_level'")->fetch()) {
        $db->exec("ALTER TABLE school_years DROP INDEX uniq_year_level");
    }
    if (!$db->query("SHOW INDEX FROM school_years WHERE Key_name IN ('uniq_year_code', 'year_code')")->fetch()) {
        $db->exec("ALTER TABLE school_years ADD UNIQUE KEY uniq_year_code (year_code)");
    }
    // Terms are named freely, such as "3rd Term", instead of a fixed list. This comes before the SHS terms are
    // added below: an old database only accepts 1st Sem, 2nd Sem and Summer, and would refuse "1st Term".
    $termNameColumn = $db->query("SHOW COLUMNS FROM school_terms LIKE 'term_name'")->fetch();
    if ($termNameColumn && stripos($termNameColumn['Type'], 'enum') === 0) {
        $db->exec("ALTER TABLE school_terms MODIFY COLUMN term_name VARCHAR(30) NOT NULL");
    }
    // Years made before terms had levels only have one level's terms. Once, each year missing a level gets
    // that level's standard terms (SHS 1st, 2nd, 3rd Term and Summer; College 1st Sem, 2nd Sem and Summer). It is recorded as
    // done, so terms deleted later on purpose don't come back.
    if (!$db->query("SELECT COUNT(*) FROM app_settings WHERE setting_key = 'term_levels_filled'")->fetchColumn()) {
        $standardTerms = [
            'shs' => [['1st Term', '0-08-16', '0-11-14'], ['2nd Term', '0-11-23', '1-02-26'], ['3rd Term', '1-03-08', '1-05-28'], ['Summer', '1-06-07', '1-07-23']],
            'tertiary' => [['1st Sem', '0-08-16', '0-12-17'], ['2nd Sem', '1-01-10', '1-05-26'], ['Summer', '1-06-07', '1-07-23']],
        ];
        $hasLevel = $db->prepare("SELECT COUNT(*) FROM school_terms WHERE year_id = ? AND level = ?");
        $addTerm = $db->prepare("INSERT INTO school_terms (year_id, term_name, level, start_date, end_date, status, is_active) VALUES (?, ?, ?, ?, ?, 'draft', 0)");
        // A date like "1-02-26" means 26 February of the year's second calendar year
        $dateIn = fn(int $startYear, string $spec) => ($startYear + (int)$spec[0]) . substr($spec, 1);
        foreach ($db->query("SELECT year_id, year_code FROM school_years")->fetchAll() as $year) {
            $startYear = preg_match('/(20\d{2})/', $year['year_code'], $m) ? (int)$m[1] : (int)date('Y');
            foreach ($standardTerms as $level => $list) {
                $hasLevel->execute([(int)$year['year_id'], $level]);
                if ((int)$hasLevel->fetchColumn() > 0) continue;
                foreach ($list as [$name, $start, $end]) {
                    $addTerm->execute([(int)$year['year_id'], $name, $level, $dateIn($startYear, $start), $dateIn($startYear, $end)]);
                }
            }
        }
        $db->exec("INSERT INTO app_settings (setting_key, setting_value) VALUES ('term_levels_filled', '1')");
    }
    if (!$db->query("SHOW COLUMNS FROM subject_catalog LIKE 'catalog_id'")->fetch()) {
        $db->exec("ALTER TABLE subject_catalog ADD COLUMN catalog_id INT NOT NULL AUTO_INCREMENT UNIQUE");
    }
    // Saved subject sets. The first time, each term's current subjects become a set.
    $db->exec("CREATE TABLE IF NOT EXISTS subject_sets (set_id INT AUTO_INCREMENT PRIMARY KEY, set_name VARCHAR(60) NOT NULL UNIQUE, items_json MEDIUMTEXT NOT NULL)");
    if (!(int)$db->query("SELECT COUNT(*) FROM subject_sets")->fetchColumn()) {
        $seed = [];
        $rows = $db->query("
            SELECT t.term_name, y.year_code, s.* FROM term_subjects s
            JOIN school_terms t ON t.term_id = s.term_id
            JOIN school_years y ON y.year_id = t.year_id
            ORDER BY y.year_id, t.term_id, s.program, s.year_level, s.subject_code
        ")->fetchAll();
        foreach ($rows as $r) {
            $seed[mb_substr("{$r['term_name']} {$r['year_code']}", 0, 60)][] = [
                'code' => $r['subject_code'], 'name' => $r['subject_name'], 'units' => (int)$r['units'],
                'lecHours' => (float)$r['lecture_hours'], 'labHours' => (float)$r['lab_hours'], 'type' => $r['subject_type'],
                'program' => $r['program'], 'year' => (int)$r['year_level']
            ];
        }
        $insSet = $db->prepare("INSERT IGNORE INTO subject_sets (set_name, items_json) VALUES (?, ?)");
        foreach ($seed as $name => $items) {
            $insSet->execute([$name, json_encode($items)]);
        }
    }
    $db->prepare("REPLACE INTO app_settings (setting_key, setting_value) VALUES ('schema_lifecycle', ?)")->execute([SCHEMA_VERSION]);
} catch (Exception $e) {
    // Non-fatal if DB permissions restrict DDL
}
