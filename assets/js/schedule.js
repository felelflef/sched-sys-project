/* ══════════════════════════════════════════════════════════════════════════
   MODULE 1 — SECTION MASTER TIMETABLE CONTROLLER (SPREADSHEET-LIKE ARCHITECTURE)
   ══════════════════════════════════════════════════════════════════════════ */

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Section catalog and metadata
let SECTION_METADATA = {
  'IT701M':  { code: 'IT701M',  program: 'BSIT',  year: '1', name: 'BSIT 1A', adviser: 'Prof. Academic Head',   students: 38 },
  'IT702M':  { code: 'IT702M',  program: 'BSIT',  year: '1', name: 'BSIT 1B', adviser: 'Prof. Faculty Member',  students: 36 },
  'IT801M':  { code: 'IT801M',  program: 'BSIT',  year: '2', name: 'BSIT 2A', adviser: 'Prof. Program Head',    students: 35 },
  'IT802M':  { code: 'IT802M',  program: 'BSIT',  year: '2', name: 'BSIT 2B', adviser: 'Prof. Faculty Member',  students: 34 },
  'CS701M':  { code: 'CS701M',  program: 'BSCS',  year: '1', name: 'BSCS 1A', adviser: 'Prof. Program Head',    students: 32 },
  'CPE701M': { code: 'CPE701M', program: 'BSCpE', year: '1', name: 'BSCpE 1A',adviser: 'Engr. Faculty Member',  students: 30 },
  'HM701M':  { code: 'HM701M',  program: 'BSHM',  year: '1', name: 'BSHM 1A', adviser: 'Chef Faculty Member',   students: 40 },
  'TM701M':  { code: 'TM701M',  program: 'BSTM',  year: '1', name: 'BSTM 1A', adviser: 'Prof. Academic Head',   students: 34 },
  'BA701M':  { code: 'BA701M',  program: 'BSBA',  year: '1', name: 'BSBA 1A', adviser: 'Prof. Academic Head',   students: 35 }
};

// Global schedule repository
let MASTER_SCHEDULE_DATA = [];
let currentSelectedSection = 'IT701M';

/* ─── Helpers: Time Parsing & Formatting ─── */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatTime12(timeStr) {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ─── Baseline Schedule Generator ─── */
function generateBaselineSchedules() {
  const list = [
    // ─── IT701M (1st Year BSIT) ───
    {
      id: 'SCH-101',
      section: 'IT701M',
      program: 'BSIT',
      year: '1',
      subjectCode: 'ITE 101',
      subjectTitle: 'Introduction to Computing',
      type: 'lecture',
      units: 3,
      room: 'LR-101',
      instructor: 'Academic Head',
      day: 'Mon',
      startTime: '08:00',
      endTime: '10:00'
    },
    {
      id: 'SCH-102',
      section: 'IT701M',
      program: 'BSIT',
      year: '1',
      subjectCode: 'ITE 101 Lab',
      subjectTitle: 'Intro to Computing Lab',
      type: 'lab',
      units: 1,
      room: 'CL-101',
      instructor: 'Academic Head',
      day: 'Mon',
      startTime: '10:00',
      endTime: '12:00'
    },
    {
      id: 'SCH-103',
      section: 'IT701M',
      program: 'BSIT',
      year: '1',
      subjectCode: 'GE 201',
      subjectTitle: 'Purposive Communication',
      type: 'lecture',
      units: 3,
      room: 'LR-201',
      instructor: 'Faculty Member',
      day: 'Tue',
      startTime: '09:00',
      endTime: '11:30'
    },
    {
      id: 'SCH-104',
      section: 'IT701M',
      program: 'BSIT',
      year: '1',
      subjectCode: 'CC 103',
      subjectTitle: 'Computer Programming 1',
      type: 'lecture',
      units: 3,
      room: 'LR-102',
      instructor: 'Academic Head',
      day: 'Wed',
      startTime: '08:00',
      endTime: '10:00'
    },
    {
      id: 'SCH-105',
      section: 'IT701M',
      program: 'BSIT',
      year: '1',
      subjectCode: 'CC 103 Lab',
      subjectTitle: 'Computer Programming 1 Lab',
      type: 'lab',
      units: 1,
      room: 'CL-102',
      instructor: 'Academic Head',
      day: 'Wed',
      startTime: '10:00',
      endTime: '12:00'
    },
    {
      id: 'SCH-106',
      section: 'IT701M',
      program: 'BSIT',
      year: '1',
      subjectCode: 'PE 102',
      subjectTitle: 'Physical Fitness',
      type: 'pe',
      units: 2,
      room: 'LR-103',
      instructor: 'Faculty Member',
      day: 'Thu',
      startTime: '13:00',
      endTime: '15:00'
    },
    {
      id: 'SCH-107',
      section: 'IT701M',
      program: 'BSIT',
      year: '1',
      subjectCode: 'GE 107',
      subjectTitle: 'Ethics',
      type: 'lecture',
      units: 3,
      room: 'LR-202',
      instructor: 'Faculty Member',
      day: 'Fri',
      startTime: '08:30',
      endTime: '11:00'
    },
    {
      id: 'SCH-108',
      section: 'IT701M',
      program: 'BSIT',
      year: '1',
      subjectCode: 'NSTP 1',
      subjectTitle: 'National Service Training Program',
      type: 'special',
      units: 3,
      room: 'LR-103',
      instructor: 'Faculty Member',
      day: 'Sat',
      startTime: '08:00',
      endTime: '11:00'
    },

    // ─── IT702M (1st Year BSIT 1B) ───
    {
      id: 'SCH-201',
      section: 'IT702M',
      program: 'BSIT',
      year: '1',
      subjectCode: 'CC 103',
      subjectTitle: 'Computer Programming 1',
      type: 'lecture',
      units: 3,
      room: 'LR-101',
      instructor: 'Program Head',
      day: 'Tue',
      startTime: '08:00',
      endTime: '10:00'
    },
    {
      id: 'SCH-202',
      section: 'IT702M',
      program: 'BSIT',
      year: '1',
      subjectCode: 'CC 103 Lab',
      subjectTitle: 'Computer Programming 1 Lab',
      type: 'lab',
      units: 1,
      room: 'CL-103',
      instructor: 'Program Head',
      day: 'Tue',
      startTime: '10:00',
      endTime: '12:00'
    },
    {
      id: 'SCH-203',
      section: 'IT702M',
      program: 'BSIT',
      year: '1',
      subjectCode: 'ITE 101',
      subjectTitle: 'Introduction to Computing',
      type: 'lecture',
      units: 3,
      room: 'LR-102',
      instructor: 'Faculty Member',
      day: 'Thu',
      startTime: '08:30',
      endTime: '10:30'
    },
    {
      id: 'SCH-204',
      section: 'IT702M',
      program: 'BSIT',
      year: '1',
      subjectCode: 'ITE 101 Lab',
      subjectTitle: 'Intro to Computing Lab',
      type: 'lab',
      units: 1,
      room: 'CL-104',
      instructor: 'Faculty Member',
      day: 'Thu',
      startTime: '10:30',
      endTime: '12:30'
    },
    {
      id: 'SCH-205',
      section: 'IT702M',
      program: 'BSIT',
      year: '1',
      subjectCode: 'GE 201',
      subjectTitle: 'Purposive Communication',
      type: 'lecture',
      units: 3,
      room: 'LR-203',
      instructor: 'Faculty Member',
      day: 'Fri',
      startTime: '13:00',
      endTime: '15:30'
    },

    // ─── IT801M (2nd Year BSIT 2A) — Includes a deliberate conflict to demonstrate red warning! ───
    {
      id: 'SCH-301',
      section: 'IT801M',
      program: 'BSIT',
      year: '2',
      subjectCode: 'ITE 301',
      subjectTitle: 'Data Structures & Algorithms',
      type: 'lab',
      units: 3,
      room: 'CL-101', // Concurrently booked with IT701M Mon 08:00–10:00!
      instructor: 'Program Head',
      day: 'Mon',
      startTime: '08:00',
      endTime: '10:00'
    },
    {
      id: 'SCH-302',
      section: 'IT801M',
      program: 'BSIT',
      year: '2',
      subjectCode: 'IM 101',
      subjectTitle: 'Database Management Systems',
      type: 'lecture',
      units: 3,
      room: 'LR-204',
      instructor: 'Program Head',
      day: 'Tue',
      startTime: '13:00',
      endTime: '15:00'
    },
    {
      id: 'SCH-303',
      section: 'IT801M',
      program: 'BSIT',
      year: '2',
      subjectCode: 'IM 101 Lab',
      subjectTitle: 'Database Systems Lab',
      type: 'lab',
      units: 1,
      room: 'CL-102',
      instructor: 'Program Head',
      day: 'Wed',
      startTime: '13:00',
      endTime: '15:30'
    },
    {
      id: 'SCH-304',
      section: 'IT801M',
      program: 'BSIT',
      year: '2',
      subjectCode: 'CS 201',
      subjectTitle: 'Discrete Mathematics',
      type: 'lecture',
      units: 3,
      room: 'LR-205',
      instructor: 'Faculty Member',
      day: 'Thu',
      startTime: '09:00',
      endTime: '11:30'
    },

    // ─── CS701M (1st Year BSCS) ───
    {
      id: 'SCH-401',
      section: 'CS701M',
      program: 'BSCS',
      year: '1',
      subjectCode: 'CS 201',
      subjectTitle: 'Discrete Mathematics',
      type: 'lecture',
      units: 3,
      room: 'LR-201',
      instructor: 'Program Head',
      day: 'Mon',
      startTime: '13:00',
      endTime: '15:30'
    },
    {
      id: 'SCH-402',
      section: 'CS701M',
      program: 'BSCS',
      year: '1',
      subjectCode: 'CC 103',
      subjectTitle: 'Computer Programming 1',
      type: 'lab',
      units: 3,
      room: 'CL-103',
      instructor: 'Academic Head',
      day: 'Wed',
      startTime: '08:30',
      endTime: '11:30'
    },

    // ─── HM701M (1st Year BSHM) ───
    {
      id: 'SCH-501',
      section: 'HM701M',
      program: 'BSHM',
      year: '1',
      subjectCode: 'HM 201',
      subjectTitle: 'Food & Beverage Service',
      type: 'lab',
      units: 3,
      room: 'Kitchen Lab',
      instructor: 'Faculty Member',
      day: 'Wed',
      startTime: '13:00',
      endTime: '16:00'
    },
    {
      id: 'SCH-502',
      section: 'HM701M',
      program: 'BSHM',
      year: '1',
      subjectCode: 'GE 107',
      subjectTitle: 'Ethics',
      type: 'lecture',
      units: 3,
      room: 'LR-101',
      instructor: 'Faculty Member',
      day: 'Thu',
      startTime: '09:00',
      endTime: '11:30'
    },

    // ─── TM701M (1st Year BSTM) ───
    {
      id: 'SCH-601',
      section: 'TM701M',
      program: 'BSTM',
      year: '1',
      subjectCode: 'TM 301',
      subjectTitle: 'Tourism Planning & Development',
      type: 'lecture',
      units: 3,
      room: 'Tourism Lab',
      instructor: 'Faculty Member',
      day: 'Tue',
      startTime: '09:00',
      endTime: '12:00'
    },

    // ─── BA701M (1st Year BSBA) ───
    {
      id: 'SCH-701',
      section: 'BA701M',
      program: 'BSBA',
      year: '1',
      subjectCode: 'BA 101',
      subjectTitle: 'Principles of Management',
      type: 'lecture',
      units: 3,
      room: 'LR-202',
      instructor: 'Academic Head',
      day: 'Mon',
      startTime: '13:00',
      endTime: '15:30'
    }
  ];

  return list;
}

/* ─── Conflict Detection Engine ─── */
function timesOverlap(classA, classB) {
  const startA = timeToMinutes(classA.startTime);
  const endA = timeToMinutes(classA.endTime);
  const startB = timeToMinutes(classB.startTime);
  const endB = timeToMinutes(classB.endTime);
  return startA < endB && endA > startB;
}

function detectConflicts(classItem) {
  const conflicts = [];

  for (const other of MASTER_SCHEDULE_DATA) {
    if (other.id === classItem.id) continue;
    if (other.day !== classItem.day) continue;
    if (!timesOverlap(classItem, other)) continue;

    // 1. Room Double-Booking Conflict
    if (other.room && classItem.room && other.room.toLowerCase() === classItem.room.toLowerCase()) {
      conflicts.push(`Room Double-Booking: ${classItem.room} is simultaneously booked by section ${other.section} (${other.subjectCode}).`);
    }

    // 2. Instructor Overlap Conflict
    if (other.instructor && classItem.instructor && other.instructor.toLowerCase() === classItem.instructor.toLowerCase()) {
      conflicts.push(`Instructor Overlap: ${classItem.instructor} is concurrently assigned to section ${other.section} in ${other.room}.`);
    }

    // 3. Section Overlapping Class Conflict
    if (other.section && classItem.section && other.section.toLowerCase() === classItem.section.toLowerCase()) {
      conflicts.push(`Section Overlap: This section already has class ${other.subjectCode} scheduled at this time.`);
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    reasons: conflicts
  };
}

/* ─── Populate Section Dropdown based on Program & Year Filters ─── */
function updateSectionDropdown() {
  const progFilter = document.getElementById('programFilter')?.value || 'all';
  const yrFilter = document.getElementById('yearFilter')?.value || 'all';
  const sectionSelect = document.getElementById('sectionSelect');
  if (!sectionSelect) return;

  const prevValue = sectionSelect.value;
  sectionSelect.innerHTML = '';

  const matchingSections = Object.values(SECTION_METADATA).filter(sec => {
    const matchProg = progFilter === 'all' || sec.program === progFilter;
    const matchYr = yrFilter === 'all' || sec.year === yrFilter;
    return matchProg && matchYr;
  });

  if (matchingSections.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No matching sections';
    sectionSelect.appendChild(opt);
    currentSelectedSection = '';
    renderGrid();
    return;
  }

  matchingSections.forEach(sec => {
    const opt = document.createElement('option');
    opt.value = sec.code;
    opt.textContent = `${sec.code} (${sec.name || sec.program})`;
    sectionSelect.appendChild(opt);
  });

  // Keep prior selection if still valid, otherwise default to first
  if (matchingSections.some(s => s.code === prevValue)) {
    sectionSelect.value = prevValue;
    currentSelectedSection = prevValue;
  } else {
    sectionSelect.value = matchingSections[0].code;
    currentSelectedSection = matchingSections[0].code;
  }

  renderGrid();
}

/* ─── Main Render Function: Section Spreadsheet Timetable ─── */
function renderGrid() {
  const tbody = document.getElementById('sectionGridBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const isAdmin = CURRENT_USER && CURRENT_USER.role === 'admin';

  // Toggle Generate Baseline button access
  const btnGen = document.getElementById('btnGenerate');
  if (btnGen) {
    btnGen.style.display = isAdmin ? 'inline-flex' : 'none';
  }

  // Active section verification
  const sectionSelect = document.getElementById('sectionSelect');
  if (sectionSelect && sectionSelect.value) {
    currentSelectedSection = sectionSelect.value;
  }

  const meta = SECTION_METADATA[currentSelectedSection] || {
    code: currentSelectedSection || '—',
    program: 'General',
    year: '1',
    name: currentSelectedSection || '—',
    adviser: 'Academic Head',
    students: 35
  };

  const sectionClasses = MASTER_SCHEDULE_DATA.filter(c => c.section === currentSelectedSection);

  // 1. Update Header Metadata
  const sheetTitle = document.getElementById('sheetSectionTitle');
  if (sheetTitle) sheetTitle.textContent = meta.code;

  const sheetProgram = document.getElementById('sheetProgramYear');
  if (sheetProgram) sheetProgram.textContent = `${meta.program} · Year ${meta.year} (${meta.name})`;

  const totalUnits = sectionClasses.reduce((sum, c) => sum + (Number(c.units) || 0), 0);
  const sheetUnits = document.getElementById('sheetTotalUnits');
  if (sheetUnits) sheetUnits.textContent = `${totalUnits} Units`;

  const sheetStudents = document.getElementById('sheetStudentsCount');
  if (sheetStudents) sheetStudents.textContent = `${meta.students} Students`;

  const sheetAdviser = document.getElementById('sheetAdviser');
  if (sheetAdviser) sheetAdviser.textContent = meta.adviser;

  // 2. Auto-Trim Range: Determine earliest start & latest end times
  let minMinutes = 8 * 60;   // Default 8:00 AM
  let maxMinutes = 17 * 60;  // Default 5:00 PM

  if (sectionClasses.length > 0) {
    let earliest = 24 * 60;
    let latest = 0;
    sectionClasses.forEach(c => {
      const s = timeToMinutes(c.startTime);
      const e = timeToMinutes(c.endTime);
      if (s < earliest) earliest = s;
      if (e > latest) latest = e;
    });

    // Round earliest down to nearest 30 min, latest up to nearest 30 min
    minMinutes = Math.floor(earliest / 30) * 30;
    maxMinutes = Math.ceil(latest / 30) * 30;

    // Provide at least 1 hr buffer or keep snug
    if (minMinutes > 7 * 60) minMinutes = Math.max(7 * 60, minMinutes);
    if (maxMinutes < 12 * 60) maxMinutes = 12 * 60;
  }

  // Generate 30-minute intervals
  const timeSlots = [];
  for (let m = minMinutes; m < maxMinutes; m += 30) {
    timeSlots.push(minutesToTime(m));
  }

  // 3. Matrix to track rowspan occupancy: covered[day][slotIndex]
  const covered = {};
  DAYS.forEach(d => { covered[d] = new Array(timeSlots.length).fill(false); });

  // Daily hours tracker for footer
  const dailyMinutes = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };

  // 4. Build Table Body Rows
  timeSlots.forEach((slotTime, slotIdx) => {
    const tr = document.createElement('tr');

    // Time Column
    const timeTd = document.createElement('td');
    timeTd.className = 'time-col-cell';
    timeTd.textContent = formatTime12(slotTime);
    tr.appendChild(timeTd);

    // Days Columns (MON-SAT)
    DAYS.forEach(day => {
      // If cell is already covered by a previous rowspan, skip rendering <td>
      if (covered[day][slotIdx]) {
        return;
      }

      // Check if a class starts in this time slot for this day
      const classItem = sectionClasses.find(c => c.day === day && c.startTime === slotTime);

      if (classItem) {
        const durationMins = timeToMinutes(classItem.endTime) - timeToMinutes(classItem.startTime);
        const rowspan = Math.max(1, Math.round(durationMins / 30));

        // Mark covered slots
        for (let r = 0; r < rowspan; r++) {
          if (slotIdx + r < timeSlots.length) {
            covered[day][slotIdx + r] = true;
          }
        }

        dailyMinutes[day] += durationMins;

        const conflictInfo = detectConflicts(classItem);
        const typeClass = `type-${classItem.type || 'lecture'}`;

        const classTd = document.createElement('td');
        classTd.rowSpan = rowspan;
        classTd.className = `class-block-cell ${typeClass} ${conflictInfo.hasConflict ? 'has-conflict' : ''}`;
        classTd.dataset.id = classItem.id;

        // Hover tooltip with full details
        let tooltip = `${classItem.section} · ${classItem.subjectCode} (${classItem.subjectTitle || ''})\n` +
                      `Room: ${classItem.room} | Instructor: ${classItem.instructor}\n` +
                      `Time: ${formatTime12(classItem.startTime)} – ${formatTime12(classItem.endTime)} (${classItem.units} Units)`;
        classTd.title = tooltip;

        classTd.innerHTML = `
          <div class="class-cell-inner">
            <div class="class-sec-badge">${escapeHtml(classItem.section)}</div>
            <div class="class-subj-title">${escapeHtml(classItem.subjectCode)}</div>
            <div class="class-meta-line">${escapeHtml(classItem.room)} · ${escapeHtml(classItem.instructor)}</div>
            <div class="class-units-line">${escapeHtml(String(classItem.units))} Units</div>
          </div>
        `;

        classTd.addEventListener('click', () => {
          showClassDetails(classItem.id);
        });

        tr.appendChild(classTd);

      } else {
        // Empty cell
        const emptyTd = document.createElement('td');
        emptyTd.className = 'empty-cell';
        tr.appendChild(emptyTd);
      }
    });

    tbody.appendChild(tr);
  });

  // 5. Update Footer Row (# of Hrs per day + Weekly Total)
  let weeklyTotalMins = 0;
  DAYS.forEach(day => {
    const hrsEl = document.getElementById(`hrs-${day}`);
    const hrs = (dailyMinutes[day] / 60).toFixed(1);
    if (hrsEl) hrsEl.textContent = `${hrs} hrs`;
    weeklyTotalMins += dailyMinutes[day];
  });

  const weeklyEl = document.getElementById('weeklyTotalHours');
  if (weeklyEl) {
    const totalWeeklyHrs = (weeklyTotalMins / 60).toFixed(1);
    weeklyEl.textContent = `${totalWeeklyHrs} hrs / week`;
  }
}

/* ─── Class Details Modal & Diagnostic ─── */
function showClassDetails(classId) {
  const item = MASTER_SCHEDULE_DATA.find(c => c.id === classId);
  if (!item) return;

  const modal = document.getElementById('classDetailModal');
  const modalBody = document.getElementById('detailModalBody');
  const modalTitle = document.getElementById('detailModalTitle');
  if (!modal || !modalBody) return;

  const conflictInfo = detectConflicts(item);

  if (modalTitle) {
    modalTitle.textContent = `${item.section} · ${item.subjectCode}`;
  }

  const durationHrs = ((timeToMinutes(item.endTime) - timeToMinutes(item.startTime)) / 60).toFixed(1);

  modalBody.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
      <div>
        <div style="font-size:18px; font-weight:800; color:var(--accent-primary);">${escapeHtml(item.subjectCode)}</div>
        <div style="font-size:13.5px; color:var(--text-secondary); margin-top:2px;">${escapeHtml(item.subjectTitle || 'No title available')}</div>
      </div>
      <span class="badge" style="background:#EEF1F7; color:var(--accent-primary); font-weight:700; font-size:11.5px; text-transform:uppercase;">
        ${escapeHtml(item.type || 'Lecture')}
      </span>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:13px;">
      <div>
        <div style="color:var(--text-secondary); font-size:11px; font-weight:700; text-transform:uppercase;">Section</div>
        <div style="font-weight:700; color:var(--text-primary); margin-top:2px;">${escapeHtml(item.section)}</div>
      </div>
      <div>
        <div style="color:var(--text-secondary); font-size:11px; font-weight:700; text-transform:uppercase;">Academic Units</div>
        <div style="font-weight:700; color:var(--text-primary); margin-top:2px;">${escapeHtml(String(item.units))} Units</div>
      </div>
      <div>
        <div style="color:var(--text-secondary); font-size:11px; font-weight:700; text-transform:uppercase;">Classroom</div>
        <div style="font-weight:700; color:var(--text-primary); margin-top:2px; display:flex; align-items:center; gap:6px;">
          <span>${escapeHtml(item.room)}</span>
          <button class="btn btn-outline" style="font-size:10.5px; padding:2px 7px; display:inline-flex; align-items:center; gap:3px; font-weight:600;" onclick="viewRoomOnCampusMap('${escapeHtml(item.room)}')">
            📍 Map ↗
          </button>
        </div>
      </div>
      <div>
        <div style="color:var(--text-secondary); font-size:11px; font-weight:700; text-transform:uppercase;">Instructor</div>
        <div style="font-weight:700; color:var(--text-primary); margin-top:2px;">${escapeHtml(item.instructor)}</div>
      </div>
      <div style="grid-column: span 2;">
        <div style="color:var(--text-secondary); font-size:11px; font-weight:700; text-transform:uppercase;">Schedule</div>
        <div style="font-weight:700; color:var(--text-primary); margin-top:2px;">
          ${escapeHtml(item.day)} · ${formatTime12(item.startTime)} – ${formatTime12(item.endTime)} (${durationHrs} hrs)
        </div>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
}

function closeClassDetailModal() {
  const modal = document.getElementById('classDetailModal');
  if (modal) modal.style.display = 'none';
}

/* ─── Export Timetable Handlers ─── */
function toggleExportMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('exportDropdownMenu');
  if (menu) {
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
  }
}

function exportTimetablePDF() {
  const menu = document.getElementById('exportDropdownMenu');
  if (menu) menu.style.display = 'none';

  // Set document title temporarily to section name for PDF filename
  const originalTitle = document.title;
  document.title = `${currentSelectedSection}_STI_Classroom_Timetable`;

  window.print();

  setTimeout(() => {
    document.title = originalTitle;
  }, 1000);
}

async function exportTimetablePNG() {
  const menu = document.getElementById('exportDropdownMenu');
  if (menu) menu.style.display = 'none';

  const card = document.getElementById('sectionTimetableCard');
  if (!card) {
    alert('Timetable sheet not found.');
    return;
  }

  if (typeof html2canvas === 'undefined') {
    alert('html2canvas library is loading. Please check your internet connection or use Export as PDF.');
    return;
  }

  try {
    const canvas = await html2canvas(card, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#FFFFFF',
      logging: false
    });

    const link = document.createElement('a');
    link.download = `${currentSelectedSection}_Timetable.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    alert('Unable to generate PNG image. Please use Export as PDF.');
  }
}

/* ─── Fetch Live Schedules from API (if backend available) ─── */
async function syncSchedulesFromAPI() {
  try {
    const res = await fetch('api/gemini_suggestions.php', { method: 'GET' });
    // Keep baseline enriched
  } catch (e) {
    // Standalone fallback
  }
}

/* ─── Module Initialization & Global Bindings ─── */
document.addEventListener('DOMContentLoaded', () => {
  MASTER_SCHEDULE_DATA = generateBaselineSchedules();

  const progFilter = document.getElementById('programFilter');
  if (progFilter) progFilter.addEventListener('change', updateSectionDropdown);

  const yrFilter = document.getElementById('yearFilter');
  if (yrFilter) yrFilter.addEventListener('change', updateSectionDropdown);

  const sectionSelect = document.getElementById('sectionSelect');
  if (sectionSelect) {
    sectionSelect.addEventListener('change', (e) => {
      currentSelectedSection = e.target.value;
      renderGrid();
    });
  }

  const btnGenerate = document.getElementById('btnGenerate');
  if (btnGenerate) {
    btnGenerate.addEventListener('click', () => {
      MASTER_SCHEDULE_DATA = generateBaselineSchedules();
      renderGrid();
      alert('Baseline master schedule successfully generated for all sections.');
    });
  }

  document.addEventListener('click', (e) => {
    const menu = document.getElementById('exportDropdownMenu');
    const btn = document.getElementById('btnExport');
    if (menu && menu.style.display === 'block' && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

  updateSectionDropdown();
});

// Global window assignments for inline event handlers and inter-module calls
window.renderGrid = renderGrid;
window.updateSectionDropdown = updateSectionDropdown;
window.showClassDetails = showClassDetails;
window.closeClassDetailModal = closeClassDetailModal;
window.toggleExportMenu = toggleExportMenu;
window.exportTimetablePDF = exportTimetablePDF;
window.exportTimetablePNG = exportTimetablePNG;
