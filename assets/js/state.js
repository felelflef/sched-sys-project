/* ═══════════════════════════════════════════════════
   CENTRAL APPLICATION STATE & CATALOG DATA
   ═══════════════════════════════════════════════════ */

const VALID_USERS = {
  'admin@sti.edu':   { name: 'System Administrator', role: 'admin',         initials: 'SA', password: 'password' },
  'acah@sti.edu':    { name: 'Academic Head',        role: 'academic-head', initials: 'AH', password: 'password' },
  'proh@sti.edu':    { name: 'Program Head',         role: 'program-head',  initials: 'PH', password: 'password' },
  'faculty@sti.edu': { name: 'Faculty Member',       role: 'faculty',       initials: 'FM', password: 'password' },
};

let CURRENT_USER = null;

let ROOMS = [
  // Floor 1 (4 Computer Labs, 3 Lecture Rooms, 1 Culinary Kitchen Lab)
  { code: 'CL-101', floor: '1F', type: 'CompLab', cap: 35, util: 92, name: 'Computer Laboratory 1' },
  { code: 'CL-102', floor: '1F', type: 'CompLab', cap: 35, util: 88, name: 'Computer Laboratory 2' },
  { code: 'CL-103', floor: '1F', type: 'CompLab', cap: 40, util: 95, name: 'Computer Laboratory 3' },
  { code: 'CL-104', floor: '1F', type: 'CompLab', cap: 30, util: 84, name: 'Computer Laboratory 4' },
  { code: 'LR-101', floor: '1F', type: 'Lecture', cap: 45, util: 82, name: 'Lecture Room 101' },
  { code: 'LR-102', floor: '1F', type: 'Lecture', cap: 45, util: 76, name: 'Lecture Room 102' },
  { code: 'LR-103', floor: '1F', type: 'Lecture', cap: 40, util: 70, name: 'Lecture Room 103' },
  { code: 'Kitchen Lab', floor: '1F', type: 'Special', cap: 25, util: 70, name: 'Culinary Arts Kitchen Lab' },

  // Floor 2 (6 Lecture Rooms)
  { code: 'LR-201', floor: '2F', type: 'Lecture', cap: 45, util: 88, name: 'Lecture Room 201' },
  { code: 'LR-202', floor: '2F', type: 'Lecture', cap: 45, util: 82, name: 'Lecture Room 202' },
  { code: 'LR-203', floor: '2F', type: 'Lecture', cap: 40, util: 76, name: 'Lecture Room 203' },
  { code: 'LR-204', floor: '2F', type: 'Lecture', cap: 40, util: 91, name: 'Lecture Room 204' },
  { code: 'LR-205', floor: '2F', type: 'Lecture', cap: 50, util: 84, name: 'Lecture Room 205' },
  { code: 'LR-206', floor: '2F', type: 'Lecture', cap: 45, util: 68, name: 'Lecture Room 206' },

  // Floor 3 (6 Lecture Rooms, 1 Tourism Lab)
  { code: 'LR-301', floor: '3F', type: 'Lecture', cap: 50, util: 70, name: 'Lecture Room 301' },
  { code: 'LR-302', floor: '3F', type: 'Lecture', cap: 50, util: 65, name: 'Lecture Room 302' },
  { code: 'LR-303', floor: '3F', type: 'Lecture', cap: 45, util: 78, name: 'Lecture Room 303' },
  { code: 'LR-304', floor: '3F', type: 'Lecture', cap: 45, util: 72, name: 'Lecture Room 304' },
  { code: 'LR-305', floor: '3F', type: 'Lecture', cap: 40, util: 68, name: 'Lecture Room 305' },
  { code: 'LR-306', floor: '3F', type: 'Lecture', cap: 45, util: 62, name: 'Lecture Room 306' },
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
  { name: 'Academic Head', email: 'acah@sti.edu', dept: 'IT / CS', status: 'Full-time', load: 18, maxLoad: 24, quals: ['ITE 101','CC 103','ITE 301','ITE 202'], bg: '#25447A' },
  { name: 'Program Head', email: 'proh@sti.edu', dept: 'IT / CS', status: 'Full-time', load: 18, maxLoad: 24, quals: ['CS 201','CS 301','CS 401','CC 104'], bg: '#2E7D5B' },
  { name: 'Faculty Member', email: 'faculty@sti.edu', dept: 'IT / CS', status: 'Full-time', load: 15, maxLoad: 24, quals: ['ITE 101','IM 101'], bg: '#6C3483' }
];

let USERS = [
  { name: 'System Administrator', email: 'admin@sti.edu', role: 'admin', roleLabel: 'System Admin', lastActive: 'Just now', status: 'Online' },
  { name: 'Academic Head', email: 'acah@sti.edu', role: 'academic-head', roleLabel: 'Academic Head', lastActive: '5 min ago', status: 'Online' },
  { name: 'Program Head', email: 'proh@sti.edu', role: 'program-head', roleLabel: 'Program Head', lastActive: '10 min ago', status: 'Online' },
  { name: 'Faculty Member', email: 'faculty@sti.edu', role: 'faculty', roleLabel: 'Faculty Member', lastActive: '15 min ago', status: 'Online' }
];

const DAYS_ABBR = ['M','T','W','Th','F','S'];
const TIME_SLOTS = ['7:00–8:30','8:30–10:00','10:00–11:30','11:30–1:00','1:00–2:30','2:30–4:00','4:00–5:30','5:30–7:00'];

const MODULE_TITLES = {
  schedule: { title: 'Interactive Schedule Management Dashboard', sub: '1st Semester AY 2026–2027 · 342 sections across 19 rooms' },
  minimap:  { title: 'AI Integrated Campus Map & Utilization', sub: 'Real-time room availability across 3 floors' },
  rooms:    { title: 'Room Information', sub: '15 lecture rooms · 4 computer labs · 2 specialized labs' },
  faculty:  { title: 'Faculty & Resource Profiling', sub: 'Time availability, teaching loads & MAQ certifications' },
  subjects: { title: 'Subject Catalog & Specialization', sub: 'Course codes, department specialization & teaching eligibility' },
  ai:       { title: 'AI Space & Schedule Optimization', sub: 'Powered by Google Gemini API · Automated room utilization and timetable analytics' },
  users:    { title: 'User Management & Security', sub: 'Role-based access control & audit trail' },
};
