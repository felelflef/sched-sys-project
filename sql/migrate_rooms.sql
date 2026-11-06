-- ─────────────────────────────────────────────────────────────
-- Room list migration for an existing database
-- Converts the old rooms (Lab 1, Room 201, ...) to the 21 rooms
-- used by the frontend. All lecture rooms become 40 seats.
--
-- BACK UP THE DATABASE FIRST.
-- Room IDs are kept, so existing schedules stay linked.
-- 'Room 310' is removed, and any schedules, room requests and
-- session logs in that room are deleted with it.
-- Safe to run again: renamed rooms no longer match.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE classrooms
    MODIFY COLUMN room_type ENUM('Lecture', 'Lab', 'CompLab', 'Kitchen', 'Bar', 'Special') NOT NULL;

-- Computer labs
UPDATE classrooms SET room_name_number = 'CL-101', room_type = 'CompLab', capacity = 35, floor_level = 1 WHERE room_name_number = 'Lab 1';
UPDATE classrooms SET room_name_number = 'CL-102', room_type = 'CompLab', capacity = 35, floor_level = 1 WHERE room_name_number = 'Lab 2';
UPDATE classrooms SET room_name_number = 'CL-103', room_type = 'CompLab', capacity = 40, floor_level = 1 WHERE room_name_number = 'Lab 3';
UPDATE classrooms SET room_name_number = 'CL-104', room_type = 'CompLab', capacity = 30, floor_level = 1 WHERE room_name_number = 'Lab 4';

-- Specialized rooms
UPDATE classrooms SET room_name_number = 'Kitchen Lab', room_type = 'Special', capacity = 25, floor_level = 1 WHERE room_name_number = 'Kitchen';
UPDATE classrooms SET room_type = 'Special', capacity = 30, floor_level = 3 WHERE room_name_number = 'Tourism Lab';

-- Floor 1 lecture rooms (the frontend has no Bar, so its record becomes LR-101)
UPDATE classrooms SET room_name_number = 'LR-101', room_type = 'Lecture', capacity = 40, floor_level = 1 WHERE room_name_number = 'Bar';
UPDATE classrooms SET room_name_number = 'LR-102', room_type = 'Lecture', capacity = 40, floor_level = 1 WHERE room_name_number = 'Room 308';
UPDATE classrooms SET room_name_number = 'LR-103', room_type = 'Lecture', capacity = 40, floor_level = 1 WHERE room_name_number = 'Room 309';

-- Floor 2 lecture rooms
UPDATE classrooms SET room_name_number = 'LR-201', capacity = 40, floor_level = 2 WHERE room_name_number = 'Room 201';
UPDATE classrooms SET room_name_number = 'LR-202', capacity = 40, floor_level = 2 WHERE room_name_number = 'Room 202';
UPDATE classrooms SET room_name_number = 'LR-203', capacity = 40, floor_level = 2 WHERE room_name_number = 'Room 203';
UPDATE classrooms SET room_name_number = 'LR-204', capacity = 40, floor_level = 2 WHERE room_name_number = 'Room 204';
UPDATE classrooms SET room_name_number = 'LR-205', capacity = 40, floor_level = 2 WHERE room_name_number = 'Room 205';
UPDATE classrooms SET room_name_number = 'LR-206', capacity = 40, floor_level = 2 WHERE room_name_number = 'Room 307';

-- Floor 3 lecture rooms
UPDATE classrooms SET room_name_number = 'LR-301', capacity = 40, floor_level = 3 WHERE room_name_number = 'Room 301';
UPDATE classrooms SET room_name_number = 'LR-302', capacity = 40, floor_level = 3 WHERE room_name_number = 'Room 302';
UPDATE classrooms SET room_name_number = 'LR-303', capacity = 40, floor_level = 3 WHERE room_name_number = 'Room 303';
UPDATE classrooms SET room_name_number = 'LR-304', capacity = 40, floor_level = 3 WHERE room_name_number = 'Room 304';
UPDATE classrooms SET room_name_number = 'LR-305', capacity = 40, floor_level = 3 WHERE room_name_number = 'Room 305';
UPDATE classrooms SET room_name_number = 'LR-306', capacity = 40, floor_level = 3 WHERE room_name_number = 'Room 306';

-- The list has 21 rooms, so the 22nd old room is removed
DELETE FROM classrooms WHERE room_name_number = 'Room 310';

-- Check: this should return exactly 21 rooms
SELECT room_id, room_name_number, room_type, capacity, floor_level
FROM classrooms
ORDER BY floor_level, room_name_number;
