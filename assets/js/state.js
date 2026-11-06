/* ═══════════════════════════════════════════════════
   CENTRAL APPLICATION STATE & CATALOG DATA
   ═══════════════════════════════════════════════════ */

const VALID_USERS = {
  'admin@sti.edu':   { name: 'System Administrator', role: 'admin',         initials: 'SA' },
  'acah@sti.edu':    { name: 'Academic Head',        role: 'academic-head', initials: 'AH' },
  'proh@sti.edu':    { name: 'Program Head',         role: 'program-head',  initials: 'PH' },
  'faculty@sti.edu': { name: 'Faculty Member',       role: 'faculty',       initials: 'FM' },
};

let CURRENT_USER = null;

let ROOMS = [
  // Floor 1 (4 Computer Labs, 3 Lecture Rooms, 1 Culinary Kitchen Lab)
  { code: 'CL-101', floor: '1F', type: 'CompLab', cap: 35, util: 92, name: 'Computer Laboratory 1' },
  { code: 'CL-102', floor: '1F', type: 'CompLab', cap: 35, util: 88, name: 'Computer Laboratory 2' },
  { code: 'CL-103', floor: '1F', type: 'CompLab', cap: 40, util: 95, name: 'Computer Laboratory 3' },
  { code: 'CL-104', floor: '1F', type: 'CompLab', cap: 30, util: 84, name: 'Computer Laboratory 4' },
  { code: 'LR-101', floor: '1F', type: 'Lecture', cap: 40, util: 82, name: 'Lecture Room 101' },
  { code: 'LR-102', floor: '1F', type: 'Lecture', cap: 40, util: 76, name: 'Lecture Room 102' },
  { code: 'LR-103', floor: '1F', type: 'Lecture', cap: 40, util: 70, name: 'Lecture Room 103' },
  { code: 'Kitchen Lab', floor: '1F', type: 'Special', cap: 25, util: 70, name: 'Culinary Arts Kitchen Lab' },

  // Floor 2 (6 Lecture Rooms)
  { code: 'LR-201', floor: '2F', type: 'Lecture', cap: 40, util: 88, name: 'Lecture Room 201' },
  { code: 'LR-202', floor: '2F', type: 'Lecture', cap: 40, util: 82, name: 'Lecture Room 202' },
  { code: 'LR-203', floor: '2F', type: 'Lecture', cap: 40, util: 76, name: 'Lecture Room 203' },
  { code: 'LR-204', floor: '2F', type: 'Lecture', cap: 40, util: 91, name: 'Lecture Room 204' },
  { code: 'LR-205', floor: '2F', type: 'Lecture', cap: 40, util: 84, name: 'Lecture Room 205' },
  { code: 'LR-206', floor: '2F', type: 'Lecture', cap: 40, util: 68, name: 'Lecture Room 206' },

  // Floor 3 (6 Lecture Rooms, 1 Tourism Lab)
  { code: 'LR-301', floor: '3F', type: 'Lecture', cap: 40, util: 70, name: 'Lecture Room 301' },
  { code: 'LR-302', floor: '3F', type: 'Lecture', cap: 40, util: 65, name: 'Lecture Room 302' },
  { code: 'LR-303', floor: '3F', type: 'Lecture', cap: 40, util: 78, name: 'Lecture Room 303' },
  { code: 'LR-304', floor: '3F', type: 'Lecture', cap: 40, util: 72, name: 'Lecture Room 304' },
  { code: 'LR-305', floor: '3F', type: 'Lecture', cap: 40, util: 68, name: 'Lecture Room 305' },
  { code: 'LR-306', floor: '3F', type: 'Lecture', cap: 40, util: 62, name: 'Lecture Room 306' },
  { code: 'Tourism Lab', floor: '3F', type: 'Special', cap: 30, util: 68, name: 'Tourism & Hospitality Mock Center' }
];

let scheduleData = {};

let SUBJECTS = [
  { code: 'ITE 101', title: 'Introduction to Computing', dept: 'IT / CS', itOnly: true, units: 3 },
  { code: 'CC 103',  title: 'Computer Programming 1',    dept: 'IT / CS', itOnly: true, units: 3 },
  { code: 'ITE 301', title: 'Data Structures & Algorithms', dept: 'IT / CS', itOnly: true, units: 3 },
  { code: 'CS 201',  title: 'Discrete Mathematics',       dept: 'IT / CS', itOnly: true, units: 3 },
  { code: 'IM 101',  title: 'Database Management Systems', dept: 'IT / CS', itOnly: true, units: 3 },
  { code: 'ITE 202', title: 'Object-Oriented Programming', dept: 'IT / CS', itOnly: true, units: 3 },
  { code: 'CC 104',  title: 'Computer Programming 2',    dept: 'IT / CS', itOnly: true, units: 3 },
  { code: 'CS 301',  title: 'Operating Systems',          dept: 'IT / CS', itOnly: true, units: 3 },
  { code: 'IT 312',  title: 'Web Systems & Technologies', dept: 'IT / CS', itOnly: true, units: 3 },
  { code: 'ITE 401', title: 'Software Engineering',       dept: 'IT / CS', itOnly: true, units: 3 },
  { code: 'CS 401',  title: 'Automata Theory',            dept: 'IT / CS', itOnly: true, units: 3 },
  { code: 'GE 107',  title: 'Ethics',                     dept: 'General Education', itOnly: false, units: 3 },
  { code: 'GE 201',  title: 'Purposive Communication',    dept: 'General Education', itOnly: false, units: 3 },
  { code: 'PE 102',  title: 'Physical Fitness',           dept: 'General Education', itOnly: false, units: 2 },
  { code: 'NSTP 1',  title: 'National Service Training',  dept: 'General Education', itOnly: false, units: 3 },
  { code: 'BA 101',  title: 'Principles of Management',   dept: 'Business Admin', itOnly: false, units: 3 },
  { code: 'HM 201',  title: 'Food & Beverage Service',    dept: 'Hospitality', itOnly: false, units: 3 },
  { code: 'TM 301',  title: 'Tourism Planning',           dept: 'Hospitality', itOnly: false, units: 3 }
];

let DEPARTMENTS = ['IT / CS', 'Engineering', 'Hospitality', 'Business Admin', 'General Education'];

let FACULTY = [
  { name: 'Academic Head', email: 'acah@sti.edu', dept: 'IT / CS', status: 'Full-time', load: 18, maxLoad: 24, mainQuals: ['ITE 101','CC 103','ITE 301','ITE 202'], bg: '#25447A' },
  { name: 'Program Head', email: 'proh@sti.edu', dept: 'IT / CS', status: 'Full-time', load: 18, maxLoad: 24, mainQuals: ['CS 201','CS 301','CS 401','CC 104'], bg: '#2E7D5B' },
  { name: 'Faculty Member', email: 'faculty@sti.edu', dept: 'IT / CS', status: 'Full-time', load: 15, maxLoad: 24, mainQuals: ['ITE 101','IM 101','IT 312','ITE 401'], bg: '#6C3483' },
  { name: 'Prof. GenEd Instructor', email: 'gened@sti.edu', dept: 'General Education', status: 'Full-time', load: 16, maxLoad: 24, mainQuals: ['GE 107','GE 201','PE 102','NSTP 1','GE 102','PE 104','NSTP 2'], bg: '#0D9488' },
  { name: 'Chef Hospitality Faculty', email: 'hospitality@sti.edu', dept: 'Hospitality', status: 'Full-time', load: 15, maxLoad: 24, mainQuals: ['HM 201','TM 301','HM 202','TM 302'], bg: '#D97706' },
  { name: 'Prof. Business Faculty', email: 'business@sti.edu', dept: 'Business Admin', status: 'Full-time', load: 15, maxLoad: 24, mainQuals: ['BA 101','BA 102'], bg: '#2563EB' },
  { name: 'Engr. Faculty Member', email: 'engr@sti.edu', dept: 'Engineering', status: 'Full-time', load: 15, maxLoad: 24, mainQuals: ['CC 103','CC 104','CS 201'], bg: '#4B5563' }
];

// A teacher may only teach subjects in their main qualifications
function isFacultyQualified(fac, subjectCode) {
  const target = (subjectCode || '').trim().toUpperCase();
  return (fac?.mainQuals || []).some(q => q.trim().toUpperCase() === target);
}

let USERS = [
  { name: 'System Administrator', email: 'admin@sti.edu', role: 'admin', roleLabel: 'System Admin', lastActive: 'Just now', status: 'Online', employmentType: 'Full-time' },
  { name: 'Academic Head', email: 'acah@sti.edu', role: 'academic-head', roleLabel: 'Academic Head', lastActive: '5 min ago', status: 'Online', employmentType: 'Full-time' },
  { name: 'Program Head', email: 'proh@sti.edu', role: 'program-head', roleLabel: 'Program Head', lastActive: '10 min ago', status: 'Online', employmentType: 'Full-time' },
  { name: 'Faculty Member', email: 'faculty@sti.edu', role: 'faculty', roleLabel: 'Faculty Member', lastActive: '15 min ago', status: 'Online', employmentType: 'Full-time' },
  { name: 'Prof. GenEd Instructor', email: 'gened@sti.edu', role: 'faculty', roleLabel: 'Faculty Member', lastActive: '20 min ago', status: 'Online', employmentType: 'Full-time' },
  { name: 'Chef Hospitality Faculty', email: 'hospitality@sti.edu', role: 'faculty', roleLabel: 'Faculty Member', lastActive: '25 min ago', status: 'Online', employmentType: 'Full-time' },
  { name: 'Prof. Business Faculty', email: 'business@sti.edu', role: 'faculty', roleLabel: 'Faculty Member', lastActive: '30 min ago', status: 'Online', employmentType: 'Full-time' },
  { name: 'Engr. Faculty Member', email: 'engr@sti.edu', role: 'faculty', roleLabel: 'Faculty Member', lastActive: '35 min ago', status: 'Online', employmentType: 'Full-time' }
];

const DAYS_ABBR = ['M','T','W','Th','F','S'];
const TIME_SLOTS = ['7:00–8:30','8:30–10:00','10:00–11:30','11:30–1:00','1:00–2:30','2:30–4:00','4:00–5:30','5:30–7:00'];

const MODULE_TITLES = {
  schedule: { title: 'Interactive Schedule Management Dashboard', sub: '1st Semester AY 2026–2027 · 9 sections across 21 rooms' },
  minimap:  { title: 'AI Integrated Campus Map & Utilization', sub: 'Real-time room availability across 3 floors' },
  rooms:    { title: 'Room Information', sub: '15 lecture rooms · 4 computer labs · 2 specialized labs' },
  faculty:  { title: 'Faculty & Resource Profiling', sub: 'Time availability, teaching loads & MAQ certifications' },
  subjects: { title: 'Subject Catalog & Specialization', sub: 'Course codes, department specialization & teaching eligibility' },
  ai:       { title: 'AI Space & Schedule Optimization', sub: 'Powered by Google Gemini API · Automated room utilization and timetable analytics' },
  users:    { title: 'User Management & Security', sub: 'Role-based access control & audit trail' },
};

/* ═══════════════════════════════════════════════════
   ACADEMIC SCHEDULING LIFECYCLE STATE (STEPS 1 – 6)
   ═══════════════════════════════════════════════════ */

let ACTIVE_SCHEDULE_STEP = 6; // Default to step 6 (Timetable & Master Schedule)
let CURRENT_TIMETABLE_VIEW = 'section'; // 'section' | 'room' | 'teacher'
let TIMETABLE_STYLE = 'spreadsheet'; // 'spreadsheet' | 'plain-print'

// 1. School Years
let SCHOOL_YEARS = [
  { id: 1, yearCode: 'AY 2026-2027', isActive: true,  created: '2026-06-01' },
  { id: 2, yearCode: 'AY 2027-2028', isActive: false, created: '2026-10-15' }
];

// 2. School Terms
let SCHOOL_TERMS = [
  // AY 2026-2027
  { id: 1, yearId: 1, termName: '1st Sem', startDate: '2026-08-17', endDate: '2026-12-18', status: 'active', isActive: true },
  { id: 2, yearId: 1, termName: '2nd Sem', startDate: '2027-01-11', endDate: '2027-05-28', status: 'draft',  isActive: false },
  { id: 3, yearId: 1, termName: 'Summer',  startDate: '2027-06-07', endDate: '2027-07-23', status: 'draft',  isActive: false },
  // AY 2027-2028
  { id: 4, yearId: 2, termName: '1st Sem', startDate: '2027-08-16', endDate: '2027-12-17', status: 'draft',  isActive: false },
  { id: 5, yearId: 2, termName: '2nd Sem', startDate: '2028-01-10', endDate: '2028-05-26', status: 'draft',  isActive: false },
  { id: 6, yearId: 2, termName: 'Summer',  startDate: '2028-06-05', endDate: '2028-07-21', status: 'draft',  isActive: false }
];

// 3. Curriculum Subjects (Term Subjects)
let CURRICULUM_SUBJECTS = [
  // ─── 1st Semester Offerings ───
  // BSIT Year 1
  { id: 1, termId: 1, termName: '1st Sem', code: 'ITE 101', name: 'Introduction to Computing', units: 3, lecHours: 2.0, labHours: 3.0, type: 'lecture', program: 'BSIT', year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 2, termId: 1, termName: '1st Sem', code: 'CC 103',  name: 'Computer Programming 1',    units: 3, lecHours: 2.0, labHours: 3.0, type: 'lecture', program: 'BSIT', year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 3, termId: 1, termName: '1st Sem', code: 'GE 107',  name: 'Ethics',                     units: 3, lecHours: 3.0, labHours: 0.0, type: 'lecture', program: 'BSIT', year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 4, termId: 1, termName: '1st Sem', code: 'GE 201',  name: 'Purposive Communication',    units: 3, lecHours: 3.0, labHours: 0.0, type: 'lecture', program: 'BSIT', year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 5, termId: 1, termName: '1st Sem', code: 'PE 102',  name: 'Physical Fitness',           units: 2, lecHours: 2.0, labHours: 0.0, type: 'pe',      program: 'BSIT', year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 6, termId: 1, termName: '1st Sem', code: 'NSTP 1',  name: 'National Service Training',  units: 3, lecHours: 3.0, labHours: 0.0, type: 'special', program: 'BSIT', year: 1, curriculum: '2024 Revised', isIncluded: true },
  // BSIT Year 2
  { id: 7, termId: 1, termName: '1st Sem', code: 'ITE 301', name: 'Data Structures & Algorithms', units: 3, lecHours: 2.0, labHours: 3.0, type: 'lecture', program: 'BSIT', year: 2, curriculum: '2024 Revised', isIncluded: true },
  { id: 8, termId: 1, termName: '1st Sem', code: 'IM 101',  name: 'Database Management Systems', units: 3, lecHours: 2.0, labHours: 3.0, type: 'lecture', program: 'BSIT', year: 2, curriculum: '2024 Revised', isIncluded: true },
  { id: 9, termId: 1, termName: '1st Sem', code: 'ITE 202', name: 'Object-Oriented Programming', units: 3, lecHours: 2.0, labHours: 3.0, type: 'lecture', program: 'BSIT', year: 2, curriculum: '2024 Revised', isIncluded: true },
  // BSCS Year 1
  { id: 10, termId: 1, termName: '1st Sem', code: 'CS 201', name: 'Discrete Mathematics',       units: 3, lecHours: 3.0, labHours: 0.0, type: 'lecture', program: 'BSCS', year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 11, termId: 1, termName: '1st Sem', code: 'CC 103', name: 'Computer Programming 1',    units: 3, lecHours: 2.0, labHours: 3.0, type: 'lecture', program: 'BSCS', year: 1, curriculum: '2024 Revised', isIncluded: true },
  // BSCpE Year 1
  { id: 12, termId: 1, termName: '1st Sem', code: 'CC 103', name: 'Computer Programming 1',    units: 3, lecHours: 2.0, labHours: 3.0, type: 'lecture', program: 'BSCpE', year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 13, termId: 1, termName: '1st Sem', code: 'GE 201', name: 'Purposive Communication',    units: 3, lecHours: 3.0, labHours: 0.0, type: 'lecture', program: 'BSCpE', year: 1, curriculum: '2024 Revised', isIncluded: true },
  // BSHM Year 1
  { id: 14, termId: 1, termName: '1st Sem', code: 'HM 201', name: 'Food & Beverage Service',    units: 3, lecHours: 1.0, labHours: 4.0, type: 'special', program: 'BSHM', year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 15, termId: 1, termName: '1st Sem', code: 'GE 107', name: 'Ethics',                     units: 3, lecHours: 3.0, labHours: 0.0, type: 'lecture', program: 'BSHM', year: 1, curriculum: '2024 Revised', isIncluded: true },
  // BSTM Year 1
  { id: 16, termId: 1, termName: '1st Sem', code: 'TM 301', name: 'Tourism Planning',           units: 3, lecHours: 3.0, labHours: 0.0, type: 'lecture', program: 'BSTM', year: 1, curriculum: '2024 Revised', isIncluded: true },
  // BSBA Year 1
  { id: 17, termId: 1, termName: '1st Sem', code: 'BA 101', name: 'Principles of Management',   units: 3, lecHours: 3.0, labHours: 0.0, type: 'lecture', program: 'BSBA', year: 1, curriculum: '2024 Revised', isIncluded: true },

  // ─── 2nd Semester Offerings ───
  { id: 18, termId: 2, termName: '2nd Sem', code: 'CC 104',  name: 'Computer Programming 2',    units: 3, lecHours: 2.0, labHours: 3.0, type: 'lecture', program: 'BSIT', year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 19, termId: 2, termName: '2nd Sem', code: 'CS 301',  name: 'Operating Systems',          units: 3, lecHours: 2.0, labHours: 3.0, type: 'lecture', program: 'BSIT', year: 2, curriculum: '2024 Revised', isIncluded: true },
  { id: 20, termId: 2, termName: '2nd Sem', code: 'IT 312',  name: 'Web Systems & Technologies', units: 3, lecHours: 2.0, labHours: 3.0, type: 'lecture', program: 'BSIT', year: 2, curriculum: '2024 Revised', isIncluded: true },
  { id: 21, termId: 2, termName: '2nd Sem', code: 'GE 102',  name: 'Readings in PH History',     units: 3, lecHours: 3.0, labHours: 0.0, type: 'lecture', program: 'BSIT', year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 22, termId: 2, termName: '2nd Sem', code: 'PE 104',  name: 'Team Sports',                units: 2, lecHours: 2.0, labHours: 0.0, type: 'pe',      program: 'BSIT', year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 23, termId: 2, termName: '2nd Sem', code: 'NSTP 2',  name: 'National Service Training 2', units: 3, lecHours: 3.0, labHours: 0.0, type: 'special', program: 'BSIT', year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 24, termId: 2, termName: '2nd Sem', code: 'HM 202',  name: 'Bar Operations',            units: 3, lecHours: 1.0, labHours: 4.0, type: 'special', program: 'BSHM', year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 25, termId: 2, termName: '2nd Sem', code: 'TM 302',  name: 'Sustainable Tourism',        units: 3, lecHours: 3.0, labHours: 0.0, type: 'lecture', program: 'BSTM', year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 26, termId: 2, termName: '2nd Sem', code: 'BA 102',  name: 'Business Finance',           units: 3, lecHours: 3.0, labHours: 0.0, type: 'lecture', program: 'BSBA', year: 1, curriculum: '2024 Revised', isIncluded: true },

  // ─── Summer Offerings ───
  { id: 27, termId: 3, termName: 'Summer',  code: 'ITE 401', name: 'Software Engineering',       units: 3, lecHours: 3.0, labHours: 0.0, type: 'lecture', program: 'BSIT', year: 2, curriculum: '2024 Revised', isIncluded: true },
  { id: 28, termId: 3, termName: 'Summer',  code: 'CS 401',  name: 'Automata Theory',            units: 3, lecHours: 3.0, labHours: 0.0, type: 'lecture', program: 'BSCS', year: 1, curriculum: '2024 Revised', isIncluded: true }
];

// 5. Academic Sections
let ACADEMIC_SECTIONS = [
  // AY 2026-2027 (Term 1 - 1st Sem)
  { id: 1, termId: 1, code: 'IT701M',  name: 'BSIT 1A',  program: 'BSIT',  year: 1, studentCount: 38, shift: 'AM', adviser: 'Prof. Academic Head' },
  { id: 2, termId: 1, code: 'IT702M',  name: 'BSIT 1B',  program: 'BSIT',  year: 1, studentCount: 36, shift: 'AM', adviser: 'Prof. Faculty Member' },
  { id: 3, termId: 1, code: 'IT801M',  name: 'BSIT 2A',  program: 'BSIT',  year: 2, studentCount: 35, shift: 'AM', adviser: 'Prof. Program Head' },
  { id: 4, termId: 1, code: 'IT802M',  name: 'BSIT 2B',  program: 'BSIT',  year: 2, studentCount: 34, shift: 'AM', adviser: 'Prof. Faculty Member' },
  { id: 5, termId: 1, code: 'CS701M',  name: 'BSCS 1A',  program: 'BSCS',  year: 1, studentCount: 32, shift: 'AM', adviser: 'Prof. Program Head' },
  { id: 6, termId: 1, code: 'CPE701M', name: 'BSCpE 1A', program: 'BSCpE', year: 1, studentCount: 30, shift: 'AM', adviser: 'Engr. Faculty Member' },
  { id: 7, termId: 1, code: 'HM701M',  name: 'BSHM 1A',  program: 'BSHM',  year: 1, studentCount: 40, shift: 'AM', adviser: 'Chef Faculty Member' },
  { id: 8, termId: 1, code: 'TM701M',  name: 'BSTM 1A',  program: 'BSTM',  year: 1, studentCount: 34, shift: 'AM', adviser: 'Prof. Academic Head' },
  { id: 9, termId: 1, code: 'BA701M',  name: 'BSBA 1A',  program: 'BSBA',  year: 1, studentCount: 35, shift: 'AM', adviser: 'Prof. Academic Head' },
  // AY 2027-2028 (Term 4 - 1st Sem)
  { id: 10, termId: 4, code: 'IT701M',  name: 'BSIT 1A',  program: 'BSIT',  year: 1, studentCount: 38, shift: 'AM', adviser: 'Prof. Academic Head' },
  { id: 11, termId: 4, code: 'IT702M',  name: 'BSIT 1B',  program: 'BSIT',  year: 1, studentCount: 36, shift: 'AM', adviser: 'Prof. Faculty Member' },
  { id: 12, termId: 4, code: 'IT801M',  name: 'BSIT 2A',  program: 'BSIT',  year: 2, studentCount: 35, shift: 'AM', adviser: 'Prof. Program Head' },
  { id: 13, termId: 4, code: 'IT802M',  name: 'BSIT 2B',  program: 'BSIT',  year: 2, studentCount: 34, shift: 'AM', adviser: 'Prof. Faculty Member' },
  { id: 14, termId: 4, code: 'CS701M',  name: 'BSCS 1A',  program: 'BSCS',  year: 1, studentCount: 32, shift: 'AM', adviser: 'Prof. Program Head' },
  { id: 15, termId: 4, code: 'CPE701M', name: 'BSCpE 1A', program: 'BSCpE', year: 1, studentCount: 30, shift: 'AM', adviser: 'Engr. Faculty Member' },
  { id: 16, termId: 4, code: 'HM701M',  name: 'BSHM 1A',  program: 'BSHM',  year: 1, studentCount: 40, shift: 'AM', adviser: 'Chef Faculty Member' },
  { id: 17, termId: 4, code: 'TM701M',  name: 'BSTM 1A',  program: 'BSTM',  year: 1, studentCount: 34, shift: 'AM', adviser: 'Prof. Academic Head' },
  { id: 18, termId: 4, code: 'BA701M',  name: 'BSBA 1A',  program: 'BSBA',  year: 1, studentCount: 35, shift: 'AM', adviser: 'Prof. Academic Head' }
];

// Unassigned Classes Diagnostics
let UNASSIGNED_CLASSES = [];

/* ─── LocalStorage Synchronization Helpers ─── */
function loadStateFromStorage() {
  try {
    const storedUser = localStorage.getItem('sti_auth_user');
    if (storedUser) {
      try {
        const u = JSON.parse(storedUser);
        if (u && u.email) CURRENT_USER = u;
      } catch (e) {}
    }

    const storedRooms = JSON.parse(localStorage.getItem('sti_rooms') || 'null');
    if (Array.isArray(storedRooms) && storedRooms.length > 0) ROOMS = storedRooms;

    const sy = localStorage.getItem('sti_school_years');
    if (sy) SCHOOL_YEARS = JSON.parse(sy);

    const st = localStorage.getItem('sti_school_terms');
    if (st) SCHOOL_TERMS = JSON.parse(st);

    const cs = localStorage.getItem('sti_curriculum_subjects');
    if (cs) CURRICULUM_SUBJECTS = JSON.parse(cs);

    const as = localStorage.getItem('sti_academic_sections');
    if (as) {
      ACADEMIC_SECTIONS = JSON.parse(as);
      ACADEMIC_SECTIONS.forEach(s => {
        if (!s.termId) s.termId = 1;
        if (!s.shift) s.shift = 'AM';
      });
    }

    const fac = localStorage.getItem('sti_faculty_data');
    if (fac) {
      const parsedFac = JSON.parse(fac);
      if (Array.isArray(parsedFac) && parsedFac.length > 0) {
        FACULTY = parsedFac;
      }
    }
    const storedCatalog = JSON.parse(localStorage.getItem('sti_subject_catalog') || 'null');
    if (Array.isArray(storedCatalog) && storedCatalog.length > 0) SUBJECTS = storedCatalog;

    const storedDepts = JSON.parse(localStorage.getItem('sti_departments') || 'null');
    if (Array.isArray(storedDepts) && storedDepts.length > 0) DEPARTMENTS = storedDepts;

    // Older saved profiles had separate lists; merge them into the one allowed list
    FACULTY.forEach(f => {
      f.mainQuals = [...new Set([...(f.mainQuals || []), ...(f.sideQuals || []), ...(f.quals || [])].map(q => q.trim().toUpperCase()))];
      delete f.sideQuals;
      delete f.quals;
    });

    // Self-healing: Ensure active term matches active school year
    const activeSy = SCHOOL_YEARS.find(y => y.isActive) || SCHOOL_YEARS[0];
    if (activeSy && !SCHOOL_TERMS.some(t => t.yearId === activeSy.id && t.isActive)) {
      const firstTerm = SCHOOL_TERMS.find(t => t.yearId === activeSy.id && t.termName === '1st Sem') 
        || SCHOOL_TERMS.find(t => t.yearId === activeSy.id);
      if (firstTerm) {
        SCHOOL_TERMS.forEach(t => t.isActive = (t.id === firstTerm.id));
      }
    }
  } catch (e) {
    console.warn('LocalStorage load warning:', e);
  }
}

function saveStateToStorage() {
  try {
    localStorage.setItem('sti_rooms', JSON.stringify(ROOMS));
    localStorage.setItem('sti_subject_catalog', JSON.stringify(SUBJECTS));
    localStorage.setItem('sti_departments', JSON.stringify(DEPARTMENTS));
    localStorage.setItem('sti_school_years', JSON.stringify(SCHOOL_YEARS));
    localStorage.setItem('sti_school_terms', JSON.stringify(SCHOOL_TERMS));
    localStorage.setItem('sti_curriculum_subjects', JSON.stringify(CURRICULUM_SUBJECTS));
    localStorage.setItem('sti_academic_sections', JSON.stringify(ACADEMIC_SECTIONS));
    localStorage.setItem('sti_faculty_data', JSON.stringify(FACULTY));
    if (typeof MASTER_SCHEDULE_DATA !== 'undefined' && Array.isArray(MASTER_SCHEDULE_DATA) && MASTER_SCHEDULE_DATA.length > 0) {
      localStorage.setItem('sti_master_schedule_data', JSON.stringify(MASTER_SCHEDULE_DATA));
    }
  } catch (e) {
    console.warn('LocalStorage save warning:', e);
  }
}

// Initial state load
loadStateFromStorage();
