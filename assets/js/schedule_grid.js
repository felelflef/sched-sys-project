/* ══════════════════════════════════════════════════════════════════════════
   STEP 7: TIMETABLE GRID, CLASS EDITING, DRAG AND DROP, MANUAL SLOTS, STATS
   Part of the Master Schedule; the schedule_*.js files load in order (see the page's script tags).
   ══════════════════════════════════════════════════════════════════════════ */

function updateSectionDropdown() {
  const prog = document.getElementById('programFilter')?.value || 'all';
  const yr = document.getElementById('yearFilter')?.value || 'all';
  const secSelect = document.getElementById('sectionSelect');
  if (!secSelect) return;

  const { activeTerm } = getActiveAcademicContext();
  let list = ACADEMIC_SECTIONS.filter(s => !activeTerm || s.termId === activeTerm.id);
  if (prog !== 'all') list = list.filter(s => s.program === prog);
  if (yr !== 'all') list = list.filter(s => String(s.year) === yr);

  if (list.length === 0) {
    secSelect.innerHTML = `<option value="">-- No Sections in this Term --</option>`;
    currentSelectedSection = '';
    return;
  }

  secSelect.innerHTML = list.map(s => `
    <option value="${escapeHtml(s.code)}" ${s.code === currentSelectedSection ? 'selected' : ''}>
      ${escapeHtml(s.code)} (${escapeHtml(s.name)})
    </option>
  `).join('');

  if (list.length > 0 && !list.some(s => s.code === currentSelectedSection)) {
    currentSelectedSection = list[0].code;
  }
}

/* ─── Faculty Qualification & Department Eligibility Conflict Checker ─── */
// Matches the server's SHIFT_WINDOWS, in minutes from midnight
const SHIFT_WINDOWS = { AM: [420, 780], MIDSHIFT: [600, 960], PM: [780, 1230] };

// Generated classes finish by 7:00 PM
const LAST_GENERATED_MINUTE = 19 * 60;

function subjectWeeklyMinutes(subj) {
  const minutes = subjectPartMinutes(subj);
  return minutes.lec + minutes.lab;
}

// Under 3 hours is one meeting; longer subjects split into meetings of at most 4 hours
function splitIntoMeetings(totalMinutes) {
  if (totalMinutes < 180) return [totalMinutes];
  const count = totalMinutes <= 480 ? 2 : Math.ceil(totalMinutes / 240);
  const longest = Math.ceil(totalMinutes / count / 30) * 30;
  const lengths = [];
  let left = totalMinutes;
  for (let i = 0; i < count; i++) {
    const length = i === count - 1 ? left : Math.min(longest, left);
    lengths.push(length);
    left -= length;
  }
  return lengths;
}

function dayCombinations(days, size) {
  if (size === 0) return [[]];
  return days.flatMap((day, i) => dayCombinations(days.slice(i + 1), size - 1).map(rest => [day, ...rest]));
}

// Terms whose dates overlap run at the same time, such as College 1st Sem and SHS 1st Term. A teacher or
// room can't be in a class of each at the same hour, and a teacher's units in both add up.
function concurrentTermIds(termId) {
  const term = SCHOOL_TERMS.find(t => t.id === termId);
  if (!term || !term.startDate || !term.endDate) return [];
  return SCHOOL_TERMS.filter(t => t.id !== termId && t.startDate && t.endDate && t.startDate <= term.endDate && t.endDate >= term.startDate).map(t => t.id);
}
function concurrentClasses(termId) {
  const ids = concurrentTermIds(termId);
  return MASTER_SCHEDULE_DATA.filter(c => c.termId && ids.includes(c.termId));
}
// A teacher's units in overlapping terms: the busiest overlapping term of each level counts, since the
// terms of one level follow each other instead of running together
function concurrentLoadUnits(name, termId) {
  const busiest = {};
  concurrentTermIds(termId).forEach(id => {
    const level = termSchoolLevel(id);
    busiest[level] = Math.max(busiest[level] || 0, facultyLoadUnits(name, MASTER_SCHEDULE_DATA.filter(c => c.termId === id)));
  });
  return Object.values(busiest).reduce((sum, units) => sum + units, 0);
}
function termWithLevel(termId) {
  return `${termLabelFor(termId)} (${LEVEL_NAMES[termSchoolLevel(termId)]})`;
}
// A room or teacher already booked at that hour in a term running at the same time
function overlappingTermClash(cls) {
  if (!cls.termId) return null;
  const start = timeToMinutes(cls.startTime);
  const end = timeToMinutes(cls.endTime);
  for (const other of concurrentClasses(cls.termId)) {
    if (other.day !== cls.day || !(start < timeToMinutes(other.endTime) && end > timeToMinutes(other.startTime))) continue;
    const where = `${other.subjectCode} for ${other.section} in ${termWithLevel(other.termId)}`;
    if (other.room === cls.room) return `Room ${cls.room} is already booked for ${where}`;
    if (other.instructor === cls.instructor) return `${cls.instructor} already teaches ${where} at this time`;
  }
  return null;
}

// The instructor chosen for a section's subject in Rooms & Instructors, or null for Automatic
function sectionChosenTeacher(sec, subjectCode) {
  const email = (sec && sec.subjectTeachers || {})[String(subjectCode || '').toUpperCase()];
  return email ? FACULTY.find(f => (f.email || '').toLowerCase() === String(email).toLowerCase()) || null : null;
}

// The active term's classes plus those of terms running alongside it, for checks that must not strand a class
function currentAndOverlappingClasses() {
  const { activeTerm } = getActiveAcademicContext();
  return [...activeTermClasses(), ...concurrentClasses(activeTerm.id)];
}
// For display: of each other level's overlapping terms, the one that overlaps this term the longest
function pairedTermIds(termId) {
  const term = SCHOOL_TERMS.find(t => t.id === termId);
  if (!term) return [];
  const days = other => (Math.min(new Date(term.endDate), new Date(other.endDate)) - Math.max(new Date(term.startDate), new Date(other.startDate))) / 86400000;
  const best = {};
  concurrentTermIds(termId).forEach(id => {
    const other = SCHOOL_TERMS.find(t => t.id === id);
    const level = termSchoolLevel(id);
    if (!best[level] || days(other) > best[level].days) best[level] = { id, days: days(other) };
  });
  return Object.values(best).map(b => b.id);
}

function activeTermClasses() {
  const { activeTerm } = getActiveAcademicContext();
  return MASTER_SCHEDULE_DATA.filter(c => !c.termId || c.termId === activeTerm.id);
}

function classMinutes(c) {
  return timeToMinutes(c.endTime) - timeToMinutes(c.startTime);
}

// A class's share of its subject's units: all of a subject's meetings add up to its units
function classUnits(c) {
  const termId = c.termId || getActiveAcademicContext().activeTerm.id;
  const sec = ACADEMIC_SECTIONS.find(s => s.code === c.section && s.termId === termId);
  const subj = sec && curriculumSubjectFor(sec, c.subjectCode, termId);
  if (!subj) return classMinutes(c) / 60;
  const total = subjectWeeklyMinutes(subj);
  return total > 0 ? (Number(subj.units) || 0) * classMinutes(c) / total : 0;
}

function facultyLoadUnits(name, classes = activeTermClasses()) {
  return classes.filter(c => c.instructor === name).reduce((sum, c) => sum + classUnits(c), 0);
}

function formatUnits(units) {
  return +Number(units || 0).toFixed(1);
}

function facultyWeeklyHours(name) {
  return activeTermClasses().filter(c => c.instructor === name).reduce((sum, c) => sum + classMinutes(c), 0) / 60;
}

// Each subject part (lecture, lab) a section needs this term, with how many minutes are scheduled
function sectionSubjectProgress(section) {
  const { activeTerm } = getActiveAcademicContext();
  const classes = activeTermClasses().filter(c => c.section === section.code);
  return CURRICULUM_SUBJECTS
    .filter(s => s.isIncluded !== false && s.termId === activeTerm.id && s.program === section.program && Number(s.year) === Number(section.year))
    .flatMap(subject => subjectParts(subject).map(({ part, minutes }) => ({
      subject,
      part,
      label: subjectPartLabel(subject, part),
      requiredMinutes: minutes,
      scheduledMinutes: classes.filter(c => (c.subjectCode || '').toUpperCase() === subject.code.toUpperCase() && classPart(c, subject, section.program) === part)
        .reduce((sum, c) => sum + classMinutes(c), 0)
    })));
}

function isSectionFullyScheduled(section) {
  const progress = sectionSubjectProgress(section);
  return progress.length > 0 && progress.every(p => p.scheduledMinutes >= p.requiredMinutes);
}

// Faculty accounts can view schedules but not change them
function canEditSchedule() {
  return !CURRENT_USER || CURRENT_USER.role !== 'faculty';
}

function applyScheduleRole() {
  document.body.classList.toggle('role-faculty', !canEditSchedule());
  document.body.classList.toggle('role-program-head', !!(CURRENT_USER && CURRENT_USER.role === 'program-head'));
}

// Selected shifts that touch or overlap count as one continuous window
function isWithinAvailability(days, shifts, day, startTime, endTime) {
  if (!days.includes(day)) return false;
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  let from = null;
  let to = null;
  for (const [shift, [shiftStart, shiftEnd]] of Object.entries(SHIFT_WINDOWS)) {
    if (!shifts.includes(shift)) continue;
    if (from !== null && shiftStart > to) {
      if (start >= from && end <= to) return true;
      from = null;
    }
    if (from === null) from = shiftStart;
    to = shiftEnd;
  }
  return from !== null && start >= from && end <= to;
}

// A part-time professor with no days or shifts set has no limit yet
const CLASS_DAY_START = 7 * 60;
const CLASS_DAY_END = 20 * 60 + 30;

// The curriculum subject a class teaches, for its section's program and year in that term
function curriculumSubjectFor(sec, subjectCode, termId) {
  const code = (subjectCode || '').toUpperCase();
  return CURRICULUM_SUBJECTS.find(s => s.termId === termId && s.isIncluded !== false && s.program === sec.program
    && Number(s.year) === Number(sec.year) && (s.code || '').toUpperCase() === code) || null;
}

// Units of the subject a class teaches. Each meeting only stores its share of the units.
function subjectUnitsFor(c) {
  const termId = c.termId || getActiveAcademicContext().activeTerm.id;
  const sec = ACADEMIC_SECTIONS.find(s => s.code === c.section && s.termId === termId);
  const subj = sec && curriculumSubjectFor(sec, c.subjectCode, termId);
  return subj ? subj.units : (c.units || 0);
}

// Total units of the subjects in a list of classes, counting each section's subject once
function totalSubjectUnits(classes) {
  const seen = new Map();
  classes.forEach(c => {
    const key = `${c.termId}|${c.section}|${(c.subjectCode || '').toUpperCase()}`;
    if (!seen.has(key)) seen.set(key, subjectUnitsFor(c));
  });
  return +[...seen.values()].reduce((sum, units) => sum + (Number(units) || 0), 0).toFixed(1);
}

// A room must seat the section, and lab subjects need the right kind of lab
// A lab can hold the subject's lab hours; any other room its lecture hours
function roomFitProblem(room, subj, sec) {
  if (room.cap < sec.studentCount) return `${room.code} seats ${room.cap}, but ${sec.code} has ${sec.studentCount} students.`;
  const { lec, lab } = subjectPartMinutes(subj);
  if (lab > 0 && isLabRoomFor(room, sec.program)) return null;
  const isSpecial = room.type === 'Special' || /kitchen|tourism/i.test(room.code);
  if (lec === 0) {
    const needed = KITCHEN_PROGRAMS.includes(sec.program) ? 'the Kitchen Lab' : TOURISM_LAB_PROGRAMS.includes(sec.program) ? 'the Tourism Lab' : 'a computer lab';
    return `${subj.code} only has lab hours, so it needs ${needed}. ${room.code} is a ${room.type} room.`;
  }
  if (isSpecial) return `${room.code} is a specialized lab, so it can't be used for ${subj.code}'s lecture hours.`;
  return null;
}

// True when a class no longer fits its section after the section is changed
function sectionChangeBreaks(c, updatedSec) {
  const subj = curriculumSubjectFor(updatedSec, c.subjectCode, updatedSec.termId);
  if (!subj) return true;
  const room = ROOMS.find(r => r.code === c.room);
  return !!(room && roomFitProblem(room, subj, updatedSec));
}

// Lists the classes a change would break and asks before saving. Resolves true to go ahead.
// The caller takes the classes off the schedule with removeClassesAndSave once every prompt is confirmed.
function askToUnscheduleBroken(affected, title, reason) {
  if (affected.length === 0) return Promise.resolve(true);
  const listed = affected.slice(0, 6).map(c => `${c.section} ${c.subjectCode} (${c.day} ${formatTime12(c.startTime)})`).join(', ');
  const more = affected.length > 6 ? `, and ${affected.length - 6} more` : '';
  const them = affected.length === 1 ? 'it' : 'them';
  return askConfirm(`${reason}\n\nThis affects ${scheduledClassesNote(affected)}: ${listed}${more}.\n\nSaving takes ${them} off the schedule, so ${affected.length === 1 ? 'it shows' : 'they show'} as missing hours and can be placed again.`,
    { title, confirmLabel: 'Save and unschedule', danger: true });
}

// Rules for a class placed by hand, on top of clash, qualification and availability checks
function placementProblem(cls, ignoreId = null) {
  const termId = cls.termId || getActiveAcademicContext().activeTerm.id;
  const start = timeToMinutes(cls.startTime);
  const end = timeToMinutes(cls.endTime);
  if (start < CLASS_DAY_START || end > CLASS_DAY_END) {
    return `Classes must be between 7:00 AM and 8:30 PM. This one would run ${formatTime12(cls.startTime)} to ${formatTime12(cls.endTime)}.`;
  }
  const sec = ACADEMIC_SECTIONS.find(s => s.code === cls.section && s.termId === termId);
  if (!sec) return `Section ${cls.section} doesn't exist in this term.`;
  const subj = curriculumSubjectFor(sec, cls.subjectCode, termId);
  if (!subj) return `${cls.subjectCode} isn't an included subject for ${sec.code} (${sec.program} ${yearLevelLabel(sec.year)}) this term. Add it in Step 3 first.`;
  const room = ROOMS.find(r => r.code === cls.room);
  if (!room) return `Room ${cls.room} doesn't exist.`;
  const roomProblem = roomFitProblem(room, subj, sec);
  if (roomProblem) return roomProblem;
  const part = classPart(cls, subj, sec.program);
  const partMinutes = MASTER_SCHEDULE_DATA
    .filter(c => c.id !== ignoreId && c.section === sec.code && (c.termId || termId) === termId
      && (c.subjectCode || '').toUpperCase() === subj.code.toUpperCase() && classPart(c, subj, sec.program) === part)
    .reduce((sum, c) => sum + timeToMinutes(c.endTime) - timeToMinutes(c.startTime), 0) + (end - start);
  const partRequired = subjectPartMinutes(subj)[part];
  if (partMinutes > partRequired) {
    const partName = part === 'lab' ? 'lab' : (subjectPartMinutes(subj).lab > 0 ? 'lecture' : 'weekly');
    return `${sec.code} would have ${+(partMinutes / 60).toFixed(1)} ${partName} hrs of ${subj.code}, but it needs only ${+(partRequired / 60).toFixed(1)}.`;
  }
  const fac = FACULTY.find(f => f.name === cls.instructor);
  if (fac) {
    const otherUnits = concurrentLoadUnits(fac.name, termId);
    const units = facultyLoadUnits(fac.name, MASTER_SCHEDULE_DATA.filter(c => c.id !== ignoreId && (c.termId || termId) === termId))
      + classUnits({ ...cls, termId }) + otherUnits;
    const maxLoad = facultyMaxUnits(fac);
    if (units > maxLoad + 0.001) return `${fac.name} would teach ${formatUnits(units)} units${otherUnits > 0 ? ' a week, counting their classes in overlapping terms' : ''}, over their ${maxLoad}-unit max load.`;
  }
  return null;
}

function facultyAvailabilityProblem(instructorName, day, startTime, endTime) {
  const fac = FACULTY.find(f => f.name && f.name.toLowerCase() === (instructorName || '').toLowerCase());
  if (!fac || fac.status !== 'Part-time' || !(fac.availableDays || []).length || !(fac.availableShifts || []).length) return null;
  if (isWithinAvailability(fac.availableDays, fac.availableShifts, day, startTime, endTime)) return null;
  return `Not Available: ${fac.name} only teaches ${fac.availableDays.join(', ')} during ${fac.availableShifts.join(', ')} shift`;
}

function checkFacultySubjectConflict(instructorName, subjectCode, sectionCode) {
  if (!instructorName || instructorName === 'TBA' || instructorName === 'Unassigned') {
    return 'Instructor Unassigned';
  }

  // Check the faculty profile
  const fac = FACULTY.find(f => f.name && f.name.toLowerCase() === instructorName.toLowerCase());
  if (!fac) {
    return `Unregistered Faculty: ${instructorName}`;
  }

  // Main qualifications are the only list of what a teacher may teach
  if (!isFacultyQualified(fac, subjectCode)) {
    return `Not Qualified: ${fac.name} has no FCC certificate covering ${(subjectCode || '').toUpperCase()}`;
  }

  // The teacher's teaching level must include the section's level
  const level = sectionSchoolLevel(sectionCode);
  if (!facultyTeachesLevel(fac, level)) {
    return `Wrong Level: ${fac.name} teaches ${TEACHING_LEVEL_NAMES[facultyTeachingLevel(fac)]} only, and ${sectionCode} is a ${level === 'shs' ? 'Senior High School' : 'college'} section`;
  }

  return null;
}

/* ─── Main Timetable Grid Renderer ─── */
// Step 7 shows one section, room or professor at a time. Room and professor views also show the classes of the
// term running alongside (College with SHS), read-only, because those hold the same rooms and teachers.
let gridMode = 'section';
const gridSelection = { room: '', teacher: '' };
const GRID_MODE_LABELS = { section: 'Section', room: 'Room', teacher: 'Professor' };

function gridModeClasses() {
  const { activeTerm } = getActiveAcademicContext();
  if (gridMode === 'section') return activeTermClasses().filter(c => c.section === currentSelectedSection);
  const selected = gridSelection[gridMode];
  const alongside = MASTER_SCHEDULE_DATA.filter(c => c.termId && pairedTermIds(activeTerm.id).includes(c.termId));
  return [...activeTermClasses(), ...alongside].filter(c => gridMode === 'room' ? c.room === selected : c.instructor === selected);
}

window.setGridMode = function(mode) {
  gridMode = mode;
  document.querySelectorAll('[data-grid-mode]').forEach(btn => {
    const on = btn.dataset.gridMode === mode;
    btn.classList.toggle('btn-primary', on);
    btn.classList.toggle('btn-outline', !on);
    btn.setAttribute('aria-pressed', String(on));
  });
  document.getElementById('gridSectionPickers').hidden = mode !== 'section';
  document.getElementById('gridOtherPicker').hidden = mode === 'section';
  renderGrid();
};
window.setGridSelection = function(value) {
  gridSelection[gridMode] = value;
  renderGrid();
};

function renderRoomOrTeacherGrid(tbody) {
  const { activeSy, activeTerm } = getActiveAcademicContext();
  const options = gridMode === 'room'
    ? ROOMS.map(r => ({ value: r.code, label: `${r.code} (${r.type}, ${r.cap} seats)` })).sort((a, b) => a.label.localeCompare(b.label))
    : FACULTY.map(f => ({ value: f.name, label: f.dept ? `${f.name} (${f.dept})` : f.name })).sort((a, b) => a.label.localeCompare(b.label));
  if (!options.some(o => o.value === gridSelection[gridMode])) gridSelection[gridMode] = options.length ? options[0].value : '';
  const selected = gridSelection[gridMode];
  document.getElementById('gridPickLabel').textContent = `${GRID_MODE_LABELS[gridMode]}:`;
  const pick = document.getElementById('gridPickSelect');
  pick.innerHTML = options.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('');
  pick.value = selected;

  const classes = gridModeClasses();
  const weeklyHours = classes.reduce((sum, c) => sum + timeToMinutes(c.endTime) - timeToMinutes(c.startTime), 0) / 60;
  document.getElementById('sheetSectionTitle').textContent = selected || `No ${GRID_MODE_LABELS[gridMode]}`;
  if (gridMode === 'room') {
    const room = ROOMS.find(r => r.code === selected);
    document.getElementById('sheetProgramYear').textContent = `Room timetable • ${activeTerm.termName} ${activeSy.yearCode}`;
    [['Room Type', room ? room.type : '—'], ['Capacity', room ? `${room.cap} seats` : '—'], ['Weekly Hours', `${weeklyHours.toFixed(1)} hrs`]]
      .forEach(([label, value], i) => setSheetStat(i, label, value));
  } else {
    const fac = FACULTY.find(f => f.name === selected);
    const load = fac ? facultyLoadUnits(fac.name) + concurrentLoadUnits(fac.name, activeTerm.id) : 0;
    document.getElementById('sheetProgramYear').textContent = `Professor timetable • ${activeTerm.termName} ${activeSy.yearCode}`;
    [['Teaching Load', fac ? `${formatUnits(load)} of ${facultyMinUnits(fac)}–${facultyMaxUnits(fac)} units` : '—'], ['Weekly Teaching', `${weeklyHours.toFixed(1)} hrs`], ['Department', (fac && fac.dept) || '—']]
      .forEach(([label, value], i) => setSheetStat(i, label, value));
  }
  tbody.innerHTML = timetableRowsHtml(classes, !canEditSchedule());
  renderTimetableHours(classes, 'hrs-', 'weeklyTotalHours');
}
// The three numbers under the timetable title
function setSheetStat(index, label, value) {
  const labels = ['sheetStatLabel1', 'sheetStatLabel2', 'sheetStatLabel3'];
  const values = ['sheetTotalUnits', 'sheetStudentsCount', 'sheetAdviser'];
  document.getElementById(labels[index]).textContent = label;
  document.getElementById(values[index]).textContent = value;
}

function renderGrid() {
  const tbody = document.getElementById('sectionGridBody');
  if (!tbody) return;
  applyScheduleRole();
  queueUnassignedBannerRefresh();
  if (!canEditSchedule() && ACTIVE_SCHEDULE_STEP !== 7) {
    goToScheduleStep(7);
    return;
  }
  if (gridMode !== 'section') return renderRoomOrTeacherGrid(tbody);

  const { activeSy, activeTerm } = getActiveAcademicContext();
  let filteredClasses = [];

  // Section View
  {
    if (!currentSelectedSection) {
      document.getElementById('sheetProgramYear').textContent = `${activeTerm.termName} ${activeSy.yearCode}`;
      document.getElementById('sheetSectionTitle').textContent = 'No Section Selected';
      document.getElementById('sheetStatLabel1').textContent = 'Total Units';
      document.getElementById('sheetTotalUnits').textContent = '0';
      document.getElementById('sheetStatLabel2').textContent = '# of Students';
      document.getElementById('sheetStudentsCount').textContent = '0';
      document.getElementById('sheetStatLabel3').textContent = 'Adviser';
      document.getElementById('sheetAdviser').textContent = '—';
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:48px 16px; color:var(--text-secondary);"><div style="font-size:1.143rem; font-weight:700; color:var(--text-primary); margin-bottom:8px;">No Sections Configured for ${escapeHtml(activeTerm.termName)} ${escapeHtml(activeSy.yearCode)}</div><div>Please go to <strong>Step 4 (Create Sections)</strong> to add or generate sections for this academic period.</div></td></tr>`;
      return;
    }
    filteredClasses = MASTER_SCHEDULE_DATA.filter(c => c.section === currentSelectedSection && (!c.termId || c.termId === activeTerm.id));

    const secMeta = ACADEMIC_SECTIONS.find(s => s.code === currentSelectedSection && s.termId === activeTerm.id) || ACADEMIC_SECTIONS.find(s => s.code === currentSelectedSection) || {
      code: currentSelectedSection,
      name: currentSelectedSection,
      program: 'BSIT',
      year: 1,
      studentCount: 38,
      shift: 'AM'
    };

    const totalUnits = totalSubjectUnits(filteredClasses);

    document.getElementById('sheetSectionTitle').textContent = secMeta.code;
    document.getElementById('sheetProgramYear').textContent = `${secMeta.program} \u2022 ${yearLevelLabel(secMeta.year)} (${secMeta.name}) \u2022 ${secMeta.shift || 'AM'} shift \u2022 ${activeTerm.termName} ${activeSy.yearCode}`;
    document.getElementById('sheetStatLabel1').textContent = 'Total Units';
    document.getElementById('sheetTotalUnits').textContent = String(totalUnits);
    document.getElementById('sheetStatLabel2').textContent = '# of Students';
    document.getElementById('sheetStudentsCount').textContent = String(secMeta.studentCount || 35);
    document.getElementById('sheetStatLabel3').textContent = 'Adviser';
    document.getElementById('sheetAdviser').textContent = sectionAdviserName(secMeta) || '—';
  }
  tbody.innerHTML = timetableRowsHtml(filteredClasses, !canEditSchedule());
  renderTimetableHours(filteredClasses, 'hrs-', 'weeklyTotalHours');
}

// Builds the timetable rows. readOnly leaves out editing, dragging and conflict notes.
// A class from the other level's term shown alongside the active term, such as "SHS · 1st Term"
function otherTermBadge(item) {
  const { activeTerm } = getActiveAcademicContext();
  if (!item.termId || item.termId === activeTerm.id) return '';
  const term = SCHOOL_TERMS.find(t => t.id === item.termId);
  const level = termSchoolLevel(item.termId) === 'shs' ? 'SHS' : 'College';
  return ` <span class="class-ai-badge" style="background:#F3E8FF; color:#6B21A8;" title="${escapeHtml(termWithLevel(item.termId))}">${level}${term ? ` · ${escapeHtml(term.termName)}` : ''}</span>`;
}

// " · Lab" or " · Lecture" on a class of a subject that has both parts
function classPartTag(item) {
  const sec = ACADEMIC_SECTIONS.find(s => s.code === item.section && (!item.termId || s.termId === item.termId));
  const subj = sec && curriculumSubjectFor(sec, item.subjectCode, sec.termId);
  if (!subj || subjectParts(subj).length < 2) return '';
  return classPart(item, subj, sec.program) === 'lab' ? ' · Lab' : ' · Lecture';
}

function timetableRowsHtml(filteredClasses, readOnly = false) {
  const viewedTermId = getActiveAcademicContext().activeTerm.id;
  // Auto-trim used range: Calculate earliest start & latest end
  let minMinutes = 7 * 60; // 07:00
  let maxMinutes = 19 * 60; // 19:00

  if (filteredClasses.length > 0) {
    let earliest = 24 * 60;
    let latest = 0;
    filteredClasses.forEach(c => {
      const s = timeToMinutes(c.startTime);
      const e = timeToMinutes(c.endTime);
      if (s < earliest) earliest = s;
      if (e > latest) latest = e;
    });

    // Round down to closest 30 min boundary, with 30 min buffer
    minMinutes = Math.max(7 * 60, Math.floor((earliest - 30) / 30) * 30);
    maxMinutes = Math.min(21 * 60, Math.ceil((latest + 30) / 30) * 30);
  }

  // Generate 30-min time slots within used range
  const slots = [];
  for (let m = minMinutes; m < maxMinutes; m += 30) {
    slots.push(m);
  }

  // Pre-calculate merged cells layout
  const gridMatrix = {}; // key: day -> object of slotMin -> cell descriptor
  DAYS.forEach(day => {
    gridMatrix[day] = {};
  });

  filteredClasses.forEach(c => {
    const sMin = timeToMinutes(c.startTime);
    const eMin = timeToMinutes(c.endTime);
    const duration = Math.max(30, eMin - sMin);
    const rowspan = Math.round(duration / 30);

    if (gridMatrix[c.day]) {
      gridMatrix[c.day][sMin] = {
        type: 'class',
        classItem: c,
        rowspan
      };
      // Mark intermediate slots as consumed
      for (let s = sMin + 30; s < eMin; s += 30) {
        gridMatrix[c.day][s] = { type: 'consumed' };
      }
    }
  });

  // Check conflicts across global data (same room, instructor, or section overlap)
  function checkClassConflict(classItem) {
    const sMin = timeToMinutes(classItem.startTime);
    const eMin = timeToMinutes(classItem.endTime);

    for (const other of MASTER_SCHEDULE_DATA) {
      if (other.id === classItem.id) continue;
      if (other.day !== classItem.day) continue;
      if (other.termId && classItem.termId && other.termId !== classItem.termId) continue;

      const osMin = timeToMinutes(other.startTime);
      const oeMin = timeToMinutes(other.endTime);

      if (sMin < oeMin && eMin > osMin) {
        if (other.room === classItem.room) return 'Room double-booked';
        if (other.instructor === classItem.instructor) return 'Faculty double-booked';
        if (other.section === classItem.section) return 'Section double-booked';
      }
    }
    const overlappingTerm = overlappingTermClash(classItem);
    if (overlappingTerm) return overlappingTerm;

    const qualConflict = checkFacultySubjectConflict(classItem.instructor, classItem.subjectCode, classItem.section);
    if (qualConflict) return qualConflict;
    return facultyAvailabilityProblem(classItem.instructor, classItem.day, classItem.startTime, classItem.endTime);
  }

  // Render HTML rows
  let rowsHtml = '';
  slots.forEach(slotMin => {
    const timeStr = minutesToTime(slotMin);
    rowsHtml += `<tr>`;
    rowsHtml += `<td class="time-col-cell">${formatTime12(timeStr)}</td>`;

    DAYS.forEach(day => {
      const cell = gridMatrix[day][slotMin];

      if (cell && cell.type === 'consumed') {
        // Skip rendering because upper merged cell spans over this
        return;
      }

      if (cell && cell.type === 'class') {
        const item = cell.classItem;
        // A class of the term running alongside is shown for reference; it is edited from its own term
        const cellReadOnly = readOnly || (item.termId && item.termId !== viewedTermId);
        const conflictReason = cellReadOnly ? null : checkClassConflict(item);
        const conflictClass = conflictReason ? 'has-conflict' : '';
        const itemType = (item.type || 'lecture').toLowerCase();

        rowsHtml += `
          <td class="class-block-cell type-${itemType} ${conflictClass}"
              rowspan="${cell.rowspan}"
              ${cellReadOnly ? '' : `draggable="true"
              ondragstart="handleClassDragStart(event, '${item.id}')"
              onclick="showClassDetails('${item.id}')"
              tabindex="0" role="button"
              aria-label="${escapeHtml(item.subjectCode)} for ${escapeHtml(item.section)}, ${escapeHtml(item.day)} ${formatTime12(item.startTime)} to ${formatTime12(item.endTime)}, ${escapeHtml(item.room)}, ${escapeHtml(item.instructor)}. Press Enter for details."`}
              title="${escapeHtml(item.subjectCode)}: ${escapeHtml(item.subjectTitle || '')} (${formatTime12(item.startTime)} – ${formatTime12(item.endTime)})">
            <div class="class-cell-inner">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:4px;">
                <span class="class-sec-badge">${escapeHtml(item.section)}${item.aiPlaced ? ' <span class="class-ai-badge" title="Placed by AI">AI</span>' : ''}${item.locked ? ' <span class="class-lock-badge" title="Locked: Generate keeps this class where it is">Locked</span>' : ''}${otherTermBadge(item)}</span>
                ${cellReadOnly ? '' : `<button class="cell-quick-edit-btn" onclick="event.stopPropagation(); openEditClassScheduleModal('${item.id}')" title="Edit subject or time" aria-label="Edit ${escapeHtml(item.subjectCode)}">Edit</button>`}
              </div>
              <span class="class-subj-title">${escapeHtml(item.subjectCode)}${classPartTag(item)}</span>
              <span class="class-meta-line">Room ${escapeHtml(item.room)}</span>
              <span class="class-meta-line">${escapeHtml(item.instructor)}</span>
              ${conflictReason ? `<span class="class-conflict-badge">Clash: ${escapeHtml(conflictReason)}</span>` : ''}
            </div>
          </td>
        `;
      } else if (readOnly) {
        rowsHtml += `<td class="empty-cell"></td>`;
      } else {
        // Empty cell: Droppable target & clickable manual schedule slot
        rowsHtml += `
          <td class="empty-cell"
              ondragover="handleSlotDragOver(event)"
              ondragleave="handleSlotDragLeave(event)"
              ondrop="handleSlotDrop(event, '${day}', ${slotMin})"
              onclick="openManualSlotModal('${day}', '${timeStr}')"
              title="Click to schedule class or drag & drop here (${day} ${formatTime12(timeStr)})">
          </td>
        `;
      }
    });

    rowsHtml += `</tr>`;
  });

  return rowsHtml;
}

// Fills in a timetable's daily and weekly hour totals
function renderTimetableHours(filteredClasses, dayIdPrefix, totalId) {
  let weeklyTotalMins = 0;
  DAYS.forEach(day => {
    const dayClasses = filteredClasses.filter(c => c.day === day);
    const dayMins = dayClasses.reduce((sum, c) => sum + (timeToMinutes(c.endTime) - timeToMinutes(c.startTime)), 0);
    weeklyTotalMins += dayMins;
    const hrsEl = document.getElementById(`${dayIdPrefix}${day}`);
    if (hrsEl) {
      hrsEl.textContent = `${(dayMins / 60).toFixed(1)} hrs`;
    }
  });

  const totalEl = document.getElementById(totalId);
  if (totalEl) {
    totalEl.textContent = `${(weeklyTotalMins / 60).toFixed(1)} hrs / week`;
  }
}

/* ─── Class Details Modal ─── */
// A locked class stays put when the timetable is generated again; everything else is placed around it
window.toggleClassLock = function(classId) {
  const item = MASTER_SCHEDULE_DATA.find(c => c.id === classId);
  if (!item || !canEditSchedule()) return;
  item.locked = !item.locked;
  saveStateToStorage();
  renderGrid();
  queueScheduleSave();
  // The saved timetable comes back with new class IDs, so the details window closes rather than go stale
  closeClassDetailModal();
  alert(item.locked ? `${item.subjectCode} for ${item.section} is locked. Generate will keep it at ${item.day} ${formatTime12(item.startTime)}.` : `${item.subjectCode} for ${item.section} is unlocked.`);
};

function showClassDetails(classId) {
  const item = MASTER_SCHEDULE_DATA.find(c => c.id === classId);
  if (!item) return;

  const modal = document.getElementById('classDetailModal');
  const body = document.getElementById('detailModalBody');
  if (!modal || !body) return;

  const title = document.getElementById('detailModalTitle');
  if (title) title.textContent = 'Class Schedule Details';

  const footer = document.getElementById('detailModalFooter');
  if (footer) {
    footer.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
        <button class="btn btn-outline" style="color:var(--danger); border-color:#FCA5A5; font-size:0.857rem; padding:6px 12px;" onclick="deleteClassSchedule('${escapeHtml(item.id)}')">
          🗑️ Remove
        </button>
        <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
          <button class="btn btn-outline" style="font-size:0.857rem; padding:6px 14px;" onclick="toggleClassLock('${escapeHtml(item.id)}')"
            title="${item.locked ? 'Let Generate move this class again' : 'Generate keeps a locked class at this day, time, room and teacher'}">${item.locked ? 'Unlock' : 'Lock'}</button>
          <button class="btn btn-secondary" style="font-size:0.857rem; padding:6px 14px;" onclick="closeClassDetailModal()">Close</button>
          <button class="btn btn-primary" style="font-size:0.857rem; padding:6px 16px; font-weight:700;" onclick="openEditClassScheduleModal('${escapeHtml(item.id)}')">
            ✏️ Edit Schedule
          </button>
        </div>
      </div>
    `;
  }

  const durationHrs = ((timeToMinutes(item.endTime) - timeToMinutes(item.startTime)) / 60).toFixed(1);
  const instFac = FACULTY.find(f => f.name && f.name.toLowerCase() === (item.instructor || '').toLowerCase());
  const itemSubjCode = (item.subjectCode || '').toUpperCase();
  let qualBadge = '';
  if (instFac) {
    if (isFacultyQualified(instFac, itemSubjCode)) {
      qualBadge = `<span class="badge" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-size:0.857rem; padding:1px 6px; margin-left:6px; font-weight:700;">🎓 Certified</span>`;
    } else {
      qualBadge = `<span class="badge" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; font-size:0.857rem; padding:1px 6px; margin-left:6px; font-weight:700;">⚠️ Not Qualified</span>`;
    }
  }

  body.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
      <div>
        <div style="font-size:1.286rem; font-weight:800; color:var(--accent-primary);">${escapeHtml(item.subjectCode)}</div>
        <div style="font-size:0.964rem; color:var(--text-secondary); margin-top:2px;">${escapeHtml(item.subjectTitle || 'No title available')}</div>
      </div>
      <span class="badge" style="background:#EEF1F7; color:var(--accent-primary); font-weight:700; font-size:0.857rem; text-transform:uppercase;">
        ${escapeHtml(item.type || 'Lecture')}${item.aiPlaced ? ' · Placed by AI' : ''}
      </span>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:0.929rem;">
      <div>
        <div style="color:var(--text-secondary); font-size:0.857rem; font-weight:700; text-transform:uppercase;">Section</div>
        <div style="font-weight:700; color:var(--text-primary); margin-top:2px;">${escapeHtml(item.section)}</div>
      </div>
      <div>
        <div style="color:var(--text-secondary); font-size:0.857rem; font-weight:700; text-transform:uppercase;">Academic Units</div>
        <div style="font-weight:700; color:var(--text-primary); margin-top:2px;">${escapeHtml(String(subjectUnitsFor(item)))} Units</div>
      </div>
      <div>
        <div style="color:var(--text-secondary); font-size:0.857rem; font-weight:700; text-transform:uppercase;">Classroom</div>
        <div style="font-weight:700; color:var(--text-primary); margin-top:2px; display:flex; align-items:center; gap:6px;">
          <span>${escapeHtml(item.room)}</span>
          <button class="btn btn-outline" style="font-size:0.857rem; padding:2px 7px; display:inline-flex; align-items:center; gap:3px; font-weight:600;" onclick="viewRoomSchedule(${jsArg(item.room)})">
            📅 Schedule ↗
          </button>
        </div>
      </div>
      <div>
        <div style="color:var(--text-secondary); font-size:0.857rem; font-weight:700; text-transform:uppercase;">Instructor</div>
        <div style="font-weight:700; color:var(--text-primary); margin-top:2px; display:flex; align-items:center; flex-wrap:wrap;"><span>${escapeHtml(item.instructor)}</span>${qualBadge}</div>
      </div>
      <div style="grid-column: span 2;">
        <div style="color:var(--text-secondary); font-size:0.857rem; font-weight:700; text-transform:uppercase;">Schedule</div>
        <div style="font-weight:700; color:var(--text-primary); margin-top:2px;">
          ${escapeHtml(item.day)} · ${formatTime12(item.startTime)} – ${formatTime12(item.endTime)} (${durationHrs} hrs)
        </div>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
}

/* ─── Interactive Class Schedule Editor ─── */
function openEditClassScheduleModal(classId) {
  const item = MASTER_SCHEDULE_DATA.find(c => c.id === classId);
  if (!item) return;

  const modal = document.getElementById('classDetailModal');
  const title = document.getElementById('detailModalTitle');
  const body = document.getElementById('detailModalBody');
  const footer = document.getElementById('detailModalFooter');
  if (!modal || !body) return;

  if (title) title.textContent = 'Edit Class Schedule';

  // Standard collegiate time options (30 min steps 7:00 AM - 8:30 PM)
  const timeOptions = [];
  for (let m = 7 * 60; m <= 20 * 60 + 30; m += 30) {
    const tStr = minutesToTime(m);
    timeOptions.push({ value: tStr, label: formatTime12(tStr) });
  }

  body.innerHTML = `
    <input type="hidden" id="editScheduleId" value="${escapeHtml(item.id)}" />
    <div id="editScheduleError" style="display:none; color:var(--danger); font-size:0.857rem; margin-bottom:12px; padding:8px 12px; background:#FFF5F5; border-radius:6px; border:1px solid #FADBD8;"></div>

    <div class="form-group" style="margin-bottom:12px;">
      <label class="form-label" style="font-weight:700; font-size:0.857rem;">Course / Subject</label>
      <select id="editScheduleSubject" class="form-input" style="width:100%; font-weight:600;" onchange="handleEditSubjectChange(this.value)">
        ${CURRICULUM_SUBJECTS.map(s => `
          <option value="${escapeHtml(s.code)}" ${s.code.toUpperCase() === item.subjectCode.toUpperCase() ? 'selected' : ''}>
            ${escapeHtml(s.code)} — ${escapeHtml(s.name)} (${s.units}u · ${s.type})
          </option>
        `).join('')}
        ${!CURRICULUM_SUBJECTS.some(s => s.code.toUpperCase() === item.subjectCode.toUpperCase()) ? `
          <option value="${escapeHtml(item.subjectCode)}" selected>${escapeHtml(item.subjectCode)} — ${escapeHtml(item.subjectTitle || '')}</option>
        ` : ''}
      </select>
    </div>

    <div class="form-group" style="margin-bottom:12px;">
      <label class="form-label" style="font-weight:700; font-size:0.857rem;">Subject Title / Name</label>
      <input type="text" id="editScheduleSubjTitle" class="form-input" value="${escapeHtml(item.subjectTitle || '')}" style="width:100%;" />
    </div>

    <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:12px;">
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label" style="font-weight:700; font-size:0.857rem;">Day of Week</label>
        <select id="editScheduleDay" class="form-input" style="width:100%;">
          ${DAYS.map(d => `<option value="${d}" ${d === item.day ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label" style="font-weight:700; font-size:0.857rem;">Start Time</label>
        <select id="editScheduleStartTime" class="form-input" style="width:100%;">
          ${timeOptions.map(t => `<option value="${t.value}" ${t.value === item.startTime ? 'selected' : ''}>${t.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label" style="font-weight:700; font-size:0.857rem;">End Time</label>
        <select id="editScheduleEndTime" class="form-input" style="width:100%;">
          ${timeOptions.map(t => `<option value="${t.value}" ${t.value === item.endTime ? 'selected' : ''}>${t.label}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label" style="font-weight:700; font-size:0.857rem;">Classroom / Room</label>
        <select id="editScheduleRoom" class="form-input" style="width:100%;">
          ${ROOMS.map(r => `<option value="${escapeHtml(r.code)}" ${r.code === item.room ? 'selected' : ''}>${escapeHtml(r.code)} (${r.type} · ${r.cap} seats)</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label" style="font-weight:700; font-size:0.857rem;">Instructor / Faculty</label>
        <select id="editScheduleInstructor" class="form-input" style="width:100%;">
          ${FACULTY.map(f => {
            const qualTag = !facultyTeachesLevel(f, sectionSchoolLevel(item.section)) ? ' [⚠️ Wrong Level]' : isFacultyQualified(f, item.subjectCode) ? ' [🎓 Certified]' : ' [⚠️ Not Qualified]';
            return `<option value="${escapeHtml(f.name)}" ${f.name === item.instructor ? 'selected' : ''}>${escapeHtml(f.name)} (${escapeHtml(f.dept || 'Faculty')})${qualTag}</option>`;
          }).join('')}
        </select>
      </div>
    </div>

    <div class="form-group" style="margin-bottom:0;">
      <label class="form-label" style="font-weight:700; font-size:0.857rem;">Section</label>
      <input type="text" id="editScheduleSection" class="form-input" value="${escapeHtml(item.section)}" style="width:100%; font-weight:700;" />
    </div>
  `;

  if (footer) {
    footer.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
        <button class="btn btn-outline" style="color:var(--danger); border-color:#FCA5A5; font-size:0.893rem; padding:6px 14px;" onclick="deleteClassSchedule('${escapeHtml(item.id)}')">
          🗑️ Remove
        </button>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary" style="font-size:0.893rem; padding:6px 14px;" onclick="showClassDetails('${escapeHtml(item.id)}')">Cancel</button>
          <button class="btn btn-primary" style="font-size:0.893rem; padding:6px 16px; font-weight:700;" onclick="submitEditClassSchedule()">Save Changes</button>
        </div>
      </div>
    `;
  }

  modal.style.display = 'flex';
}

function handleEditSubjectChange(code) {
  const subj = CURRICULUM_SUBJECTS.find(s => s.code.toUpperCase() === (code || '').toUpperCase());
  const titleInput = document.getElementById('editScheduleSubjTitle');
  if (subj && titleInput) titleInput.value = subj.name;
  const instSelect = document.getElementById('editScheduleInstructor');
  if (instSelect) {
    const curVal = instSelect.value;
    const targetCode = (code || '').toUpperCase();
    instSelect.innerHTML = FACULTY.map(f => {
      const qualTag = !facultyTeachesLevel(f, activeSchoolLevel()) ? ' [⚠️ Wrong Level]' : isFacultyQualified(f, targetCode) ? ' [🎓 Certified]' : ' [⚠️ Not Qualified]';
      return `<option value="${escapeHtml(f.name)}" ${f.name === curVal ? 'selected' : ''}>${escapeHtml(f.name)} (${escapeHtml(f.dept || 'Faculty')})${qualTag}</option>`;
    }).join('');
  }
}

function submitEditClassSchedule() {
  const schedId = document.getElementById('editScheduleId')?.value;
  const item = MASTER_SCHEDULE_DATA.find(c => c.id === schedId);
  const errDiv = document.getElementById('editScheduleError');
  if (!item) return;

  const subjCode = document.getElementById('editScheduleSubject')?.value.trim();
  const subjTitle = document.getElementById('editScheduleSubjTitle')?.value.trim();
  const day = document.getElementById('editScheduleDay')?.value;
  const startTime = document.getElementById('editScheduleStartTime')?.value;
  const endTime = document.getElementById('editScheduleEndTime')?.value;
  const room = document.getElementById('editScheduleRoom')?.value;
  const instructor = document.getElementById('editScheduleInstructor')?.value;
  const section = document.getElementById('editScheduleSection')?.value.trim();

  if (!subjCode) {
    if (errDiv) { errDiv.textContent = 'Subject is required.'; errDiv.style.display = 'block'; }
    return;
  }

  const classSectionProblem = INPUT_RULES.code('Section', section || '');
  if (classSectionProblem) {
    if (errDiv) { errDiv.textContent = classSectionProblem; errDiv.style.display = 'block'; }
    return;
  }

  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
    if (errDiv) { errDiv.textContent = 'Start time must be earlier than end time.'; errDiv.style.display = 'block'; }
    return;
  }

  const editPlacementProblem = placementProblem({ ...item, subjectCode: subjCode, day, startTime, endTime, room, instructor, section }, item.id);
  if (editPlacementProblem) {
    if (errDiv) { errDiv.textContent = editPlacementProblem; errDiv.style.display = 'block'; }
    return;
  }

  // Check conflicts with other scheduled items
  for (const other of MASTER_SCHEDULE_DATA) {
    if (other.id === item.id) continue;
    if (other.day !== day) continue;
    if (other.termId && item.termId && other.termId !== item.termId) continue;
    const sMin = timeToMinutes(startTime);
    const eMin = timeToMinutes(endTime);
    const osMin = timeToMinutes(other.startTime);
    const oeMin = timeToMinutes(other.endTime);

    if (sMin < oeMin && eMin > osMin) {
      if (other.room === room) {
        if (errDiv) { errDiv.textContent = `Room conflict: ${room} is already booked by ${other.section} (${other.subjectCode}) at this time.`; errDiv.style.display = 'block'; }
        return;
      }
      if (other.instructor === instructor) {
        if (errDiv) { errDiv.textContent = `Faculty conflict: ${instructor} is already teaching ${other.section} at this time.`; errDiv.style.display = 'block'; }
        return;
      }
      if (other.section === section) {
        if (errDiv) { errDiv.textContent = `Section conflict: ${section} already has ${other.subjectCode} at this time.`; errDiv.style.display = 'block'; }
        return;
      }
    }
  }

  const qualConflict = checkFacultySubjectConflict(instructor, subjCode, section);
  if (qualConflict) {
    if (errDiv) {
      errDiv.textContent = qualConflict;
      errDiv.style.display = 'block';
    }
    return;
  }

  const availabilityProblem = facultyAvailabilityProblem(instructor, day, startTime, endTime);
  if (availabilityProblem) {
    if (errDiv) {
      errDiv.textContent = availabilityProblem;
      errDiv.style.display = 'block';
    }
    return;
  }

  // Apply updates
  item.subjectCode = subjCode;
  item.subjectTitle = subjTitle || subjCode;
  item.day = day;
  item.startTime = startTime;
  item.endTime = endTime;
  item.room = room;
  item.instructor = instructor;
  item.section = section;

  const matchedSubj = CURRICULUM_SUBJECTS.find(s => s.code.toUpperCase() === subjCode.toUpperCase());
  if (matchedSubj) {
    item.type = matchedSubj.type;
  }

  saveStateToStorage();
  closeClassDetailModal();
  renderGrid();
  updateScheduleStats();

  queueScheduleSave();
}

async function deleteClassSchedule(classId) {
  if (!(await askConfirm('The class will be taken off the schedule.', { title: 'Remove this class?', confirmLabel: 'Remove class', danger: true }))) return;
  MASTER_SCHEDULE_DATA = MASTER_SCHEDULE_DATA.filter(c => c.id !== classId);
  queueScheduleSave();
  saveStateToStorage();
  closeClassDetailModal();
  renderGrid();
  updateScheduleStats();
}

function closeClassDetailModal() {
  const modal = document.getElementById('classDetailModal');
  if (modal) modal.style.display = 'none';
}

/* ─── HTML5 Drag-and-Drop Schedule Rescheduling ─── */
let activeDraggedClassId = null;

function handleClassDragStart(event, classId) {
  activeDraggedClassId = classId;
  if (event.dataTransfer) {
    event.dataTransfer.setData('text/plain', classId);
    event.dataTransfer.effectAllowed = 'move';
  }
}

function handleSlotDragOver(event) {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  event.currentTarget.classList.add('drag-over');
}

function handleSlotDragLeave(event) {
  event.currentTarget.classList.remove('drag-over');
}

function handleSlotDrop(event, targetDay, targetSlotMin) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');

  const classId = (event.dataTransfer && event.dataTransfer.getData('text/plain')) || activeDraggedClassId;
  activeDraggedClassId = null;
  if (!classId) return;

  const item = MASTER_SCHEDULE_DATA.find(c => c.id === classId);
  if (!item) return;

  const durationMin = Math.max(30, timeToMinutes(item.endTime) - timeToMinutes(item.startTime));
  const targetEndMin = targetSlotMin + durationMin;
  if (targetEndMin > CLASS_DAY_END) {
    alert(`This class can't move there. It would end at ${formatTime12(minutesToTime(targetEndMin))}, after the 8:30 PM closing time.`);
    return;
  }

  const availabilityProblem = facultyAvailabilityProblem(item.instructor, targetDay, minutesToTime(targetSlotMin), minutesToTime(targetEndMin));
  if (availabilityProblem) {
    alert(`This class can't move there. ${availabilityProblem}.`);
    return;
  }

  const conflict = checkGlobalClassConflict({ ...item, day: targetDay, startTime: minutesToTime(targetSlotMin), endTime: minutesToTime(targetEndMin) });
  if (conflict) {
    alert(`This class can't move there. ${conflict}.`);
    return;
  }

  item.day = targetDay;
  item.startTime = minutesToTime(targetSlotMin);
  item.endTime = minutesToTime(targetEndMin);

  queueScheduleSave();
  saveStateToStorage();
  renderGrid();
  updateScheduleStats();
}

/* ─── Manual Slot Scheduling via Modal ─── */
function openManualSlotModal(day, timeStr) {
  const modal = document.getElementById('slotModal');
  if (!modal) return;

  const roomSel = document.getElementById('slotRoomSelect');
  const facSel = document.getElementById('slotFacultySelect');
  const subInput = document.getElementById('slotSubjectInput');
  const datalist = document.getElementById('subjectDatalist');
  const progSel = document.getElementById('slotProgramSelect');
  const secInput = document.getElementById('slotSectionInput');
  const errDiv = document.getElementById('slotModalError');

  if (errDiv) errDiv.style.display = 'none';

  // Target Section (in room and professor views the section is typed in)
  let targetSection = gridMode === 'section' ? (currentSelectedSection || '') : '';
  if (secInput) secInput.value = targetSection;

  // Target Program
  const secObj = ACADEMIC_SECTIONS.find(s => s.code === targetSection);
  if (progSel && secObj) progSel.value = secObj.program;

  // Target Time & Duration (default 1.5 hrs)
  const startMin = timeToMinutes(timeStr);
  const endTimeStr = minutesToTime(Math.min(20 * 60 + 30, startMin + 90));

  const timeOptions = [];
  for (let m = 7 * 60; m <= 20 * 60 + 30; m += 30) {
    const value = minutesToTime(m);
    timeOptions.push(`<option value="${value}">${formatTime12(value)}</option>`);
  }
  document.getElementById('slotDaySelect').innerHTML = DAYS.map(d => `<option value="${d}">${d}</option>`).join('');
  document.getElementById('slotDaySelect').value = day;
  document.getElementById('slotStartSelect').innerHTML = timeOptions.join('');
  document.getElementById('slotStartSelect').value = timeStr;
  document.getElementById('slotEndSelect').innerHTML = timeOptions.join('');
  document.getElementById('slotEndSelect').value = endTimeStr;

  // Starts on the first room that's free at this time; the user can change it
  const isRoomFree = room => !activeTermClasses().some(c => c.room === room.code && c.day === day
    && startMin < timeToMinutes(c.endTime) && timeToMinutes(endTimeStr) > timeToMinutes(c.startTime));
  roomSel.innerHTML = ROOMS.map(r => `<option value="${escapeHtml(r.code)}">${escapeHtml(r.code)} (${escapeHtml(r.type)}, ${r.cap} seats)</option>`).join('');
  const firstFree = ROOMS.find(isRoomFree);
  if (gridMode === 'room' && gridSelection.room) roomSel.value = gridSelection.room;
  else if (firstFree) roomSel.value = firstFree.code;

  // Populate Faculty Select
  if (facSel) {
    facSel.innerHTML = FACULTY.map(f => `
      <option value="${escapeHtml(f.name)}">
        ${escapeHtml(f.name)} (${escapeHtml(f.dept || 'Academic Faculty')})
      </option>
    `).join('');
  }

  // Populate Subjects Datalist
  if (datalist) {
    datalist.innerHTML = CURRICULUM_SUBJECTS.map(s => `
      <option value="${escapeHtml(s.code)}">${escapeHtml(s.name)} (${s.units}u · ${s.type})</option>
    `).join('');
  }

  if (gridMode === 'teacher' && facSel && gridSelection.teacher) facSel.value = gridSelection.teacher;
  if (subInput) subInput.value = '';

  modal.style.display = 'flex';
}

function closeSlotModal() {
  const modal = document.getElementById('slotModal');
  if (modal) modal.style.display = 'none';
}

function submitSlotAssignment() {
  const facSel = document.getElementById('slotFacultySelect');
  const subInput = document.getElementById('slotSubjectInput');
  const progSel = document.getElementById('slotProgramSelect');
  const secInput = document.getElementById('slotSectionInput');
  const errDiv = document.getElementById('slotModalError');

  const showError = message => {
    if (errDiv) {
      errDiv.textContent = message;
      errDiv.style.display = 'block';
    }
  };
  const day = document.getElementById('slotDaySelect').value;
  const startTime = document.getElementById('slotStartSelect').value;
  const endTime = document.getElementById('slotEndSelect').value;
  const room = document.getElementById('slotRoomSelect').value;
  const instructor = facSel?.value || (FACULTY.length > 0 ? FACULTY[0].name : 'TBA');
  const subjectCode = (subInput?.value || '').trim().toUpperCase();
  const program = progSel?.value || 'BSIT';
  const section = (secInput?.value || '').trim().toUpperCase();

  if (!section) {
    showError('Please enter the section this class is for.');
    return;
  }
  if (!subjectCode) {
    if (errDiv) {
      errDiv.textContent = 'Please enter or select a Course / Subject Code.';
      errDiv.style.display = 'block';
    }
    return;
  }

  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
    showError('Start time must be earlier than end time.');
    return;
  }
  const sectionProblem = INPUT_RULES.code('Section', section);
  if (sectionProblem) {
    showError(sectionProblem);
    return;
  }

  // Same eligibility rule as editing a class
  const eligibility = checkFacultySubjectConflict(instructor, subjectCode, section);
  if (eligibility) {
    if (errDiv) {
      errDiv.textContent = eligibility;
      errDiv.style.display = 'block';
    }
    return;
  }

  const availabilityProblem = facultyAvailabilityProblem(instructor, day, startTime, endTime);
  if (availabilityProblem) {
    if (errDiv) {
      errDiv.textContent = availabilityProblem;
      errDiv.style.display = 'block';
    }
    return;
  }

  const activeTermId = getActiveAcademicContext().activeTerm.id;
  const addPlacementProblem = placementProblem({ termId: activeTermId, section, subjectCode, room, instructor, day, startTime, endTime });
  if (addPlacementProblem) {
    showError(addPlacementProblem);
    return;
  }

  // Details come from the section and its curriculum entry
  const slotSection = ACADEMIC_SECTIONS.find(s => s.code === section && s.termId === activeTermId);
  const matchingSubj = curriculumSubjectFor(slotSection, subjectCode, activeTermId);
  const subjectTitle = matchingSubj.name;
  const units = matchingSubj.units;
  const type = matchingSubj.type;

  const newId = `SCH-MANUAL-${Date.now()}`;
  const newClass = {
    id: newId,
    termId: activeTermId,
    section,
    program: slotSection.program,
    year: String(slotSection.year),
    subjectCode,
    subjectTitle,
    type,
    units,
    room,
    instructor,
    day,
    startTime,
    endTime
  };

  const conflict = checkGlobalClassConflict(newClass);
  if (conflict) {
    showError(conflict);
    return;
  }

  MASTER_SCHEDULE_DATA.push(newClass);
  queueScheduleSave();
  saveStateToStorage();
  closeSlotModal();
  renderGrid();
  updateScheduleStats();

}

/* ─── Global Class Conflict Check Helper ─── */
function checkGlobalClassConflict(classItem) {
  const sMin = timeToMinutes(classItem.startTime);
  const eMin = timeToMinutes(classItem.endTime);

  for (const other of MASTER_SCHEDULE_DATA) {
    if (other.id === classItem.id) continue;
    if (other.day !== classItem.day) continue;
    if (other.termId && classItem.termId && other.termId !== classItem.termId) continue;

    const osMin = timeToMinutes(other.startTime);
    const oeMin = timeToMinutes(other.endTime);

    const timesOverlap = sMin < oeMin && eMin > osMin;
    if (!timesOverlap) continue;

    if (other.room === classItem.room) return `Room ${classItem.room} double-booked with ${other.section} (${other.subjectCode})`;
    if (other.instructor === classItem.instructor) return `Faculty ${classItem.instructor} double-booked with ${other.section}`;
    if (other.section === classItem.section) return `Section ${classItem.section} double-booked with ${other.subjectCode}`;
  }
  const overlappingTerm = overlappingTermClash({ ...classItem, termId: classItem.termId || getActiveAcademicContext().activeTerm.id });
  if (overlappingTerm) return overlappingTerm;

  const qualConflict = checkFacultySubjectConflict(classItem.instructor, classItem.subjectCode, classItem.section);
  if (qualConflict) return qualConflict;
  return null;
}

/* ─── Section Search Handler ─── */
function handleSectionSearch(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return;

  const { activeTerm } = getActiveAcademicContext();
  const termSections = ACADEMIC_SECTIONS.filter(s => s.termId === activeTerm.id);
  const match = termSections.find(s => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  if (match) {
    currentSelectedSection = match.code;
    const secSelect = document.getElementById('sectionSelect');
    if (secSelect) secSelect.value = match.code;
    renderGrid();
  }
}

/* ─── Dynamic Stats & Subtitles Updater ─── */
function updateScheduleStats() {
  const summary = document.getElementById('generateSummary');
  if (summary && !summary.hidden && summary.dataset.termId !== String(getActiveAcademicContext().activeTerm.id)) summary.hidden = true;
  const { activeSy, activeTerm } = getActiveAcademicContext();
  const schoolTerm = getSchoolCurrentContext().activeTerm;
  const termSections = ACADEMIC_SECTIONS.filter(s => s.termId === activeTerm.id);
  const totalSections = termSections.length;
  const fullyScheduledSections = termSections.filter(isSectionFullyScheduled).length;
  const totalRooms = ROOMS.length;

  const statTotal = document.getElementById('statTotalSections');
  if (statTotal) statTotal.textContent = String(totalSections);

  const statAssigned = document.getElementById('statAssignedSections');
  if (statAssigned) statAssigned.textContent = String(fullyScheduledSections);

  const headerSub = document.getElementById('headerSubtitle');
  if (headerSub) {
    headerSub.textContent = `${activeTerm.termName} ${activeSy.yearCode} · ${totalSections} sections across ${totalRooms} rooms`
      + (schoolTerm && schoolTerm.id !== activeTerm.id ? ` · You're working on this term; the school's current term is ${schoolTerm.termName}` : '');
  }

  const sub1 = document.getElementById('stepSub-1');
  if (sub1) sub1.textContent = activeSy.yearCode;

  const sub2 = document.getElementById('stepSub-2');
  if (sub2) sub2.textContent = activeTerm.termName;

  const sub3 = document.getElementById('stepSub-3');
  if (sub3 && typeof CURRICULUM_SUBJECTS !== 'undefined') {
    const inc = CURRICULUM_SUBJECTS.filter(s => s.isIncluded && s.termId === activeTerm.id).length;
    sub3.textContent = `${inc} Subjects`;
  }

  const sub4 = document.getElementById('stepSub-4');
  if (sub4) sub4.textContent = `${totalSections} Sections`;
  // Rooms & Instructors: how many sections have a room chosen
  const sub5 = document.getElementById('stepSub-5');
  if (sub5) {
    const withRoom = ACADEMIC_SECTIONS.filter(s => s.termId === activeTerm.id && s.homeRoom).length;
    sub5.textContent = `${withRoom} of ${totalSections} rooms chosen`;
  }
}
