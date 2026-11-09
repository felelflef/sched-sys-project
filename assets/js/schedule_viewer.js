/* ═══════════════════════════════════════════════════
   VIEW SCHEDULE
   Read-only weekly timetables by section, professor or room.
   ═══════════════════════════════════════════════════ */

let viewerMode = 'section'; // 'section' | 'teacher' | 'room'
const viewerSelection = { section: '', teacher: '', room: '' };
const VIEWER_LABELS = { section: 'Section', teacher: 'Professor', room: 'Room' };

/**
 * Adds any room used by a class to the ROOMS catalog so its timetable can still be viewed.
 */
function syncMasterScheduleRoomsWithCatalog() {
  if (typeof MASTER_SCHEDULE_DATA === 'undefined' || !Array.isArray(MASTER_SCHEDULE_DATA)) return;

  MASTER_SCHEDULE_DATA.forEach(c => {
    if (!c.room || c.room === 'TBA') return;
    const roomCode = c.room.trim();
    const exists = ROOMS.some(r => r.code.toUpperCase() === roomCode.toUpperCase());
    if (!exists) {
      let floor = '1F';
      if (roomCode.includes('20') || roomCode.startsWith('LR-2')) floor = '2F';
      else if (roomCode.includes('30') || roomCode.startsWith('LR-3')) floor = '3F';

      let type = 'Lecture';
      if (roomCode.toLowerCase().includes('lab') || roomCode.startsWith('CL-')) type = 'CompLab';
      else if (roomCode.toLowerCase().includes('kitchen') || roomCode.toLowerCase().includes('tourism')) type = 'Special';

      ROOMS.push({ code: roomCode, floor, type, cap: 40, name: roomCode });
    }
  });
}

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
  const totalUnits = classes.reduce((sum, c) => sum + (c.units || 0), 0);
  const weeklyHours = classes.reduce((sum, c) => sum + (timeToMinutes(c.endTime) - timeToMinutes(c.startTime)), 0) / 60;

  if (viewerMode === 'section') {
    const sec = ACADEMIC_SECTIONS.find(s => s.code === selected && s.termId === activeTerm.id);
    return {
      subtitle: sec ? `${sec.program} • Year ${sec.year} (${sec.name}) • ${termLabel}` : termLabel,
      stats: [['Total Units', String(totalUnits)], ['# of Students', String(sec ? sec.studentCount : 0)], ['Adviser', (sec && sec.adviser) || '—']]
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
    subtitle: `Professor Schedule • ${termLabel}`,
    stats: [['Teaching Load', `${totalUnits} Units`], ['Weekly Teaching', `${weeklyHours.toFixed(1)} hrs`], ['Department', (fac && fac.dept) || '—']]
  };
}

function renderScheduleViewer() {
  const body = document.getElementById('viewerGridBody');
  if (!body) return;

  syncMasterScheduleRoomsWithCatalog();

  const { activeSy, activeTerm } = getActiveAcademicContext();
  const termLabel = `${activeTerm.termName} ${activeSy.yearCode}`;
  const termClasses = MASTER_SCHEDULE_DATA.filter(c => !c.termId || c.termId === activeTerm.id);

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

  const classes = termClasses.filter(c => {
    if (viewerMode === 'section') return c.section === selected;
    if (viewerMode === 'room') return c.room === selected;
    return c.instructor === selected;
  });

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
}

// Excel treats a leading = + - or @ as a formula, so those cells are kept as plain text
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadScheduleCsv(classes, filename) {
  const dayOrder = DAYS.reduce((order, day, i) => ({ ...order, [day]: i }), {});
  const sorted = [...classes].sort((a, b) => a.section.localeCompare(b.section) || dayOrder[a.day] - dayOrder[b.day] || a.startTime.localeCompare(b.startTime));
  const lines = [['Section', 'Subject Code', 'Subject Title', 'Day', 'Start', 'End', 'Room', 'Professor', 'Units']];
  sorted.forEach(c => lines.push([c.section, c.subjectCode, c.subjectTitle, c.day, formatTime12(c.startTime), formatTime12(c.endTime), c.room, c.instructor, c.units]));

  // The byte order mark makes Excel read accented names correctly
  const blob = new Blob(['﻿' + lines.map(line => line.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function csvFileName(label) {
  const { activeSy, activeTerm } = getActiveAcademicContext();
  return `${label} ${activeTerm.termName} ${activeSy.yearCode}.csv`.replace(/[\\/:*?"<>|]/g, '-');
}

window.exportTermCsv = function() {
  const menu = document.getElementById('exportDropdownMenu');
  if (menu) menu.style.display = 'none';
  downloadScheduleCsv(activeTermClasses(), csvFileName('Master Schedule'));
};

window.exportViewerCsv = function() {
  const selected = viewerSelection[viewerMode];
  const classes = activeTermClasses().filter(c => viewerMode === 'section' ? c.section === selected : viewerMode === 'room' ? c.room === selected : c.instructor === selected);
  downloadScheduleCsv(classes, csvFileName(selected));
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
