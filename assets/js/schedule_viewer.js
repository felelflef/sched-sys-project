/* ═══════════════════════════════════════════════════
   VIEW SCHEDULE
   Read-only weekly timetables by section, professor or room.
   ═══════════════════════════════════════════════════ */

let viewerMode = 'section'; // 'section' | 'teacher' | 'room'
const viewerSelection = { section: '', teacher: '', room: '' };
const VIEWER_LABELS = { section: 'Section', teacher: 'Professor', room: 'Room' };
let viewerDefaultedFor = null; // Email of the faculty member already shown their own timetable

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
    subtitle: `Professor Schedule • ${termLabel}`,
    stats: [['Teaching Load', `${formatUnits(facultyLoadUnits(selected, classes))} of ${fac ? `${facultyMinUnits(fac)}–${facultyMaxUnits(fac)}` : '—'} Units`], ['Weekly Teaching', `${weeklyHours.toFixed(1)} hrs`], ['Department', (fac && fac.dept) || '—']]
  };
}

function renderScheduleViewer() {
  const body = document.getElementById('viewerGridBody');
  if (!body) return;

  syncMasterScheduleRoomsWithCatalog();

  const { activeSy, activeTerm } = getActiveAcademicContext();
  const termLabel = `${activeTerm.termName} ${activeSy.yearCode}`;
  const termClasses = MASTER_SCHEDULE_DATA.filter(c => !c.termId || c.termId === activeTerm.id);

  // A professor first sees their own timetable; after that, their own choice is kept
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

  const classes = viewerClassesFor(selected, termClasses, activeTerm);

  const details = viewerSheetDetails(selected, classes, activeTerm, termLabel);
  const pairedShown = [...new Set(classes.filter(c => c.termId && c.termId !== activeTerm.id).map(c => c.termId))];
  document.getElementById('viewerSheetSubtitle').textContent = details.subtitle + (pairedShown.length ? ` · also showing ${pairedShown.map(termWithLevel).join(', ')}` : '');
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

// Excel treats a leading = + - or @ as a formula, so those cells are kept as plain text
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadScheduleCsv(classes, filename) {
  const dayOrder = DAYS.reduce((order, day, i) => ({ ...order, [day]: i }), {});
  const sorted = [...classes].sort((a, b) => a.section.localeCompare(b.section) || dayOrder[a.day] - dayOrder[b.day] || a.startTime.localeCompare(b.startTime));
  const lines = [['Section', 'Subject Code', 'Subject Title', 'Day', 'Start', 'End', 'Room', 'Professor', 'Subject Units']];
  sorted.forEach(c => lines.push([c.section, c.subjectCode, c.subjectTitle, c.day, formatTime12(c.startTime), formatTime12(c.endTime), c.room, c.instructor, subjectUnitsFor(c)]));

  // The byte order mark makes Excel read accented names correctly
  const blob = new Blob(['﻿' + lines.map(line => line.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

/* ─── Excel workbooks ───
   Each timetable is laid out like the on-screen sheet: times down the side, days across,
   and each class spanning its hours. A Class List sheet holds one row per class. */
const XLSX_LINE = { style: 'thin', color: { rgb: 'A3A9B5' } };
const XLSX_BORDER = { top: XLSX_LINE, bottom: XLSX_LINE, left: XLSX_LINE, right: XLSX_LINE };
const XLSX_HEAD = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1C3664' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: XLSX_BORDER };
const XLSX_TYPE_FILL = { lecture: 'EBF3FC', lab: 'ECFDF5', pe: 'FEF3C7', special: 'F3E8FF' };
const XLSX_SLOT_MINUTES = 30;

function xlsxCell(value, style) {
  return { v: value, t: typeof value === 'number' ? 'n' : 's', s: style };
}

function timetableWorksheet(classes, title, subtitle) {
  const slots = [];
  for (let m = CLASS_DAY_START; m < CLASS_DAY_END; m += XLSX_SLOT_MINUTES) slots.push(m);
  const firstSlotRow = 4;
  const rows = [
    [xlsxCell(title, { font: { bold: true, sz: 14, color: { rgb: '1C3664' } } })],
    [xlsxCell(subtitle, { font: { sz: 10, color: { rgb: '5C6375' } } })],
    [],
    [xlsxCell('Time', XLSX_HEAD), ...DAYS.map(day => xlsxCell(day, XLSX_HEAD))]
  ];
  slots.forEach(m => rows.push([
    xlsxCell(`${formatTime12(minutesToTime(m))} – ${formatTime12(minutesToTime(m + XLSX_SLOT_MINUTES))}`, { font: { bold: true, sz: 9 }, fill: { fgColor: { rgb: 'F1F3F7' } }, border: XLSX_BORDER, alignment: { vertical: 'top' } }),
    ...DAYS.map(() => xlsxCell('', { border: XLSX_BORDER }))
  ]));

  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: DAYS.length } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: DAYS.length } }
  ];
  const taken = new Set();
  classes.forEach(c => {
    const col = DAYS.indexOf(c.day) + 1;
    const start = Math.max(0, Math.floor((timeToMinutes(c.startTime) - CLASS_DAY_START) / XLSX_SLOT_MINUTES));
    const end = Math.min(slots.length, Math.ceil((timeToMinutes(c.endTime) - CLASS_DAY_START) / XLSX_SLOT_MINUTES));
    if (col < 1 || end <= start) return;
    const row = firstSlotRow + start;
    const text = [
      `${c.subjectCode} – ${c.subjectTitle}`,
      `Section: ${c.section}`,
      `Room: ${c.room}`,
      `Prof: ${c.instructor}`,
      `${formatTime12(c.startTime)}–${formatTime12(c.endTime)}`
    ].join('\n');
    // Merged ranges must not overlap, so a class over a filled slot is added to that cell instead
    const overlaps = Array.from({ length: end - start }, (_, i) => `${row + i}|${col}`).some(key => taken.has(key));
    if (overlaps) {
      const cell = rows[row][col];
      cell.v = cell.v ? `${cell.v}\n\n${text}` : text;
      return;
    }
    for (let i = 0; i < end - start; i++) taken.add(`${row + i}|${col}`);
    rows[row][col] = xlsxCell(text, {
      font: { sz: 9 },
      alignment: { wrapText: true, vertical: 'top' },
      fill: { fgColor: { rgb: XLSX_TYPE_FILL[c.type] || XLSX_TYPE_FILL.lecture } },
      border: XLSX_BORDER
    });
    if (end - start > 1) merges.push({ s: { r: row, c: col }, e: { r: row + end - start - 1, c: col } });
  });

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!merges'] = merges;
  sheet['!cols'] = [{ wch: 20 }, ...DAYS.map(() => ({ wch: 28 }))];
  sheet['!rows'] = rows.map((_, i) => (i >= firstSlotRow ? { hpt: 22 } : {}));
  return sheet;
}

function classListWorksheet(classes) {
  const dayOrder = DAYS.reduce((order, day, i) => ({ ...order, [day]: i }), {});
  const sorted = [...classes].sort((a, b) => a.section.localeCompare(b.section) || dayOrder[a.day] - dayOrder[b.day] || a.startTime.localeCompare(b.startTime));
  const headings = ['Section', 'Subject Code', 'Subject Title', 'Day', 'Start', 'End', 'Room', 'Professor', 'Subject Units'];
  const body = { border: XLSX_BORDER, font: { sz: 10 } };
  const rows = [headings.map(h => xlsxCell(h, XLSX_HEAD))];
  sorted.forEach(c => rows.push([c.section, c.subjectCode, c.subjectTitle, c.day, formatTime12(c.startTime), formatTime12(c.endTime), c.room, c.instructor, Number(subjectUnitsFor(c)) || 0]
    .map(value => xlsxCell(value, body))));
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [12, 13, 34, 7, 11, 11, 12, 26, 13].map(wch => ({ wch }));
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length - 1, 1), c: headings.length - 1 } }) };
  return sheet;
}

// Sheet names: at most 31 characters, none of : \ / ? * [ ], and no repeats
function addWorksheet(book, sheet, name) {
  const base = String(name).replace(/[:\\/?*[\]]/g, '-').slice(0, 31) || 'Sheet';
  let unique = base;
  for (let n = 2; book.SheetNames.includes(unique); n++) unique = `${base.slice(0, 28)} ${n}`;
  XLSX.utils.book_append_sheet(book, sheet, unique);
}

// Saves the workbook, or a CSV of the same classes if the Excel tool couldn't load
function saveScheduleWorkbook(buildSheets, classes, label) {
  if (!window.XLSX || !XLSX.utils) {
    downloadScheduleCsv(classes, exportFileName(label, 'csv'));
    alert("The Excel tool couldn't load, so the schedule was saved as a CSV file, which Excel can also open.");
    return;
  }
  try {
    const book = XLSX.utils.book_new();
    buildSheets(book);
    XLSX.writeFile(book, exportFileName(label, 'xlsx'));
  } catch (e) {
    alert('Could not create the Excel file. Please try again.');
  }
}

function termContextLabel() {
  const { activeSy, activeTerm } = getActiveAcademicContext();
  return `${activeTerm.termName} ${activeSy.yearCode}`;
}

window.exportTermExcel = function() {
  const menu = document.getElementById('exportDropdownMenu');
  if (menu) menu.style.display = 'none';
  const { activeTerm } = getActiveAcademicContext();
  const classes = activeTermClasses();
  const sections = ACADEMIC_SECTIONS.filter(s => s.termId === activeTerm.id).sort((a, b) => a.code.localeCompare(b.code));
  saveScheduleWorkbook(book => {
    addWorksheet(book, classListWorksheet(classes), 'All Classes');
    sections.forEach(sec => {
      const secClasses = classes.filter(c => c.section === sec.code);
      addWorksheet(book, timetableWorksheet(secClasses, `${sec.code} (${sec.name})`,
        `${sec.program} ${yearLevelLabel(sec.year)} · ${termContextLabel()} · ${totalSubjectUnits(secClasses)} units · ${sec.studentCount} students`), sec.code);
    });
  }, classes, 'Master Schedule');
};

// A section belongs to one term. Teachers and rooms are shared by College and SHS, so their timetables
// also show the other level's term that runs alongside this one.
function viewerClassesFor(selected, termClasses, activeTerm) {
  const shared = viewerMode === 'section' ? [] : MASTER_SCHEDULE_DATA.filter(c => c.termId && pairedTermIds(activeTerm.id).includes(c.termId));
  return [...termClasses, ...shared].filter(c => viewerMode === 'section' ? c.section === selected : viewerMode === 'room' ? c.room === selected : c.instructor === selected);
}

function viewerSelectedClasses() {
  const { activeTerm } = getActiveAcademicContext();
  return viewerClassesFor(viewerSelection[viewerMode], activeTermClasses(), activeTerm);
}

window.exportViewerExcel = function() {
  const selected = viewerSelection[viewerMode];
  if (!selected) return;
  const classes = viewerSelectedClasses();
  saveScheduleWorkbook(book => {
    addWorksheet(book, timetableWorksheet(classes, selected, `${VIEWER_LABELS[viewerMode]} timetable · ${termContextLabel()} · ${totalSubjectUnits(classes)} units`), 'Timetable');
    addWorksheet(book, classListWorksheet(classes), 'Class List');
  }, classes, selected);
};

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
