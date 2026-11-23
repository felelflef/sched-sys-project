/* ═══════════════════════════════════════════════════
   CENTRAL APPLICATION STATE & CATALOG DATA
   ═══════════════════════════════════════════════════ */

const VALID_USERS = {
  'admin@sti.edu':   { name: 'System Administrator', role: 'admin',         initials: 'SA' },
  'acah@sti.edu':    { name: 'Prof. IT Instructor',  role: 'faculty',       initials: 'IT' },
  'proh@sti.edu':    { name: 'Program Head',         role: 'program-head',  initials: 'PH' },
  'faculty@sti.edu': { name: 'Faculty Member',       role: 'faculty',       initials: 'FM' },
};

let CURRENT_USER = null;

let ROOMS = [
  // Floor 1 (4 Computer Labs, 3 Lecture Rooms, 1 Culinary Kitchen Lab)
  { code: 'CL-101', floor: '1F', type: 'CompLab', cap: 35, name: 'Computer Laboratory 1' },
  { code: 'CL-102', floor: '1F', type: 'CompLab', cap: 35, name: 'Computer Laboratory 2' },
  { code: 'CL-103', floor: '1F', type: 'CompLab', cap: 40, name: 'Computer Laboratory 3' },
  { code: 'CL-104', floor: '1F', type: 'CompLab', cap: 30, name: 'Computer Laboratory 4' },
  { code: 'LR-101', floor: '1F', type: 'Lecture', cap: 40, name: 'Lecture Room 101' },
  { code: 'LR-102', floor: '1F', type: 'Lecture', cap: 40, name: 'Lecture Room 102' },
  { code: 'LR-103', floor: '1F', type: 'Lecture', cap: 40, name: 'Lecture Room 103' },
  { code: 'Kitchen Lab', floor: '1F', type: 'Special', cap: 40, name: 'Culinary Arts Kitchen Lab' },

  // Floor 2 (6 Lecture Rooms)
  { code: 'LR-201', floor: '2F', type: 'Lecture', cap: 40, name: 'Lecture Room 201' },
  { code: 'LR-202', floor: '2F', type: 'Lecture', cap: 40, name: 'Lecture Room 202' },
  { code: 'LR-203', floor: '2F', type: 'Lecture', cap: 40, name: 'Lecture Room 203' },
  { code: 'LR-204', floor: '2F', type: 'Lecture', cap: 40, name: 'Lecture Room 204' },
  { code: 'LR-205', floor: '2F', type: 'Lecture', cap: 40, name: 'Lecture Room 205' },
  { code: 'LR-206', floor: '2F', type: 'Lecture', cap: 40, name: 'Lecture Room 206' },

  // Floor 3 (6 Lecture Rooms, 1 Tourism Lab)
  { code: 'LR-301', floor: '3F', type: 'Lecture', cap: 40, name: 'Lecture Room 301' },
  { code: 'LR-302', floor: '3F', type: 'Lecture', cap: 40, name: 'Lecture Room 302' },
  { code: 'LR-303', floor: '3F', type: 'Lecture', cap: 40, name: 'Lecture Room 303' },
  { code: 'LR-304', floor: '3F', type: 'Lecture', cap: 40, name: 'Lecture Room 304' },
  { code: 'LR-305', floor: '3F', type: 'Lecture', cap: 40, name: 'Lecture Room 305' },
  { code: 'LR-306', floor: '3F', type: 'Lecture', cap: 40, name: 'Lecture Room 306' },
  { code: 'Tourism Lab', floor: '3F', type: 'Special', cap: 30, name: 'Tourism & Hospitality Mock Center' }
];

let SUBJECTS = [
  { code: "GE 1", title: "Understanding the Self", dept: "General Education", units: 3, level: 'tertiary' },
  { code: "GE 2", title: "Readings in Philippine History", dept: "General Education", units: 3, level: 'tertiary' },
  { code: "GE 3", title: "The Contemporary World", dept: "General Education", units: 3, level: 'tertiary' },
  { code: "GE 4", title: "Mathematics in the Modern World", dept: "General Education", units: 3, level: 'tertiary' },
  { code: "GE 5", title: "Purposive Communication", dept: "General Education", units: 3, level: 'tertiary' },
  { code: "GE 6", title: "Art Appreciation", dept: "General Education", units: 3, level: 'tertiary' },
  { code: "GE 7", title: "Science, Technology and Society", dept: "General Education", units: 3, level: 'tertiary' },
  { code: "GE 8", title: "Ethics", dept: "General Education", units: 3, level: 'tertiary' },
  { code: "GE 9", title: "Life and Works of Rizal", dept: "General Education", units: 3, level: 'tertiary' },
  { code: "PATHFIT 1", title: "Movement Competency Training", dept: "PE & NSTP", units: 2, level: 'tertiary' },
  { code: "PATHFIT 2", title: "Exercise-based Fitness Activities", dept: "PE & NSTP", units: 2, level: 'tertiary' },
  { code: "PATHFIT 3", title: "Sports and Dance", dept: "PE & NSTP", units: 2, level: 'tertiary' },
  { code: "PATHFIT 4", title: "Outdoor and Adventure Activities", dept: "PE & NSTP", units: 2, level: 'tertiary' },
  { code: "NSTP 1", title: "National Service Training Program 1", dept: "PE & NSTP", units: 3, level: 'tertiary' },
  { code: "NSTP 2", title: "National Service Training Program 2", dept: "PE & NSTP", units: 3, level: 'tertiary' },
  { code: "COMP 101", title: "Introduction to Computing", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "COMP 102", title: "Computer Programming 1", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "COMP 103", title: "Computer Programming 2", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "COMP 104", title: "Data Structures and Algorithms", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "COMP 105", title: "Information Management", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "COMP 106", title: "Applications Development and Emerging Technologies", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "IT 102", title: "Human Computer Interaction", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "IT 103", title: "Networking 1", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "IT 104", title: "Networking 2", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "IT 105", title: "Web Systems and Technologies", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "IT 106", title: "Integrative Programming and Technologies", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "IT 107", title: "Information Assurance and Security", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "IT 108", title: "Systems Integration and Architecture", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "IT 109", title: "Systems Administration and Maintenance", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "IT 110", title: "Mobile Application Development", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "IT 111", title: "Cloud Computing", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "IT 112", title: "Capstone Project 1", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "IT 113", title: "Capstone Project 2", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "CS 101", title: "Discrete Structures 1", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "CS 102", title: "Discrete Structures 2", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "CS 103", title: "Object-Oriented Programming", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "CS 104", title: "Algorithms and Complexity", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "CS 105", title: "Automata Theory and Formal Languages", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "CS 106", title: "Programming Languages", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "CS 107", title: "Software Engineering 1", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "CS 108", title: "Software Engineering 2", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "CS 109", title: "Operating Systems", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "CS 110", title: "Architecture and Organization", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "CS 111", title: "Networks and Communications", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "CS 112", title: "Machine Learning", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "CS 113", title: "Data Science and Analytics", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "CS 114", title: "Thesis 1", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "CS 115", title: "Thesis 2", dept: "IT / Computing", units: 3, level: 'tertiary' },
  { code: "SCPT 101", title: "Computer Systems Servicing", dept: "IT / Computing", units: 3, level: 'shs' },
  { code: "SCPT 102", title: "Computer Programming (SHS) 1", dept: "IT / Computing", units: 3, level: 'shs' },
  { code: "SCPT 103", title: "Computer Programming (SHS) 2", dept: "IT / Computing", units: 3, level: 'shs' },
  { code: "SCPT 104", title: "Web Development", dept: "IT / Computing", units: 3, level: 'shs' },
  { code: "THC 101", title: "Macro Perspective of Tourism and Hospitality", dept: "Tourism", units: 3, level: 'tertiary' },
  { code: "THC 102", title: "Risk Management as Applied to Safety, Security and Sanitation", dept: "Tourism", units: 3, level: 'tertiary' },
  { code: "THC 103", title: "Quality Service Management in Tourism and Hospitality", dept: "Tourism", units: 3, level: 'tertiary' },
  { code: "THC 104", title: "Philippine Culture and Tourism Geography", dept: "Tourism", units: 3, level: 'tertiary' },
  { code: "THC 105", title: "Micro Perspective of Tourism and Hospitality", dept: "Tourism", units: 3, level: 'tertiary' },
  { code: "THC 106", title: "Tourism and Hospitality Marketing", dept: "Tourism", units: 3, level: 'tertiary' },
  { code: "THC 107", title: "Legal Aspects in Tourism and Hospitality", dept: "Tourism", units: 3, level: 'tertiary' },
  { code: "THC 108", title: "Multicultural Diversity in the Workplace", dept: "Tourism", units: 3, level: 'tertiary' },
  { code: "THC 109", title: "Entrepreneurship in Tourism and Hospitality", dept: "Tourism", units: 3, level: 'tertiary' },
  { code: "TPC 101", title: "Tour and Travel Management", dept: "Tourism", units: 3, level: 'tertiary' },
  { code: "TPC 102", title: "Sustainable Tourism", dept: "Tourism", units: 3, level: 'tertiary' },
  { code: "TPC 103", title: "Global Culture and Tourism Geography", dept: "Tourism", units: 3, level: 'tertiary' },
  { code: "TPC 104", title: "Transportation Management", dept: "Tourism", units: 3, level: 'tertiary' },
  { code: "TPC 105", title: "Tourism Policy Planning and Development", dept: "Tourism", units: 3, level: 'tertiary' },
  { code: "TPC 106", title: "Applied Business Tools and Technologies (GDS)", dept: "Tourism", units: 3, level: 'tertiary' },
  { code: "TPC 107", title: "Introduction to MICE", dept: "Tourism", units: 3, level: 'tertiary' },
  { code: "TPC 108", title: "Airline Management and Operations", dept: "Tourism", units: 3, level: 'tertiary' },
  { code: "TPC 109", title: "Research in Tourism", dept: "Tourism", units: 3, level: 'tertiary' },
  { code: "HTTO 101", title: "Travel and Tour Services", dept: "Tourism", units: 3, level: 'shs' },
  { code: "HTTO 102", title: "Local Guiding Services", dept: "Tourism", units: 3, level: 'shs' },
  { code: "HTTO 103", title: "Front Office Services (SHS)", dept: "Tourism", units: 3, level: 'shs' },
  { code: "HTTO 104", title: "Events Management", dept: "Tourism", units: 3, level: 'shs' },
  { code: "HRS 101", title: "Cookery", dept: "Hospitality & Culinary", units: 3, level: 'tertiary' },
  { code: "HRS 102", title: "Food and Beverage Services", dept: "Hospitality & Culinary", units: 3, level: 'tertiary' },
  { code: "HRS 103", title: "Bread and Pastry Production", dept: "Hospitality & Culinary", units: 3, level: 'tertiary' },
  { code: "HRS 104", title: "Housekeeping", dept: "Hospitality & Culinary", units: 3, level: 'tertiary' },
  { code: "HRS 105", title: "Front Office Services", dept: "Hospitality & Culinary", units: 3, level: 'tertiary' },
  { code: "HRS 106", title: "Customer Communication Services", dept: "Hospitality & Culinary", units: 3, level: 'tertiary' },
  { code: "HTCUA 101", title: "Kitchen Safety and Sanitation", dept: "Hospitality & Culinary", units: 3, level: 'shs' },
  { code: "HTCUA 102", title: "Culinary Cookery", dept: "Hospitality & Culinary", units: 3, level: 'shs' },
  { code: "HTCUA 103", title: "Baking and Pastry", dept: "Hospitality & Culinary", units: 3, level: 'shs' },
  { code: "HTCUA 104", title: "Food and Beverage Service (SHS)", dept: "Hospitality & Culinary", units: 3, level: 'shs' },
  { code: "BE 101", title: "Fundamentals of Accountancy, Business and Management 1", dept: "Business & Entrepreneurship", units: 3, level: 'shs' },
  { code: "BE 102", title: "Fundamentals of Accountancy, Business and Management 2", dept: "Business & Entrepreneurship", units: 3, level: 'shs' },
  { code: "BE 103", title: "Business Finance", dept: "Business & Entrepreneurship", units: 3, level: 'shs' },
  { code: "BE 104", title: "Principles of Marketing", dept: "Business & Entrepreneurship", units: 3, level: 'shs' },
  { code: "BE 105", title: "Applied Economics", dept: "Business & Entrepreneurship", units: 3, level: 'shs' },
  { code: "BE 106", title: "Business Ethics and Social Responsibility", dept: "Business & Entrepreneurship", units: 3, level: 'shs' },
  { code: "BE 107", title: "Entrepreneurship", dept: "Business & Entrepreneurship", units: 3, level: 'shs' },
  { code: "ASSH 101", title: "Creative Writing", dept: "Arts & Social Sciences", units: 3, level: 'shs' },
  { code: "ASSH 102", title: "Malikhaing Pagsulat", dept: "Arts & Social Sciences", units: 3, level: 'shs' },
  { code: "ASSH 103", title: "Introduction to the Philosophy of the Human Person", dept: "Arts & Social Sciences", units: 3, level: 'shs' },
  { code: "ASSH 104", title: "Disciplines and Ideas in the Social Sciences", dept: "Arts & Social Sciences", units: 3, level: 'shs' },
  { code: "ASSH 105", title: "Philippine Politics and Governance", dept: "Arts & Social Sciences", units: 3, level: 'shs' },
  { code: "ASSH 106", title: "Community Engagement, Solidarity and Citizenship", dept: "Arts & Social Sciences", units: 3, level: 'shs' },
  { code: "ASSH 107", title: "Trends, Networks and Critical Thinking", dept: "Arts & Social Sciences", units: 3, level: 'shs' },
  { code: "SHS 101", title: "Effective Communication", dept: "General Education", units: 3, level: 'shs' },
  { code: "SHS 102", title: "General Mathematics", dept: "General Education", units: 3, level: 'shs' },
  { code: "SHS 103", title: "General Science", dept: "General Education", units: 3, level: 'shs' },
  { code: "SHS 104", title: "Life and Career Skills", dept: "General Education", units: 3, level: 'shs' },
  { code: "SHS 105", title: "Pag-aaral ng Kasaysayan at Lipunang Pilipino", dept: "General Education", units: 3, level: 'shs' },
  { code: "SHS 106", title: "Physical Education and Health", dept: "PE & NSTP", units: 2, level: 'shs' }
];

let DEPARTMENTS = ["IT / Computing","Tourism","Hospitality & Culinary","Business & Entrepreneurship","Arts & Social Sciences","General Education","PE & NSTP"];

let FACULTY = [
  { name: 'Prof. IT Instructor', email: 'acah@sti.edu', dept: 'IT / Computing', status: 'Full-time', maxLoad: 30, teachingLevel: 'mixed', certificates: [1], bg: '#25447A' },
  { name: 'Program Head', email: 'proh@sti.edu', dept: 'IT / Computing', status: 'Full-time', maxLoad: 30, certificates: [1], bg: '#2E7D5B' },
  { name: 'Faculty Member', email: 'faculty@sti.edu', dept: 'IT / Computing', status: 'Full-time', maxLoad: 30, certificates: [1], bg: '#6C3483' },
  { name: 'Prof. Tourism Faculty', email: 'tourism@sti.edu', dept: 'Tourism', status: 'Full-time', maxLoad: 30, teachingLevel: 'mixed', certificates: [2], bg: '#0E7490' },
  { name: 'Chef Hospitality Faculty', email: 'hospitality@sti.edu', dept: 'Hospitality & Culinary', status: 'Full-time', maxLoad: 30, teachingLevel: 'mixed', certificates: [3], bg: '#D97706' },
  { name: 'Prof. Business Faculty', email: 'business@sti.edu', dept: 'Business & Entrepreneurship', status: 'Full-time', maxLoad: 30, teachingLevel: 'shs', certificates: [4], bg: '#2563EB' },
  { name: 'Prof. Arts & Humanities', email: 'arts@sti.edu', dept: 'Arts & Social Sciences', status: 'Part-time', maxLoad: 24, minLoad: 15, teachingLevel: 'shs', certificates: [5], bg: '#BE185D' },
  { name: 'Prof. GenEd Instructor', email: 'gened@sti.edu', dept: 'General Education', status: 'Full-time', maxLoad: 30, teachingLevel: 'mixed', certificates: [6], bg: '#0D9488' },
  { name: 'Coach PE Instructor', email: 'pe@sti.edu', dept: 'PE & NSTP', status: 'Full-time', maxLoad: 30, teachingLevel: 'mixed', certificates: [7], bg: '#4B5563' }
];

// FCC certificates: each covers one or more subject areas. A holder may teach every catalog subject in those areas.
let FCC_CERTIFICATES = DEPARTMENTS.map((dept, i) => ({ id: i + 1, name: `FCC - ${dept}`, areas: [dept] }));

// The subject area (department) of a subject, from the Subject Catalog
function subjectArea(subjectCode) {
  const target = (subjectCode || '').trim().toUpperCase();
  const subj = SUBJECTS.find(s => (s.code || '').trim().toUpperCase() === target);
  return subj ? subj.dept : '';
}

function facultyCertificates(fac, certs = FCC_CERTIFICATES) {
  const held = fac?.certificates || [];
  return certs.filter(c => held.includes(c.id));
}

// The certificate that lets this teacher teach the subject, if any
function coveringCertificate(fac, subjectCode, certs = FCC_CERTIFICATES) {
  const area = subjectArea(subjectCode);
  return area ? facultyCertificates(fac, certs).find(c => c.areas.includes(area)) || null : null;
}

// A teacher may teach a subject when one of their FCC certificates covers its subject area
function isFacultyQualified(fac, subjectCode, certs = FCC_CERTIFICATES) {
  return !!coveringCertificate(fac, subjectCode, certs);
}

// Teachers saved in this browser may still have single-subject Main Qualifications. Those become the FCC
// certificates for the subjects' areas, creating "FCC - {area}" when needed; a subject missing from the
// catalog joins it under the teacher's department first. Returns true when something changed.
function convertMainQualsToCertificates(fac) {
  const codes = [...new Set([...(fac.mainQuals || []), ...(fac.sideQuals || []), ...(fac.quals || [])]
    .map(q => String(q).trim().toUpperCase()).filter(Boolean))];
  const hadList = 'mainQuals' in fac || 'sideQuals' in fac || 'quals' in fac;
  delete fac.mainQuals;
  delete fac.sideQuals;
  delete fac.quals;
  if (codes.length === 0) return hadList;
  fac.certificates = Array.isArray(fac.certificates) ? fac.certificates : [];
  codes.forEach(code => {
    let area = subjectArea(code);
    if (!area && DEPARTMENTS.includes(fac.dept)) {
      const curriculum = (typeof CURRICULUM_SUBJECTS !== 'undefined' ? CURRICULUM_SUBJECTS : []).find(s => (s.code || '').toUpperCase() === code);
      SUBJECTS.push({ code, title: curriculum ? curriculum.name : code, dept: fac.dept, units: curriculum ? curriculum.units : 3 });
      area = fac.dept;
    }
    if (!area) return;
    let cert = FCC_CERTIFICATES.find(c => c.areas.length === 1 && c.areas[0] === area);
    if (!cert) {
      cert = { id: Math.max(0, ...FCC_CERTIFICATES.map(c => c.id)) + 1, name: `FCC - ${area}`.slice(0, 60), areas: [area] };
      FCC_CERTIFICATES.push(cert);
    }
    if (!fac.certificates.includes(cert.id)) fac.certificates.push(cert.id);
  });
  return true;
}

/* Teaching load is counted in units, with a minimum and a maximum per teacher. Defaults: full-time 24 to 30 units,
   part-time 15 to 24 units; both can be changed in the teacher's profile. */
// The school's default loads in units, a school setting (Faculty Profiles > Default Loads). A teacher's own
// minimum and maximum, when saved, take precedence; these fill in for new teachers and any not set.
const DEFAULT_LOAD_UNITS = { 'Full-time': { min: 24, max: 30 }, 'Part-time': { min: 15, max: 24 } };
function setDefaultLoadUnits(loads) {
  ['Full-time', 'Part-time'].forEach(status => {
    const r = loads && loads[status];
    if (r && Number.isFinite(Number(r.min)) && Number(r.max) > 0) DEFAULT_LOAD_UNITS[status] = { min: Number(r.min), max: Number(r.max) };
  });
}
function defaultLoadUnits(status) {
  return DEFAULT_LOAD_UNITS[status === 'Part-time' ? 'Part-time' : 'Full-time'];
}
function facultyMinUnits(fac) {
  const saved = fac ? fac.minLoad : null;
  return saved === null || saved === undefined || saved === '' || !Number.isFinite(Number(saved)) ? defaultLoadUnits(fac?.status).min : Number(saved);
}
function facultyMaxUnits(fac) {
  return Number(fac?.maxLoad) > 0 ? Number(fac.maxLoad) : defaultLoadUnits(fac?.status).max;
}

/* Lecture and lab parts of a subject. Units split into lecture units and lab units; by default a lecture unit
   meets 1 hour a week and a lab unit 3 hours, so 2 lecture + 1 lab units is 2 + 3 = 5 hours. The hours can be
   changed for subjects that differ. Lecture hours meet in a lecture room and lab hours in a lab. */
const LAB_HOURS_PER_UNIT = 3;
function subjectLabUnits(subj) {
  const units = Number(subj?.units) || 0;
  if (subj && subj.labUnits !== undefined && subj.labUnits !== null && subj.labUnits !== '') {
    return Math.min(Math.max(Number(subj.labUnits) || 0, 0), units);
  }
  // Subjects saved before the split only have hours
  if (!(Number(subj?.labHours) > 0)) return 0;
  return Math.min(units, Math.max(units - Math.round(Number(subj.lecHours) || 0), 1));
}
function subjectLecUnits(subj) {
  return Math.max((Number(subj?.units) || 0) - subjectLabUnits(subj), 0);
}
// Weekly minutes of each part
function subjectPartMinutes(subj) {
  const lec = Number(subj?.lecHours) || 0;
  const lab = Number(subj?.labHours) || 0;
  if (subj?.type === 'lab' && lab === 0) return { lec: 0, lab: Math.round((lec || subj.units || 3) * 60) };
  if (lec + lab === 0) return { lec: Math.round((Number(subj?.units) || 3) * 60), lab: 0 };
  return { lec: Math.round(lec * 60), lab: Math.round(lab * 60) };
}
function subjectParts(subj) {
  const minutes = subjectPartMinutes(subj);
  return ['lec', 'lab'].filter(part => minutes[part] > 0).map(part => ({ part, minutes: minutes[part] }));
}
// Computer labs, except HRS and HTCUA use the Kitchen Lab and BSTM and HTTO the Tourism Lab
function isLabRoomFor(room, program) {
  if (!room) return false;
  // A specialized room counts for its own kind of lab only, so the Tourism Lab never hosts cookery and the reverse
  if (KITCHEN_PROGRAMS.includes(program)) return /kitchen/i.test(room.code) || (room.type === 'Special' && !/tourism/i.test(room.code));
  if (TOURISM_LAB_PROGRAMS.includes(program)) return /tourism/i.test(room.code) || (room.type === 'Special' && !/kitchen/i.test(room.code));
  return room.type === 'CompLab';
}
// A class in a lab counts toward the lab hours, any other class toward the lecture hours
function classPart(cls, subj, program) {
  const room = ROOMS.find(r => r.code === cls.room);
  return subjectPartMinutes(subj).lab > 0 && isLabRoomFor(room, program) ? 'lab' : 'lec';
}
// "ITE 101 lab" for a subject with both parts, otherwise just the code
function subjectPartLabel(subj, part) {
  return subjectParts(subj).length > 1 ? `${subj.code} ${part === 'lab' ? 'lab' : 'lecture'}` : subj.code;
}

// A section's adviser is saved as the teacher's account email; older sections may hold their name
function sectionAdviser(sec) {
  const saved = String(sec?.adviser || '').trim();
  if (!saved) return null;
  return FACULTY.find(f => (f.email || '').toLowerCase() === saved.toLowerCase()) || FACULTY.find(f => f.name === saved) || null;
}
function sectionAdviserName(sec) {
  const fac = sectionAdviser(sec);
  return fac ? fac.name : '';
}

// The page a role opens on: Faculty don't use Master Schedule, so they start on View Schedule
function homePageForRole(role) {
  return role === 'faculty' ? 'viewer' : 'schedule';
}

// The System Administrator and Program Heads manage scheduling data. Only the System Administrator manages user accounts.
function canManageData() {
  return !!(CURRENT_USER && (CURRENT_USER.role === 'admin' || CURRENT_USER.role === 'program-head'));
}

let USERS = [
  { name: 'System Administrator', email: 'admin@sti.edu', role: 'admin', roleLabel: 'System Admin', lastActive: 'Just now', status: 'Online', employmentType: 'Full-time' },
  { name: 'Prof. IT Instructor', email: 'acah@sti.edu', role: 'faculty', roleLabel: 'Faculty Member', lastActive: '5 min ago', status: 'Online', employmentType: 'Full-time' },
  { name: 'Program Head', email: 'proh@sti.edu', role: 'program-head', roleLabel: 'Program Head', lastActive: '10 min ago', status: 'Online', employmentType: 'Full-time' },
  { name: 'Faculty Member', email: 'faculty@sti.edu', role: 'faculty', roleLabel: 'Faculty Member', lastActive: '15 min ago', status: 'Online', employmentType: 'Full-time' },
  { name: 'Prof. Tourism Faculty', email: 'tourism@sti.edu', role: 'faculty', roleLabel: 'Faculty Member', lastActive: '20 min ago', status: 'Online', employmentType: 'Full-time' },
  { name: 'Chef Hospitality Faculty', email: 'hospitality@sti.edu', role: 'faculty', roleLabel: 'Faculty Member', lastActive: '25 min ago', status: 'Online', employmentType: 'Full-time' },
  { name: 'Prof. Business Faculty', email: 'business@sti.edu', role: 'faculty', roleLabel: 'Faculty Member', lastActive: '30 min ago', status: 'Online', employmentType: 'Full-time' },
  { name: 'Prof. Arts & Humanities', email: 'arts@sti.edu', role: 'faculty', roleLabel: 'Faculty Member', lastActive: '35 min ago', status: 'Online', employmentType: 'Part-time' },
  { name: 'Prof. GenEd Instructor', email: 'gened@sti.edu', role: 'faculty', roleLabel: 'Faculty Member', lastActive: '40 min ago', status: 'Online', employmentType: 'Full-time' },
  { name: 'Coach PE Instructor', email: 'pe@sti.edu', role: 'faculty', roleLabel: 'Faculty Member', lastActive: '45 min ago', status: 'Online', employmentType: 'Full-time' }
];

const MODULE_TITLES = {
  schedule: { title: 'Master Schedule', sub: 'Set up the term and build the weekly timetable' },
  viewer:   { title: 'View Schedule', sub: 'Weekly timetables by section, teacher or room' },
  reports:  { title: 'Schedule Overview', sub: 'Teacher loads, room use and missing hours' },
  rooms:    { title: 'Room Information', sub: 'Rooms, capacity and weekly schedules' },
  faculty:  { title: 'Faculty Profiles', sub: 'Teachers and the subjects they can teach' },
  subjects: { title: 'Subject Catalog', sub: 'Courses, subject areas and units' },
  users:    { title: 'User Management', sub: 'Accounts, roles and passwords' },
  activity: { title: 'Activity Log', sub: 'Who changed what, and when' },
};

/* ═══════════════════════════════════════════════════
   ACADEMIC SCHEDULING LIFECYCLE STATE (STEPS 1 – 6)
   ═══════════════════════════════════════════════════ */

let ACTIVE_SCHEDULE_STEP = 7; // Default to step 7 (Timetable & Master Schedule)
let SCHEDULE_SNAPSHOTS = []; // Terms that have an earlier schedule to undo back to

// 1. School Years
let SCHOOL_YEARS = [
  { id: 1, yearCode: 'AY 2026-2027', isActive: true,  created: '2026-06-01' },
  { id: 2, yearCode: 'AY 2027-2028', isActive: false, created: '2026-10-15' }
];

// Each term is college (tertiary) or Senior High School, so a school year holds both kinds of terms.
// STI's programs: college programs use Years 1-4 (HRS is a 2-year program); SHS strands use Grades 11-12.
const LEVEL_PROGRAMS = { tertiary: ['BSCS', 'BSIT', 'BSTM', 'HRS'], shs: ['HTCUA', 'HTTO', 'ASSH', 'B&E', 'ICT-SCPT'] };
const LEVEL_YEARS = { tertiary: [1, 2, 3, 4], shs: [11, 12] };
const PROGRAM_YEARS = { HRS: [1, 2] };
// The years a program offers within its level
function yearsForProgram(program, level) {
  return PROGRAM_YEARS[program] || LEVEL_YEARS[level] || LEVEL_YEARS.tertiary;
}
// Sections and subjects saved under a program STI no longer offers
function isRetiredProgram(program) {
  return !Object.values(LEVEL_PROGRAMS).some(list => list.includes(program));
}
// Programs whose lab hours use the Kitchen Lab or the Tourism Lab instead of a computer lab
const KITCHEN_PROGRAMS = ['HRS', 'HTCUA'];
const TOURISM_LAB_PROGRAMS = ['BSTM', 'HTTO'];
const LEVEL_NAMES = { tertiary: 'College', shs: 'Senior High School' };

// A term's level is saved on the term; data saved in this browser before that kept it on the school year
function schoolLevelOfTerm(term) {
  const level = term && (term.level || (SCHOOL_YEARS.find(y => y.id === term.yearId) || {}).level);
  return level === 'shs' ? 'shs' : 'tertiary';
}
function termSchoolLevel(termId) {
  return schoolLevelOfTerm(SCHOOL_TERMS.find(t => t.id === termId));
}
// The level of the active term, which the program and year dropdowns follow
function activeSchoolLevel() {
  return schoolLevelOfTerm(typeof getActiveAcademicContext === 'function' ? getActiveAcademicContext().activeTerm : SCHOOL_TERMS.find(t => t.isActive));
}
// A teacher teaches college (tertiary), Senior High School, or both (mixed). Profiles without one teach college.
const TEACHING_LEVEL_NAMES = { tertiary: 'Tertiary', shs: 'SHS', mixed: 'Mixed (SHS and Tertiary)' };
function facultyTeachingLevel(fac) {
  return fac && TEACHING_LEVEL_NAMES[fac.teachingLevel] ? fac.teachingLevel : 'tertiary';
}
function facultyTeachesLevel(fac, level) {
  const teaches = facultyTeachingLevel(fac);
  return teaches === 'mixed' || teaches === level;
}
// The school level of a section's classes, from its term
function sectionSchoolLevel(sectionCode) {
  const { activeTerm } = getActiveAcademicContext();
  const sec = ACADEMIC_SECTIONS.find(s => s.code === sectionCode && s.termId === activeTerm.id) || ACADEMIC_SECTIONS.find(s => s.code === sectionCode);
  return sec ? termSchoolLevel(sec.termId) : activeSchoolLevel();
}

// "Year 2" for college, "Grade 11" for SHS
function yearLevelLabel(year) {
  const n = Number(year);
  return n >= 11 ? `Grade ${n}` : `Year ${n}`;
}
// "2nd Year" or "Grade 11", for dropdowns
function yearLevelOptionLabel(year) {
  const n = Number(year);
  return n >= 11 ? `Grade ${n}` : `${n}${['st', 'nd', 'rd'][n - 1] || 'th'} Year`;
}
// A school year's terms in calendar order
function termsOfYear(yearId) {
  return SCHOOL_TERMS.filter(t => t.yearId === yearId)
    .sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')) || a.id - b.id);
}

// 2. School Terms
let SCHOOL_TERMS = [
  // AY 2026-2027
  { id: 1, yearId: 1, termName: '1st Sem', level: 'tertiary', startDate: '2026-08-17', endDate: '2026-12-18', status: 'active', isActive: true },
  { id: 2, yearId: 1, termName: '2nd Sem', level: 'tertiary', startDate: '2027-01-11', endDate: '2027-05-28', status: 'draft',  isActive: false },
  { id: 3, yearId: 1, termName: 'Summer', level: 'tertiary',  startDate: '2027-06-07', endDate: '2027-07-23', status: 'draft',  isActive: false },
  { id: 7, yearId: 1, termName: '1st Term', level: 'shs', startDate: '2026-08-16', endDate: '2026-11-14', status: 'draft', isActive: false },
  { id: 8, yearId: 1, termName: '2nd Term', level: 'shs', startDate: '2026-11-23', endDate: '2027-02-26', status: 'draft', isActive: false },
  { id: 9, yearId: 1, termName: '3rd Term', level: 'shs', startDate: '2027-03-08', endDate: '2027-05-28', status: 'draft', isActive: false },
  { id: 13, yearId: 1, termName: 'Summer', level: 'shs', startDate: '2027-06-07', endDate: '2027-07-23', status: 'draft', isActive: false },
  // AY 2027-2028
  { id: 4, yearId: 2, termName: '1st Sem', level: 'tertiary', startDate: '2027-08-16', endDate: '2027-12-17', status: 'draft',  isActive: false },
  { id: 5, yearId: 2, termName: '2nd Sem', level: 'tertiary', startDate: '2028-01-10', endDate: '2028-05-26', status: 'draft',  isActive: false },
  { id: 6, yearId: 2, termName: 'Summer', level: 'tertiary',  startDate: '2028-06-05', endDate: '2028-07-21', status: 'draft',  isActive: false },
  { id: 10, yearId: 2, termName: '1st Term', level: 'shs', startDate: '2027-08-16', endDate: '2027-11-14', status: 'draft', isActive: false },
  { id: 11, yearId: 2, termName: '2nd Term', level: 'shs', startDate: '2027-11-23', endDate: '2028-02-26', status: 'draft', isActive: false },
  { id: 12, yearId: 2, termName: '3rd Term', level: 'shs', startDate: '2028-03-08', endDate: '2028-05-28', status: 'draft', isActive: false },
  { id: 14, yearId: 2, termName: 'Summer', level: 'shs', startDate: '2028-06-05', endDate: '2028-07-21', status: 'draft', isActive: false }
];

// 3. Curriculum Subjects (Term Subjects)
let CURRICULUM_SUBJECTS = [
  // 1st Sem (term 1)
  { id: 1, termId: 1, termName: "1st Sem", code: "COMP 101", name: "Introduction to Computing", units: 3, labUnits: 1, lecHours: 2.0, labHours: 3.0, type: "lecture", program: "BSIT", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 2, termId: 1, termName: "1st Sem", code: "COMP 102", name: "Computer Programming 1", units: 3, labUnits: 1, lecHours: 2.0, labHours: 3.0, type: "lecture", program: "BSIT", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 3, termId: 1, termName: "1st Sem", code: "GE 1", name: "Understanding the Self", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "lecture", program: "BSIT", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 4, termId: 1, termName: "1st Sem", code: "GE 5", name: "Purposive Communication", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "lecture", program: "BSIT", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 5, termId: 1, termName: "1st Sem", code: "PATHFIT 1", name: "Movement Competency Training", units: 2, labUnits: 0, lecHours: 2.0, labHours: 0.0, type: "pe", program: "BSIT", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 6, termId: 1, termName: "1st Sem", code: "NSTP 1", name: "National Service Training Program 1", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "special", program: "BSIT", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 7, termId: 1, termName: "1st Sem", code: "COMP 104", name: "Data Structures and Algorithms", units: 3, labUnits: 1, lecHours: 2.0, labHours: 3.0, type: "lecture", program: "BSIT", year: 2, curriculum: '2024 Revised', isIncluded: true },
  { id: 8, termId: 1, termName: "1st Sem", code: "COMP 105", name: "Information Management", units: 3, labUnits: 1, lecHours: 2.0, labHours: 3.0, type: "lecture", program: "BSIT", year: 2, curriculum: '2024 Revised', isIncluded: true },
  { id: 9, termId: 1, termName: "1st Sem", code: "IT 102", name: "Human Computer Interaction", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "lecture", program: "BSIT", year: 2, curriculum: '2024 Revised', isIncluded: true },
  { id: 10, termId: 1, termName: "1st Sem", code: "IT 103", name: "Networking 1", units: 3, labUnits: 1, lecHours: 2.0, labHours: 3.0, type: "lecture", program: "BSIT", year: 2, curriculum: '2024 Revised', isIncluded: true },
  { id: 11, termId: 1, termName: "1st Sem", code: "COMP 101", name: "Introduction to Computing", units: 3, labUnits: 1, lecHours: 2.0, labHours: 3.0, type: "lecture", program: "BSCS", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 12, termId: 1, termName: "1st Sem", code: "COMP 102", name: "Computer Programming 1", units: 3, labUnits: 1, lecHours: 2.0, labHours: 3.0, type: "lecture", program: "BSCS", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 13, termId: 1, termName: "1st Sem", code: "CS 101", name: "Discrete Structures 1", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "lecture", program: "BSCS", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 14, termId: 1, termName: "1st Sem", code: "GE 4", name: "Mathematics in the Modern World", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "lecture", program: "BSCS", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 15, termId: 1, termName: "1st Sem", code: "THC 101", name: "Macro Perspective of Tourism and Hospitality", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "lecture", program: "BSTM", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 16, termId: 1, termName: "1st Sem", code: "THC 104", name: "Philippine Culture and Tourism Geography", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "lecture", program: "BSTM", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 17, termId: 1, termName: "1st Sem", code: "GE 1", name: "Understanding the Self", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "lecture", program: "BSTM", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 18, termId: 1, termName: "1st Sem", code: "TPC 101", name: "Tour and Travel Management", units: 3, labUnits: 1, lecHours: 2.0, labHours: 3.0, type: "lecture", program: "BSTM", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 19, termId: 1, termName: "1st Sem", code: "HRS 101", name: "Cookery", units: 3, labUnits: 2, lecHours: 1.0, labHours: 6.0, type: "lab", program: "HRS", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 20, termId: 1, termName: "1st Sem", code: "HRS 102", name: "Food and Beverage Services", units: 3, labUnits: 1, lecHours: 2.0, labHours: 3.0, type: "lab", program: "HRS", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 21, termId: 1, termName: "1st Sem", code: "GE 5", name: "Purposive Communication", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "lecture", program: "HRS", year: 1, curriculum: '2024 Revised', isIncluded: true },
  // 2nd Sem (term 2)
  { id: 22, termId: 2, termName: "2nd Sem", code: "COMP 103", name: "Computer Programming 2", units: 3, labUnits: 1, lecHours: 2.0, labHours: 3.0, type: "lecture", program: "BSIT", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 23, termId: 2, termName: "2nd Sem", code: "GE 2", name: "Readings in Philippine History", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "lecture", program: "BSIT", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 24, termId: 2, termName: "2nd Sem", code: "PATHFIT 2", name: "Exercise-based Fitness Activities", units: 2, labUnits: 0, lecHours: 2.0, labHours: 0.0, type: "pe", program: "BSIT", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 25, termId: 2, termName: "2nd Sem", code: "NSTP 2", name: "National Service Training Program 2", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "special", program: "BSIT", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 26, termId: 2, termName: "2nd Sem", code: "IT 105", name: "Web Systems and Technologies", units: 3, labUnits: 1, lecHours: 2.0, labHours: 3.0, type: "lecture", program: "BSIT", year: 2, curriculum: '2024 Revised', isIncluded: true },
  { id: 27, termId: 2, termName: "2nd Sem", code: "CS 102", name: "Discrete Structures 2", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "lecture", program: "BSCS", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 28, termId: 2, termName: "2nd Sem", code: "COMP 103", name: "Computer Programming 2", units: 3, labUnits: 1, lecHours: 2.0, labHours: 3.0, type: "lecture", program: "BSCS", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 29, termId: 2, termName: "2nd Sem", code: "THC 105", name: "Micro Perspective of Tourism and Hospitality", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "lecture", program: "BSTM", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 30, termId: 2, termName: "2nd Sem", code: "TPC 102", name: "Sustainable Tourism", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "lecture", program: "BSTM", year: 1, curriculum: '2024 Revised', isIncluded: true },
  { id: 31, termId: 2, termName: "2nd Sem", code: "HRS 103", name: "Bread and Pastry Production", units: 3, labUnits: 2, lecHours: 1.0, labHours: 6.0, type: "lab", program: "HRS", year: 1, curriculum: '2024 Revised', isIncluded: true },
  // Summer (term 3)
  { id: 32, termId: 3, termName: "Summer", code: "IT 106", name: "Integrative Programming and Technologies", units: 3, labUnits: 1, lecHours: 2.0, labHours: 3.0, type: "lecture", program: "BSIT", year: 2, curriculum: '2024 Revised', isIncluded: true },
  { id: 33, termId: 3, termName: "Summer", code: "CS 103", name: "Object-Oriented Programming", units: 3, labUnits: 1, lecHours: 2.0, labHours: 3.0, type: "lecture", program: "BSCS", year: 1, curriculum: '2024 Revised', isIncluded: true },
  // 1st Term (term 7)
  { id: 34, termId: 7, termName: "1st Term", code: "SCPT 101", name: "Computer Systems Servicing", units: 3, labUnits: 1, lecHours: 2.0, labHours: 3.0, type: "lecture", program: "ICT-SCPT", year: 11, curriculum: '2024 Revised', isIncluded: true },
  { id: 35, termId: 7, termName: "1st Term", code: "SHS 101", name: "Effective Communication", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "lecture", program: "ICT-SCPT", year: 11, curriculum: '2024 Revised', isIncluded: true },
  { id: 36, termId: 7, termName: "1st Term", code: "SHS 102", name: "General Mathematics", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "lecture", program: "ICT-SCPT", year: 11, curriculum: '2024 Revised', isIncluded: true },
  { id: 37, termId: 7, termName: "1st Term", code: "HTCUA 101", name: "Kitchen Safety and Sanitation", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "lecture", program: "HTCUA", year: 11, curriculum: '2024 Revised', isIncluded: true },
  { id: 38, termId: 7, termName: "1st Term", code: "HTCUA 102", name: "Culinary Cookery", units: 3, labUnits: 2, lecHours: 1.0, labHours: 6.0, type: "lab", program: "HTCUA", year: 11, curriculum: '2024 Revised', isIncluded: true },
  { id: 39, termId: 7, termName: "1st Term", code: "SHS 101", name: "Effective Communication", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "lecture", program: "HTCUA", year: 11, curriculum: '2024 Revised', isIncluded: true },
  { id: 40, termId: 7, termName: "1st Term", code: "HTTO 101", name: "Travel and Tour Services", units: 3, labUnits: 1, lecHours: 2.0, labHours: 3.0, type: "lecture", program: "HTTO", year: 11, curriculum: '2024 Revised', isIncluded: true },
  { id: 41, termId: 7, termName: "1st Term", code: "SHS 101", name: "Effective Communication", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "lecture", program: "HTTO", year: 11, curriculum: '2024 Revised', isIncluded: true },
  { id: 42, termId: 7, termName: "1st Term", code: "BE 101", name: "Fundamentals of Accountancy, Business and Management 1", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "lecture", program: "B&E", year: 11, curriculum: '2024 Revised', isIncluded: true },
  { id: 43, termId: 7, termName: "1st Term", code: "SHS 102", name: "General Mathematics", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "lecture", program: "B&E", year: 11, curriculum: '2024 Revised', isIncluded: true },
  { id: 44, termId: 7, termName: "1st Term", code: "ASSH 101", name: "Creative Writing", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "lecture", program: "ASSH", year: 11, curriculum: '2024 Revised', isIncluded: true },
  { id: 45, termId: 7, termName: "1st Term", code: "SHS 101", name: "Effective Communication", units: 3, labUnits: 0, lecHours: 3.0, labHours: 0.0, type: "lecture", program: "ASSH", year: 11, curriculum: '2024 Revised', isIncluded: true },
  { id: 46, termId: 7, termName: "1st Term", code: "SHS 106", name: "Physical Education and Health", units: 2, labUnits: 0, lecHours: 2.0, labHours: 0.0, type: "pe", program: "ASSH", year: 11, curriculum: '2024 Revised', isIncluded: true }
];

// 4. Saved Subject Sets: reusable subject lists kept in the Subject Catalog and loaded into a term in Step 3.
// The demo starts with one set per term.
function subjectSetItem(s) {
  return { code: s.code, name: s.name, units: s.units, labUnits: subjectLabUnits(s), lecHours: s.lecHours, labHours: s.labHours, type: s.type, program: s.program, year: Number(s.year) };
}
let SUBJECT_SETS = SCHOOL_TERMS.map(term => {
  const year = SCHOOL_YEARS.find(y => y.id === term.yearId);
  return { id: term.id, name: `${term.termName}${year ? ` ${year.yearCode}` : ''}`, items: CURRICULUM_SUBJECTS.filter(s => s.termId === term.id).map(subjectSetItem) };
}).filter(set => set.items.length > 0);

// 5. Academic Sections
let ACADEMIC_SECTIONS = [
  // College: 1st Sem AY 2026-2027 (term 1) and AY 2027-2028 (term 4); SHS: 1st Term AY 2026-2027 (term 7)
  { id: 1, termId: 1, code: "IT101M", name: "BSIT 1A", program: "BSIT", year: 1, studentCount: 38, shift: 'AM' },
  { id: 2, termId: 1, code: "IT102M", name: "BSIT 1B", program: "BSIT", year: 1, studentCount: 36, shift: 'AM' },
  { id: 3, termId: 1, code: "IT201M", name: "BSIT 2A", program: "BSIT", year: 2, studentCount: 35, shift: 'AM' },
  { id: 4, termId: 1, code: "CS101M", name: "BSCS 1A", program: "BSCS", year: 1, studentCount: 32, shift: 'AM' },
  { id: 5, termId: 1, code: "TM101M", name: "BSTM 1A", program: "BSTM", year: 1, studentCount: 34, shift: 'AM' },
  { id: 6, termId: 1, code: "HRS101M", name: "HRS 1A", program: "HRS", year: 1, studentCount: 35, shift: 'AM' },
  { id: 7, termId: 4, code: "IT101M", name: "BSIT 1A", program: "BSIT", year: 1, studentCount: 38, shift: 'AM' },
  { id: 8, termId: 4, code: "IT102M", name: "BSIT 1B", program: "BSIT", year: 1, studentCount: 36, shift: 'AM' },
  { id: 9, termId: 4, code: "IT201M", name: "BSIT 2A", program: "BSIT", year: 2, studentCount: 35, shift: 'AM' },
  { id: 10, termId: 4, code: "CS101M", name: "BSCS 1A", program: "BSCS", year: 1, studentCount: 32, shift: 'AM' },
  { id: 11, termId: 4, code: "TM101M", name: "BSTM 1A", program: "BSTM", year: 1, studentCount: 34, shift: 'AM' },
  { id: 12, termId: 4, code: "HRS101M", name: "HRS 1A", program: "HRS", year: 1, studentCount: 35, shift: 'AM' },
  { id: 13, termId: 7, code: "ICT-SCPT11-A", name: "ICT-SCPT 11A", program: "ICT-SCPT", year: 11, studentCount: 36, shift: 'PM' },
  { id: 14, termId: 7, code: "HTCUA11-A", name: "HTCUA 11A", program: "HTCUA", year: 11, studentCount: 30, shift: 'PM' },
  { id: 15, termId: 7, code: "HTTO11-A", name: "HTTO 11A", program: "HTTO", year: 11, studentCount: 30, shift: 'PM' },
  { id: 16, termId: 7, code: "BE11-A", name: "B&E 11A", program: "B&E", year: 11, studentCount: 38, shift: 'PM' },
  { id: 17, termId: 7, code: "ASSH11-A", name: "ASSH 11A", program: "ASSH", year: 11, studentCount: 35, shift: 'PM' }
];

// Unassigned Classes Diagnostics
let UNASSIGNED_CLASSES = [];

/* Data saved in this browser before STI's current programs used other subject areas. Once, the old areas are
   renamed (as the server does), PE and NSTP get their own area, every area gets a certificate, and the standard
   subjects missing from the saved catalog are added. */
const AREA_RENAMES = { 'IT / CS': 'IT / Computing', 'IT': 'IT / Computing', 'Engineering': 'IT / Computing', 'Hospitality': 'Hospitality & Culinary', 'Business Admin': 'Business & Entrepreneurship' };
const STANDARD_AREAS = [...DEPARTMENTS];
const STANDARD_SUBJECTS = SUBJECTS.map(s => ({ ...s }));
// Catalog subjects are for College, SHS or both. Subjects saved before levels existed count as both,
// except the standard subjects, which keep their usual level.
const CATALOG_LEVEL_NAMES = { tertiary: 'College', shs: 'SHS', both: 'Both' };
function catalogLevel(subj) {
  if (subj && CATALOG_LEVEL_NAMES[subj.level]) return subj.level;
  const standard = STANDARD_SUBJECTS.find(s => s.code.toUpperCase() === String(subj?.code || '').toUpperCase());
  return standard ? standard.level : 'both';
}
function catalogFitsLevel(subj, level) {
  const own = catalogLevel(subj);
  return own === 'both' || own === level;
}
function migrateSavedAreas() {
  try {
    if (localStorage.getItem('sti_areas_2026')) return;
    localStorage.setItem('sti_areas_2026', '1');
  } catch (e) {
    return;
  }
  const rename = area => AREA_RENAMES[area] || area;
  DEPARTMENTS = [...new Set([...DEPARTMENTS.map(rename), ...STANDARD_AREAS])];
  SUBJECTS.forEach(s => {
    s.dept = rename(s.dept);
    if (s.dept === 'General Education' && /^(PE|NSTP|PATHFIT)/i.test(s.code)) s.dept = 'PE & NSTP';
  });
  STANDARD_SUBJECTS.forEach(s => { if (!SUBJECTS.some(x => x.code.toUpperCase() === s.code.toUpperCase())) SUBJECTS.push({ ...s }); });
  FACULTY.forEach(f => { f.dept = rename(f.dept); });
  FCC_CERTIFICATES.forEach(c => {
    c.areas = [...new Set((c.areas || []).map(rename))];
    const m = /^FCC - (.+)$/.exec(c.name);
    if (m && AREA_RENAMES[m[1]] && !FCC_CERTIFICATES.some(o => o !== c && o.name === `FCC - ${AREA_RENAMES[m[1]]}`)) c.name = `FCC - ${AREA_RENAMES[m[1]]}`;
  });
  STANDARD_AREAS.forEach(area => {
    if (FCC_CERTIFICATES.some(c => c.areas.length === 1 && c.areas[0] === area)) return;
    FCC_CERTIFICATES.push({ id: Math.max(0, ...FCC_CERTIFICATES.map(c => c.id)) + 1, name: `FCC - ${area}`, areas: [area] });
  });
  const pe = FCC_CERTIFICATES.find(c => c.areas.length === 1 && c.areas[0] === 'PE & NSTP');
  FACULTY.forEach(f => {
    if (facultyCertificates(f).some(c => c.areas.includes('General Education')) && !(f.certificates || []).includes(pe.id)) f.certificates = [...(f.certificates || []), pe.id];
  });
  saveStateToStorage();
}

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

    const storedSets = JSON.parse(localStorage.getItem('sti_subject_sets') || 'null');
    if (Array.isArray(storedSets)) SUBJECT_SETS = storedSets;

    const storedDepts = JSON.parse(localStorage.getItem('sti_departments') || 'null');
    if (Array.isArray(storedDepts) && storedDepts.length > 0) DEPARTMENTS = storedDepts;

    const storedCerts = JSON.parse(localStorage.getItem('sti_fcc_certificates') || 'null');
    if (Array.isArray(storedCerts)) FCC_CERTIFICATES = storedCerts;

    migrateSavedAreas();

    // Older saved profiles listed single subjects; those become FCC certificates for the subjects' areas
    let convertedQuals = false;
    FACULTY.forEach(f => { if (convertMainQualsToCertificates(f)) convertedQuals = true; });
    if (convertedQuals) saveStateToStorage();

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
    localStorage.setItem('sti_fcc_certificates', JSON.stringify(FCC_CERTIFICATES));
    localStorage.setItem('sti_subject_sets', JSON.stringify(SUBJECT_SETS));
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

// The browser's copy of the school's data (timetables, sections, teachers and their emails). It only speeds up
// opening the app; the database is the real copy. It is removed on sign-out, so a shared computer keeps none of it.
const CACHED_SCHOOL_DATA_KEYS = ['sti_rooms', 'sti_subject_catalog', 'sti_departments', 'sti_fcc_certificates', 'sti_subject_sets',
  'sti_school_years', 'sti_school_terms', 'sti_curriculum_subjects', 'sti_academic_sections', 'sti_faculty_data', 'sti_master_schedule_data', 'sti_viewing_term'];
function clearCachedSchoolData() {
  // Opened from disk, the browser copy is the only copy, so it stays
  if (typeof IS_STANDALONE !== 'undefined' && IS_STANDALONE) return;
  try { CACHED_SCHOOL_DATA_KEYS.forEach(key => localStorage.removeItem(key)); } catch (e) {}
  if (typeof viewingTermId !== 'undefined') viewingTermId = null;
}

// Initial state load
loadStateFromStorage();
