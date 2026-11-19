/* ═══════════════════════════════════════════════════
   SHARED DATABASE SYNC
   The database is the source of truth once published.
   localStorage is only a cache and the file:// demo store.
   ═══════════════════════════════════════════════════ */

// Saves that create records need a reload so the browser gets the server's IDs
const RELOAD_AFTER_ACTIONS = new Set([
  'save_school_year', 'save_term_subject', 'save_section',
  'split_section', 'auto_generate_sections', 'delete_section',
  'delete_catalog_subject', 'save_departments', 'save_faculty_qualifications', 'add_term_subjects', 'edit_user',
  'save_term', 'delete_term', 'save_certificate', 'delete_certificate', 'save_catalog_subject'
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
  const weeklyHours = subject ? (subjectPartMinutes(subject).lec + subjectPartMinutes(subject).lab) / 60 : 0;
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
    aiPlaced: Number(row.ai_generated) === 1,
    locked: Number(row.is_locked) === 1
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
    level: t.level === 'shs' ? 'shs' : 'tertiary',
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
      labUnits: s.lab_units === null || s.lab_units === undefined ? null : Number(s.lab_units),
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
    homeRoom: s.home_room || '',
    subjectTeachers: (() => { try { const plan = JSON.parse(s.subject_teachers || '{}'); return plan && typeof plan === 'object' ? plan : {}; } catch (e) { return {}; } })(),
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
      level: ['tertiary', 'shs', 'both'].includes(s.level) ? s.level : 'both',
      units: Number(s.units),
      addedOrder: Number(s.catalog_id) || undefined
    }));
  }
  if (Array.isArray(data.subjectSets)) {
    SUBJECT_SETS = data.subjectSets.map(s => {
      let items = [];
      try { items = JSON.parse(s.items_json) || []; } catch (e) {}
      return { id: Number(s.set_id), name: s.set_name, items };
    });
  }
  if (Array.isArray(data.certificates)) {
    FCC_CERTIFICATES = data.certificates.map(c => {
      let areas = [];
      try { areas = JSON.parse(c.areas_json) || []; } catch (e) {}
      return { id: Number(c.cert_id), name: c.cert_name, areas };
    });
  }
  applyServerFaculty(data);

  MASTER_SCHEDULE_DATA = data.schedules.map(row => mapServerClass(row, ACADEMIC_SECTIONS, CURRICULUM_SUBJECTS));

  saveStateToStorage();
  refreshAllSchedulingViews();
  updateUndoButton();
  refreshEditUndoBaseline();
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
      fac = { email, status: 'Full-time', maxLoad: 30, bg: colors[index % colors.length] };
      FACULTY.push(fac);
    }
    fac.name = `${row.first_name} ${row.last_name}`.trim();
    if (DEPARTMENTS.includes(row.subject_role) || !fac.dept) fac.dept = row.subject_role || DEPARTMENTS[0];
    fac.status = row.employment_status || 'Full-time';
    fac.maxLoad = Number(row.max_load) || defaultLoadUnits(fac.status).max;
    fac.minLoad = row.min_load === null || row.min_load === undefined ? null : Number(row.min_load);
    fac.teachingLevel = TEACHING_LEVEL_NAMES[row.teaching_level] ? row.teaching_level : 'tertiary';
    fac.seasoned = Number(row.seasoned) === 1;
    fac.availableDays = (row.available_days || '').split(',').filter(Boolean);
    fac.availableShifts = (row.available_shifts || '').split(',').filter(Boolean);
    const account = USERS.find(u => u.email.toLowerCase() === email);
    if (account) account.employmentType = fac.status;

    fac.certificates = (data.facultyCertificates || [])
      .filter(c => c.email.toLowerCase() === email)
      .map(c => Number(c.cert_id));
  });
  // Teachers with no account in the database (such as the built-in demo ones) can't be given classes
  const onServer = new Set(data.faculty.map(row => row.email.toLowerCase()));
  FACULTY.splice(0, FACULTY.length, ...FACULTY.filter(f => f.email && onServer.has(f.email.toLowerCase())));
}

// Whether the server answers. When it doesn't, a banner says the screen shows the last saved copy and that changes
// can't be saved; the app retries every 15 seconds and reloads the saved data once the server is back.
let serverReachable = true;
let serverRetryTimer = null;
// The last data loaded from the server, and how many saves succeeded since, so a change that couldn't be saved
// can be taken off the screen without hiding changes that were saved
let lastSavedServerData = null;
let savesSinceServerLoad = 0;

function markServerReachable(reachable) {
  if (IS_STANDALONE || reachable === serverReachable) return;
  serverReachable = reachable;
  let bar = document.getElementById('serverStatusBanner');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'serverStatusBanner';
    bar.className = 'server-status-banner';
    bar.setAttribute('role', 'alert');
    bar.textContent = "Can't reach the server. You're seeing the last saved copy, and changes can't be saved until the connection is back. Retrying…";
    document.body.prepend(bar);
  }
  bar.hidden = reachable;
  clearInterval(serverRetryTimer);
  serverRetryTimer = reachable ? null : setInterval(() => { if (CURRENT_USER) loadServerState(); }, 15000);
}

// A save that never reached the server: put the screen back to the saved data when that's safe, and say so
function handleSaveUnreachable() {
  markServerReachable(false);
  if (lastSavedServerData && savesSinceServerLoad === 0) {
    applyServerState(lastSavedServerData);
    return true;
  }
  return false;
}

async function loadServerState() {
  if (IS_STANDALONE || !CURRENT_USER) return;
  try {
    const res = await fetch('api/schedules.php?action=get_lifecycle', { headers: { 'Accept': 'application/json' } });
    if (res.status >= 500) markServerReachable(false);
    if (!res.ok) return;
    const body = await res.json();
    if (!body.success || !body.data) return;
    markServerReachable(true);

    if (body.data.initialized) {
      lastSavedServerData = body.data;
      savesSinceServerLoad = 0;
      applyServerState(body.data);
    } else if (canManageData() && !publishOffered) {
      publishOffered = true;
      const ok = await askConfirm('Publish the scheduling data in this browser so everyone uses it? This replaces the school years, terms, subjects, sections and schedules in the database.\n\nChoose Cancel if another browser has the correct data.', { title: 'The shared database has not been set up yet', confirmLabel: 'Publish this data' });
      if (ok) await publishLocalState();
    }
  } catch (e) {
    console.warn('Could not load shared data:', e);
    markServerReachable(false);
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
      subject_sets: SUBJECT_SETS,
      departments: DEPARTMENTS,
      certificates: FCC_CERTIFICATES.map(c => ({ ...c, holders: FACULTY.filter(f => (f.certificates || []).includes(c.id)).map(f => f.email) })),
      schedules: withFacultyEmails(MASTER_SCHEDULE_DATA)
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
  savesSinceServerLoad++;
  markServerReachable(true);
  let action = '';
  try { action = JSON.parse(body).action || ''; } catch (e) {}
  if (RELOAD_AFTER_ACTIONS.has(action) || /rooms\.php/.test(url)) queueServerReload();
}

// Saves run one at a time, each carrying the version it was based on.
// If someone else saved first the server refuses, and the latest schedule is loaded.
let scheduleSaveChain = Promise.resolve();

// Adds each class's teacher email, which the server uses to find the teacher
function withFacultyEmails(schedules) {
  return schedules.map(c => {
    const fac = FACULTY.find(f => f.name === c.instructor);
    return fac && fac.email ? { ...c, faculty_email: fac.email } : c;
  });
}

function saveTermSchedule(action, termId, schedules, extra = {}) {
  if (IS_STANDALONE) return Promise.resolve({ ok: true });
  const result = scheduleSaveChain.then(async () => {
    const term = SCHOOL_TERMS.find(t => t.id === termId);
    const res = await fetch('api/schedules.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, term_id: termId, schedules: withFacultyEmails(schedules), expected_version: term ? term.scheduleVersion : undefined, ...extra })
    });
    if (res.ok) {
      const body = await res.clone().json();
      if (term && body.schedule_version !== undefined) term.scheduleVersion = body.schedule_version;
      if (term && term.id === editUndoTermId && body.schedule_version !== undefined) editUndoKnownVersion = body.schedule_version;
    } else if (res.status === 409) {
      await loadServerState();
    }
    return res;
  });
  scheduleSaveChain = result.catch(() => {});
  return result;
}

// Undo for hand edits (add, move, edit, delete, lock). Each saved change remembers the timetable as it was just
// before, up to the last 10. If someone else changes the same term, the list is cleared, so Undo can never
// remove their work.
const EDIT_UNDO_LIMIT = 10;
let editUndoStack = [];
let editUndoBaseline = null;     // this term's classes as last saved or loaded
let editUndoTermId = null;
let editUndoKnownVersion = null; // the term's schedule version after our own last save
let undoInProgress = false;
const copyClasses = list => list.map(c => ({ ...c }));

function clearEditUndo() {
  editUndoStack = [];
  editUndoBaseline = copyClasses(activeTermClasses());
  updateUndoEditButton();
}
// After data loads: start over for a new term, or when the version moved because of someone else's save
function refreshEditUndoBaseline() {
  const { activeTerm } = getActiveAcademicContext();
  if (!activeTerm) return;
  if (editUndoTermId !== activeTerm.id || (editUndoKnownVersion !== null && activeTerm.scheduleVersion !== editUndoKnownVersion)) editUndoStack = [];
  editUndoTermId = activeTerm.id;
  editUndoKnownVersion = activeTerm.scheduleVersion ?? null;
  editUndoBaseline = copyClasses(activeTermClasses());
  updateUndoEditButton();
}
function updateUndoEditButton() {
  const btn = document.getElementById('btnUndoEdit');
  if (!btn) return;
  btn.disabled = editUndoStack.length === 0 || !canEditSchedule();
  btn.textContent = editUndoStack.length ? `Undo Last Change (${editUndoStack.length})` : 'Undo Last Change';
}
window.undoLastEdit = function() {
  if (!editUndoStack.length || !canEditSchedule()) return;
  const { activeTerm } = getActiveAcademicContext();
  const previous = editUndoStack.pop();
  MASTER_SCHEDULE_DATA = MASTER_SCHEDULE_DATA.filter(c => c.termId && c.termId !== activeTerm.id).concat(copyClasses(previous));
  editUndoBaseline = copyClasses(previous);
  undoInProgress = true;
  saveStateToStorage();
  renderGrid();
  updateScheduleStats();
  queueScheduleSave();
  updateUndoEditButton();
  alert('Your last change was undone.');
};

// Saves the active term's timetable after a manual change
function queueScheduleSave() {
  if (IS_STANDALONE) return;
  // Remember the timetable as it was before this change, unless this save is itself an Undo
  if (!undoInProgress && editUndoBaseline) {
    editUndoStack.push(editUndoBaseline);
    if (editUndoStack.length > EDIT_UNDO_LIMIT) editUndoStack.shift();
  }
  undoInProgress = false;
  editUndoBaseline = copyClasses(activeTermClasses());
  updateUndoEditButton();
  clearTimeout(scheduleSaveTimer);
  scheduleSaveTimer = setTimeout(async () => {
    const { activeTerm } = getActiveAcademicContext();
    try {
      await saveTermSchedule('bulk_save_schedules', activeTerm.id, MASTER_SCHEDULE_DATA.filter(c => !c.termId || c.termId === activeTerm.id));
    } catch (e) {
      if (!e || !e.reported) alert("Couldn't reach the server, so this schedule change wasn't saved. Check your connection and try again.");
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
  }).catch(e => { if (!e || !e.reported) alert("Couldn't reach the server, so this change wasn't saved. Check your connection and try again."); });
}

function saveFacultyQualifications(fac, removeClasses = false) {
  postScheduleAction({ action: 'save_faculty_qualifications', email: fac.email, cert_ids: fac.certificates || [], remove_classes: removeClasses });
}

function saveCertificateToServer(cert, isNew, removeClasses = false) {
  postScheduleAction({ action: 'save_certificate', cert_id: isNew ? 0 : cert.id, cert_name: cert.name, areas: cert.areas, remove_classes: removeClasses });
}

function deleteCertificateFromServer(certId, removeClasses = false) {
  postScheduleAction({ action: 'delete_certificate', cert_id: certId, remove_classes: removeClasses });
}

function saveFacultyAvailability(fac) {
  postScheduleAction({ action: 'save_faculty_availability', email: fac.email, status: fac.status, days: fac.availableDays || [], shifts: fac.availableShifts || [], max_load: facultyMaxUnits(fac), min_load: facultyMinUnits(fac), teaching_level: facultyTeachingLevel(fac), seasoned: fac.seasoned ? 1 : 0 });
}

function saveCatalogSubject(subj) {
  return postScheduleAction({ action: 'save_catalog_subject', subject_code: subj.code, subject_title: subj.title, department: subj.dept, units: subj.units, level: catalogLevel(subj) });
}

function deleteCatalogSubject(code) {
  postScheduleAction({ action: 'delete_catalog_subject', subject_code: code });
}

function saveDepartmentsToServer() {
  postScheduleAction({ action: 'save_departments', departments: DEPARTMENTS });
}
