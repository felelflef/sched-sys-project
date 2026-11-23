/* ═══════════════════════════════════════════════════
   VIEW SCHEDULE
   Read-only weekly timetables by section, teacher or room.
   ═══════════════════════════════════════════════════ */

let viewerMode = 'section'; // 'section' | 'teacher' | 'room'
const viewerSelection = { section: '', teacher: '', room: '' };
const VIEWER_LABELS = { section: 'Section', teacher: 'Teacher', room: 'Room' };
let viewerDefaultedFor = null; // Email of the faculty member already shown their own timetable

function viewerOptions(activeTerm, termClasses) {
  const byLabel = (a, b) => a.label.localeCompare(b.label);

  if (viewerMode === 'section') {
    return ACADEMIC_SECTIONS
      .filter(s => s.termId === activeTerm.id)
      .map(s => ({ value: s.code, label: `${s.code} (${s.name})` }))
      .sort(byLabel);
  }
  if (viewerMode === 'room') {
    return ROOMS
      .map(r => ({ value: r.code, label: `${r.code} (${r.type}, ${r.cap} seats)` }))
      .sort(byLabel);
  }

  const names = new Set(FACULTY.map(f => f.name));
  termClasses.forEach(c => { if (c.instructor) names.add(c.instructor); });
  return [...names].map(name => {
    const fac = FACULTY.find(f => f.name === name);
    return { value: name, label: fac && fac.dept ? `${name} (${fac.dept})` : name };
  }).sort(byLabel);
}

function viewerSheetDetails(selected, classes, activeTerm, termLabel) {
  const totalUnits = totalSubjectUnits(classes);
  const weeklyHours = classes.reduce((sum, c) => sum + (timeToMinutes(c.endTime) - timeToMinutes(c.startTime)), 0) / 60;

  if (viewerMode === 'section') {
    const sec = ACADEMIC_SECTIONS.find(s => s.code === selected && s.termId === activeTerm.id);
    return {
      subtitle: sec ? `${sec.program} • ${yearLevelLabel(sec.year)} (${sec.name}) • ${sec.shift || 'AM'} shift • ${termLabel}` : termLabel,
      stats: [['Total Units', String(totalUnits)], ['# of Students', String(sec ? sec.studentCount : 0)], ['Adviser', sectionAdviserName(sec) || '—']]
    };
  }
  if (viewerMode === 'room') {
    const room = ROOMS.find(r => r.code === selected);
    return {
      subtitle: `Room Timetable • ${termLabel}`,
      stats: [['Room Type', room ? room.type : '—'], ['Capacity', room ? `${room.cap} Seats` : '—'], ['Weekly Hours', `${weeklyHours.toFixed(1)} hrs`]]
    };
  }
  const fac = FACULTY.find(f => f.name === selected);
  return {
    subtitle: `Teacher Schedule • ${termLabel}`,
    stats: [['Teaching Load', `${formatUnits(facultyLoadUnits(selected, classes))} of ${fac ? `${facultyMinUnits(fac)}–${facultyMaxUnits(fac)}` : '—'} Units`], ['Weekly Teaching', `${weeklyHours.toFixed(1)} hrs`], ['Department', (fac && fac.dept) || '—']]
  };
}

function renderScheduleViewer() {
  const body = document.getElementById('viewerGridBody');
  if (!body) return;


  const { activeSy, activeTerm } = getActiveAcademicContext();
  const termLabel = `${activeTerm.termName} ${activeSy.yearCode}`;
  const termClasses = MASTER_SCHEDULE_DATA.filter(c => !c.termId || c.termId === activeTerm.id);

  // A teacher first sees their own timetable; after that, their own choice is kept
  if (CURRENT_USER && CURRENT_USER.role === 'faculty' && viewerDefaultedFor !== CURRENT_USER.email) {
    const own = FACULTY.find(f => f.email && f.email.toLowerCase() === (CURRENT_USER.email || '').toLowerCase());
    if (own) {
      viewerDefaultedFor = CURRENT_USER.email;
      viewerMode = 'teacher';
      viewerSelection.teacher = own.name;
    }
  }

  document.querySelectorAll('[data-viewer-mode]').forEach(btn => {
    const isActive = btn.dataset.viewerMode === viewerMode;
    btn.classList.toggle('btn-primary', isActive);
    btn.classList.toggle('btn-outline', !isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });

  const options = viewerOptions(activeTerm, termClasses);
  if (!options.some(o => o.value === viewerSelection[viewerMode])) {
    viewerSelection[viewerMode] = options.length ? options[0].value : '';
  }
  const selected = viewerSelection[viewerMode];

  document.getElementById('viewerSelectLabel').textContent = `${VIEWER_LABELS[viewerMode]}:`;
  const select = document.getElementById('viewerSelect');
  select.innerHTML = options.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('');
  select.value = selected;
  select.disabled = options.length === 0;

  const classes = viewerClassesFor(selected, termClasses);

  const details = viewerSheetDetails(selected, classes, activeTerm, termLabel);
  document.getElementById('viewerSheetSubtitle').textContent = details.subtitle;
  document.getElementById('viewerSheetTitle').textContent = selected || `No ${VIEWER_LABELS[viewerMode]} Available`;
  details.stats.forEach(([label, value], index) => {
    document.getElementById(`viewerStatLabel${index + 1}`).textContent = label;
    document.getElementById(`viewerStatValue${index + 1}`).textContent = value;
  });

  body.innerHTML = classes.length
    ? timetableRowsHtml(classes, true)
    : `<tr><td colspan="7" class="viewer-empty-message">${selected
        ? `No classes scheduled for ${escapeHtml(selected)} this term.`
        : `There is no ${VIEWER_LABELS[viewerMode].toLowerCase()} to show for this term.`}</td></tr>`;

  renderTimetableHours(classes, 'viewerHrs-', 'viewerWeeklyTotal');
  renderViewerDayList(classes);
}

// On phones the week shows as a list, one day at a time, instead of a wide grid
const VIEWER_DAY_NAMES = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
function renderViewerDayList(classes) {
  const box = document.getElementById('viewerDayList');
  if (!box) return;
  const detail = c => viewerMode === 'section' ? [c.room, c.instructor]
    : viewerMode === 'teacher' ? [c.section, c.room] : [c.section, c.instructor];
  const days = DAYS.map(day => {
    const list = classes.filter(c => c.day === day).sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    if (!list.length) return '';
    return `<section class="viewer-day"><h4>${VIEWER_DAY_NAMES[day]}</h4><ul>${list.map(c => `
      <li class="viewer-day-class type-${escapeHtml((c.type || 'lecture').toLowerCase())}">
        <div class="viewer-day-time">${formatTime12(c.startTime)} – ${formatTime12(c.endTime)}</div>
        <div><strong>${escapeHtml(c.subjectCode)}</strong>${classPartTag(c)} <span class="viewer-day-title">${escapeHtml(c.subjectTitle || '')}</span></div>
        <div class="viewer-day-meta">${detail(c).filter(Boolean).map(escapeHtml).join(' · ')}</div>
      </li>`).join('')}</ul></section>`;
  }).join('');
  box.innerHTML = days || '<p class="viewer-day-empty">No classes this week.</p>';
}

// Every timetable shows only the open term's classes, also for rooms and teachers shared by College and SHS
function viewerClassesFor(selected, termClasses) {
  return termClasses.filter(c => viewerMode === 'section' ? c.section === selected : viewerMode === 'room' ? c.room === selected : c.instructor === selected);
}

function viewerSelectedClasses() {
  return viewerClassesFor(viewerSelection[viewerMode], activeTermClasses());
}

window.exportViewerPdf = function() {
  const selected = viewerSelection[viewerMode];
  if (!selected) return;
  saveTimetableSheetPdf(document.querySelector('#page-viewer .schedule-viewer-sheet'), selected, viewerSelectedClasses(), viewerMode);
};

window.setViewerMode = function(mode) {
  viewerMode = mode;
  renderScheduleViewer();
};

window.setViewerSelection = function(value) {
  viewerSelection[viewerMode] = value;
  renderScheduleViewer();
};

/**
 * Opens View Schedule on one room, from the Rooms page or a class's details
 */
window.viewRoomSchedule = function(roomCode) {
  if (typeof closeClassDetailModal === 'function') closeClassDetailModal();
  viewerMode = 'room';
  viewerSelection.room = (roomCode || '').trim();
  switchPage('viewer');
};
