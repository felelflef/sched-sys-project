/* ══════════════════════════════════════════════════════════════════════════
   STEP 7: GENERATE (BASELINE ENGINE, UNDO, UNPLACED CLASSES)
   Part of the Master Schedule; the schedule_*.js files load in order (see the page's script tags).
   ══════════════════════════════════════════════════════════════════════════ */

function openConfirmRegenerateModal() {
  const modal = document.getElementById('confirmRegenerateModal');
  if (modal) modal.style.display = 'flex';
}

function closeConfirmRegenerateModal() {
  const modal = document.getElementById('confirmRegenerateModal');
  if (modal) modal.style.display = 'none';
}

async function executeGenerateBaseline() {
  closeConfirmRegenerateModal();
  // A term that has already started stays editable class by class (for example when a teacher is away);
  // replacing its whole timetable is asked about first
  const { activeTerm: termToGenerate } = getActiveAcademicContext();
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (termToGenerate.startDate && termToGenerate.startDate <= today && activeTermClasses().length > 0) {
    const started = new Date(`${termToGenerate.startDate}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const ok = await askConfirm(`${termToGenerate.termName} started on ${started}, so teachers and students may already be following its timetable. Generate replaces all of its classes (locked classes stay where they are).\n\nTo change only some classes, for example when a teacher is away, open those classes and edit them instead.`,
      { title: 'Replace the timetable of a term that has started?', confirmLabel: 'Replace the Timetable', danger: true });
    if (!ok) return;
  }
  // Teachers, qualifications and rooms come fresh from the database, as the server will check them
  if (!IS_STANDALONE && typeof loadServerState === 'function') {
    try { await loadServerState(); } catch (e) {}
  }
  const sectionsToSchedule = ACADEMIC_SECTIONS.filter(s => s.termId === (getActiveAcademicContext().activeTerm.id));

  if (sectionsToSchedule.length === 0) {
    const ctx = getActiveAcademicContext();
    alert(`No academic sections found for ${ctx.activeTerm.termName} (${ctx.activeSy.yearCode}).\n\nPlease go to Step 4 (Create Sections) to create sections before generating a schedule.`);
    return;
  }
  const { activeSy, activeTerm } = getActiveAcademicContext();
  // Locked classes stay exactly where they are; the rest of the term is placed around them
  const lockedClasses = activeTermClasses().filter(c => c.locked);
  const newSchedules = generateSmartBaselineSchedules({ seed: lockedClasses });
  clearEditUndo();
  MASTER_SCHEDULE_DATA = MASTER_SCHEDULE_DATA.filter(c => c.termId && c.termId !== activeTerm.id).concat(newSchedules);
  renderGrid();

  // Show status banner if unassigned classes exist
  if (!currentSelectedSection || !sectionsToSchedule.some(s => s.code === currentSelectedSection)) {
    currentSelectedSection = sectionsToSchedule[0].code;
  }

  saveStateToStorage();
  updateSectionDropdown();
  renderGrid();
  updateScheduleStats();

  refreshUnassignedBanner();

  // Persist to DB, then reload to pick up saved IDs and the Undo option
  saveTermSchedule('generate_baseline', activeTerm.id, newSchedules, { strict: true })
    .then(res => { if (res.ok && !IS_STANDALONE) loadServerState(); })
    .catch(e => { if (!e || !e.reported) alert("Couldn't reach the server, so this schedule wasn't saved. Check your connection and generate again."); });

  alert(`Master schedule successfully generated (${newSchedules.length} classes scheduled across ${sectionsToSchedule.length} sections for ${activeTerm.termName}).`);
  renderGenerateSummary();
}

// The results card after Generate: what was placed, what still needs attention, and how busy the rooms are
function renderGenerateSummary() {
  const box = document.getElementById('generateSummary');
  if (!box) return;
  const { activeSy, activeTerm } = getActiveAcademicContext();
  const classes = activeTermClasses();
  const sections = ACADEMIC_SECTIONS.filter(s => s.termId === activeTerm.id);
  const short = sections.filter(s => sectionSubjectProgress(s).some(p => p.scheduledMinutes < p.requiredMinutes));
  const saturday = new Set(classes.filter(c => c.day === 'Sat').map(c => c.section));
  const loadOf = f => facultyLoadUnits(f.name) + concurrentLoadUnits(f.name, activeTerm.id);
  const teaching = FACULTY.filter(f => classes.some(c => c.instructor === f.name));
  const over = FACULTY.filter(f => loadOf(f) > facultyMaxUnits(f) + 0.001);
  const under = teaching.filter(f => loadOf(f) < facultyMinUnits(f) - 0.001);
  // Only teachers who teach this term's level (College or SHS) can be idle in it
  const level = termSchoolLevel(activeTerm.id);
  const idle = FACULTY.filter(f => facultyTeachesLevel(f, level) && !teaching.includes(f)).length;
  const lectureRooms = ROOMS.filter(r => r.type === 'Lecture').map(r => r.code);
  const lectureMinutes = classes.filter(c => lectureRooms.includes(c.room)).reduce((sum, c) => sum + timeToMinutes(c.endTime) - timeToMinutes(c.startTime), 0);
  const roomUse = lectureRooms.length ? Math.round(100 * lectureMinutes / (lectureRooms.length * 6 * 12 * 60)) : 0;
  const names = list => list.slice(0, 3).map(f => escapeHtml(f.name)).join(', ') + (list.length > 3 ? ` and ${list.length - 3} more` : '');
  const line = (ok, text) => `<li class="${ok ? 'ok' : 'warn'}"><span aria-hidden="true">${ok ? '✓' : '!'}</span> ${text}</li>`;
  box.innerHTML = `
    <div class="generate-summary-head"><strong>Results for ${escapeHtml(activeTerm.termName)} ${escapeHtml(activeSy.yearCode)}</strong>
      <button type="button" class="btn btn-outline" onclick="document.getElementById('generateSummary').hidden = true" aria-label="Close the results">Close</button></div>
    <ul class="generate-summary-list">
      ${line(true, `${classes.length} classes placed; ${sections.length - short.length} of ${sections.length} sections fully scheduled`)}
      ${line(short.length === 0, short.length === 0 ? 'Every required hour is on the timetable' : `${short.length} section${short.length === 1 ? ' is' : 's are'} still missing hours; the list below says why`)}
      ${line(saturday.size === 0, saturday.size === 0 ? 'No Saturday classes' : `${saturday.size} section${saturday.size === 1 ? ' has' : 's have'} Saturday classes`)}
      ${line(over.length === 0, over.length === 0 ? 'No teacher is over their maximum load' : `Over their maximum load: ${names(over)}`)}
      ${line(under.length === 0, under.length === 0 ? 'Every teacher with classes reaches their minimum load' : `Under their minimum load: ${under.length} teacher${under.length === 1 ? '' : 's'} (${names(under)})`)}
      ${idle > 0 ? line(false, `${idle} ${level === 'shs' ? 'SHS' : 'College'} teacher${idle === 1 ? ' has' : 's have'} no classes this term`) : ''}
      ${line(true, `Lecture rooms are in use ${roomUse}% of the week (Monday to Saturday, 7:00 AM to 7:00 PM)`)}
    </ul>
    <div class="generate-summary-actions">
      <button type="button" class="btn btn-outline" onclick="switchPage('reports')">Open Schedule Overview</button>
      <button type="button" class="btn btn-outline" onclick="switchPage('viewer')">View Timetables</button>
    </div>`;
  box.dataset.termId = String(activeTerm.id);
  box.hidden = false;
}

function updateUndoButton() {
  const btn = document.getElementById('btnUndoGenerate');
  if (!btn) return;
  const { activeTerm } = getActiveAcademicContext();
  const snapshot = SCHEDULE_SNAPSHOTS.find(s => Number(s.term_id) === activeTerm.id);
  btn.style.display = snapshot ? 'inline-flex' : 'none';
  btn.title = snapshot ? `Go back to the schedule saved before the last generate (${snapshot.saved_at})` : '';
}

window.undoLastGenerate = async function() {
  const { activeTerm } = getActiveAcademicContext();
  if (!(await askConfirm(`The current ${activeTerm.termName} schedule will be replaced with the one saved before the last generate. You can undo this too.`, { title: 'Undo the last generate?', confirmLabel: 'Restore Schedule' }))) return;
  const res = await fetch('api/schedules.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'restore_schedule', term_id: activeTerm.id, expected_version: activeTerm.scheduleVersion })
  });
  await loadServerState();
  if (res.ok) {
    alert('The previous schedule has been restored.');
    const summary = document.getElementById('generateSummary');
    if (summary) summary.hidden = true;
  }
};

// Lists what is still missing from the current schedule, with up-to-date reasons.
// Runs after every change, so fixing a cause (such as raising a max load) updates the list.
function refreshUnassignedBanner() {
  const banner = document.getElementById('unassignedBanner');
  const list = document.getElementById('unassignedList');
  if (!banner || !list) return;
  const { activeTerm } = getActiveAcademicContext();
  const sections = ACADEMIC_SECTIONS.filter(s => s.termId === activeTerm.id);
  const missing = sections.flatMap(section => sectionSubjectProgress(section)
    .filter(p => p.scheduledMinutes < p.requiredMinutes)
    .map(p => ({ section, ...p })));

  // Before the first generate everything is missing, which the empty timetable already shows
  if (!canEditSchedule() || missing.length === 0 || activeTermClasses().length === 0) {
    UNASSIGNED_CLASSES = [];
    banner.classList.remove('show');
    list.innerHTML = '';
    return;
  }

  // A trial run around the current classes gives today's reason for each subject with no classes yet
  generateSmartBaselineSchedules({ seed: activeTermClasses() });
  const trialReasons = UNASSIGNED_CLASSES;
  const hours = minutes => +(minutes / 60).toFixed(1);
  UNASSIGNED_CLASSES = missing.map(m => {
    const code = m.label;
    const trial = trialReasons.find(u => u.section === m.section.code && u.code === code);
    let reason;
    if (m.scheduledMinutes > 0) {
      reason = `Only ${hours(m.scheduledMinutes)} of ${hours(m.requiredMinutes)} hrs a week are scheduled. Add the remaining time manually or run Generate.`;
    } else if (trial) {
      reason = trial.reason;
    } else {
      reason = 'Not scheduled yet, but a clash-free time is now available. Run Generate or add it manually.';
    }
    return { section: m.section.code, code, reason };
  });

  list.innerHTML = UNASSIGNED_CLASSES.map(u => `
    <li><strong>${escapeHtml(u.section)} - ${escapeHtml(u.code)}:</strong> ${escapeHtml(u.reason)}</li>
  `).join('');
  const count = UNASSIGNED_CLASSES.length;
  document.getElementById('unassignedSummary').textContent =
    `${count} subject${count === 1 ? " doesn't" : "s don't"} have their full weekly hours on the schedule yet.`;
  applyUnassignedListOpen();
  banner.classList.add('show');
}

// On phones the reasons start hidden, so the timetable isn't pushed far down the page
let unassignedListOpen = !window.matchMedia('(max-width: 800px)').matches;
function applyUnassignedListOpen() {
  const list = document.getElementById('unassignedList');
  const toggle = document.getElementById('unassignedToggle');
  if (!list || !toggle) return;
  list.hidden = !unassignedListOpen;
  toggle.textContent = unassignedListOpen ? 'Hide Details' : 'Show Details';
  toggle.setAttribute('aria-expanded', String(unassignedListOpen));
}
function toggleUnassignedList() {
  unassignedListOpen = !unassignedListOpen;
  applyUnassignedListOpen();
}

let unassignedBannerTimer = null;
function queueUnassignedBannerRefresh() {
  clearTimeout(unassignedBannerTimer);
  unassignedBannerTimer = setTimeout(refreshUnassignedBanner, 250);
}

// Keeps the Master Schedule's day headers just below its sticky filter bar
(function keepTimetableHeadBelowControls() {
  const panel = document.getElementById('stepPanel-7');
  const controls = panel && panel.querySelector('.grid-controls');
  if (!controls || typeof ResizeObserver === 'undefined') return;
  new ResizeObserver(() => panel.style.setProperty('--timetable-head-top', `${Math.max(0, controls.offsetHeight - 14)}px`)).observe(controls);
})();

/* ─── Smart Constraint-Honoring Baseline Schedule Generator ─── */
// The AI draft passes seed to keep the classes it already placed
function generateSmartBaselineSchedules({ seed = [] } = {}) {
  UNASSIGNED_CLASSES = [];
  const schedules = [...seed];

  // Classes of terms running at the same time keep their rooms and teachers; their units count toward the max load
  const { activeTerm: generatorTerm } = getActiveAcademicContext();
  const otherTermClasses = concurrentClasses(generatorTerm.id);
  const otherTermUnits = {};
  const otherUnits = name => (otherTermUnits[name] ??= concurrentLoadUnits(name, generatorTerm.id));
  // Indexes kept up to date as classes are placed, so each check only looks at what could clash:
  // busy times per room, teacher and section for each day, each teacher's units, and how much each room is used
  const busy = new Map();
  const busyKey = (kind, day, key) => `${kind}|${day}|${key}`;
  const addBusy = (kind, day, key, start, end) => {
    const k = busyKey(kind, day, key);
    if (!busy.has(k)) busy.set(k, []);
    busy.get(k).push([start, end]);
  };
  const isBusy = (kind, day, key, start, end) => (busy.get(busyKey(kind, day, key)) || []).some(([s, e]) => start < e && end > s);
  const loadUnits = new Map();
  const roomMinutes = new Map();
  const sectionRoomUses = new Map();
  // Classes of other terms only hold their room and teacher; this term's classes also count toward loads and room use
  const teacherDayMinutes = new Map();   // `${termId}|${teacher}|${day}` -> minutes taught that day in that term
  function track(c, units, ownTerm) {
    const start = timeToMinutes(c.startTime);
    const end = timeToMinutes(c.endTime);
    addBusy('room', c.day, c.room, start, end);
    addBusy('teacher', c.day, c.instructor, start, end);
    const dayKey = `${c.termId || generatorTerm.id}|${c.instructor}|${c.day}`;
    teacherDayMinutes.set(dayKey, (teacherDayMinutes.get(dayKey) || 0) + end - start);
    if (!ownTerm) return;
    addBusy('section', c.day, c.section, start, end);
    loadUnits.set(c.instructor, (loadUnits.get(c.instructor) || 0) + units);
    roomMinutes.set(c.room, (roomMinutes.get(c.room) || 0) + end - start);
    sectionRoomUses.set(`${c.section}|${c.room}`, (sectionRoomUses.get(`${c.section}|${c.room}`) || 0) + 1);
  }
  schedules.forEach(c => track(c, classUnits(c), true));
  otherTermClasses.forEach(c => track(c, 0, false));

  // A healthy teaching day: at most 6 hours of classes, at most 3 hours in a row, and a free half hour for lunch
  // between 11:00 and 1:30 when the day runs through midday. Generate tries healthy times first and uses any
  // clash-free time only when none is left. Of the terms running alongside, only the busiest one counts toward
  // the day's hours, since the terms of one level follow each other.
  const HEALTHY_DAY_MINUTES = 6 * 60;
  const HEALTHY_RUN_MINUTES = 3 * 60;
  const alongsideTermIds = concurrentTermIds(generatorTerm.id);
  function healthyTeacherDay(teacherName, day, start, end) {
    const minutesIn = termId => teacherDayMinutes.get(`${termId}|${teacherName}|${day}`) || 0;
    const otherTerms = Math.max(0, ...alongsideTermIds.map(minutesIn));
    if (minutesIn(generatorTerm.id) + otherTerms + end - start > HEALTHY_DAY_MINUTES) return false;
    const blocks = [...(busy.get(busyKey('teacher', day, teacherName)) || []), [start, end]].sort((a, b) => a[0] - b[0]);
    // The stretch of back-to-back classes this one would join (classes that touch count as one stretch)
    let runStart = start, runEnd = end, grew = true;
    while (grew) {
      grew = false;
      for (const [s, e] of blocks) {
        if (s <= runEnd && e >= runStart && (s < runStart || e > runEnd)) {
          runStart = Math.min(runStart, s);
          runEnd = Math.max(runEnd, e);
          grew = true;
        }
      }
    }
    if (runEnd - runStart > HEALTHY_RUN_MINUTES) return false;
    const throughMidday = blocks.some(([s]) => s < 11 * 60 + 30) && blocks.some(([, e]) => e > 13 * 60);
    if (!throughMidday) return true;
    for (let t = 11 * 60; t + 30 <= 13 * 60 + 30; t += 30) {
      if (!blocks.some(([s, e]) => s < t + 30 && e > t)) return true;
    }
    return false;
  }

  function fitsTeacherLoad(teacher, addedUnits) {
    return (loadUnits.get(teacher.name) || 0) + otherUnits(teacher.name) + addedUnits <= facultyMaxUnits(teacher) + 0.001;
  }

  // Working day sequence: Mon to Sat
  const workDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // Comprehensive daily slot presets (7:00 AM - 7:00 PM)
  const allMasterSlots = [
    { start: '07:00', end: '08:30' },
    { start: '07:30', end: '09:30' },
    { start: '08:00', end: '10:00' },
    { start: '08:30', end: '10:00' },
    { start: '08:30', end: '11:00' },
    { start: '09:00', end: '11:00' },
    { start: '10:00', end: '11:30' },
    { start: '10:00', end: '12:00' },
    { start: '10:30', end: '12:00' },
    { start: '10:30', end: '12:30' },
    { start: '11:30', end: '13:00' },
    { start: '12:00', end: '14:00' },
    { start: '13:00', end: '14:30' },
    { start: '13:00', end: '15:00' },
    { start: '13:30', end: '15:30' },
    { start: '13:30', end: '16:00' },
    { start: '14:00', end: '15:30' },
    { start: '14:00', end: '16:00' },
    { start: '14:30', end: '16:00' },
    { start: '14:30', end: '16:30' },
    { start: '15:00', end: '17:00' },
    { start: '15:30', end: '17:30' },
    { start: '16:00', end: '17:30' },
    { start: '16:00', end: '18:00' },
    { start: '17:00', end: '18:30' },
    { start: '17:00', end: '19:00' },
    { start: '17:30', end: '19:00' }
  ];

  // A room, teacher or section already busy at that time (classes of terms running alongside hold their room and teacher)
  function hasOverlap(day, start, end, room, teacher, section) {
    const sMin = timeToMinutes(start);
    const eMin = timeToMinutes(end);
    return isBusy('room', day, room, sMin, eMin) || isBusy('teacher', day, teacher, sMin, eMin) || isBusy('section', day, section, sMin, eMin);
  }

  const { activeSy, activeTerm } = getActiveAcademicContext();
  const sectionsToSchedule = ACADEMIC_SECTIONS.filter(s => s.termId === activeTerm.id);

  let schedCounter = 100;

  // Part-time teachers have the fewest usable time slots, so the classes they can teach are placed first
  const limitedHours = t => t.status === 'Part-time' && (t.availableDays || []).length > 0 && (t.availableShifts || []).length > 0;
  const partTimeRanks = {};
  const partTimeRank = subj => {
    const code = (subj.code || '').toUpperCase();
    if (partTimeRanks[code] === undefined) {
      const partTimers = FACULTY.filter(f => f.status === 'Part-time' && isFacultyQualified(f, code));
      partTimeRanks[code] = partTimers.some(limitedHours) ? 0 : partTimers.length > 0 ? 1 : 2;
    }
    return partTimeRanks[code];
  };
  const workItems = [];
  sectionsToSchedule.forEach(sec => {
    // Only the subjects included for this section in the active term
    CURRICULUM_SUBJECTS.filter(s => s.isIncluded !== false && s.termId === activeTerm.id && s.program === sec.program && Number(s.year) === Number(sec.year))
      // A subject with lecture and lab hours is placed as two parts: lecture meetings and lab meetings
      .forEach((subj, subjIdx) => subjectParts(subj).forEach(({ part, minutes }) =>
        workItems.push({ sec, subj, subjIdx, part, partMinutes: minutes, order: workItems.length })));
  });
  workItems.sort((a, b) => partTimeRank(a.subj) - partTimeRank(b.subj) || a.order - b.order);

  // Each section keeps one room per room type when it can: its Home Room if one is set, otherwise one picked here
  const autoHomeRooms = {};
  function homeRoomFor(sec, candidateRooms) {
    const chosen = candidateRooms.find(r => r.code === sec.homeRoom);
    if (chosen) return chosen;
    const mine = autoHomeRooms[sec.code] = autoHomeRooms[sec.code] || {};
    for (const type of new Set(candidateRooms.map(r => r.type))) {
      const earlier = candidateRooms.find(r => r.code === mine[type]);
      if (earlier) return earlier;
    }
    // A room the section already uses (such as from kept classes) comes first, then one no other section calls home
    const usedBySection = code => sectionRoomUses.get(`${sec.code}|${code}`) || 0;
    const homeOfOthers = code => sectionsToSchedule.filter(s => s.code !== sec.code && s.homeRoom === code).length
      + Object.entries(autoHomeRooms).filter(([other, rooms]) => other !== sec.code && Object.values(rooms).includes(code)).length;
    const bookedMinutes = code => roomMinutes.get(code) || 0;
    const pick = candidateRooms.slice().sort((a, b) => usedBySection(b.code) - usedBySection(a.code)
      || homeOfOthers(a.code) - homeOfOthers(b.code) || bookedMinutes(a.code) - bookedMinutes(b.code))[0];
    if (pick) mine[pick.type] = pick.code;
    return pick || null;
  }

  workItems.forEach(({ sec, subj, subjIdx, part, partMinutes }) => {
    {
      // Classes already kept (locked, or placed by an AI draft) count toward this part; only the rest is placed
      const keptMinutes = seed.filter(c => c.section === sec.code && c.subjectCode === subj.code && classPart(c, subj, sec.program) === part)
        .reduce((sum, c) => sum + timeToMinutes(c.endTime) - timeToMinutes(c.startTime), 0);
      if (keptMinutes >= partMinutes) return;
      partMinutes -= keptMinutes;
      let placed = false;
      const partLabel = subjectPartLabel(subj, part);

      // Lab hours go in a lab; lecture hours in a lecture room
      let candidateRooms = [];
      if (part === 'lab') {
        candidateRooms = ROOMS.filter(r => isLabRoomFor(r, sec.program));
      } else if (subj.type === 'pe') {
        candidateRooms = ROOMS.filter(r => r.code === 'LR-103' || r.type === 'Lecture');
      } else {
        // Lecture
        candidateRooms = ROOMS.filter(r => r.type === 'Lecture' && r.cap >= sec.studentCount);
      }

      // If no room with enough capacity, fallback to largest lecture room
      if (candidateRooms.length === 0 && part === 'lec') {
        candidateRooms = ROOMS.filter(r => r.type === 'Lecture');
      }

      // Prefer rooms that seat the whole section; keep all candidates if none are big enough
      const roomsThatFit = candidateRooms.filter(r => r.cap >= sec.studentCount);
      if (roomsThatFit.length > 0) candidateRooms = roomsThatFit;

      // Determine candidate faculty
      // Check faculty qualified/allowable for this subject
      const targetSubjCode = (subj.code || '').toUpperCase();
      const sectionLevel = termSchoolLevel(sec.termId);
      const qualifiedAnyLevel = FACULTY.filter(f => isFacultyQualified(f, targetSubjCode));
      const candidateTeachers = qualifiedAnyLevel.filter(f => facultyTeachesLevel(f, sectionLevel));
      const hasQualifiedFaculty = candidateTeachers.length > 0;

      // Determine slot search prioritized by section shift
      const secShift = sec.shift || 'AM';
      let shiftSlots = [];
      if (secShift === 'AM') {
        shiftSlots = [{ start: '07:00', end: '08:30' }, { start: '08:30', end: '10:00' }, { start: '10:00', end: '11:30' }, { start: '10:30', end: '12:00' }, { start: '11:30', end: '13:00' }, { start: '07:30', end: '09:30' }, { start: '08:00', end: '10:00' }, { start: '08:30', end: '11:00' }, { start: '09:00', end: '11:00' }, { start: '10:00', end: '12:00' }];
      } else if (secShift === 'MIDSHIFT') {
        shiftSlots = [{ start: '10:00', end: '11:30' }, { start: '11:30', end: '13:00' }, { start: '13:00', end: '14:30' }, { start: '14:30', end: '16:00' }, { start: '14:00', end: '15:30' }, { start: '10:30', end: '12:30' }, { start: '12:00', end: '14:00' }, { start: '13:30', end: '15:30' }, { start: '14:00', end: '16:00' }];
      } else if (secShift === 'PM') {
        shiftSlots = [{ start: '17:30', end: '19:00' }, { start: '16:00', end: '17:30' }, { start: '17:00', end: '18:30' }, { start: '14:30', end: '16:00' }, { start: '13:00', end: '14:30' }, { start: '17:00', end: '19:00' }, { start: '16:00', end: '18:00' }, { start: '15:30', end: '17:30' }, { start: '15:00', end: '17:00' }, { start: '14:30', end: '16:30' }];
      }
      // In-shift times are tried on every day before any out-of-shift time is used
      const slotGroups = [shiftSlots, allMasterSlots.filter(ms => !shiftSlots.some(ss => ss.start === ms.start && ss.end === ms.end))];

      // Standard collegiate academic day pairs for 1.5 units each meeting
      const DAY_PAIRS = [
        ['Mon', 'Thu'],
        ['Tue', 'Fri']
      ];
      const orderedDayPairs = [
        DAY_PAIRS[subjIdx % DAY_PAIRS.length],
        DAY_PAIRS[(subjIdx + 1) % DAY_PAIRS.length],
        ['Wed', 'Sat']
      ];

      // Meetings add up to this part's full weekly hours
      const weeklyMinutes = partMinutes;
      const subjectMinutes = subjectWeeklyMinutes(subj);
      const meetingLengths = splitIntoMeetings(weeklyMinutes);

      // Three meetings rotate between day patterns, as pairs do, so no day fills up first. SHS keeps DepEd's
      // Monday-to-Friday week: its patterns use each weekday equally, and days with Saturday are tried last.
      const DAY_TRIPLES = sectionLevel === 'shs'
        ? [['Mon', 'Wed', 'Fri'], ['Tue', 'Thu', 'Fri'], ['Mon', 'Wed', 'Thu'], ['Tue', 'Wed', 'Fri'], ['Mon', 'Tue', 'Thu']]
        : [['Mon', 'Wed', 'Fri'], ['Tue', 'Thu', 'Sat']];
      const orderedTriples = DAY_TRIPLES.map((_, i) => DAY_TRIPLES[(subjIdx + i) % DAY_TRIPLES.length]);

      // Day combinations to try, best first
      const dayPlans = meetingLengths.length === 1
        ? [['Wed'], ['Sat'], ['Fri'], ['Thu'], ['Tue'], ['Mon']]
        : [...(meetingLengths.length === 2 ? orderedDayPairs : orderedTriples), ...dayCombinations(workDays, meetingLengths.length)];
      if (sectionLevel === 'shs') dayPlans.sort((a, b) => a.includes('Sat') - b.includes('Sat'));

      // In-shift times are tried on every day before any out-of-shift time is used
      const firstLength = meetingLengths[0];
      const startsFor = (slots, fromMin, toMin) => {
        const starts = slots.filter(s => timeToMinutes(s.end) - timeToMinutes(s.start) === firstLength).map(s => s.start);
        for (let m = fromMin; m + firstLength <= toMin; m += 30) starts.push(minutesToTime(m));
        return [...new Set(starts)];
      };
      const [shiftFrom, shiftTo] = SHIFT_WINDOWS[secShift] || SHIFT_WINDOWS.AM;
      const inShiftStarts = startsFor(shiftSlots, shiftFrom, Math.min(shiftTo, LAST_GENERATED_MINUTE));
      const otherStarts = startsFor(slotGroups[1], 7 * 60, LAST_GENERATED_MINUTE).filter(s => !inShiftStarts.includes(s));

      // Part-time teachers go first, since their time slots are limited. Then teachers still under their
      // minimum units, then the least-loaded, so classes spread out; between teachers within about 3 units
      // of each other, a seasoned one goes first.
      const subjectLoad = subjectLoadUnits(subj, activeTerm.id);
      const partUnits = subjectLoad * weeklyMinutes / (subjectMinutes || weeklyMinutes);
      const usedUnits = t => loadUnits.get(t.name) || 0;
      const statusRank = t => limitedHours(t) ? 0 : t.status === 'Part-time' ? 1 : 2;
      const underMin = t => usedUnits(t) < facultyMinUnits(t) ? 0 : 1;
      const loadBand = t => Math.floor(usedUnits(t) / 3);
      // The teacher of the subject's other part (lecture or lab) is tried first, so one teacher has both
      const otherPartTeacher = (schedules.find(c => c.section === sec.code && c.subjectCode === subj.code) || {}).instructor;
      const keepsTeacher = t => t.name === otherPartTeacher ? 0 : 1;
      // An instructor chosen in Rooms & Teachers teaches this subject for this section; one who is no longer
      // qualified for it (or this level) is ignored, and the generator picks as usual
      const chosenTeacher = sectionChosenTeacher(sec, targetSubjCode);
      const usesChoice = !!chosenTeacher && candidateTeachers.includes(chosenTeacher);
      const teachersToTry = (usesChoice ? [chosenTeacher] : candidateTeachers)
        .filter(t => fitsTeacherLoad(t, partUnits))
        .sort((a, b) => keepsTeacher(a) - keepsTeacher(b) || statusRank(a) - statusRank(b) || underMin(a) - underMin(b)
          || loadBand(a) - loadBand(b) || (b.seasoned ? 1 : 0) - (a.seasoned ? 1 : 0) || usedUnits(a) - usedUnits(b));

      // The section's home room is tried at every in-shift time before another room is used
      const homeRoom = homeRoomFor(sec, candidateRooms);
      const passes = homeRoom
        ? [[inShiftStarts, [homeRoom]], [inShiftStarts, candidateRooms], [otherStarts, [homeRoom]], [otherStarts, candidateRooms]]
        : [[inShiftStarts, candidateRooms], [otherStarts, candidateRooms]];

      // Healthy teaching days first; any clash-free time only when no healthy one is left
      const tryPlace = () => {
        for (const healthyOnly of [true, false]) for (const [starts, rooms] of passes) {
          for (const days of dayPlans) {
            for (const start of starts) {
              const meetings = days.map((day, i) => ({ day, start, end: minutesToTime(timeToMinutes(start) + meetingLengths[i]) }));
              if (meetings.some(m => timeToMinutes(m.end) > LAST_GENERATED_MINUTE)) continue;
              for (const roomObj of rooms) {
                for (const teacherObj of teachersToTry) {
                  const fits = meetings.every(m =>
                    !hasOverlap(m.day, m.start, m.end, roomObj.code, teacherObj.name, sec.code)
                    && !facultyAvailabilityProblem(teacherObj.name, m.day, m.start, m.end)
                    && (!healthyOnly || healthyTeacherDay(teacherObj.name, m.day, timeToMinutes(m.start), timeToMinutes(m.end))));
                  if (!fits) continue;
                  meetings.forEach((m, i) => {
                    schedCounter++;
                    const units = Math.round(((subj.units || 3) * meetingLengths[i] / subjectMinutes) * 100) / 100;
                    const placedClass = {
                      id: `SCH-${schedCounter}`,
                      termId: activeTerm.id,
                      section: sec.code,
                      program: sec.program,
                      year: String(sec.year),
                      subjectCode: subj.code,
                      subjectTitle: subj.name,
                      type: subj.type,
                      units,
                      room: roomObj.code,
                      instructor: teacherObj.name,
                      day: m.day,
                      startTime: m.start,
                      endTime: m.end
                    };
                    schedules.push(placedClass);
                    track(placedClass, subjectLoad * meetingLengths[i] / (subjectMinutes || meetingLengths[i]), true);
                  });
                  return true;
                }
              }
            }
          }
        }
        return false;
      };
      placed = tryPlace();

      // Names the main thing that stopped this class, so the user knows what to change
      const unplacedReason = () => {
        const hours = weeklyMinutes / 60;
        if (!hasQualifiedFaculty && qualifiedAnyLevel.length > 0) {
          return `No ${sectionLevel === 'shs' ? 'SHS' : 'college'} teacher has an FCC certificate covering ${subj.code}. ${qualifiedAnyLevel.map(t => t.name).join(", ")} ${qualifiedAnyLevel.length === 1 ? 'teaches' : 'teach'} only ${sectionLevel === 'shs' ? 'college' : 'SHS'}: set ${qualifiedAnyLevel.length === 1 ? 'their' : 'one\'s'} teaching level to ${sectionLevel === 'shs' ? 'SHS' : 'Tertiary'} or Mixed in Faculty Profiles.`;
        }
        if (!hasQualifiedFaculty) return (subjectArea(subj.code) ? `No faculty member has an FCC certificate covering ${subjectArea(subj.code)}, the subject area of ${subj.code}. Give a teacher one in Faculty Profiles.` : `${subj.code} isn't in the Subject Catalog, so no FCC certificate covers it. Add it to the catalog with its subject area.`);
        if (candidateRooms.length === 0) return `There is no suitable ${part === 'lab' ? 'lab' : 'room'} for ${partLabel}. Add a room of the right type in Room Information.`;
        const names = list => list.map(t => t.name).join(', ');
        if (usesChoice) {
          return teachersToTry.length === 0
            ? `${chosenTeacher.name}, chosen for ${partLabel} in Rooms & Teachers, would go over their max load (${formatUnits(usedUnits(chosenTeacher) + otherUnits(chosenTeacher.name))} of ${facultyMaxUnits(chosenTeacher)} units). Choose another instructor or Automatic.`
            : `${chosenTeacher.name}, chosen for ${partLabel} in Rooms & Teachers, has no free ${hours}-hour weekly time that fits ${sec.code} and a suitable room. Choose another instructor or Automatic.`;
        }
        if (teachersToTry.length === 0) {
          const loads = candidateTeachers.map(t => `${t.name} has ${formatUnits(usedUnits(t) + otherUnits(t.name))} of ${facultyMaxUnits(t)} units${otherUnits(t.name) > 0 ? ', counting overlapping terms' : ''}`).join('; ');
          return `${partLabel} adds ${formatUnits(partUnits)} units, which would put every qualified teacher over their max load (${loads}). Raise a max load or qualify another teacher.`;
        }
        if (teachersToTry.every(limitedHours)) {
          return `The qualified teacher${teachersToTry.length === 1 ? '' : 's'} (${names(teachersToTry)}) ${teachersToTry.length === 1 ? 'is' : 'are'} part-time, and no ${hours}-hour weekly schedule fits inside their available days and shifts without a clash.`;
        }
        return `No clash-free ${hours}-hour weekly schedule is left. The qualified teacher${teachersToTry.length === 1 ? '' : 's'} (${names(teachersToTry)}) and the suitable rooms are already booked whenever ${sec.code} is free. Free up time or qualify another teacher.`;
      };

      if (!placed) {
        UNASSIGNED_CLASSES.push({ section: sec.code, code: partLabel, reason: unplacedReason() });
      }
    }
  });

  return schedules;
}
