/* ═══════════════════════════════════════════════════
   SHARED DATABASE SYNC
   The database is the source of truth once published.
   localStorage is only a cache and the file:// demo store.
   ═══════════════════════════════════════════════════ */

// Saves that create records need a reload so the browser gets the server's IDs
const RELOAD_AFTER_ACTIONS = new Set([
  'save_school_year', 'save_term_subject', 'save_section',
  'split_section', 'merge_sections', 'auto_generate_sections', 'delete_section',
  'delete_catalog_subject', 'save_departments', 'save_faculty_qualifications'
]);
const MAX_DB_INT = 2147483647;

let publishOffered = false;
let reloadTimer = null;
let scheduleSaveTimer = null;

function mapServerClass(row, sections, subjects) {
  const termId = row.term_id ? Number(row.term_id) : undefined;
  const section = sections.find(s => s.code === row.section_name && (!termId || s.termId === termId));
  const subject = subjects.find(s => s.code === row.subject_code && (!termId || s.termId === termId) && (!section || s.program === section.program))
    || subjects.find(s => s.code === row.subject_code);
  const units = subject ? subject.units : 3;
  const weeklyHours = subject ? (subject.lecHours || 0) + (subject.labHours || 0) : 0;
  const classHours = (timeToMinutes(String(row.end_time).slice(0, 5)) - timeToMinutes(String(row.start_time).slice(0, 5))) / 60;

  return {
    id: `SCH-${row.schedule_id}`,
    termId,
    section: row.section_name,
    program: section ? section.program : row.subject_category,
    year: section ? String(section.year) : '1',
    subjectCode: row.subject_code,
    subjectTitle: subject ? subject.name : row.subject_code,
    type: subject ? subject.type : 'lecture',
    // A class carries the share of the subject's units that its time represents
    units: weeklyHours > 0 ? Math.round((units * classHours / weeklyHours) * 100) / 100 : (units >= 3 ? 1.5 : units),
    room: row.room_name_number,
    instructor: row.faculty_name,
    day: row.day_of_week,
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    aiPlaced: Number(row.ai_generated) === 1
  };
}

function applyServerState(data) {
  SCHOOL_YEARS = data.years.map(y => ({
    id: Number(y.year_id),
    yearCode: y.year_code,
    isActive: Number(y.is_active) === 1,
    created: String(y.created_at || '').slice(0, 10)
  })).sort((a, b) => a.id - b.id);

  SCHOOL_TERMS = data.terms.map(t => ({
    id: Number(t.term_id),
    yearId: Number(t.year_id),
    termName: t.term_name,
    startDate: t.start_date,
    endDate: t.end_date,
    status: t.status,
    isActive: Number(t.is_active) === 1,
    scheduleVersion: Number(t.schedule_version || 0)
  }));
  SCHEDULE_SNAPSHOTS = data.snapshots || [];

  CURRICULUM_SUBJECTS = data.subjects.map(s => {
    const term = SCHOOL_TERMS.find(t => t.id === Number(s.term_id));
    return {
      id: Number(s.subject_id),
      termId: Number(s.term_id),
      termName: term ? term.termName : undefined,
      code: s.subject_code,
      name: s.subject_name,
      units: Number(s.units),
      lecHours: parseFloat(s.lecture_hours),
      labHours: parseFloat(s.lab_hours),
      type: s.subject_type,
      program: s.program,
      year: Number(s.year_level),
      curriculum: s.curriculum,
      isIncluded: Number(s.is_included) === 1
    };
  });

  ACADEMIC_SECTIONS = data.sections.map(s => ({
    id: Number(s.section_id),
    termId: Number(s.term_id),
    code: s.section_code,
    name: s.section_name,
    program: s.program,
    year: Number(s.year_level),
    studentCount: Number(s.student_count),
    shift: s.shift || 'AM',
    adviser: s.adviser || ''
  }));

  const previousRooms = ROOMS;
  ROOMS = data.rooms.map(r => {
    const previous = previousRooms.find(p => p.code === r.room_name_number);
    return {
      dbId: Number(r.room_id),
      code: r.room_name_number,
      floor: `${r.floor_level}F`,
      type: r.room_type,
      cap: Number(r.capacity),
      name: previous ? previous.name : r.room_name_number
    };
  });

  if (data.departments.length > 0) DEPARTMENTS = data.departments;
  if (data.catalog.length > 0) {
    SUBJECTS = data.catalog.map(s => ({
      code: s.subject_code,
      title: s.subject_title,
      dept: s.department,
      itOnly: Number(s.it_only) === 1,
      units: Number(s.units),
      addedOrder: Number(s.catalog_id) || undefined
    }));
  }
  applyServerFaculty(data);

  MASTER_SCHEDULE_DATA = data.schedules.map(row => mapServerClass(row, ACADEMIC_SECTIONS, CURRICULUM_SUBJECTS));

  saveStateToStorage();
  refreshAllSchedulingViews();
  updateUndoButton();
  updateRoomDropdown();
  updateTeacherDropdown();
  renderRoomTable();
  renderDeptFilterOptions();
  renderSubjectDeptFilterOptions();
  renderSubjectDatalist();
  renderSubjectTable();
  renderFacultyCards();
}

// The database decides each teacher's allowed subjects
function applyServerFaculty(data) {
  const colors = ['#25447A', '#2E7D5B', '#6C3483', '#C27A1A', '#2980B9', '#C0392B'];
  data.faculty.forEach((row, index) => {
    const email = row.email.toLowerCase();
    let fac = FACULTY.find(f => f.email && f.email.toLowerCase() === email);
    if (!fac) {
      fac = { email, status: 'Full-time', maxLoad: 24, bg: colors[index % colors.length] };
      FACULTY.push(fac);
    }
    fac.name = `${row.first_name} ${row.last_name}`.trim();
    if (DEPARTMENTS.includes(row.subject_role) || !fac.dept) fac.dept = row.subject_role || DEPARTMENTS[0];
    fac.status = row.employment_status || 'Full-time';
    fac.maxLoad = Number(row.max_load) || 24;
    fac.availableDays = (row.available_days || '').split(',').filter(Boolean);
    fac.availableShifts = (row.available_shifts || '').split(',').filter(Boolean);
    const account = USERS.find(u => u.email.toLowerCase() === email);
    if (account) account.employmentType = fac.status;
    fac.mainQuals = data.qualifications
      .filter(q => q.email.toLowerCase() === email)
      .map(q => q.subject_code);
  });
}

async function loadServerState() {
  if (IS_STANDALONE || !CURRENT_USER) return;
  try {
    const res = await fetch('api/schedules.php?action=get_lifecycle', { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return;
    const body = await res.json();
    if (!body.success || !body.data) return;

    if (body.data.initialized) {
      applyServerState(body.data);
    } else if (CURRENT_USER.role === 'admin' && !publishOffered) {
      publishOffered = true;
      const ok = confirm('The shared database has not been set up yet.\n\nPublish the scheduling data in this browser so everyone uses it? This replaces the school years, terms, subjects, sections and schedules in the database.\n\nChoose Cancel if another browser has the correct data.');
      if (ok) await publishLocalState();
    }
  } catch (e) {
    console.warn('Could not load shared data:', e);
  }
}

// Replaces client-generated term IDs that don't fit the database's INT columns
function normalizeLocalTermIds() {
  let nextId = Math.max(0, ...SCHOOL_TERMS.map(t => t.id).filter(id => id <= MAX_DB_INT)) + 1;
  SCHOOL_TERMS.filter(t => t.id > MAX_DB_INT).forEach(term => {
    const oldId = term.id;
    term.id = nextId++;
    [CURRICULUM_SUBJECTS, ACADEMIC_SECTIONS, MASTER_SCHEDULE_DATA].forEach(list => {
      list.forEach(item => { if (item.termId === oldId) item.termId = term.id; });
    });
  });
}

async function publishLocalState() {
  normalizeLocalTermIds();
  const { activeTerm } = getActiveAcademicContext();
  const yearIds = new Set(SCHOOL_YEARS.map(y => y.id));
  const terms = SCHOOL_TERMS.filter(t => yearIds.has(t.yearId));
  const termIds = new Set(terms.map(t => t.id));

  const res = await fetch('api/schedules.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'publish_state',
      years: SCHOOL_YEARS,
      terms,
      subjects: CURRICULUM_SUBJECTS.filter(s => termIds.has(s.termId)),
      sections: ACADEMIC_SECTIONS.filter(s => termIds.has(s.termId)),
      catalog: SUBJECTS,
      departments: DEPARTMENTS,
      qualifications: FACULTY.map(f => ({ email: f.email, subjects: f.mainQuals || [] })),
      schedules: MASTER_SCHEDULE_DATA
        .map(c => ({ ...c, termId: c.termId || activeTerm.id }))
        .filter(c => termIds.has(c.termId))
    })
  });
  if (res.ok) await loadServerState();
}

function queueServerReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    // Let a pending schedule save finish so a reload can't undo it
    if (scheduleSaveTimer) queueServerReload();
    else loadServerState();
  }, 500);
}

function handleApiWriteSaved(url, body) {
  let action = '';
  try { action = JSON.parse(body).action || ''; } catch (e) {}
  if (RELOAD_AFTER_ACTIONS.has(action) || /rooms\.php/.test(url)) queueServerReload();
}

// Saves run one at a time, each carrying the version it was based on.
// If someone else saved first the server refuses, and the latest schedule is loaded.
let scheduleSaveChain = Promise.resolve();

function saveTermSchedule(action, termId, schedules, extra = {}) {
  if (IS_STANDALONE) return Promise.resolve({ ok: true });
  const result = scheduleSaveChain.then(async () => {
    const term = SCHOOL_TERMS.find(t => t.id === termId);
    const res = await fetch('api/schedules.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, term_id: termId, schedules, expected_version: term ? term.scheduleVersion : undefined, ...extra })
    });
    if (res.ok) {
      const body = await res.clone().json();
      if (term && body.schedule_version !== undefined) term.scheduleVersion = body.schedule_version;
    } else if (res.status === 409) {
      await loadServerState();
    }
    return res;
  });
  scheduleSaveChain = result.catch(() => {});
  return result;
}

// Saves the active term's timetable after a manual change
function queueScheduleSave() {
  if (IS_STANDALONE) return;
  clearTimeout(scheduleSaveTimer);
  scheduleSaveTimer = setTimeout(async () => {
    const { activeTerm } = getActiveAcademicContext();
    try {
      await saveTermSchedule('bulk_save_schedules', activeTerm.id, MASTER_SCHEDULE_DATA.filter(c => !c.termId || c.termId === activeTerm.id));
    } catch (e) {
      alert('Could not reach the server, so this schedule change exists only in this browser.');
    }
    scheduleSaveTimer = null;
  }, 600);
}

function postScheduleAction(body) {
  if (IS_STANDALONE) return;
  return fetch('api/schedules.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).catch(() => alert('Could not reach the server, so this change exists only in this browser.'));
}

function saveFacultyQualifications(fac) {
  postScheduleAction({ action: 'save_faculty_qualifications', email: fac.email, subjects: fac.mainQuals || [] });
}

function saveFacultyAvailability(fac) {
  postScheduleAction({ action: 'save_faculty_availability', email: fac.email, status: fac.status, days: fac.availableDays || [], shifts: fac.availableShifts || [], max_load: fac.maxLoad || 24 });
}

function saveCatalogSubject(subj) {
  return postScheduleAction({ action: 'save_catalog_subject', subject_code: subj.code, subject_title: subj.title, department: subj.dept, it_only: subj.itOnly ? 1 : 0, units: subj.units });
}

function deleteCatalogSubject(code) {
  postScheduleAction({ action: 'delete_catalog_subject', subject_code: code });
}

function saveDepartmentsToServer() {
  postScheduleAction({ action: 'save_departments', departments: DEPARTMENTS });
}

window.loadServerState = loadServerState;
window.queueScheduleSave = queueScheduleSave;
window.handleApiWriteSaved = handleApiWriteSaved;
