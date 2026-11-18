/* ══════════════════════════════════════════════════════════════════════════
   MODULE 1 — ACADEMIC SCHEDULING LIFECYCLE CONTROLLER & TIMETABLE ENGINE
   ══════════════════════════════════════════════════════════════════════════ */

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Global repositories and runtime trackers
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

// Encodes a value for use as an argument inside an inline onclick attribute
function jsArg(value) {
  return escapeHtml(JSON.stringify(String(value ?? '')));
}

// Form checks matching includes/functions.php. Each returns an error message, or null if valid.
const INPUT_RULES = {
  name: (label, v) => /^\p{L}[\p{L}\p{M} .'\-]*$/u.test(v) ? null : `${label} can only contain letters, spaces, periods, apostrophes and hyphens.`,
  code: (label, v) => /^[A-Za-z0-9][A-Za-z0-9 \-]*$/.test(v) ? null : `${label} can only contain letters, numbers, spaces and hyphens.`,
  text: (label, v) => (/^[\p{L}\p{N}][\p{L}\p{M}\p{N} .,:;&\/()'+#\-]*$/u.test(v) && /\p{L}/u.test(v)) ? null : `${label} must contain a letter and only ordinary punctuation.`,
  int: (label, raw, min, max) => {
    const text = String(raw).trim();
    const n = Number(text);
    return text !== '' && Number.isInteger(n) && n >= min && n <= max ? null : `${label} must be a whole number from ${min} to ${max}.`;
  },
  hours: (label, raw) => {
    const text = String(raw).trim();
    const n = Number(text);
    return text !== '' && n >= 0 && n <= 6 && Number.isInteger(n * 2) ? null : `${label} must be from 0 to 6, in steps of 0.5.`;
  },
  schoolYear: v => {
    const m = /^AY (20\d{2})-(20\d{2})$/.exec(v);
    return m && Number(m[2]) === Number(m[1]) + 1 ? null : 'School year must look like AY 2026-2027, and the second year must follow the first.';
  },
  password: v => {
    if (v.length < 8) return 'Password must be at least 8 characters.';
    if (v.length > 72) return 'Password must be 72 characters or fewer.';
    return /[A-Za-z]/.test(v) && /\d/.test(v) ? null : 'Password must include at least one letter and one number.';
  },
  // Full names are stored as a first word and the remainder, each up to 50 characters
  fullName: v => {
    const [first, ...rest] = v.split(/\s+/);
    if (first.length > 50 || rest.join(' ').length > 50) return 'First and last name must each be 50 characters or fewer.';
    return INPUT_RULES.name('Full name', v);
  }
};

/* ══════════════════════════════════════════════════════════════════════════
   STEP NAVIGATION CONTROLLER
   ══════════════════════════════════════════════════════════════════════════ */

let isScheduleInitialized = false;

function getActiveAcademicContext() {
  const activeSy = (typeof SCHOOL_YEARS !== 'undefined' ? SCHOOL_YEARS.find(y => y.isActive) : null)
    || (typeof SCHOOL_YEARS !== 'undefined' && SCHOOL_YEARS.length > 0 ? SCHOOL_YEARS[0] : { id: 1, yearCode: 'AY 2026-2027' });

  const terms = (typeof SCHOOL_TERMS !== 'undefined') ? termsOfYear(activeSy.id) : [];
  let activeTerm = terms.find(t => t.isActive);

  // With no active term, the year's earliest term becomes active
  if (!activeTerm && terms.length > 0) {
    activeTerm = terms[0];
    activeTerm.isActive = true;
  }

  if (!activeTerm) {
    activeTerm = { id: 1, yearId: activeSy.id, termName: '1st Sem', status: 'active', isActive: true };
  }

  return { activeSy, activeTerm };
}

// Steps: 1 School Year, 2 School Term, 3 Load Subjects, 4 Create Sections, 5 Rooms & Instructors,
// 6 Validate Resources, 7 Timetable. Returns the first unfinished setup step, or null when all are done.
function firstIncompleteStep() {
  const activeSy = SCHOOL_YEARS.find(y => y.isActive);
  if (!activeSy) return { step: 1, reason: 'Set an active school year.' };
  if (!SCHOOL_TERMS.some(t => t.yearId === activeSy.id)) return { step: 2, reason: `Add a school term for ${activeSy.yearCode}.` };

  const { activeTerm } = getActiveAcademicContext();
  if (!CURRICULUM_SUBJECTS.some(s => s.termId === activeTerm.id && s.isIncluded)) {
    return { step: 3, reason: `Load and include subjects for ${activeTerm.termName} (${activeSy.yearCode}).` };
  }

  if (!ACADEMIC_SECTIONS.some(s => s.termId === activeTerm.id)) {
    return { step: 4, reason: `Create the sections for ${activeTerm.termName} (${activeSy.yearCode}).` };
  }

  const readiness = evaluateResourceReadiness();
  if (readiness.hasCritical) return { step: 6, reason: readiness.criticalReasons.join('\n• ') };
  return null;
}

function updateStepLocks() {
  const incomplete = firstIncompleteStep();
  const hasCritical = evaluateResourceReadiness().hasCritical;
  // Sections need Steps 1-3; Rooms & Instructors needs sections; the timetable needs no critical shortages
  const lockReason = {
    4: incomplete && incomplete.step < 4 ? `Locked: finish Step ${incomplete.step} first` : '',
    5: incomplete && incomplete.step < 5 ? `Locked: finish Step ${incomplete.step} first` : '',
    7: hasCritical ? 'Locked: resolve the critical professor and room shortages in Step 6 first' : ''
  };
  [4, 5, 7].forEach(step => {
    const btn = document.getElementById(`stepBtn-${step}`);
    if (!btn) return;
    const locked = !!lockReason[step];
    btn.classList.toggle('locked', locked);
    if (locked) {
      btn.title = lockReason[step];
    } else {
      btn.removeAttribute('title');
    }
  });
}

function goToScheduleStep(stepNumber) {
  stepNumber = parseInt(stepNumber, 10);
  if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 7) stepNumber = 7;
  applyScheduleRole();
  if (!canEditSchedule()) stepNumber = 7;

  // Gatekeeper: a step opens only once the steps it depends on are done (Sections need Steps 1-3, Rooms &
  // Instructors needs sections). Only when the user moves through the steps, never during page startup.
  if (isScheduleInitialized && (stepNumber === 4 || stepNumber === 5)) {
    const incomplete = firstIncompleteStep();
    if (incomplete && incomplete.step < stepNumber) {
      const names = { 4: 'Create Sections', 5: 'Rooms & Instructors' };
      alert(`\u26A0 Step ${stepNumber} (${names[stepNumber]}) isn't ready yet.\n\nFinish Step ${incomplete.step} first:\n\u2022 ${incomplete.reason}`);
      goToScheduleStep(incomplete.step);
      return;
    }
  }
  if (isScheduleInitialized && stepNumber === 7 && canEditSchedule()
    && ACADEMIC_SECTIONS.filter(s => s.termId === getActiveAcademicContext().activeTerm.id).length === 0) {
    alert(`\u26A0 Step 7 (Timetable) needs sections.\n\nCreate this term's sections in Step 4 first.`);
    goToScheduleStep(4);
    return;
  }
  ACTIVE_SCHEDULE_STEP = stepNumber;

  // A step only shows as done when it really is finished
  const incompleteStep = firstIncompleteStep();
  const isStepDone = i => i < stepNumber && !(incompleteStep && incompleteStep.step <= i);

  // Update Stepper Bar Indicators
  for (let i = 1; i <= 7; i++) {
    const btn = document.getElementById(`stepBtn-${i}`);
    const num = document.getElementById(`stepNum-${i}`);
    if (btn) {
      btn.classList.toggle('active', i === stepNumber);
      btn.classList.toggle('completed', isStepDone(i));
    }
    if (num) {
      if (isStepDone(i)) {
        num.innerHTML = '&check;';
      } else {
        num.textContent = String(i);
      }
    }
  }

  updateStepLocks();

  // Update Active Panel
  for (let i = 1; i <= 7; i++) {
    const panel = document.getElementById(`stepPanel-${i}`);
    if (panel) {
      panel.classList.toggle('active', i === stepNumber);
    }
  }

  // Render Step Content
  if (stepNumber === 1) renderSchoolYearTable();
  if (stepNumber === 2) renderSchoolTermTable();
  if (stepNumber === 3) {
    updateCurriculumTermFilter();
    renderSubjectOfferingTable();
  }
  renderStepHelp(stepNumber);
  if (stepNumber === 4) renderSectionsTable();
  if (stepNumber === 5) renderRoomPlan();
  if (stepNumber === 6) renderResourceValidation();
  if (stepNumber === 7) {
    updateSectionDropdown();
    renderGrid();
  }
  updateScheduleStats();
}

/* ══════════════════════════════════════════════════════════════════════════
   STEP 1: SCHOOL YEAR MANAGEMENT
   ══════════════════════════════════════════════════════════════════════════ */

function renderSchoolYearTable() {
  const tbody = document.getElementById('schoolYearTableBody');
  if (!tbody) return;

  const activeSy = SCHOOL_YEARS.find(y => y.isActive) || SCHOOL_YEARS[0];
  const sub1 = document.getElementById('stepSub-1');
  if (sub1 && activeSy) sub1.textContent = activeSy.yearCode;

  if (SCHOOL_YEARS.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--text-secondary);">No school years configured. Click "+ Add School Year" to create one.</td></tr>`;
    return;
  }

  tbody.innerHTML = SCHOOL_YEARS.map(sy => {
    const yearTerms = SCHOOL_TERMS.filter(t => t.yearId === sy.id);
    const collegeCount = yearTerms.filter(t => schoolLevelOfTerm(t) === 'tertiary').length;
    const shsCount = yearTerms.length - collegeCount;
    const statusBadge = sy.isActive
      ? `<span class="badge" style="background:#DEF7EC; color:#03543F; font-weight:800; font-size:0.857rem;">✓ ACTIVE</span>`
      : `<span class="badge" style="background:#F3F4F6; color:#4B5563; font-weight:600; font-size:0.857rem;">Inactive</span>`;

    const activeBtn = sy.isActive
      ? `<button class="btn btn-outline" disabled style="font-size:0.857rem; padding:3px 8px; opacity:0.6;">Current Active</button>`
      : `<button class="btn btn-outline" onclick="setActiveSchoolYear(${sy.id})" style="font-size:0.857rem; padding:3px 8px;">Set as Active</button>`;

    return `
      <tr>
        <td style="font-weight:700; color:var(--accent-primary); font-size:0.964rem;">${escapeHtml(sy.yearCode)}</td>
        <td>${statusBadge}</td>
        <td>${collegeCount} College · ${shsCount} SHS</td>
        <td style="color:var(--text-secondary);">${escapeHtml(sy.created || '2026-06-01')}</td>
        <td style="text-align:right;">
          <div style="display:inline-flex; gap:6px; align-items:center;">
            ${activeBtn}
            <button class="btn btn-outline" onclick="openEditSchoolYearModal(${sy.id})" style="font-size:0.857rem; padding:3px 8px;">Edit</button>
            <button class="btn btn-outline" onclick="deleteSchoolYear(${sy.id})" style="font-size:0.857rem; padding:3px 8px; color:#DC2626; border-color:#FCA5A5;">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Sections or subjects tie a term to its level
function termHasLevelData(termId) {
  return ACADEMIC_SECTIONS.some(s => s.termId === termId) || CURRICULUM_SUBJECTS.some(s => s.termId === termId);
}

function openAddSchoolYearModal() {
  document.getElementById('syModalTitle').textContent = 'Add School Year';
  document.getElementById('syEditId').value = '';
  document.getElementById('syCodeInput').value = '';
  document.getElementById('syIsActiveInput').checked = false;
  document.getElementById('schoolYearModal').style.display = 'flex';
}

function openEditSchoolYearModal(id) {
  const sy = SCHOOL_YEARS.find(y => y.id === id);
  if (!sy) return;
  document.getElementById('syModalTitle').textContent = 'Edit School Year';
  document.getElementById('syEditId').value = sy.id;
  document.getElementById('syCodeInput').value = String(sy.yearCode).replace(/^AY\s*/i, '');
  document.getElementById('syIsActiveInput').checked = !!sy.isActive;
  document.getElementById('schoolYearModal').style.display = 'flex';
}

// The terms a new school year starts with: College 1st Sem, 2nd Sem and Summer; SHS 1st, 2nd, 3rd Term and Summer.
// They can be renamed, added to or removed in Step 2.
function defaultTermsFor(level, startYr, endYr) {
  const summer = { termName: 'Summer', startDate: `${endYr}-06-07`, endDate: `${endYr}-07-23` };
  return level === 'shs' ? [
    { termName: '1st Term', startDate: `${startYr}-08-16`, endDate: `${startYr}-11-14` },
    { termName: '2nd Term', startDate: `${startYr}-11-23`, endDate: `${endYr}-02-26` },
    { termName: '3rd Term', startDate: `${endYr}-03-08`, endDate: `${endYr}-05-28` },
    summer
  ] : [
    { termName: '1st Sem', startDate: `${startYr}-08-16`, endDate: `${startYr}-12-17` },
    { termName: '2nd Sem', startDate: `${endYr}-01-10`, endDate: `${endYr}-05-26` },
    { ...summer }
  ];
}
function defaultYearTerms(startYr, endYr) {
  return ['tertiary', 'shs'].flatMap(level => defaultTermsFor(level, startYr, endYr).map(d => ({ ...d, level })));
}

// Years saved in this browser before terms had levels lack one level's terms. Once per browser they get that
// level's standard terms, as the server does for its database; terms deleted later on purpose don't come back.
function fillSavedYearsMissingLevelTerms() {
  try {
    if (localStorage.getItem('sti_term_levels_filled')) return;
    localStorage.setItem('sti_term_levels_filled', '1');
  } catch (e) {
    return;
  }
  let nextId = Math.max(0, ...SCHOOL_TERMS.map(t => Number(t.id) || 0)) + 1;
  let added = false;
  SCHOOL_YEARS.forEach(year => {
    const { startYr, endYr } = yearSpanOf(year.yearCode);
    ['tertiary', 'shs'].forEach(level => {
      if (SCHOOL_TERMS.some(t => t.yearId === year.id && schoolLevelOfTerm(t) === level)) return;
      defaultTermsFor(level, startYr, endYr).forEach(d => {
        SCHOOL_TERMS.push({ id: nextId++, yearId: year.id, ...d, level, status: 'draft', isActive: false });
        added = true;
      });
    });
  });
  if (added) saveStateToStorage();
}

function yearSpanOf(yearCode) {
  const yearMatches = String(yearCode || '').match(/\b(20\d{2})\b/g);
  const startYr = yearMatches && yearMatches[0] ? parseInt(yearMatches[0], 10) : new Date().getFullYear();
  const endYr = yearMatches && yearMatches[1] ? parseInt(yearMatches[1], 10) : (startYr + 1);
  return { startYr, endYr };
}

function closeSchoolYearModal() {
  const modal = document.getElementById('schoolYearModal');
  if (modal) modal.style.display = 'none';
}

// Program and year dropdowns list the active school year's programs or strands, and years or grades
const LEVEL_PROGRAM_SELECTS = ['programFilter', 'slotProgramSelect', 'curricSubjProgram', 'secProgramInput', 'autoGenProgram'];
const LEVEL_YEAR_SELECTS = ['yearFilter', 'curricSubjYear', 'secYearInput', 'autoGenYear'];

function fillLevelSelect(id, values, label) {
  const select = document.getElementById(id);
  if (!select) return;
  const allOption = select.querySelector('option[value="all"]');
  const current = select.value;
  select.innerHTML = (allOption ? allOption.outerHTML : '') + values.map(v => `<option value="${escapeHtml(String(v))}">${escapeHtml(label(v))}</option>`).join('');
  select.value = [...select.options].some(o => o.value === current) ? current : select.options[0].value;
}

function applySchoolLevelOptions() {
  const level = activeSchoolLevel();
  LEVEL_PROGRAM_SELECTS.forEach(id => fillLevelSelect(id, LEVEL_PROGRAMS[level], p => p));
  LEVEL_YEAR_SELECTS.forEach(id => fillLevelSelect(id, LEVEL_YEARS[level], yearLevelOptionLabel));

  // Saved subject sets are shared by every year, so they list both levels
  const setProgram = document.getElementById('subjectSetProgram');
  if (setProgram && !setProgram.querySelector('optgroup')) {
    setProgram.innerHTML = Object.keys(LEVEL_PROGRAMS).map(lv => `<optgroup label="${LEVEL_NAMES[lv]}">${LEVEL_PROGRAMS[lv].map(p => `<option value="${p}">${p}</option>`).join('')}</optgroup>`).join('');
  }
  const setYear = document.getElementById('subjectSetYear');
  if (setYear && !setYear.querySelector('optgroup')) {
    setYear.innerHTML = Object.keys(LEVEL_YEARS).map(lv => `<optgroup label="${LEVEL_NAMES[lv]}">${LEVEL_YEARS[lv].map(y => `<option value="${y}">${yearLevelOptionLabel(y)}</option>`).join('')}</optgroup>`).join('');
  }
}
window.applySchoolLevelOptions = applySchoolLevelOptions;

function refreshAllSchedulingViews() {
  applySchoolLevelOptions();
  renderSchoolYearTable();
  renderSchoolTermTable();
  updateCurriculumTermFilter();
  renderSubjectOfferingTable();
  renderResourceValidation();
  renderSectionsTable();
  updateSectionDropdown();
  renderGrid();
  updateScheduleStats();
  syncAllSyFilters();

  if (typeof renderScheduleViewer === 'function') renderScheduleViewer();
  if (typeof renderScheduleReports === 'function') renderScheduleReports();
}

function syncAllSyFilters() {
  if (typeof SCHOOL_YEARS === 'undefined') return;
  const activeSy = SCHOOL_YEARS.find(y => y.isActive) || SCHOOL_YEARS[0];

  const selects = [
    document.getElementById('masterScheduleSyFilter')
  ];

  selects.forEach(sel => {
    if (!sel) return;
    sel.innerHTML = SCHOOL_YEARS.map(sy => {
      return `<option value="${sy.id}" ${sy.isActive ? 'selected' : ''}>${escapeHtml(sy.yearCode)}${sy.isActive ? ' (Active)' : ''}</option>`;
    }).join('');
    if (activeSy) sel.value = String(activeSy.id);
  });
}
window.syncAllSyFilters = syncAllSyFilters;

// The year field takes only numbers and a dash, such as 2026-2027; the dash is added after the first 4 digits
function formatSchoolYearInput(input) {
  const digits = input.value.replace(/\D/g, '').slice(0, 8);
  input.value = digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
}
window.formatSchoolYearInput = formatSchoolYearInput;

async function submitSchoolYearModal() {
  const idVal = document.getElementById('syEditId').value;
  const typed = document.getElementById('syCodeInput').value.trim();
  const isActiveVal = document.getElementById('syIsActiveInput').checked;

  // Saved as "AY 2026-2027"
  const codeVal = `AY ${typed}`;
  if (!typed || INPUT_RULES.schoolYear(codeVal)) {
    alert('Type the school year as numbers, like 2026-2027, with the second year right after the first.');
    return;
  }

  if (SCHOOL_YEARS.some(y => y.yearCode.toLowerCase() === codeVal.toLowerCase() && String(y.id) !== idVal)) {
    alert(`${codeVal} already exists.`);
    return;
  }

  const { startYr, endYr } = yearSpanOf(codeVal);

  // Making a year active changes it for everyone, so ask first, as the year dropdown does
  const editedYear = idVal ? SCHOOL_YEARS.find(y => String(y.id) === idVal) : null;
  if (isActiveVal && SCHOOL_YEARS.length > 0 && !(editedYear && editedYear.isActive)
    && !(await askConfirm(`This makes ${codeVal} the active school year for all users, not just this view.`, { title: 'Make this the active school year?', confirmLabel: 'Make active' }))) return;

  if (isActiveVal) {
    SCHOOL_YEARS.forEach(y => y.isActive = false);
    SCHOOL_TERMS.forEach(t => t.isActive = false);
  }

  let targetSyId;
  if (idVal) {
    targetSyId = parseInt(idVal, 10);
    const sy = SCHOOL_YEARS.find(y => y.id === targetSyId);
    if (sy) {
      sy.yearCode = codeVal;
      sy.isActive = isActiveVal;
    }
  } else {
    targetSyId = SCHOOL_YEARS.length ? Math.max(...SCHOOL_YEARS.map(y => y.id)) + 1 : 1;
    SCHOOL_YEARS.push({
      id: targetSyId,
      yearCode: codeVal,
      isActive: isActiveVal || SCHOOL_YEARS.length === 0,
      created: new Date().toISOString().split('T')[0]
    });
  }

  // A new year starts with its College and SHS terms. An edited year's standard terms move to the new dates.
  const defaults = defaultYearTerms(startYr, endYr);
  let yearTerms = SCHOOL_TERMS.filter(t => t.yearId === targetSyId);
  if (yearTerms.length === 0) {
    const baseId = Date.now();
    yearTerms = defaults.map((d, i) => ({ id: baseId + i + 1, yearId: targetSyId, ...d, status: i === 0 ? 'active' : 'draft', isActive: i === 0 && isActiveVal }));
    SCHOOL_TERMS.push(...yearTerms);
  } else {
    yearTerms.forEach(t => {
      const standard = defaults.find(d => d.level === schoolLevelOfTerm(t) && d.termName.toLowerCase() === String(t.termName).toLowerCase());
      if (standard) {
        t.startDate = standard.startDate;
        t.endDate = standard.endDate;
      }
    });
  }

  // An active year opens on its earliest term
  if (isActiveVal) {
    const firstTerm = termsOfYear(targetSyId)[0];
    SCHOOL_TERMS.forEach(t => {
      t.isActive = !!firstTerm && t.id === firstTerm.id;
    });
  }

  saveStateToStorage();
  closeSchoolYearModal();
  // Step 2 shows the saved year; a new year opens Step 2 right away
  termViewYearCode = codeVal;
  refreshAllSchedulingViews();
  if (!idVal) goToScheduleStep(2);

  // Try API sync if connected
  postScheduleAction({ action: 'save_school_year', year_id: idVal ? targetSyId : 0, year_code: codeVal, is_active: isActiveVal,
    terms: yearTerms.map(t => ({ ...t, level: schoolLevelOfTerm(t) })) });
}

function setActiveSchoolYear(id) {
  SCHOOL_YEARS.forEach(y => y.isActive = (y.id === id));

  // The year opens on its earliest term
  const firstTerm = termsOfYear(id)[0];
  if (firstTerm) {
    SCHOOL_TERMS.forEach(t => {
      t.isActive = t.id === firstTerm.id;
    });
  }

  saveStateToStorage();
  refreshAllSchedulingViews();

  postScheduleAction({ action: 'set_active_year', year_id: id });
}

// The year dropdowns change the shared active year, so confirm before switching
async function handleActiveYearFilter(select) {
  const id = parseInt(select.value, 10);
  const target = SCHOOL_YEARS.find(y => y.id === id);
  if (!target || !(await askConfirm(`This changes the active school year to ${target.yearCode} for all users, not just this view.`, { title: 'Switch the active school year?', confirmLabel: 'Switch year' }))) {
    syncAllSyFilters();
    return;
  }
  setActiveSchoolYear(id);
}
window.handleActiveYearFilter = handleActiveYearFilter;

async function deleteSchoolYear(id) {
  if (SCHOOL_YEARS.length <= 1) {
    alert('At least one school year must remain in the system.');
    return;
  }
  if (!(await askConfirm('This school year will be removed from the system.', { title: 'Delete this school year?', confirmLabel: 'Delete school year', danger: true }))) return;
  SCHOOL_YEARS = SCHOOL_YEARS.filter(y => y.id !== id);
  if (!SCHOOL_YEARS.some(y => y.isActive)) SCHOOL_YEARS[0].isActive = true;
  saveStateToStorage();
  renderSchoolYearTable();

  postScheduleAction({ action: 'delete_school_year', year_id: id });
}

/* ══════════════════════════════════════════════════════════════════════════
   STEP 2: SCHOOL TERM MANAGEMENT
   ══════════════════════════════════════════════════════════════════════════ */

// The school year Step 2 is showing. Picking one only changes the view, not the active year.
// It is kept by year code, which stays the same when a reload from the server renumbers a new year.
let termViewYearCode = null;
function termViewYear() {
  return SCHOOL_YEARS.find(y => y.yearCode === termViewYearCode) || SCHOOL_YEARS.find(y => y.isActive) || SCHOOL_YEARS[0];
}
function changeTermViewYear(yearId) {
  const year = SCHOOL_YEARS.find(y => String(y.id) === String(yearId));
  termViewYearCode = year ? year.yearCode : null;
  renderSchoolTermTable();
}
window.changeTermViewYear = changeTermViewYear;

// Step 2 shows the picked year's terms as boxes, one row for College and one for SHS
function renderSchoolTermTable() {
  const container = document.getElementById('schoolTermBoxes');
  if (!container) return;

  const viewSy = termViewYear();
  const picker = document.getElementById('termYearPicker');
  if (picker) {
    picker.innerHTML = SCHOOL_YEARS.map(y => `<option value="${y.id}">${escapeHtml(y.yearCode)}${y.isActive ? ' (active)' : ''}</option>`).join('');
    if (viewSy) picker.value = String(viewSy.id);
  }

  if (!viewSy) {
    container.innerHTML = '<p class="term-empty">No school year yet. Add one in Step 1.</p>';
    return;
  }

  // A year with no terms gets the standard College and SHS terms; only the active year's first one becomes the working term
  let terms = termsOfYear(viewSy.id);
  if (terms.length === 0) {
    const { startYr, endYr } = yearSpanOf(viewSy.yearCode);
    const baseId = Date.now();
    terms = defaultYearTerms(startYr, endYr)
      .map((d, i) => ({ id: baseId + i + 1, yearId: viewSy.id, ...d, status: i === 0 && viewSy.isActive ? 'active' : 'draft', isActive: i === 0 && !!viewSy.isActive }));
    SCHOOL_TERMS.push(...terms);
    saveStateToStorage();
  }

  const activeTerm = SCHOOL_TERMS.find(t => t.isActive);
  const sub2 = document.getElementById('stepSub-2');
  if (sub2 && activeTerm) sub2.textContent = activeTerm.termName;

  const statusPill = status => status === 'active' ? '<span class="badge term-status-active">Active</span>'
    : status === 'closed' ? '<span class="badge term-status-closed">Closed</span>' : '<span class="badge term-status-draft">Draft</span>';

  container.innerHTML = ['tertiary', 'shs'].map(level => {
    const boxes = terms.filter(t => schoolLevelOfTerm(t) === level).map(term => `
      <div class="term-box${term.isActive ? ' is-current' : ''}" ${term.isActive ? '' : `role="button" tabindex="0" title="Switch to ${escapeHtml(term.termName)}"
        onclick="setActiveSchoolTerm(${term.id})" onkeydown="if (event.key === 'Enter') setActiveSchoolTerm(${term.id})"`}>
        <div class="term-box-head">
          <span class="term-box-name">${escapeHtml(term.termName)}</span>
          ${statusPill(term.status)}
        </div>
        <div class="term-box-dates">${escapeHtml(term.startDate || '')} – ${escapeHtml(term.endDate || '')}</div>
        <div class="term-box-current">${term.isActive ? '✓ Current working term' : 'Click to switch to this term'}</div>
        <div class="term-box-actions" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()">
          <select onchange="updateTermStatusDirectly(${term.id}, this.value)" aria-label="Status of ${escapeHtml(term.termName)}">
            <option value="draft" ${term.status === 'draft' ? 'selected' : ''}>Draft</option>
            <option value="active" ${term.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="closed" ${term.status === 'closed' ? 'selected' : ''}>Closed</option>
          </select>
          <button class="btn btn-outline" onclick="openEditTermModal(${term.id})">Edit</button>
          <button class="btn btn-outline term-box-delete" onclick="deleteSchoolTerm(${term.id})">Delete</button>
        </div>
      </div>`).join('');
    return `
      <div class="term-level-group">
        <div class="term-level-title">${LEVEL_NAMES[level]}</div>
        <div class="term-box-row">
          ${boxes}
          <button class="term-box term-box-add" onclick="openAddTermModal('${level}')">+ Add ${level === 'shs' ? 'SHS' : 'College'} Term</button>
        </div>
      </div>`;
  }).join('');
}

function updateTermStatusDirectly(termId, newStatus) {
  const term = SCHOOL_TERMS.find(t => t.id === termId);
  if (term) {
    term.status = newStatus;
    saveStateToStorage();
    renderSchoolTermTable();

    postScheduleAction({ action: 'save_term', term_id: term.id, status: newStatus, term_name: term.termName, level: schoolLevelOfTerm(term), start_date: term.startDate, end_date: term.endDate });
  }
}

async function setActiveSchoolTerm(termId) {
  const targetTerm = SCHOOL_TERMS.find(t => t.id === termId);
  if (!targetTerm) return;

  // The active term changes for everyone, so ask first, as switching the school year does
  const targetYear = SCHOOL_YEARS.find(y => y.id === targetTerm.yearId);
  const changesYear = targetYear && !targetYear.isActive;
  const termLabel = `${targetTerm.termName}${targetYear ? ` ${targetYear.yearCode}` : ''}`;
  if (!(await askConfirm(`This makes ${termLabel} the active term for all users, not just this view.${changesYear ? ` The active school year also changes to ${targetYear.yearCode}.` : ''}`,
    { title: 'Switch the active term?', confirmLabel: 'Switch term' }))) return;

  // Make sure parent year is active
  SCHOOL_YEARS.forEach(y => y.isActive = (y.id === targetTerm.yearId));
  SCHOOL_TERMS.forEach(t => t.isActive = (t.id === termId));

  saveStateToStorage();
  refreshAllSchedulingViews();

  postScheduleAction({ action: 'set_active_term', term_id: termId });
}

// Suggested names in the term name field, by the term's level
function fillTermNameSuggestions(level) {
  const list = document.getElementById('termNameSuggestions');
  if (list) list.innerHTML = (level === 'shs' ? ['1st Term', '2nd Term', '3rd Term', 'Summer'] : ['1st Sem', '2nd Sem', 'Summer'])
    .map(name => `<option value="${name}"></option>`).join('');
}

// The Level field: locked once the term has sections or subjects, which follow its level
function setTermLevelField(level, locked) {
  const select = document.getElementById('termLevelSelect');
  select.value = level;
  select.disabled = locked;
  document.getElementById('termLevelHint').textContent = locked
    ? 'This term already has sections or subjects, so its level can\'t be changed.'
    : 'College terms use programs and Years 1–4; SHS terms use strands and Grades 11–12.';
  fillTermNameSuggestions(level);
}
window.updateTermLevelField = () => fillTermNameSuggestions(document.getElementById('termLevelSelect').value);

function openEditTermModal(termId) {
  const term = SCHOOL_TERMS.find(t => t.id === termId);
  if (!term) return;
  document.getElementById('termModalTitle').textContent = 'Edit Term';
  document.getElementById('termEditId').value = term.id;
  document.getElementById('termNameInput').value = term.termName;
  document.getElementById('termStartDateInput').value = term.startDate || '2026-08-17';
  document.getElementById('termEndDateInput').value = term.endDate || '2026-12-18';
  document.getElementById('termStatusSelect').value = term.status || 'draft';
  setTermLevelField(schoolLevelOfTerm(term), termHasLevelData(term.id));
  document.getElementById('termModal').style.display = 'flex';
}

// A new College or SHS term for the school year Step 2 is showing, starting the day after that level's last term ends
function openAddTermModal(level = 'tertiary') {
  const activeSy = termViewYear();
  if (!activeSy) return;
  const last = termsOfYear(activeSy.id).filter(t => schoolLevelOfTerm(t) === level).slice(-1)[0];
  const start = last && last.endDate ? new Date(`${last.endDate}T00:00:00`) : new Date();
  start.setDate(start.getDate() + 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 60);
  const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  document.getElementById('termModalTitle').textContent = `Add Term to ${activeSy.yearCode}`;
  document.getElementById('termEditId').value = '';
  document.getElementById('termNameInput').value = '';
  document.getElementById('termStartDateInput').value = iso(start);
  document.getElementById('termEndDateInput').value = iso(end);
  document.getElementById('termStatusSelect').value = 'draft';
  setTermLevelField(level === 'shs' ? 'shs' : 'tertiary', false);
  document.getElementById('termModal').style.display = 'flex';
}

// Deleting is refused for the active term, a year's last term, or a term with sections or classes
async function deleteSchoolTerm(termId) {
  const term = SCHOOL_TERMS.find(t => t.id === termId);
  if (!term) return;
  if (term.isActive) {
    alert(`${term.termName} is the active term. Switch to another term before deleting it.`);
    return;
  }
  if (SCHOOL_TERMS.filter(t => t.yearId === term.yearId).length <= 1) {
    alert('A school year needs at least one term.');
    return;
  }
  const sections = ACADEMIC_SECTIONS.filter(s => s.termId === termId).length;
  const classes = MASTER_SCHEDULE_DATA.filter(c => c.termId === termId).length;
  if (sections || classes) {
    alert(`${term.termName} still has ${sections} section${sections === 1 ? '' : 's'} and ${classes} scheduled class${classes === 1 ? '' : 'es'}. Remove them first.`);
    return;
  }
  const subjects = CURRICULUM_SUBJECTS.filter(s => s.termId === termId).length;
  if (!(await askConfirm(`${term.termName} will be removed${subjects ? `, along with the ${subjects} subject${subjects === 1 ? '' : 's'} loaded into it in Step 3` : ''}.`,
    { title: 'Delete this term?', confirmLabel: 'Delete term', danger: true }))) return;

  SCHOOL_TERMS = SCHOOL_TERMS.filter(t => t.id !== termId);
  CURRICULUM_SUBJECTS = CURRICULUM_SUBJECTS.filter(s => s.termId !== termId);
  saveStateToStorage();
  refreshAllSchedulingViews();
  postScheduleAction({ action: 'delete_term', term_id: termId });
}

function closeTermModal() {
  const modal = document.getElementById('termModal');
  if (modal) modal.style.display = 'none';
}

function submitTermModal() {
  const termId = parseInt(document.getElementById('termEditId').value, 10) || 0;
  const nameVal = document.getElementById('termNameInput').value.trim().replace(/\s+/g, ' ');
  const startVal = document.getElementById('termStartDateInput').value;
  const endVal = document.getElementById('termEndDateInput').value;
  const statusVal = document.getElementById('termStatusSelect').value;
  const levelVal = document.getElementById('termLevelSelect').value === 'shs' ? 'shs' : 'tertiary';
  const term = termId ? SCHOOL_TERMS.find(t => t.id === termId) : null;
  const yearId = term ? term.yearId : termViewYear().id;
  const levelName = LEVEL_NAMES[levelVal];

  if (!nameVal || nameVal.length > 30 || !/^[\p{L}\p{N}][\p{L}\p{N} .'\-]*$/u.test(nameVal)) {
    alert('Term name must be 1 to 30 letters, numbers, spaces, periods, apostrophes or hyphens.');
    return;
  }
  if (SCHOOL_TERMS.some(t => t.yearId === yearId && t.id !== termId && schoolLevelOfTerm(t) === levelVal && t.termName.toLowerCase() === nameVal.toLowerCase())) {
    alert(`This school year already has a ${levelName} term named ${nameVal}.`);
    return;
  }
  if (term && schoolLevelOfTerm(term) !== levelVal && termHasLevelData(term.id)) {
    alert('This term already has sections or subjects, so its level can\'t be changed.');
    return;
  }
  if (!startVal || !endVal || endVal <= startVal) {
    alert('The term end date must be after its start date.');
    return;
  }

  if (term) {
    term.termName = nameVal;
    term.level = levelVal;
    term.startDate = startVal;
    term.endDate = endVal;
    term.status = statusVal;
    CURRICULUM_SUBJECTS.filter(s => s.termId === term.id).forEach(s => { s.termName = nameVal; });
  } else {
    SCHOOL_TERMS.push({ id: Date.now(), yearId, termName: nameVal, level: levelVal, startDate: startVal, endDate: endVal, status: statusVal, isActive: false });
  }

  saveStateToStorage();
  closeTermModal();
  refreshAllSchedulingViews();

  // A new term gets its database ID from the reload that follows the save
  postScheduleAction({ action: 'save_term', term_id: termId, year_id: yearId, term_name: nameVal, level: levelVal, start_date: startVal, end_date: endVal, status: statusVal });
}

/* ══════════════════════════════════════════════════════════════════════════
   STEP 3: LOAD SUBJECTS & CURRICULUM
   ══════════════════════════════════════════════════════════════════════════ */

// The active term the filter last showed, so a term change can move the filter to it
let curriculumFilterActiveTermId = null;

function updateCurriculumTermFilter() {
  const sel = document.getElementById('curriculumTermFilter');
  if (!sel) return;
  const activeSy = SCHOOL_YEARS.find(y => y.isActive) || SCHOOL_YEARS[0];
  const terms = activeSy ? termsOfYear(activeSy.id) : SCHOOL_TERMS;
  const activeTerm = terms.find(t => t.isActive) || terms[0];

  // A term the user picked stays picked, until the active term itself changes
  const activeTermChanged = activeTerm && activeTerm.id !== curriculumFilterActiveTermId;
  curriculumFilterActiveTermId = activeTerm ? activeTerm.id : null;
  const currentVal = activeTermChanged ? '' : sel.value;
  sel.innerHTML = `<option value="all">All Terms</option>` + terms.map(t => `
    <option value="${t.id}" ${t.isActive ? 'selected' : ''}>
      ${escapeHtml(t.termName)} ${t.isActive ? '(Active)' : ''}
    </option>
  `).join('');

  if (currentVal && Array.from(sel.options).some(o => o.value === currentVal)) {
    sel.value = currentVal;
  } else if (activeTerm) {
    sel.value = String(activeTerm.id);
  }
}

// The Step 3 subjects that match the current filters, which are the ones the table shows
function filteredCurriculumSubjects() {
  const termFilter = document.getElementById('curriculumTermFilter')?.value || 'all';
  const progFilter = document.getElementById('curriculumProgFilter')?.value || 'all';
  const yrFilter = document.getElementById('curriculumYearFilter')?.value || 'all';

  let list = CURRICULUM_SUBJECTS.slice();

  if (termFilter !== 'all') {
    const termNum = parseInt(termFilter, 10);
    list = list.filter(s => s.termId === termNum);
  }
  if (progFilter !== 'all') {
    list = list.filter(s => s.program === progFilter);
  }
  if (yrFilter !== 'all') {
    list = list.filter(s => String(s.year) === yrFilter);
  }
  return list;
}

// Step 3's Program and Year filters list the programs and years of the term being viewed, which need not be
// the active one (an SHS term viewed while College is active lists the strands and Grades 11-12); All Terms lists both
function fillCurriculumFilterOptions() {
  const value = document.getElementById('curriculumTermFilter')?.value;
  const levels = value && value !== 'all' ? [termSchoolLevel(parseInt(value, 10))] : Object.keys(LEVEL_PROGRAMS);
  fillLevelSelect('curriculumProgFilter', levels.flatMap(level => LEVEL_PROGRAMS[level]), p => p);
  fillLevelSelect('curriculumYearFilter', levels.flatMap(level => LEVEL_YEARS[level]), yearLevelOptionLabel);
}

function renderSubjectOfferingTable() {
  fillCurriculumFilterOptions();
  const tbody = document.getElementById('subjectOfferingTableBody');
  if (!tbody) return;

  const list = filteredCurriculumSubjects();
  const countLabel = document.getElementById('subjectOfferingCountLabel');
  const includedCount = list.filter(s => s.isIncluded).length;
  if (countLabel) {
    countLabel.textContent = `Showing ${list.length} subject${list.length === 1 ? '' : 's'} (${includedCount} included, ${list.length - includedCount} excluded)`;
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:24px; color:var(--text-secondary);">No subjects found matching filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(subj => {
    let typeBadge = '';
    if (subj.type === 'lab') {
      typeBadge = `<span class="badge" style="background:#DEF7EC; color:#03543F; font-size:0.857rem; font-weight:700;">Laboratory</span>`;
    } else if (subj.type === 'pe') {
      typeBadge = `<span class="badge" style="background:#FEF3C7; color:#92400E; font-size:0.857rem; font-weight:700;">PE</span>`;
    } else if (subj.type === 'special') {
      typeBadge = `<span class="badge" style="background:#F3E8FF; color:#6B21A8; font-size:0.857rem; font-weight:700;">Special / NSTP</span>`;
    } else {
      typeBadge = `<span class="badge" style="background:#DBEAFE; color:#1E40AF; font-size:0.857rem; font-weight:700;">Lecture</span>`;
    }

    return `
      <tr style="${!subj.isIncluded ? 'opacity:0.55; background:#FAFAFA;' : ''}">
        <td style="text-align:center;">
          <input type="checkbox" ${subj.isIncluded ? 'checked' : ''} onchange="toggleSubjectInclusion(${subj.id}, this.checked)" aria-label="Include ${escapeHtml(subj.code)} this term" style="width:16px; height:16px; cursor:pointer;" />
        </td>
        <td style="font-weight:700; color:var(--accent-primary); font-size:0.929rem;">${escapeHtml(subj.code)}</td>
        <td style="font-weight:600; color:var(--text-primary);">${escapeHtml(subj.name)}</td>
        <td><span class="badge" style="background:#F8FAFC; border:1px solid var(--border-subtle); color:var(--text-primary); font-size:0.857rem;">${escapeHtml(subjectArea(subj.code) || 'Not in catalog')}</span></td>
        <td><strong>${subj.units}</strong>${subjectLabUnits(subj) > 0 ? `<div style="font-size:0.857rem; color:var(--text-secondary);">${subjectLecUnits(subj)} lec + ${subjectLabUnits(subj)} lab</div>` : ''}</td>
        <td>${typeBadge}</td>
        <td>${subj.lecHours || 0}h</td>
        <td>${subj.labHours || 0}h</td>
        <td><span class="badge" style="background:#F3F4F6; color:#374151; font-size:0.857rem;">${escapeHtml(subj.program)}</span>${isRetiredProgram(subj.program) ? '<span class="badge" style="background:#FEE2E2; color:#B91C1C; font-size:0.857rem; margin-left:4px;" title="STI no longer offers this program. Move or delete this subject.">No longer offered</span>' : ''}</td>
        <td>${yearLevelLabel(subj.year)}</td>
        <td style="text-align:right;">
          <div style="display:inline-flex; gap:6px;">
            <button class="btn btn-outline" onclick="openEditCurriculumSubjectModal(${subj.id})" style="font-size:0.857rem; padding:3px 7px;">Edit</button>
            <button class="btn btn-outline" onclick="deleteSubjectOffering(${subj.id})" style="font-size:0.857rem; padding:3px 7px; color:#DC2626; border-color:#FCA5A5;">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Scheduled classes that teach this curriculum subject, in its own term, program and year
function curriculumSubjectClasses(subj) {
  const code = (subj.code || '').toUpperCase();
  return MASTER_SCHEDULE_DATA.filter(c => {
    if (c.termId !== subj.termId || (c.subjectCode || '').toUpperCase() !== code) return false;
    const sec = ACADEMIC_SECTIONS.find(s => s.code === c.section && s.termId === subj.termId);
    return !sec || (sec.program === subj.program && Number(sec.year) === Number(subj.year));
  });
}

// Takes classes off the schedule and saves each affected term
function removeClassesAndSave(classes) {
  if (classes.length === 0) return;
  const termIds = [...new Set(classes.map(c => c.termId))];
  MASTER_SCHEDULE_DATA = MASTER_SCHEDULE_DATA.filter(c => !classes.includes(c));
  saveStateToStorage();
  const { activeTerm } = getActiveAcademicContext();
  termIds.forEach(termId => {
    if (termId === activeTerm.id) queueScheduleSave();
    else if (!IS_STANDALONE) saveTermSchedule('bulk_save_schedules', termId, MASTER_SCHEDULE_DATA.filter(c => c.termId === termId)).catch(() => {});
  });
}

function scheduledClassesNote(classes) {
  return `${classes.length} scheduled class${classes.length === 1 ? '' : 'es'}`;
}

async function toggleSubjectInclusion(id, isIncluded) {
  const subj = CURRICULUM_SUBJECTS.find(s => s.id === id);
  if (subj) {
    const scheduled = isIncluded ? [] : curriculumSubjectClasses(subj);
    if (scheduled.length > 0 && !(await askConfirm(`${subj.code} has ${scheduledClassesNote(scheduled)}. Excluding it also takes ${scheduled.length === 1 ? 'that class' : 'those classes'} off the schedule.`, { title: 'Exclude this subject?', confirmLabel: 'Exclude and unschedule', danger: true }))) {
      renderSubjectOfferingTable();
      return;
    }
    removeClassesAndSave(scheduled);
    subj.isIncluded = isIncluded;
    saveStateToStorage();
    renderSubjectOfferingTable();

    postScheduleAction({ action: 'toggle_term_subject', subject_id: id, is_included: isIncluded });
  }
}

// Only changes the subjects listed under the current filters, never other terms
async function toggleAllSubjectInclusion(status) {
  const listed = filteredCurriculumSubjects();
  if (listed.length === 0) return;
  const scheduled = status ? [] : [...new Set(listed.flatMap(curriculumSubjectClasses))];
  if (scheduled.length > 0 && !(await askConfirm(`The listed subjects have ${scheduledClassesNote(scheduled)}. Excluding them also takes those classes off the schedule.`, { title: `Exclude ${listed.length} subject${listed.length === 1 ? '' : 's'}?`, confirmLabel: 'Exclude and unschedule', danger: true }))) return;
  removeClassesAndSave(scheduled);
  listed.forEach(s => s.isIncluded = status);
  saveStateToStorage();
  renderSubjectOfferingTable();

  postScheduleAction({ action: 'set_all_subjects_included', is_included: status, subject_ids: listed.map(s => s.id) });
}

// The term the Step 3 subject form is adding to or editing, and its level (not necessarily the active term's)
let curricFormTermId = null;
function curricFormLevel() {
  return curricFormTermId ? termSchoolLevel(curricFormTermId) : activeSchoolLevel();
}
function curriculumFilterTermId() {
  const value = document.getElementById('curriculumTermFilter')?.value;
  const { activeTerm } = getActiveAcademicContext();
  return value && value !== 'all' ? parseInt(value, 10) : (activeTerm ? activeTerm.id : null);
}
// The form's Program dropdown lists the edited term's programs or strands
function fillCurriculumFormPrograms(program) {
  const level = curricFormLevel();
  fillLevelSelect('curricSubjProgram', LEVEL_PROGRAMS[level], p => p);
  document.getElementById('curricSubjProgram').value = LEVEL_PROGRAMS[level].includes(program) ? program : LEVEL_PROGRAMS[level][0];
  refreshYearsForProgram('curricSubjProgram', 'curricSubjYear');
}

function openAddCurriculumSubjectModal() {
  applySchoolLevelOptions();
  curricFormTermId = curriculumFilterTermId();
  document.getElementById('curricSubjModalTitle').textContent = 'Add Curriculum Subject';
  document.getElementById('curricSubjEditId').value = '';
  document.getElementById('curricSubjCode').value = '';
  document.getElementById('curricSubjName').value = '';
  setCurriculumUnitFields(3, 0, 3, 0);
  document.getElementById('curricSubjType').value = 'lecture';
  fillCurriculumFormPrograms('');
  fillCurriculumAreaSelect('');
  populateCurriculumCatalogSelect();
  document.getElementById('curricSubjCatalogRow').style.display = '';
  document.getElementById('manualSubjectModal').style.display = 'flex';
}

function setCurriculumUnitFields(lecUnits, labUnits, lecHrs, labHrs) {
  document.getElementById('curricSubjLecUnits').value = lecUnits;
  document.getElementById('curricSubjLabUnits').value = labUnits;
  document.getElementById('curricSubjUnits').value = lecUnits + labUnits;
  document.getElementById('curricSubjLecHrs').value = lecHrs;
  document.getElementById('curricSubjLabHrs').value = labHrs;
}

// Changing the unit split fills in the usual hours: 1 per lecture unit, 3 per lab unit
function syncCurriculumUnitHours() {
  const lecUnits = Math.max(parseInt(document.getElementById('curricSubjLecUnits').value, 10) || 0, 0);
  const labUnits = Math.max(parseInt(document.getElementById('curricSubjLabUnits').value, 10) || 0, 0);
  document.getElementById('curricSubjUnits').value = lecUnits + labUnits;
  document.getElementById('curricSubjLecHrs').value = lecUnits;
  document.getElementById('curricSubjLabHrs').value = labUnits * LAB_HOURS_PER_UNIT;
}
window.syncCurriculumUnitHours = syncCurriculumUnitHours;

// The subject area comes from the Subject Catalog; a subject not in the catalog yet defaults to the first area
function fillCurriculumAreaSelect(code) {
  const sel = document.getElementById('curricSubjArea');
  sel.innerHTML = DEPARTMENTS.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  sel.value = subjectArea(code) || DEPARTMENTS[0];
}

// Lists the Subject Catalog, marking subjects this term already offers
function populateCurriculumCatalogSelect() {
  const sel = document.getElementById('curricSubjCatalogSelect');
  if (!sel) return;
  // Only the catalog subjects for the edited term's level (College or SHS), plus subjects for both
  const termId = curricFormTermId || curriculumFilterTermId();
  const level = termSchoolLevel(termId);
  const offered = new Set(CURRICULUM_SUBJECTS.filter(s => s.termId === termId).map(s => (s.code || '').toUpperCase()));
  const catalog = SUBJECTS.filter(s => catalogFitsLevel(s, level)).sort((a, b) => a.code.localeCompare(b.code));
  sel.innerHTML = '<option value="">-- Type a new subject instead --</option>' + catalog.map(s => {
    const note = offered.has(s.code.toUpperCase()) ? ' (already in this term)' : '';
    return `<option value="${escapeHtml(s.code)}">${escapeHtml(s.code)} - ${escapeHtml(s.title || s.code)}${note}</option>`;
  }).join('');
  sel.value = '';
}

// Fills the form from the catalog. Hours and type come from the newest curriculum entry with the same code, if any.
function fillCurriculumFromCatalog(code) {
  if (!code) return;
  const subj = SUBJECTS.find(s => s.code === code);
  if (!subj) return;
  const previous = CURRICULUM_SUBJECTS.filter(s => (s.code || '').toUpperCase() === code.toUpperCase()).sort((a, b) => b.id - a.id)[0];
  const units = subj.units || (previous && previous.units) || 3;
  document.getElementById('curricSubjCode').value = subj.code;
  document.getElementById('curricSubjName').value = subj.title || subj.code;
  if (previous && Number(previous.units) === Number(units)) {
    setCurriculumUnitFields(subjectLecUnits(previous), subjectLabUnits(previous), previous.lecHours || 0, previous.labHours || 0);
  } else {
    setCurriculumUnitFields(units, 0, units, 0);
  }
  document.getElementById('curricSubjType').value = previous ? (previous.type || 'lecture') : 'lecture';
  fillCurriculumAreaSelect(subj.code);
}
window.fillCurriculumFromCatalog = fillCurriculumFromCatalog;

function openEditCurriculumSubjectModal(id) {
  applySchoolLevelOptions();
  const subj = CURRICULUM_SUBJECTS.find(s => s.id === id);
  if (!subj) return;
  document.getElementById('curricSubjModalTitle').textContent = 'Edit Curriculum Subject';
  document.getElementById('curricSubjEditId').value = subj.id;
  document.getElementById('curricSubjCode').value = subj.code;
  document.getElementById('curricSubjName').value = subj.name;
  setCurriculumUnitFields(subjectLecUnits(subj), subjectLabUnits(subj), subj.lecHours || 0, subj.labHours || 0);
  document.getElementById('curricSubjType').value = subj.type || 'lecture';
  curricFormTermId = subj.termId;
  fillCurriculumFormPrograms(subj.program);
  document.getElementById('curricSubjYear').value = String(subj.year || 1);
  document.getElementById('curricSubjCatalogRow').style.display = 'none';
  fillCurriculumAreaSelect(subj.code);
  document.getElementById('manualSubjectModal').style.display = 'flex';
}

function closeAddSubjectModal() {
  const modal = document.getElementById('manualSubjectModal');
  if (modal) modal.style.display = 'none';
}

async function submitAddSubjectModal() {
  const idVal = document.getElementById('curricSubjEditId').value;
  const code = document.getElementById('curricSubjCode').value.trim();
  const name = document.getElementById('curricSubjName').value.trim();
  const lecUnits = parseInt(document.getElementById('curricSubjLecUnits').value, 10) || 0;
  const labUnits = parseInt(document.getElementById('curricSubjLabUnits').value, 10) || 0;
  const units = lecUnits + labUnits;
  const lecHrs = parseFloat(document.getElementById('curricSubjLecHrs').value) || 0;
  const labHrs = parseFloat(document.getElementById('curricSubjLabHrs').value) || 0;
  const type = document.getElementById('curricSubjType').value;
  const program = document.getElementById('curricSubjProgram').value;
  const year = parseInt(document.getElementById('curricSubjYear').value, 10) || 1;
  const area = document.getElementById('curricSubjArea').value;

  if (!code || !name) {
    alert('Please enter both subject code and subject name.');
    return;
  }
  if (!yearsForProgram(program, curricFormLevel()).includes(year)) {
    alert(`${program} is a ${yearsForProgram(program, curricFormLevel()).length}-year program, so choose ${yearLevelLabel(yearsForProgram(program, curricFormLevel())[0])} to ${yearLevelLabel(Math.max(...yearsForProgram(program, curricFormLevel())))}.`);
    return;
  }

  const curricProblem = INPUT_RULES.code('Subject code', code) || INPUT_RULES.text('Subject name', name)
    || INPUT_RULES.int('Lecture units', document.getElementById('curricSubjLecUnits').value, 0, 6)
    || INPUT_RULES.int('Lab units', document.getElementById('curricSubjLabUnits').value, 0, 6)
    || (units < 1 || units > 6 ? 'Lecture units and lab units must add up to 1 to 6 units.' : null)
    || INPUT_RULES.hours('Lecture hours', document.getElementById('curricSubjLecHrs').value)
    || INPUT_RULES.hours('Lab hours', document.getElementById('curricSubjLabHrs').value)
    || (labUnits > 0 && labHrs === 0 ? 'This subject has lab units, so give it some lab hours a week.' : null)
    || (labUnits === 0 && labHrs > 0 ? 'This subject has lab hours but no lab units. Set its lab units, or clear the lab hours.' : null)
    || (lecUnits > 0 && lecHrs === 0 ? 'This subject has lecture units, so give it some lecture hours a week.' : null);
  if (curricProblem) {
    alert(curricProblem);
    return;
  }

  // Classes that would no longer match the edited subject come off the schedule
  const editedSubj = idVal ? CURRICULUM_SUBJECTS.find(s => s.id === parseInt(idVal, 10)) : null;
  const brokenBySubject = editedSubj ? curriculumSubjectClasses(editedSubj).filter(c => {
    const sec = ACADEMIC_SECTIONS.find(s => s.code === c.section && s.termId === editedSubj.termId);
    if (!sec) return false;
    if ((c.subjectCode || '').toUpperCase() !== code.toUpperCase() || sec.program !== program || Number(sec.year) !== year) return true;
    const room = ROOMS.find(r => r.code === c.room);
    return !!(room && roomFitProblem(room, { ...editedSubj, code, type, units, labUnits, lecHours: lecHrs, labHours: labHrs }, sec));
  }) : [];
  if (!(await askToUnscheduleBroken(brokenBySubject, `Change ${editedSubj ? editedSubj.code : code}?`, `After this change, some ${editedSubj ? editedSubj.code : code} classes no longer fit their room type, program or year level.`))) return;

  const areaProblem = areaChangeProblem(code, area);
  if (areaProblem) {
    alert(areaProblem);
    return;
  }
  removeClassesAndSave(brokenBySubject);

  // The subject area lives in the Subject Catalog, so a new subject joins the catalog and a changed area updates it
  let catalogEntry = SUBJECTS.find(s => s.code.toUpperCase() === code.toUpperCase());
  if (!catalogEntry) {
    catalogEntry = { code: code.toUpperCase(), title: name, dept: area, units, level: curricFormLevel() };
    SUBJECTS.push(catalogEntry);
    saveCatalogSubject(catalogEntry);
  } else if (catalogEntry.dept !== area) {
    catalogEntry.dept = area;
    saveCatalogSubject(catalogEntry);
  }

  let newSubjectTermId;
  if (idVal) {
    const subj = CURRICULUM_SUBJECTS.find(s => s.id === parseInt(idVal, 10));
    if (subj) {
      subj.code = code;
      subj.name = name;
      subj.units = units;
      subj.labUnits = labUnits;
      subj.lecHours = lecHrs;
      subj.labHours = labHrs;
      subj.type = type;
      subj.program = program;
      subj.year = year;
    }
  } else {
    const activeTerm = SCHOOL_TERMS.find(t => t.isActive) || SCHOOL_TERMS[0];
    const currentTermFilterVal = document.getElementById('curriculumTermFilter')?.value;
    const termId = (currentTermFilterVal && currentTermFilterVal !== 'all')
      ? parseInt(currentTermFilterVal, 10)
      : (activeTerm ? activeTerm.id : 1);
    newSubjectTermId = termId;
    const newId = CURRICULUM_SUBJECTS.length ? Math.max(...CURRICULUM_SUBJECTS.map(s => s.id)) + 1 : 1;
    CURRICULUM_SUBJECTS.push({
      id: newId,
      termId,
      code,
      name,
      units,
      labUnits,
      lecHours: lecHrs,
      labHours: labHrs,
      type,
      program,
      year,
      curriculum: '2024 Revised',
      isIncluded: true
    });
  }

  saveStateToStorage();
  closeAddSubjectModal();
  renderSubjectOfferingTable();

  fetch('api/schedules.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'save_term_subject',
      subject_id: idVal,
      term_id: newSubjectTermId,
      subject_code: code,
      subject_name: name,
      units,
      lab_units: labUnits,
      lecture_hours: lecHrs,
      lab_hours: labHrs,
      subject_type: type,
      program,
      year_level: year,
      curriculum: '2024 Revised',
      is_included: 1
    })
  }).catch(() => {});
}

async function deleteSubjectOffering(id) {
  const subj = CURRICULUM_SUBJECTS.find(s => s.id === id);
  const scheduled = subj ? curriculumSubjectClasses(subj) : [];
  const message = scheduled.length > 0
    ? `The subject will no longer be offered in this term, and its ${scheduledClassesNote(scheduled)} will be taken off the schedule.`
    : 'The subject will no longer be offered in this term.';
  if (!(await askConfirm(message, { title: 'Remove this subject from the term?', confirmLabel: scheduled.length > 0 ? 'Remove and unschedule' : 'Remove subject', danger: true }))) return;
  removeClassesAndSave(scheduled);
  CURRICULUM_SUBJECTS = CURRICULUM_SUBJECTS.filter(s => s.id !== id);
  saveStateToStorage();
  renderSubjectOfferingTable();

  postScheduleAction({ action: 'delete_term_subject', subject_id: id });
}

/* ══════════════════════════════════════════════════════════════════════════
   STEP 4: VALIDATE RESOURCES
   ══════════════════════════════════════════════════════════════════════════ */

// The "What to do here" box at the top of each Master Schedule step
const STEP_HELP = {
  1: ['Choose the school year', 'Pick the school year you are planning, or add a new one by typing it like 2026-2027. Then press Next.'],
  2: ['Choose the term', 'Pick the college or Senior High term you are planning. Its terms were made for you with the school year. Then press Next.'],
  3: ['Load the subjects', 'Add the subjects each program and year takes this term. Every section of that program and year gets these subjects.'],
  4: ['Create the sections', 'Add each section with its number of students and adviser. Open "subjects" in a row to see what that section takes.'],
  5: ['Pick rooms and instructors', 'For each section, choose its room and who teaches each subject. Leave anything on Automatic and the system picks for you.'],
  6: ['Check that there is enough', 'This step checks there are enough teachers and rooms. Fix anything marked red, then press Next.'],
  7: ['Build the timetable', 'Press Generate to fill the week, or click an empty box to add a class yourself. Click a class to change it.']
};
function renderStepHelp(stepNumber) {
  const box = document.getElementById('stepHelp');
  if (!box) return;
  const help = STEP_HELP[stepNumber];
  box.style.display = help && canEditSchedule() ? '' : 'none';
  if (help) box.innerHTML = `<div class="step-help-icon" aria-hidden="true">?</div><div><div class="step-help-title">What to do here: ${help[0]}</div><p>${help[1]}</p></div>`;
}

/* ==================== STEP 5: ROOMS & INSTRUCTORS ==================== */
// Each section gets a room and, for each subject, an instructor. Automatic leaves the choice to the generator,
// which keeps the section in its room whenever the room is free and gives each subject the chosen instructor.
function renderRoomPlan() {
  const box = document.getElementById('roomPlanList');
  if (!box) return;
  const { activeTerm } = getActiveAcademicContext();
  const level = termSchoolLevel(activeTerm.id);
  const canEdit = canManageData();
  const sections = ACADEMIC_SECTIONS.filter(s => s.termId === activeTerm.id).sort((a, b) => a.code.localeCompare(b.code));
  if (sections.length === 0) {
    box.innerHTML = '<p class="term-empty">No sections yet. Create them in Step 4 first.</p>';
    return;
  }
  const loadText = f => `${formatUnits(facultyLoadUnits(f.name) + concurrentLoadUnits(f.name, activeTerm.id))} of ${facultyMaxUnits(f)} units`;
  box.innerHTML = sections.map(sec => {
    const rooms = ROOMS.filter(r => r.cap >= sec.studentCount).sort((a, b) => a.code.localeCompare(b.code));
    const sharing = code => sections.filter(o => o !== sec && o.homeRoom === code).map(o => o.code);
    const roomOptions = '<option value="">Automatic (the generator picks one room and reuses it)</option>' + rooms.map(r => {
      const others = sharing(r.code);
      return `<option value="${escapeHtml(r.code)}" ${r.code === sec.homeRoom ? 'selected' : ''}>${escapeHtml(r.code)} · ${escapeHtml(r.type)}, ${r.cap} seats${others.length ? ` · also ${others.join(', ')}` : ''}</option>`;
    }).join('');
    const subjects = sectionSubjects(sec);
    const rows = subjects.map(subj => {
      const code = subj.code.toUpperCase();
      const teachers = FACULTY.filter(f => isFacultyQualified(f, subj.code) && facultyTeachesLevel(f, level)).sort((a, b) => a.name.localeCompare(b.name));
      const chosen = sectionChosenTeacher(sec, code);
      const stale = chosen && !teachers.includes(chosen);
      const options = '<option value="">Automatic</option>' + teachers.map(f =>
        `<option value="${escapeHtml(f.email)}" ${chosen === f ? 'selected' : ''}>${escapeHtml(f.name)} · ${loadText(f)}</option>`).join('')
        + (stale ? `<option value="${escapeHtml(chosen.email)}" selected>${escapeHtml(chosen.name)} (no longer qualified)</option>` : '');
      return `<tr>
        <td><strong>${escapeHtml(subj.code)}</strong> ${escapeHtml(subj.name)}</td>
        <td>${subj.units} units · ${subjectHoursText(subj)}</td>
        <td><select class="room-plan-select" aria-label="Instructor for ${escapeHtml(subj.code)}, ${escapeHtml(sec.code)}" ${canEdit ? '' : 'disabled'}
          onchange="setSectionTeacher(${sec.id}, ${jsArg(code)}, this.value)">${options}</select>
          ${teachers.length === 0 ? '<div class="room-plan-warning">No qualified teacher for this level. Give someone the FCC certificate for its area.</div>' : ''}
          ${stale ? '<div class="room-plan-warning">This teacher can no longer teach it. Choose another or Automatic.</div>' : ''}</td>
      </tr>`;
    }).join('');
    return `<div class="room-plan-card">
      <div class="room-plan-head">
        <div><div class="room-plan-title">${escapeHtml(sec.code)} <span>${escapeHtml(sec.name)}</span></div>
          <div class="room-plan-meta">${escapeHtml(sec.program)} ${yearLevelLabel(sec.year)} · ${sec.studentCount} students · ${escapeHtml(sec.shift || 'AM')} shift${sectionAdviserName(sec) ? ` · Adviser: ${escapeHtml(sectionAdviserName(sec))}` : ''}</div></div>
        <label class="room-plan-room">Room
          <select class="room-plan-select" ${canEdit ? '' : 'disabled'} onchange="setSectionRoom(${sec.id}, this.value)">${roomOptions}</select></label>
      </div>
      ${subjects.length ? `<table class="lifecycle-table room-plan-table"><thead><tr><th>Subject</th><th>Units and hours</th><th>Instructor</th></tr></thead><tbody>${rows}</tbody></table>`
        : '<p class="room-plan-warning">No subjects for this section yet. Add them in Step 3.</p>'}
    </div>`;
  }).join('');
}
window.renderRoomPlan = renderRoomPlan;

function saveSectionPlan(sec) {
  saveStateToStorage();
  postScheduleAction({ action: 'save_section_plan', section_id: sec.id, home_room: sec.homeRoom || '', subject_teachers: sec.subjectTeachers || {} });
  renderRoomPlan();
  updateScheduleStats();
}
window.setSectionRoom = function(id, roomCode) {
  const sec = ACADEMIC_SECTIONS.find(s => s.id === id);
  if (!sec || !canManageData()) return;
  const room = ROOMS.find(r => r.code === roomCode);
  if (room && room.cap < sec.studentCount) {
    alert(`${room.code} seats ${room.cap}, but ${sec.code} has ${sec.studentCount} students. Pick a bigger room.`);
    renderRoomPlan();
    return;
  }
  sec.homeRoom = roomCode;
  saveSectionPlan(sec);
};
window.setSectionTeacher = function(id, subjectCode, email) {
  const sec = ACADEMIC_SECTIONS.find(s => s.id === id);
  if (!sec || !canManageData()) return;
  const plan = { ...(sec.subjectTeachers || {}) };
  if (email) plan[subjectCode] = email;
  else delete plan[subjectCode];
  sec.subjectTeachers = plan;
  saveSectionPlan(sec);
};

/* ==================== Resource Readiness Evaluation Engine ==================== */
function evaluateResourceReadiness() {
  const lecRooms = ROOMS.filter(r => r.type === 'Lecture');
  const labRooms = ROOMS.filter(r => r.type === 'CompLab');
  const specialRooms = ROOMS.filter(r => r.type === 'Special');
  const kitchenRooms = ROOMS.filter(r => (r.code && r.code.toLowerCase().includes('kitchen')) || (r.name && r.name.toLowerCase().includes('kitchen')));
  const tourismRooms = ROOMS.filter(r => (r.code && r.code.toLowerCase().includes('tourism')) || (r.name && r.name.toLowerCase().includes('tourism')));

  const { activeSy, activeTerm } = getActiveAcademicContext();

  const includedSubjects = CURRICULUM_SUBJECTS.filter(s => s.isIncluded && s.termId === activeTerm.id);
  const compLabSubjects = includedSubjects.filter(s => s.type === 'lab' || (s.labHours && s.labHours > 0));
  const culinarySubjects = includedSubjects.filter(s => KITCHEN_PROGRAMS.includes(s.program) && subjectPartMinutes(s).lab > 0);
  const tourismSubjects = includedSubjects.filter(s => TOURISM_LAB_PROGRAMS.includes(s.program) && subjectPartMinutes(s).lab > 0);

  const totalMaxLoad = FACULTY.reduce((sum, f) => sum + facultyMaxUnits(f), 0);
  // Every section takes each of its subjects, so the units needed are counted per section
  const totalRequiredUnits = ACADEMIC_SECTIONS.filter(sec => sec.termId === activeTerm.id)
    .reduce((sum, sec) => sum + includedSubjects.filter(s => s.program === sec.program && Number(s.year) === Number(sec.year))
      .reduce((units, s) => units + (Number(s.units) || 0), 0), 0);

  function checkSubjectHasQualifiedFaculty(subj) {
    return FACULTY.some(f => isFacultyQualified(f, subj.code) && facultyTeachesLevel(f, termSchoolLevel(subj.termId)));
  }

  const unqualifiedSubjects = includedSubjects.filter(s => !checkSubjectHasQualifiedFaculty(s));
  const overloadedTeachers = FACULTY.filter(f => facultyLoadUnits(f.name) + concurrentLoadUnits(f.name, activeTerm.id) > facultyMaxUnits(f) + 0.001);

  const checks = [];
  const criticalReasons = [];

  // Check 1: Classroom Physical Capacity
  if ((typeof ROOMS === 'undefined' ? 0 : ROOMS.length) === 0) {
    checks.push({
      status: 'critical',
      title: 'No Classrooms Available',
      desc: 'Zero active rooms configured in the campus directory. Add classrooms before proceeding.'
    });
    criticalReasons.push('No classrooms configured in the campus inventory.');
  } else if (lecRooms.length < 5) {
    checks.push({
      status: 'warning',
      title: 'Low Lecture Room Availability',
      desc: `Only ${lecRooms.length} lecture room(s) available. May constrain simultaneous class scheduling.`
    });
  } else {
    checks.push({
      status: 'pass',
      title: 'Classroom Physical Capacity Check Passed',
      desc: `${ROOMS.length} active classrooms available on campus (${lecRooms.length} lecture halls, ${labRooms.length} computer labs, ${specialRooms.length} specialized facilities).`
    });
  }

  // Check 2: Laboratories & Specialized Rooms
  if (compLabSubjects.length > 0 && labRooms.length === 0) {
    checks.push({
      status: 'critical',
      title: 'Missing Room Type: Computer Laboratories',
      desc: `Curriculum requires computer lab rooms for ${compLabSubjects.length} practical course(s), but NO computer labs exist in the room directory!`
    });
    criticalReasons.push(`Missing Computer Labs for ${compLabSubjects.length} practical courses.`);
  } else if (culinarySubjects.length > 0 && kitchenRooms.length === 0) {
    checks.push({
      status: 'critical',
      title: 'Missing Room Type: Commercial Kitchen Lab',
      desc: `HRS and HTCUA subjects need the culinary kitchen lab for ${culinarySubjects.length} course(s), but NO kitchen lab is registered!`
    });
    criticalReasons.push(`Missing Commercial Kitchen Lab for ${culinarySubjects.length} culinary courses.`);
  } else if (tourismSubjects.length > 0 && tourismRooms.length === 0) {
    checks.push({
      status: 'warning',
      title: 'Missing Room Type: Tourism Mock Center',
      desc: `BSTM and HTTO subjects need the tourism mock center for ${tourismSubjects.length} course(s), but none is registered.`
    });
  } else {
    checks.push({
      status: 'pass',
      title: 'Computer & Specialized Laboratories Ready',
      desc: `${labRooms.length} Computer Labs (CL-101 to CL-104), Culinary Kitchen Lab, and Tourism Center fully operational.`
    });
  }

  // Check 3: Faculty Qualifications & Teaching Capacity
  if ((typeof FACULTY === 'undefined' ? 0 : FACULTY.length) === 0) {
    checks.push({
      status: 'critical',
      title: 'No Teaching Faculty Configured',
      desc: 'Zero active instructors found in the system. Add faculty in the Faculty module.'
    });
    criticalReasons.push('Zero active professors configured in the faculty directory.');
  } else if (unqualifiedSubjects.length > 0) {
    const uniqueUnqualifiedCodes = [...new Set(unqualifiedSubjects.map(s => s.code))];
    checks.push({
      status: 'critical',
      title: 'Subjects with No Qualified Faculty',
      desc: `No faculty member has an FCC certificate covering these ${uniqueUnqualifiedCodes.length} subject(s): ${uniqueUnqualifiedCodes.join(', ')}.`
    });
    criticalReasons.push(`Insufficient professors: ${uniqueUnqualifiedCodes.length} course(s) lack qualified faculty (${uniqueUnqualifiedCodes.join(', ')}).`);
  } else if (totalMaxLoad < totalRequiredUnits) {
    checks.push({
      status: 'critical',
      title: 'Insufficient Total Teaching Capacity',
      desc: `Professors can take up to ${totalMaxLoad} units in total, but this term's sections need ${totalRequiredUnits} units. Please assign more professors.`
    });
    criticalReasons.push(`Insufficient faculty capacity: ${totalRequiredUnits} units needed vs ${totalMaxLoad} units total max faculty capacity.`);
  } else if (overloadedTeachers.length > 0) {
    checks.push({
      status: 'warning',
      title: 'Faculty Max Load Warning',
      desc: `${overloadedTeachers.length} instructor(s) exceed maximum teaching load: ${overloadedTeachers.map(f => f.name).join(', ')}.`
    });
  } else {
    checks.push({
      status: 'pass',
      title: 'Faculty Qualifications & Workload Readiness',
      desc: `All ${FACULTY.length} active faculty have certified profiles matching offered subject specializations with balanced loads.`
    });
  }

  // Check 4: Curriculum verification
  if (includedSubjects.length === 0) {
    checks.push({
      status: 'critical',
      title: 'No Subjects Included for Term',
      desc: 'Zero curriculum subjects are marked included for this semester. Please include subjects in Step 3.'
    });
    criticalReasons.push('No curriculum subjects marked as included for this term.');
  } else if (includedSubjects.length < 5) {
    checks.push({
      status: 'warning',
      title: 'Low Curriculum Count',
      desc: `Only ${includedSubjects.length} subjects are currently included for this semester. Review Step 3.`
    });
  } else {
    checks.push({
      status: 'pass',
      title: 'Semester Curriculum Offerings Validated',
      desc: `${includedSubjects.length} subjects included for scheduling across all academic programs in ${escapeHtml(activeTerm.termName)} (${escapeHtml(activeSy.yearCode)}).`
    });
  }

  const hasCritical = checks.some(c => c.status === 'critical');
  const hasWarning = checks.some(c => c.status === 'warning');

  return {
    hasCritical,
    hasWarning,
    checks,
    criticalReasons,
    unqualifiedSubjects,
    lecRoomsCount: lecRooms.length,
    labRoomsCount: labRooms.length + specialRooms.length,
    totalMaxLoad,
    totalRequiredUnits
  };
}

function renderResourceValidation() {
  const roomTbody = document.getElementById('valRoomTableBody');
  const facTbody = document.getElementById('valFacultyTableBody');
  const checkContainer = document.getElementById('readinessChecklistContainer');
  const badgeContainer = document.getElementById('readinessStatusBadge');
  const btnStep5 = document.getElementById('btnProceedFromValidate');

  const readiness = evaluateResourceReadiness();

  const elLec = document.getElementById('valLecRoomsCount');
  if (elLec) elLec.textContent = `${readiness.lecRoomsCount} Lecture Room${readiness.lecRoomsCount === 1 ? '' : 's'}`;

  const elLab = document.getElementById('valLabRoomsCount');
  if (elLab) elLab.textContent = `${readiness.labRoomsCount} Labs`;

  const totalCurrentLoad = FACULTY.reduce((sum, f) => sum + facultyLoadUnits(f.name), 0);
  const elFac = document.getElementById('valFacultyCapacity');
  if (elFac) elFac.textContent = `${readiness.totalMaxLoad} Units Max (${formatUnits(totalCurrentLoad)} Assigned)`;

  // Populate Room Table
  if (roomTbody && typeof ROOMS !== 'undefined') {
    roomTbody.innerHTML = ROOMS.map(r => `
      <tr>
        <td style="font-weight:700; color:var(--accent-primary);">${escapeHtml(r.code)}</td>
        <td><span class="badge" style="font-size:0.857rem;">${escapeHtml(r.type)}</span></td>
        <td>${r.cap} seats</td>
        <td><span style="color:#10B981; font-weight:700;">Ready (${r.floor || '1F'})</span></td>
      </tr>
    `).join('');
  }

  // Populate Faculty Table
  if (facTbody && typeof FACULTY !== 'undefined') {
    facTbody.innerHTML = FACULTY.map(f => {
      const units = facultyLoadUnits(f.name) + concurrentLoadUnits(f.name, getActiveAcademicContext().activeTerm.id);
      const isOverloaded = units > facultyMaxUnits(f) + 0.001;
      const isUnder = units < facultyMinUnits(f);
      return `
        <tr>
          <td style="font-weight:700; color:var(--text-primary);">${escapeHtml(f.name)}</td>
          <td><span class="badge" style="font-size:0.857rem;">${escapeHtml(f.dept || '—')}</span></td>
          <td style="${isOverloaded ? 'color:#DC2626; font-weight:800;' : isUnder ? 'color:#B45309; font-weight:700;' : ''}">${formatUnits(units)} units</td>
          <td>${facultyMinUnits(f)}–${facultyMaxUnits(f)} units</td>
        </tr>
      `;
    }).join('');
  }

  // Render Checklist
  if (checkContainer) {
    checkContainer.innerHTML = readiness.checks.map(c => `
      <div class="readiness-item">
        <div class="readiness-icon ${c.status}">
          ${c.status === 'pass' ? '&check;' : (c.status === 'warning' ? '!' : '&times;')}
        </div>
        <div>
          <div style="font-weight:700; font-size:0.893rem; color:${c.status === 'critical' ? '#991B1B' : (c.status === 'warning' ? '#92400E' : '#065F46')};">
            ${escapeHtml(c.title)}
          </div>
          <div style="font-size:0.857rem; color:var(--text-secondary); margin-top:1px;">
            ${escapeHtml(c.desc)}
          </div>
        </div>
      </div>
    `).join('');
  }

  if (badgeContainer) {
    if (readiness.hasCritical) {
      badgeContainer.innerHTML = `<span class="badge" style="background:#FEE2E2; color:#991B1B; font-size:0.857rem; font-weight:800;">&times; Critical Resource Error</span>`;
    } else if (readiness.hasWarning) {
      badgeContainer.innerHTML = `<span class="badge" style="background:#FEF3C7; color:#92400E; font-size:0.857rem; font-weight:800;">&#9888; Ready with Warnings</span>`;
    } else {
      badgeContainer.innerHTML = `<span class="badge" style="background:#DEF7EC; color:#03543F; font-size:0.857rem; font-weight:800;">&check; Ready to Schedule</span>`;
    }
  }

  // Strictly Block Next Step on Critical Errors
  if (btnStep5) {
    btnStep5.disabled = readiness.hasCritical;
    btnStep5.style.opacity = readiness.hasCritical ? '0.5' : '1';
    btnStep5.style.cursor = readiness.hasCritical ? 'not-allowed' : 'pointer';
    btnStep5.title = readiness.hasCritical ? 'Blocked: Resolve critical professor and room shortages to proceed.' : '';
    btnStep5.onclick = function() {
      if (readiness.hasCritical) {
        alert('Cannot go to Step 7 (Timetable) yet:\n\nPlease resolve the critical professor/room shortages listed in the readiness checklist above.');
      } else {
        goToScheduleStep(7);
      }
    };
  }

  // Also update stepper locked indicators
  updateStepLocks();
}

/* ==========================================================================
   STEP 5: CREATE SECTIONS
   ========================================================================== */

function renderSectionsTable() {
  const tbody = document.getElementById('sectionsTableBody');
  if (!tbody) return;

  const { activeSy, activeTerm } = getActiveAcademicContext();
  const termSections = ACADEMIC_SECTIONS.filter(s => s.termId === activeTerm.id);

  if (termSections.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:28px 16px; color:var(--text-secondary);"><div style="font-size:1.071rem; font-weight:700; color:var(--text-primary); margin-bottom:6px;">No sections created for ${escapeHtml(activeTerm.termName)} (${escapeHtml(activeSy.yearCode)})</div><div>Click <strong>"+ Add Section"</strong> to create sections for this term.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = termSections.map(sec => {
    // Count attached included curriculum subjects
    const attachedCount = CURRICULUM_SUBJECTS.filter(s => s.isIncluded && s.program === sec.program && s.year === sec.year && s.termId === activeTerm.id).length;

    return `
      <tr>
        <td style="font-weight:800; color:var(--accent-primary); font-size:0.964rem;">${escapeHtml(sec.code)}</td>
        <td style="font-weight:700; color:var(--text-primary);">${escapeHtml(sec.name)}</td>
        <td><span class="badge" style="background:#F3F4F6; color:#374151; font-size:0.857rem;">${escapeHtml(sec.program)}</span>${isRetiredProgram(sec.program) ? '<span class="badge" style="background:#FEE2E2; color:#B91C1C; font-size:0.857rem; margin-left:4px;" title="STI no longer offers this program. Move or delete this section.">No longer offered</span>' : ''}</td>
        <td>${yearLevelLabel(sec.year)}</td>
        <td><span class="badge" style="${sec.shift === 'PM' ? 'background:#FEF3C7; color:#92400E;' : (sec.shift === 'MIDSHIFT' ? 'background:#EDE9FE; color:#5B21B6;' : 'background:#E0F2FE; color:#0369A1;')} font-size:0.857rem; font-weight:700;">${escapeHtml(sec.shift || 'AM')}</span></td>
        <td>${sec.homeRoom ? `<span class="badge" style="background:#ECFDF5; color:#065F46; font-size:0.857rem; font-weight:700;">${escapeHtml(sec.homeRoom)}</span>` : '<span style="font-size:0.857rem; color:var(--text-secondary);">Automatic</span>'}</td>
        <td>${sectionAdviserName(sec) ? escapeHtml(sectionAdviserName(sec)) : '<span style="font-size:0.857rem; color:var(--text-secondary);">None yet</span>'}</td>
        <td><strong>${sec.studentCount}</strong> students</td>
        <td>${sectionSubjectsHtml(sec, attachedCount)}</td>
        <td style="text-align:right;">
          <div style="display:inline-flex; gap:6px;">
            <button class="btn btn-outline" onclick="openEditSectionModal(${sec.id})" style="font-size:0.857rem; padding:3px 7px;">Edit</button>
            <button class="btn btn-outline" onclick="openSplitSectionModal(${sec.id})" style="font-size:0.857rem; padding:3px 7px;">Split</button>
            <button class="btn btn-outline" onclick="deleteSectionItem(${sec.id})" style="font-size:0.857rem; padding:3px 7px; color:#DC2626; border-color:#FCA5A5;">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// SHS sections read like STEM11-A; college sections keep the IT701M pattern. The server builds the same codes.
function sectionCodeFor(prog, yr, index) {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  // Codes allow only letters, numbers, spaces and hyphens: BSIT -> IT, HRS -> HRS, B&E -> BE
  const prefix = prog.startsWith('BS') ? prog.substring(2) : prog.replace(/[^A-Za-z0-9-]/g, '');
  if (Number(yr) >= 11) return `${prefix}${yr}-${letters[index] || index + 1}`;
  return `${prefix}${yr}0${index + 1}M`;
}

// The year dropdown next to a program dropdown lists only the years that program offers (HRS: Years 1-2)
function refreshYearsForProgram(programId, yearId) {
  const program = document.getElementById(programId)?.value;
  const select = document.getElementById(yearId);
  if (!select || !program) return;
  const years = yearsForProgram(program, programId === 'curricSubjProgram' ? curricFormLevel() : activeSchoolLevel());
  const current = select.value;
  select.innerHTML = years.map(y => `<option value="${y}">${escapeHtml(yearLevelOptionLabel(y))}</option>`).join('');
  select.value = years.map(String).includes(current) ? current : String(years[0]);
}
window.refreshYearsForProgram = refreshYearsForProgram;

function openAutoGenerateSectionsModal() {
  const modal = document.getElementById('autoGenerateSectionsModal');
  if (modal) {
    calculateAutoGenPreview();
    modal.style.display = 'flex';
  }
}

function closeAutoGenerateSectionsModal() {
  const modal = document.getElementById('autoGenerateSectionsModal');
  if (modal) modal.style.display = 'none';
}

function toggleAutoGenModeUI() {
  const isProj = document.getElementById('autoGenModeProj')?.checked;
  const projFields = document.getElementById('autoGenProjectionFields');
  const countFields = document.getElementById('autoGenCountFields');
  if (projFields) projFields.style.display = isProj ? 'grid' : 'none';
  if (countFields) countFields.style.display = isProj ? 'none' : 'grid';
  calculateAutoGenPreview();
}

function calculateAutoGenPreview() {
  const label = document.getElementById('autoGenPreviewLabel');
  if (!label) return;

  const isProj = document.getElementById('autoGenModeProj')?.checked;
  const prog = document.getElementById('autoGenProgram')?.value || 'all';
  const yr = document.getElementById('autoGenYear')?.value || 'all';

  let secCount = 3;
  let stuPerSec = 38;

  if (isProj) {
    const total = parseInt(document.getElementById('autoGenTotalStudents')?.value, 10) || 150;
    const max = parseInt(document.getElementById('autoGenMaxStudentsPerSec')?.value, 10) || 38;
    secCount = Math.max(1, Math.ceil(total / max));
    stuPerSec = Math.round(total / secCount);
  } else {
    secCount = parseInt(document.getElementById('autoGenDirectCount')?.value, 10) || 3;
    stuPerSec = parseInt(document.getElementById('autoGenDirectStudents')?.value, 10) || 35;
  }

  const progLabel = prog === 'all' ? 'All Programs' : prog;
  const yrLabel = yr === 'all' ? 'All Years' : yearLevelLabel(yr);
  label.textContent = `Preview: Will generate ${secCount} section${secCount > 1 ? 's' : ''} (~${stuPerSec} students each) for ${progLabel} (${yrLabel}).`;
}

async function submitAutoGenerateSections() {
  const { activeSy, activeTerm } = getActiveAcademicContext();
  const progVal = document.getElementById('autoGenProgram')?.value || 'all';
  const yrVal = document.getElementById('autoGenYear')?.value || 'all';
  const isProj = document.getElementById('autoGenModeProj')?.checked;
  const attachSubjs = document.getElementById('autoGenAttachSubjects')?.checked;

  let countPerGroup = 2;
  let studentsPerSec = 35;

  if (isProj) {
    const total = parseInt(document.getElementById('autoGenTotalStudents')?.value, 10) || 150;
    const max = parseInt(document.getElementById('autoGenMaxStudentsPerSec')?.value, 10) || 38;
    countPerGroup = Math.max(1, Math.ceil(total / max));
    studentsPerSec = Math.round(total / countPerGroup);
  } else {
    countPerGroup = parseInt(document.getElementById('autoGenDirectCount')?.value, 10) || 3;
    studentsPerSec = parseInt(document.getElementById('autoGenDirectStudents')?.value, 10) || 35;
  }

  const autoGenValue = id => document.getElementById(id)?.value ?? '';
  const autoGenProblem = isProj
    ? INPUT_RULES.int('Total students', autoGenValue('autoGenTotalStudents'), 15, 1000)
      || INPUT_RULES.int('Maximum students per section', autoGenValue('autoGenMaxStudentsPerSec'), 20, 60)
    : INPUT_RULES.int('Number of sections', autoGenValue('autoGenDirectCount'), 1, 10)
      || INPUT_RULES.int('Students per section', autoGenValue('autoGenDirectStudents'), 15, 60);
  if (autoGenProblem || countPerGroup > 26) {
    alert(autoGenProblem || `This would create ${countPerGroup} sections per group. The limit is 26, so please raise the maximum students per section.`);
    return;
  }

  const targetProgs = progVal === 'all' ? LEVEL_PROGRAMS[activeSchoolLevel()] : [progVal];
  const targetYears = yrVal === 'all' ? LEVEL_YEARS[activeSchoolLevel()] : [parseInt(yrVal, 10)];

  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  // Existing sections get the new student count, so check their rooms first
  const resetCodes = targetProgs.flatMap(prog => targetYears.filter(yr => yearsForProgram(prog, activeSchoolLevel()).includes(yr)).flatMap(yr =>
    Array.from({ length: countPerGroup }, (_, i) => sectionCodeFor(prog, yr, i))));
  const resetSections = ACADEMIC_SECTIONS.filter(s => s.termId === activeTerm.id && resetCodes.includes(s.code));
  const tooSmall = MASTER_SCHEDULE_DATA.filter(c => {
    const sec = resetSections.find(s => s.code === c.section && (c.termId || s.termId) === s.termId);
    return sec && sectionChangeBreaks(c, { ...sec, studentCount: studentsPerSec });
  });
  if (!(await askToUnscheduleBroken(tooSmall, 'Update existing sections?', `Existing sections will have ${studentsPerSec} students each, and some of their classes are in rooms that are too small.`))) return;
  removeClassesAndSave(tooSmall);

  let createdCount = 0;

  targetProgs.forEach(prog => {
    targetYears.filter(yr => yearsForProgram(prog, activeSchoolLevel()).includes(yr)).forEach(yr => {
      for (let i = 0; i < countPerGroup; i++) {
        const letter = letters[i] || String(i + 1);
        const code = sectionCodeFor(prog, yr, i);
        const name = `${prog} ${yr}${letter}`;

        let existing = ACADEMIC_SECTIONS.find(s => s.code === code && s.termId === activeTerm.id);
        if (existing) {
          existing.studentCount = studentsPerSec;
          existing.name = name;
        } else {
          const newId = ACADEMIC_SECTIONS.length ? Math.max(...ACADEMIC_SECTIONS.map(s => s.id)) + 1 : 1;
          ACADEMIC_SECTIONS.push({
            id: newId,
            termId: activeTerm.id,
            code,
            name,
            program: prog,
            year: yr,
            studentCount: studentsPerSec,
        shift: 'AM'
          });
          createdCount++;
        }
      }
    });
  });

  if (attachSubjs) {
    // Ensure curriculum subjects for these programs & years are included
    CURRICULUM_SUBJECTS.forEach(s => {
      if (targetProgs.includes(s.program) && targetYears.includes(s.year)) {
        s.isIncluded = true;
      }
    });
  }

  saveStateToStorage();
  closeAutoGenerateSectionsModal();
  renderSectionsTable();
  updateSectionDropdown();
  renderGrid();
  updateScheduleStats();
  updateSectionDropdown();
  updateScheduleStats();

  postScheduleAction({
    action: 'auto_generate_sections',
    programs: targetProgs,
    years: targetYears,
    sections_per_group: countPerGroup,
    students_per_section: studentsPerSec,
    term_id: activeTerm.id,
    attach_curriculum: attachSubjs ? 1 : 0
  });

  alert(`Academic sections generated (${createdCount} new created, ${ACADEMIC_SECTIONS.length} total sections configured).`);
}

function openAddSectionModal() {
  applySchoolLevelOptions();
  document.getElementById('secModalTitle').textContent = 'Add Academic Section';
  document.getElementById('secEditId').value = '';
  document.getElementById('secCodeInput').value = '';
  document.getElementById('secNameInput').value = '';
  document.getElementById('secProgramInput').value = LEVEL_PROGRAMS[activeSchoolLevel()][0];
  refreshYearsForProgram('secProgramInput', 'secYearInput');
  document.getElementById('secYearInput').value = String(LEVEL_YEARS[activeSchoolLevel()][0]);
  document.getElementById('secStudentsInput').value = '35';
  if (document.getElementById('secShiftInput')) document.getElementById('secShiftInput').value = 'AM';
  fillHomeRoomSelect('');
  fillAdviserSelect(null);
  renderSectionSubjectsPreview();
  document.getElementById('sectionModal').style.display = 'flex';
}

// Lecture rooms and labs a section can call home; blank lets the generator choose
function fillHomeRoomSelect(selected) {
  const sel = document.getElementById('secHomeRoomInput');
  const known = ROOMS.some(r => r.code === selected);
  sel.innerHTML = '<option value="">Automatic: the generator picks one room and keeps reusing it</option>'
    + ROOMS.slice().sort((a, b) => a.code.localeCompare(b.code)).map(r => `<option value="${escapeHtml(r.code)}">${escapeHtml(r.code)} (${escapeHtml(r.type)}, ${r.cap} seats)</option>`).join('');
  sel.value = known ? selected : '';
}

// Teachers set to teach this school year's level (or both levels); blank means no adviser yet
function fillAdviserSelect(sec) {
  const sel = document.getElementById('secAdviserInput');
  const level = activeSchoolLevel();
  const options = FACULTY.filter(f => f.email && ['mixed', level].includes(facultyTeachingLevel(f)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const current = sec ? sectionAdviser(sec) : null;
  sel.innerHTML = '<option value="">No adviser yet</option>'
    + options.map(f => `<option value="${escapeHtml(f.email)}">${escapeHtml(f.name)}</option>`).join('');
  sel.value = current && options.includes(current) ? current.email : '';
}

// The subjects a section takes: its program and year's included subjects in its term (from Step 3)
function sectionSubjects(sec) {
  return CURRICULUM_SUBJECTS.filter(s => s.isIncluded !== false && s.termId === sec.termId && s.program === sec.program && Number(s.year) === Number(sec.year))
    .sort((a, b) => a.code.localeCompare(b.code));
}
function subjectHoursText(subj) {
  const { lec, lab } = subjectPartMinutes(subj);
  return lab > 0 && lec > 0 ? `${lec / 60}h lecture + ${lab / 60}h lab` : `${(lec + lab) / 60}h ${lab > 0 ? 'lab' : 'lecture'}`;
}
// In the sections table: "6 subjects", opening to the list
function sectionSubjectsHtml(sec, count) {
  const list = sectionSubjects(sec);
  if (list.length === 0) return '<span style="font-size:0.857rem; color:var(--danger);">None yet: add them in Step 3</span>';
  return `<details class="section-subjects"><summary><span class="badge" style="background:#EFF6FF; color:#1D4ED8;">${count} subject${count === 1 ? '' : 's'}</span></summary>
    <ul>${list.map(s => `<li><strong>${escapeHtml(s.code)}</strong> ${escapeHtml(s.name)} <span>${s.units} units · ${subjectHoursText(s)}</span></li>`).join('')}</ul></details>`;
}
// In the section form: the subjects the chosen program and year take
function renderSectionSubjectsPreview() {
  const box = document.getElementById('secSubjectsPreview');
  if (!box) return;
  const idVal = document.getElementById('secEditId').value;
  const existing = idVal ? ACADEMIC_SECTIONS.find(s => String(s.id) === idVal) : null;
  const sec = {
    termId: existing ? existing.termId : getActiveAcademicContext().activeTerm.id,
    program: document.getElementById('secProgramInput').value,
    year: parseInt(document.getElementById('secYearInput').value, 10)
  };
  const list = sectionSubjects(sec);
  box.innerHTML = list.length
    ? `<ul>${list.map(s => `<li><strong>${escapeHtml(s.code)}</strong> ${escapeHtml(s.name)} <span>${s.units} units · ${subjectHoursText(s)}</span></li>`).join('')}</ul>`
    : `<p>No subjects are loaded for ${escapeHtml(sec.program)} ${yearLevelLabel(sec.year)} yet. Add them in Step 3.</p>`;
}
window.renderSectionSubjectsPreview = renderSectionSubjectsPreview;

function openEditSectionModal(id) {
  applySchoolLevelOptions();
  const sec = ACADEMIC_SECTIONS.find(s => s.id === id);
  if (!sec) return;
  document.getElementById('secModalTitle').textContent = 'Edit Academic Section';
  document.getElementById('secEditId').value = sec.id;
  document.getElementById('secCodeInput').value = sec.code;
  document.getElementById('secNameInput').value = sec.name;
  document.getElementById('secProgramInput').value = sec.program;
  refreshYearsForProgram('secProgramInput', 'secYearInput');
  document.getElementById('secYearInput').value = String(sec.year);
  document.getElementById('secStudentsInput').value = sec.studentCount;
  if (document.getElementById('secShiftInput')) document.getElementById('secShiftInput').value = sec.shift || 'AM';
  fillHomeRoomSelect(sec.homeRoom || '');
  fillAdviserSelect(sec);
  renderSectionSubjectsPreview();
  document.getElementById('sectionModal').style.display = 'flex';
}

function closeSectionModal() {
  const modal = document.getElementById('sectionModal');
  if (modal) modal.style.display = 'none';
}

async function submitSectionModal() {
  const { activeSy, activeTerm } = getActiveAcademicContext();
  const idVal = document.getElementById('secEditId').value;
  const code = document.getElementById('secCodeInput').value.trim();
  const name = document.getElementById('secNameInput').value.trim();
  const prog = document.getElementById('secProgramInput').value;
  const yr = parseInt(document.getElementById('secYearInput').value, 10) || 1;
  const students = parseInt(document.getElementById('secStudentsInput').value, 10) || 35;
  const shift = document.getElementById('secShiftInput') ? document.getElementById('secShiftInput').value : 'AM';
  const homeRoom = document.getElementById('secHomeRoomInput').value;
  const adviser = document.getElementById('secAdviserInput').value;

  if (!code || !name) {
    alert('Please enter both Section Code and Section Name.');
    return;
  }
  if (!yearsForProgram(prog, activeSchoolLevel()).includes(yr)) {
    alert(`${prog} is a ${yearsForProgram(prog, activeSchoolLevel()).length}-year program, so choose ${yearLevelLabel(yearsForProgram(prog, activeSchoolLevel())[0])} to ${yearLevelLabel(Math.max(...yearsForProgram(prog, activeSchoolLevel())))}.`);
    return;
  }

  const sectionProblem = INPUT_RULES.code('Section code', code) || INPUT_RULES.text('Section name', name)
    || INPUT_RULES.int('Student count', document.getElementById('secStudentsInput').value, 1, 60);
  if (sectionProblem) {
    alert(sectionProblem);
    return;
  }
  const homeRoomObj = ROOMS.find(r => r.code === homeRoom);
  if (homeRoomObj && homeRoomObj.cap < students) {
    alert(`${homeRoom} seats ${homeRoomObj.cap}, but this section has ${students} students. Pick a bigger home room.`);
    return;
  }

  const savedSection = idVal ? ACADEMIC_SECTIONS.find(s => s.id === parseInt(idVal, 10)) : null;
  const previousCode = savedSection ? savedSection.code : null;

  if (ACADEMIC_SECTIONS.some(s => s.termId === activeTerm.id && s.code.toLowerCase() === code.toLowerCase() && String(s.id) !== idVal)) {
    alert(`Section code ${code} already exists in this term.`);
    return;
  }

  if (idVal) {
    const sec = ACADEMIC_SECTIONS.find(s => s.id === parseInt(idVal, 10));
    if (sec) {
      // Classes that would no longer fit their room or curriculum come off the schedule
      const updated = { ...sec, code, program: prog, year: yr, studentCount: students };
      const broken = MASTER_SCHEDULE_DATA.filter(c => c.section === sec.code && (c.termId || sec.termId) === sec.termId && sectionChangeBreaks(c, updated));
      if (!(await askToUnscheduleBroken(broken, `Change ${sec.code}?`, `With ${students} students in ${prog} ${yearLevelLabel(yr)}, some of ${sec.code}'s classes no longer fit their room or curriculum.`))) return;
      removeClassesAndSave(broken);

      // Classes follow the section when its code changes
      if (previousCode !== code) {
        MASTER_SCHEDULE_DATA.forEach(c => {
          if (c.section === previousCode && (!c.termId || c.termId === sec.termId)) c.section = code;
        });
        if (currentSelectedSection === previousCode) currentSelectedSection = code;
      }
      sec.code = code;
      sec.name = name;
      sec.program = prog;
      sec.year = yr;
      sec.studentCount = students;
      sec.shift = shift;
      sec.homeRoom = homeRoom;
      sec.adviser = adviser;
    }
  } else {
    const newId = ACADEMIC_SECTIONS.length ? Math.max(...ACADEMIC_SECTIONS.map(s => s.id)) + 1 : 1;
    ACADEMIC_SECTIONS.push({
      id: newId,
      termId: activeTerm.id,
      code,
      name,
      program: prog,
      year: yr,
      studentCount: students,
      shift,
      homeRoom,
      adviser
    });
  }

  saveStateToStorage();
  closeSectionModal();
  renderSectionsTable();
  updateSectionDropdown();
  renderGrid();
  updateScheduleStats();

  postScheduleAction({
    action: 'save_section',
    section_id: idVal,
    term_id: activeTerm.id,
    section_code: code,
    section_name: name,
    program: prog,
    year_level: yr,
    student_count: students,
    shift,
    home_room: homeRoom,
    adviser
  });
}

function openSplitSectionModal(id) {
  const sec = ACADEMIC_SECTIONS.find(s => s.id === id);
  if (!sec) return;
  document.getElementById('splitTargetSectionId').value = sec.id;
  document.getElementById('splitPromptDesc').textContent = `Split students from section ${sec.code} (${sec.name}, ${sec.studentCount} students total).`;
  document.getElementById('splitStudentsCount').value = Math.floor(sec.studentCount / 2);
  document.getElementById('splitNewCode').value = `${sec.code}-B`;
  document.getElementById('splitNewName').value = `${sec.name} (Split)`;
  document.getElementById('splitSectionModal').style.display = 'flex';
}

function closeSplitSectionModal() {
  const modal = document.getElementById('splitSectionModal');
  if (modal) modal.style.display = 'none';
}

function submitSplitSection() {
  const secId = parseInt(document.getElementById('splitTargetSectionId').value, 10);
  const splitCount = parseInt(document.getElementById('splitStudentsCount').value, 10);
  const newCode = document.getElementById('splitNewCode').value.trim();
  const newName = document.getElementById('splitNewName').value.trim();

  const sec = ACADEMIC_SECTIONS.find(s => s.id === secId);
  if (!sec) return;

  if (!(splitCount > 0) || splitCount >= sec.studentCount) {
    alert(`Split count must be between 1 and ${sec.studentCount - 1}.`);
    return;
  }

  const splitProblem = (newCode && INPUT_RULES.code('Section code', newCode)) || (newName && INPUT_RULES.text('Section name', newName));
  if (splitProblem) {
    alert(splitProblem);
    return;
  }

  const splitCode = (newCode || `${sec.code}-B`).toLowerCase();
  if (ACADEMIC_SECTIONS.some(s => s.termId === sec.termId && s.code.toLowerCase() === splitCode)) {
    alert(`Section code ${newCode || `${sec.code}-B`} already exists in this term.`);
    return;
  }

  sec.studentCount -= splitCount;
  const newId = ACADEMIC_SECTIONS.length ? Math.max(...ACADEMIC_SECTIONS.map(s => s.id)) + 1 : 1;
  ACADEMIC_SECTIONS.push({
    id: newId,
    termId: sec.termId,
    code: newCode || `${sec.code}-B`,
    name: newName || `${sec.name} (Split)`,
    program: sec.program,
    year: sec.year,
    studentCount: splitCount,
    shift: sec.shift || 'AM'
  });

  saveStateToStorage();
  closeSplitSectionModal();
  renderSectionsTable();
  updateSectionDropdown();
  renderGrid();
  updateScheduleStats();
  alert(`Section split into ${sec.code} (${sec.studentCount} students) and ${newCode} (${splitCount} students).`);

  postScheduleAction({
    action: 'split_section',
    section_id: secId,
    split_student_count: splitCount,
    new_section_code: newCode,
    new_section_name: newName
  });
}

async function deleteSectionItem(id) {
  if (ACADEMIC_SECTIONS.length <= 1) {
    alert('At least one academic section must remain.');
    return;
  }
  const target = ACADEMIC_SECTIONS.find(s => s.id === id);
  const inSection = c => target && c.section === target.code && (!c.termId || c.termId === target.termId);
  const classCount = MASTER_SCHEDULE_DATA.filter(inSection).length;
  const warning = classCount > 0
    ? `Its ${classCount} scheduled class${classCount === 1 ? '' : 'es'} will be deleted too. This can't be undone.`
    : 'This section will be removed from the term.';
  if (!(await askConfirm(warning, { title: 'Delete this section?', confirmLabel: 'Delete section', danger: true }))) return;
  MASTER_SCHEDULE_DATA = MASTER_SCHEDULE_DATA.filter(c => !inSection(c));
  ACADEMIC_SECTIONS = ACADEMIC_SECTIONS.filter(s => s.id !== id);
  saveStateToStorage();
  renderSectionsTable();
  updateSectionDropdown();
  renderGrid();
  updateScheduleStats();

  postScheduleAction({ action: 'delete_section', section_id: id });
}

/* ══════════════════════════════════════════════════════════════════════════
   STEP 6: SCHEDULE MANAGEMENT & BASELINE ENGINE
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
  const newSchedules = generateSmartBaselineSchedules();
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
    .catch(e => { if (!e || !e.reported) alert('Could not reach the server, so this schedule exists only in this browser.'); });

  alert(`Master schedule successfully generated (${newSchedules.length} classes scheduled across ${sectionsToSchedule.length} sections for ${activeTerm.termName}).`);
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
  if (!(await askConfirm(`The current ${activeTerm.termName} schedule will be replaced with the one saved before the last generate. You can undo this too.`, { title: 'Undo the last generate?', confirmLabel: 'Restore schedule' }))) return;
  const res = await fetch('api/schedules.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'restore_schedule', term_id: activeTerm.id, expected_version: activeTerm.scheduleVersion })
  });
  await loadServerState();
  if (res.ok) alert('The previous schedule has been restored.');
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
      reason = `Only ${hours(m.scheduledMinutes)} of ${hours(m.requiredMinutes)} hrs a week are scheduled. Add the remaining time manually or run Quick Generate.`;
    } else if (trial) {
      reason = trial.reason;
    } else {
      reason = 'Not scheduled yet, but a clash-free time is now available. Run Quick Generate or add it manually.';
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
  toggle.textContent = unassignedListOpen ? 'Hide details' : 'Show details';
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
  function track(c, units, ownTerm) {
    const start = timeToMinutes(c.startTime);
    const end = timeToMinutes(c.endTime);
    addBusy('room', c.day, c.room, start, end);
    addBusy('teacher', c.day, c.instructor, start, end);
    if (!ownTerm) return;
    addBusy('section', c.day, c.section, start, end);
    loadUnits.set(c.instructor, (loadUnits.get(c.instructor) || 0) + units);
    roomMinutes.set(c.room, (roomMinutes.get(c.room) || 0) + end - start);
    sectionRoomUses.set(`${c.section}|${c.room}`, (sectionRoomUses.get(`${c.section}|${c.room}`) || 0) + 1);
  }
  schedules.forEach(c => track(c, classUnits(c), true));
  otherTermClasses.forEach(c => track(c, 0, false));

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
      if (seed.some(c => c.section === sec.code && c.subjectCode === subj.code && classPart(c, subj, sec.program) === part)) return;
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

      // Day combinations to try, best first
      const dayPlans = meetingLengths.length === 1
        ? [['Wed'], ['Sat'], ['Fri'], ['Thu'], ['Tue'], ['Mon']]
        : [...(meetingLengths.length === 2 ? orderedDayPairs : [['Mon', 'Wed', 'Fri'], ['Tue', 'Thu', 'Sat']]), ...dayCombinations(workDays, meetingLengths.length)];

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

      // Part-time professors go first, since their time slots are limited. Then professors still under their
      // minimum units, then the least-loaded, so classes spread out; between professors within about 3 units
      // of each other, a seasoned one goes first.
      const partUnits = (Number(subj.units) || 0) * weeklyMinutes / (subjectMinutes || weeklyMinutes);
      const usedUnits = t => loadUnits.get(t.name) || 0;
      const statusRank = t => limitedHours(t) ? 0 : t.status === 'Part-time' ? 1 : 2;
      const underMin = t => usedUnits(t) < facultyMinUnits(t) ? 0 : 1;
      const loadBand = t => Math.floor(usedUnits(t) / 3);
      // The teacher of the subject's other part (lecture or lab) is tried first, so one teacher has both
      const otherPartTeacher = (schedules.find(c => c.section === sec.code && c.subjectCode === subj.code) || {}).instructor;
      const keepsTeacher = t => t.name === otherPartTeacher ? 0 : 1;
      // An instructor chosen in Rooms & Instructors teaches this subject for this section; one who is no longer
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

      const tryPlace = () => {
        for (const [starts, rooms] of passes) {
          for (const days of dayPlans) {
            for (const start of starts) {
              const meetings = days.map((day, i) => ({ day, start, end: minutesToTime(timeToMinutes(start) + meetingLengths[i]) }));
              if (meetings.some(m => timeToMinutes(m.end) > LAST_GENERATED_MINUTE)) continue;
              for (const roomObj of rooms) {
                for (const teacherObj of teachersToTry) {
                  const fits = meetings.every(m =>
                    !hasOverlap(m.day, m.start, m.end, roomObj.code, teacherObj.name, sec.code)
                    && !facultyAvailabilityProblem(teacherObj.name, m.day, m.start, m.end));
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
                    track(placedClass, (Number(subj.units) || 0) * meetingLengths[i] / (subjectMinutes || meetingLengths[i]), true);
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
            ? `${chosenTeacher.name}, chosen for ${partLabel} in Rooms & Instructors, would go over their max load (${formatUnits(usedUnits(chosenTeacher) + otherUnits(chosenTeacher.name))} of ${facultyMaxUnits(chosenTeacher)} units). Choose another instructor or Automatic.`
            : `${chosenTeacher.name}, chosen for ${partLabel} in Rooms & Instructors, has no free ${hours}-hour weekly time that fits ${sec.code} and a suitable room. Choose another instructor or Automatic.`;
        }
        if (teachersToTry.length === 0) {
          const loads = candidateTeachers.map(t => `${t.name} has ${formatUnits(usedUnits(t) + otherUnits(t.name))} of ${facultyMaxUnits(t)} units${otherUnits(t.name) > 0 ? ', counting overlapping terms' : ''}`).join('; ');
          return `${partLabel} adds ${formatUnits(partUnits)} units, which would put every qualified professor over their max load (${loads}). Raise a max load or qualify another professor.`;
        }
        if (teachersToTry.every(limitedHours)) {
          return `The qualified professor${teachersToTry.length === 1 ? '' : 's'} (${names(teachersToTry)}) ${teachersToTry.length === 1 ? 'is' : 'are'} part-time, and no ${hours}-hour weekly schedule fits inside their available days and shifts without a clash.`;
        }
        return `No clash-free ${hours}-hour weekly schedule is left. The qualified professor${teachersToTry.length === 1 ? '' : 's'} (${names(teachersToTry)}) and the suitable rooms are already booked whenever ${sec.code} is free. Free up time or qualify another professor.`;
      };

      if (!placed) {
        UNASSIGNED_CLASSES.push({ section: sec.code, code: partLabel, reason: unplacedReason() });
      }
    }
  });

  return schedules;
}

/* ══════════════════════════════════════════════════════════════════════════
   TIMETABLE VIEW RENDERING (SECTION VIEW; ROOM AND TEACHER TIMETABLES ARE IN VIEW SCHEDULE)
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
window.checkFacultySubjectConflict = checkFacultySubjectConflict;

/* ─── Main Timetable Grid Renderer ─── */
function renderGrid() {
  const tbody = document.getElementById('sectionGridBody');
  if (!tbody) return;
  applyScheduleRole();
  queueUnassignedBannerRefresh();
  if (!canEditSchedule() && ACTIVE_SCHEDULE_STEP !== 7) {
    goToScheduleStep(7);
    return;
  }

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
        const conflictReason = readOnly ? null : checkClassConflict(item);
        const conflictClass = conflictReason ? 'has-conflict' : '';
        const itemType = (item.type || 'lecture').toLowerCase();

        rowsHtml += `
          <td class="class-block-cell type-${itemType} ${conflictClass}"
              rowspan="${cell.rowspan}"
              ${readOnly ? '' : `draggable="true"
              ondragstart="handleClassDragStart(event, '${item.id}')"
              onclick="showClassDetails('${item.id}')"
              tabindex="0" role="button"
              aria-label="${escapeHtml(item.subjectCode)} for ${escapeHtml(item.section)}, ${escapeHtml(item.day)} ${formatTime12(item.startTime)} to ${formatTime12(item.endTime)}, ${escapeHtml(item.room)}, ${escapeHtml(item.instructor)}. Press Enter for details."`}
              title="${escapeHtml(item.subjectCode)}: ${escapeHtml(item.subjectTitle || '')} (${formatTime12(item.startTime)} – ${formatTime12(item.endTime)})">
            <div class="class-cell-inner">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:4px;">
                <span class="class-sec-badge">${escapeHtml(item.section)}${item.aiPlaced ? ' <span class="class-ai-badge" title="Placed by AI">AI</span>' : ''}${otherTermBadge(item)}</span>
                ${readOnly ? '' : `<button class="cell-quick-edit-btn" onclick="event.stopPropagation(); openEditClassScheduleModal('${item.id}')" title="Edit subject or time" aria-label="Edit ${escapeHtml(item.subjectCode)}">Edit</button>`}
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
        <div style="display:flex; gap:8px;">
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

  if (typeof syncMasterScheduleRoomsWithCatalog === 'function') {
    syncMasterScheduleRoomsWithCatalog();
  }
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


  // Target Section
  let targetSection = currentSelectedSection || 'IT701M';
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
  if (firstFree) roomSel.value = firstFree.code;

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
  const section = (secInput?.value || '').trim().toUpperCase() || currentSelectedSection || 'IT701M';

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

  if (typeof syncMasterScheduleRoomsWithCatalog === 'function') {
    syncMasterScheduleRoomsWithCatalog();
  }
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
  const activeSy = (typeof SCHOOL_YEARS !== 'undefined' ? SCHOOL_YEARS.find(y => y.isActive) : null) || { yearCode: 'AY 2026–2027' };
  const activeTerm = (typeof SCHOOL_TERMS !== 'undefined' ? SCHOOL_TERMS.find(t => t.isActive && (!activeSy || t.yearId === activeSy.id)) : null)
    || (typeof SCHOOL_TERMS !== 'undefined' && activeSy ? SCHOOL_TERMS.find(t => t.yearId === activeSy.id) : null)
    || { termName: '1st Sem' };
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
    headerSub.textContent = `${activeTerm.termName} ${activeSy.yearCode} · ${totalSections} sections across ${totalRooms} rooms`;
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

/* ══════════════════════════════════════════════════════════════════════════
   STEP 8: EXPORT ENGINE (PDF & PNG, SINGLE & BATCH)
   ══════════════════════════════════════════════════════════════════════════ */

function toggleExportMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('exportDropdownMenu');
  if (menu) {
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
  }
}

// Printing shows only the timetable sheet on screen, so headings, stats and warnings stay off the paper
const printHiddenElements = [];
window.addEventListener('beforeprint', () => {
  const sheet = [...document.querySelectorAll('.module-page.active .timetable-sheet-card')].find(el => el.offsetParent !== null);
  if (!sheet) return;
  for (let el = sheet; el.parentElement && el !== document.body; el = el.parentElement) {
    [...el.parentElement.children].forEach(sibling => {
      if (sibling !== el && !sibling.classList.contains('print-hide')) {
        sibling.classList.add('print-hide');
        printHiddenElements.push(sibling);
      }
    });
  }
});
window.addEventListener('afterprint', () => {
  printHiddenElements.splice(0).forEach(el => el.classList.remove('print-hide'));
});

const PDF_TOOLS_MISSING = "The PDF tool couldn't load. Check your internet connection and reload the page, or use Print instead.";
let pdfExportBusy = false;

function pdfToolsReady() {
  return !!(window.jspdf && window.jspdf.jsPDF);
}

function exportFileName(label, extension) {
  const { activeSy, activeTerm } = getActiveAcademicContext();
  return `${label} ${activeTerm.termName} ${activeSy.yearCode}.${extension}`.replace(/[\\/:*?"<>|]/g, '-');
}

// Draws a timetable sheet as an image at desktop width, so phones get the same full page, without its edit buttons
async function captureTimetableSheet(card) {
  card.setAttribute('data-capture', 'true');
  try {
    return await html2canvas(card, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#FFFFFF',
      logging: false,
      windowWidth: 1400,
      onclone: doc => {
        const copy = doc.querySelector('[data-capture]');
        if (!copy) return;
        copy.style.width = '1240px';
        copy.style.maxWidth = 'none';
        copy.querySelectorAll('.timetable-table-container').forEach(el => { el.style.overflow = 'visible'; });
        copy.querySelectorAll('button').forEach(el => el.remove());
      }
    });
  } finally {
    card.removeAttribute('data-capture');
  }
}

function newTimetablePdf() {
  return new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
}

// One timetable per landscape A4 page, scaled to fit and centred
function addSheetToPdf(pdf, canvas, isFirstPage) {
  if (!isFirstPage) pdf.addPage('a4', 'landscape');
  const margin = 8;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const scale = Math.min((pageWidth - margin * 2) / canvas.width, (pageHeight - margin * 2) / canvas.height);
  const width = canvas.width * scale;
  const height = canvas.height * scale;
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (pageWidth - width) / 2, margin, width, height);
}

/* ─── Real (text) PDF timetables ───
   Each page is drawn with text and lines, so it can be searched, copied and printed sharply.
   The title and stats come from the sheet on screen; the classes come from the schedule data. */
const PDF_TYPE_COLORS = {
  lecture: [[235, 243, 252], [37, 99, 235]],
  lab: [[236, 253, 245], [5, 150, 105]],
  pe: [[254, 243, 199], [217, 119, 6]],
  special: [[254, 243, 199], [217, 119, 6]]
};
const PDF_NAVY = [28, 54, 100];
const PDF_GREY = [92, 99, 117];

// The built-in PDF fonts only cover Western European letters, so a few typographic marks are swapped for plain ones
function pdfText(value) {
  return String(value ?? '').trim()
    .replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u2022/g, '\u00B7');
}

function sheetHeaderFor(card) {
  const read = selector => pdfText(card.querySelector(selector)?.textContent);
  return {
    title: read('.section-title-large'),
    subtitle: read('.section-badge-program'),
    stats: [...card.querySelectorAll('.sheet-stat-pill')]
      .map(pill => [pdfText(pill.querySelector('.sheet-stat-label')?.textContent), pdfText(pill.querySelector('.sheet-stat-value')?.textContent)])
      .filter(([label, value]) => label || value)
  };
}

// The second line of a class box names what the page's title doesn't
function pdfClassDetail(c, mode) {
  if (mode === 'teacher') return `${c.section} \u00B7 ${c.room}`;
  if (mode === 'room') return `${c.section} \u00B7 ${c.instructor}`;
  return `${c.room} \u00B7 ${c.instructor}`;
}

// Draws one landscape A4 timetable page: title and stats, the Mon-Sat grid, hours per day, and a legend
function drawTimetablePage(pdf, card, classes, mode, isFirstPage) {
  if (!isFirstPage) pdf.addPage('a4', 'landscape');
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const head = sheetHeaderFor(card);

  // Title, with the stats in boxes on the right
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(...PDF_GREY);
  pdf.text(head.subtitle.toUpperCase(), margin, margin + 4);
  pdf.setFontSize(18);
  pdf.setTextColor(...PDF_NAVY);
  pdf.text(head.title, margin, margin + 12);
  let boxRight = pageW - margin;
  head.stats.slice().reverse().forEach(([label, value]) => {
    pdf.setFontSize(6.5);
    const labelW = pdf.getTextWidth(label.toUpperCase());
    pdf.setFontSize(11);
    const valueW = pdf.getTextWidth(value);
    const boxW = Math.max(labelW, valueW) + 8;
    const boxX = boxRight - boxW;
    pdf.setDrawColor(214, 221, 232);
    pdf.setFillColor(248, 250, 253);
    pdf.roundedRect(boxX, margin, boxW, 13, 1.5, 1.5, 'FD');
    pdf.setFontSize(6.5);
    pdf.setTextColor(...PDF_GREY);
    pdf.text(label.toUpperCase(), boxX + boxW / 2, margin + 4.6, { align: 'center' });
    pdf.setFontSize(11);
    pdf.setTextColor(...PDF_NAVY);
    pdf.text(value, boxX + boxW / 2, margin + 10.6, { align: 'center' });
    boxRight = boxX - 3;
  });

  // Rows every 30 minutes, from 7:00 AM to the last class (at least until noon)
  const times = classes.flatMap(c => [timeToMinutes(c.startTime), timeToMinutes(c.endTime)]);
  const dayStart = Math.min(CLASS_DAY_START, times.length ? Math.floor(Math.min(...times) / 30) * 30 : CLASS_DAY_START);
  const dayEnd = Math.max(12 * 60, times.length ? Math.ceil(Math.max(...times) / 30) * 30 : 12 * 60);
  const slots = Math.max(1, (dayEnd - dayStart) / 30);
  const top = margin + 18;
  const timeW = 22;
  const colW = (pageW - margin * 2 - timeW) / DAYS.length;
  const headH = 7;
  const footH = 7;
  // Rows grow to fill the page when the day is short, up to 12 mm each
  const rowH = Math.min(12, (pageH - top - headH - footH - 16) / slots);
  const gridTop = top + headH;
  const gridBottom = gridTop + slots * rowH;
  const gridW = pageW - margin * 2;

  pdf.setFillColor(...PDF_NAVY);
  pdf.rect(margin, top, gridW, headH, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(255, 255, 255);
  pdf.text('TIME', margin + timeW / 2, top + 4.8, { align: 'center' });
  DAYS.forEach((day, i) => pdf.text(day.toUpperCase(), margin + timeW + colW * i + colW / 2, top + 4.8, { align: 'center' }));

  pdf.setFillColor(241, 243, 247);
  pdf.rect(margin, gridTop, timeW, slots * rowH, 'F');
  pdf.setDrawColor(214, 221, 232);
  pdf.setLineWidth(0.2);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(...PDF_GREY);
  for (let i = 0; i < slots; i++) {
    const y = gridTop + i * rowH;
    pdf.line(margin, y, margin + gridW, y);
    pdf.text(formatTime12(minutesToTime(dayStart + i * 30)), margin + timeW / 2, y + Math.min(4, rowH - 1.5), { align: 'center' });
  }
  for (let i = 0; i <= DAYS.length; i++) {
    const x = margin + timeW + colW * i;
    pdf.line(x, gridTop, x, gridBottom + footH);
  }

  // Each class fills its day and hours, coloured by type
  const lineGap = size => size * 0.42;
  classes.forEach(c => {
    const col = DAYS.indexOf(c.day);
    if (col < 0) return;
    const y1 = gridTop + ((timeToMinutes(c.startTime) - dayStart) / 30) * rowH;
    const y2 = gridTop + ((timeToMinutes(c.endTime) - dayStart) / 30) * rowH;
    const x1 = margin + timeW + colW * col;
    const [fill, stripe] = PDF_TYPE_COLORS[c.type] || PDF_TYPE_COLORS.lecture;
    pdf.setFillColor(...fill);
    pdf.rect(x1 + 0.4, y1 + 0.4, colW - 0.8, y2 - y1 - 0.8, 'F');
    pdf.setFillColor(...stripe);
    pdf.rect(x1 + 0.4, y1 + 0.4, 1.1, y2 - y1 - 0.8, 'F');

    const lines = [
      [pdfText(c.subjectCode), 'bold', 8, PDF_NAVY],
      [pdfText(c.subjectTitle), 'normal', 6.8, [31, 41, 55]],
      [pdfText(pdfClassDetail(c, mode)), 'normal', 6.3, PDF_GREY],
      [`${formatTime12(c.startTime)} - ${formatTime12(c.endTime)}`, 'normal', 6.3, PDF_GREY]
    ];
    let textY = y1 + 3.6;
    const textX = x1 + 2.6;
    const textW = colW - 4;
    for (const [text, weight, size, color] of lines) {
      pdf.setFont('helvetica', weight);
      pdf.setFontSize(size);
      pdf.setTextColor(...color);
      for (const part of pdf.splitTextToSize(text, textW)) {
        if (textY > y2 - 1.2) return;
        pdf.text(part, textX, textY);
        textY += lineGap(size) + 0.6;
      }
    }
  });

  // Hours per day, then the weekly total and the legend
  pdf.setFillColor(241, 243, 247);
  pdf.rect(margin, gridBottom, gridW, footH, 'F');
  pdf.setDrawColor(214, 221, 232);
  for (let i = 0; i <= DAYS.length; i++) pdf.line(margin + timeW + colW * i, gridBottom, margin + timeW + colW * i, gridBottom + footH);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(...PDF_NAVY);
  pdf.text('# of Hrs', margin + timeW / 2, gridBottom + 4.7, { align: 'center' });
  let weekMinutes = 0;
  DAYS.forEach((day, i) => {
    const minutes = classes.filter(c => c.day === day).reduce((sum, c) => sum + timeToMinutes(c.endTime) - timeToMinutes(c.startTime), 0);
    weekMinutes += minutes;
    pdf.text(`${(minutes / 60).toFixed(1)} hrs`, margin + timeW + colW * i + colW / 2, gridBottom + 4.7, { align: 'center' });
  });
  pdf.setDrawColor(150, 160, 178);
  pdf.setLineWidth(0.3);
  pdf.rect(margin, top, gridW, gridBottom + footH - top);

  const legendY = gridBottom + footH + 6;
  pdf.setFontSize(9);
  pdf.text(`Weekly Schedule Total: ${(weekMinutes / 60).toFixed(1)} hrs / week`, pageW - margin, legendY, { align: 'right' });
  let legendX = margin;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  [['Lecture', PDF_TYPE_COLORS.lecture], ['Laboratory', PDF_TYPE_COLORS.lab], ['PE / Special / NSTP', PDF_TYPE_COLORS.pe]].forEach(([name, [fill, stripe]]) => {
    pdf.setFillColor(...fill);
    pdf.rect(legendX, legendY - 3, 4, 4, 'F');
    pdf.setFillColor(...stripe);
    pdf.rect(legendX, legendY - 3, 1, 4, 'F');
    pdf.setTextColor(...PDF_GREY);
    pdf.text(name, legendX + 5.5, legendY);
    legendX += pdf.getTextWidth(name) + 12;
  });
  pdf.setFontSize(6.5);
  pdf.text(`STI College Marikina \u00B7 Generated ${new Date().toLocaleDateString('en-PH', { dateStyle: 'medium' })}`, margin, pageH - 5);
}

// The active term's classes shown on the Master Schedule sheet
function masterSheetClasses() {
  return activeTermClasses().filter(c => c.section === currentSelectedSection);
}

// A real PDF of one timetable. If drawing fails, a picture of the sheet is used instead.
async function saveTimetableSheetPdf(card, label, classes, mode) {
  if (!pdfToolsReady()) {
    alert(PDF_TOOLS_MISSING);
    return;
  }
  if (!card || pdfExportBusy) return;
  pdfExportBusy = true;
  try {
    let pdf = newTimetablePdf();
    try {
      drawTimetablePage(pdf, card, classes, mode, true);
    } catch (drawError) {
      if (typeof html2canvas === 'undefined') throw drawError;
      console.warn('Text PDF failed, saving a picture of the timetable instead:', drawError);
      pdf = newTimetablePdf();
      addSheetToPdf(pdf, await captureTimetableSheet(card), true);
    }
    pdf.save(exportFileName(`${label} Timetable`, 'pdf'));
  } catch (e) {
    alert('Could not create the PDF. Please try again, or use Print instead.');
  } finally {
    pdfExportBusy = false;
  }
}

function exportTimetablePDF() {
  const menu = document.getElementById('exportDropdownMenu');
  if (menu) menu.style.display = 'none';

  saveTimetableSheetPdf(document.getElementById('sectionTimetableCard'), currentSelectedSection, masterSheetClasses(), 'section');
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
    alert('The image tool is still loading. Please try again in a moment.');
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
    alert('Unable to generate the PNG image. Please use Download PDF instead.');
  }
}

// One PDF with a page for every section of the active term, each drawn as real text
async function exportAllSectionsBatchPDF() {
  const menu = document.getElementById('exportDropdownMenu');
  if (menu) menu.style.display = 'none';
  if (!pdfToolsReady()) {
    alert(PDF_TOOLS_MISSING);
    return;
  }
  if (pdfExportBusy) return;

  const { activeSy, activeTerm } = getActiveAcademicContext();
  const sections = ACADEMIC_SECTIONS.filter(s => s.termId === activeTerm.id).sort((a, b) => a.code.localeCompare(b.code));
  if (sections.length === 0) {
    alert(`No sections found for ${activeTerm.termName} (${activeSy.yearCode}) to export.`);
    return;
  }

  const card = document.getElementById('sectionTimetableCard');
  const previousSection = currentSelectedSection;
  pdfExportBusy = true;
  alert(`Preparing a PDF of ${sections.length} section timetables. It downloads when ready.`);
  try {
    const pdf = newTimetablePdf();
    for (let i = 0; i < sections.length; i++) {
      currentSelectedSection = sections[i].code;
      renderGrid();
      drawTimetablePage(pdf, card, masterSheetClasses(), 'section', i === 0);
    }
    pdf.save(exportFileName('All Section Timetables', 'pdf'));
  } catch (e) {
    alert('Could not create the PDF. Please try again, or use Print instead.');
  } finally {
    currentSelectedSection = previousSection;
    renderGrid();
    pdfExportBusy = false;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   INITIALIZATION & EVENT BINDINGS
   ══════════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  // The offline demo starts with a generated schedule; a signed-in app loads the saved one
  const { activeSy, activeTerm } = getActiveAcademicContext();
  if (IS_STANDALONE) {
    MASTER_SCHEDULE_DATA = MASTER_SCHEDULE_DATA.filter(c => c.termId && c.termId !== activeTerm.id).concat(generateSmartBaselineSchedules());
  }

  // Filter bindings
  const progFilter = document.getElementById('programFilter');
  if (progFilter) progFilter.addEventListener('change', () => {
    updateSectionDropdown();
    renderGrid();
  });

  const yrFilter = document.getElementById('yearFilter');
  if (yrFilter) yrFilter.addEventListener('change', () => {
    updateSectionDropdown();
    renderGrid();
  });

  const sectionSelect = document.getElementById('sectionSelect');
  if (sectionSelect) {
    sectionSelect.addEventListener('change', (e) => {
      currentSelectedSection = e.target.value;
      renderGrid();
    });
  }


  // Dismiss export menu on outside click
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('exportDropdownMenu');
    const btn = document.getElementById('btnExport');
    if (menu && menu.style.display === 'block' && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

  // Initial step setup
  // Initial step setup (without popup alerts)
  // Load saved schedule if available
  try {
    const savedSched = localStorage.getItem('sti_master_schedule_data');
    if (savedSched) {
      const parsed = JSON.parse(savedSched);
      if (Array.isArray(parsed) && parsed.length > 0) {
        MASTER_SCHEDULE_DATA = parsed;
      }
    }
  } catch (e) {
    console.warn('Failed parsing saved master schedule', e);
  }

  syncAllSyFilters();
  goToScheduleStep(ACTIVE_SCHEDULE_STEP || 7);
  isScheduleInitialized = true;
});

// Global window assignments for inline handlers
window.evaluateResourceReadiness = evaluateResourceReadiness;
window.goToScheduleStep = goToScheduleStep;
window.renderGrid = renderGrid;
window.refreshAllSchedulingViews = refreshAllSchedulingViews;
window.updateSectionDropdown = updateSectionDropdown;

// Step 1
window.renderSchoolYearTable = renderSchoolYearTable;
window.openAddSchoolYearModal = openAddSchoolYearModal;
window.openEditSchoolYearModal = openEditSchoolYearModal;
window.closeSchoolYearModal = closeSchoolYearModal;
window.submitSchoolYearModal = submitSchoolYearModal;
window.setActiveSchoolYear = setActiveSchoolYear;
window.deleteSchoolYear = deleteSchoolYear;

// Step 2
window.renderSchoolTermTable = renderSchoolTermTable;
window.updateTermStatusDirectly = updateTermStatusDirectly;
window.setActiveSchoolTerm = setActiveSchoolTerm;
window.openEditTermModal = openEditTermModal;
window.closeTermModal = closeTermModal;
window.submitTermModal = submitTermModal;

// Step 3
window.updateCurriculumTermFilter = updateCurriculumTermFilter;
window.renderSubjectOfferingTable = renderSubjectOfferingTable;
window.toggleSubjectInclusion = toggleSubjectInclusion;
window.toggleAllSubjectInclusion = toggleAllSubjectInclusion;
window.openAddCurriculumSubjectModal = openAddCurriculumSubjectModal;
window.openEditCurriculumSubjectModal = openEditCurriculumSubjectModal;
window.closeAddSubjectModal = closeAddSubjectModal;
window.submitAddSubjectModal = submitAddSubjectModal;
window.deleteSubjectOffering = deleteSubjectOffering;

// Step 4
window.renderResourceValidation = renderResourceValidation;

// Step 5
window.renderSectionsTable = renderSectionsTable;
window.openAutoGenerateSectionsModal = openAutoGenerateSectionsModal;
window.closeAutoGenerateSectionsModal = closeAutoGenerateSectionsModal;
window.toggleAutoGenModeUI = toggleAutoGenModeUI;
window.calculateAutoGenPreview = calculateAutoGenPreview;
window.submitAutoGenerateSections = submitAutoGenerateSections;
window.openAddSectionModal = openAddSectionModal;
window.openEditSectionModal = openEditSectionModal;
window.closeSectionModal = closeSectionModal;
window.submitSectionModal = submitSectionModal;
window.openSplitSectionModal = openSplitSectionModal;
window.closeSplitSectionModal = closeSplitSectionModal;
window.submitSplitSection = submitSplitSection;
window.deleteSectionItem = deleteSectionItem;

// Step 6 & 7 Modals & Drag-and-Drop
window.openConfirmRegenerateModal = openConfirmRegenerateModal;
window.closeConfirmRegenerateModal = closeConfirmRegenerateModal;
window.executeGenerateBaseline = executeGenerateBaseline;
window.showClassDetails = showClassDetails;
window.closeClassDetailModal = closeClassDetailModal;
window.openEditClassScheduleModal = openEditClassScheduleModal;
window.handleEditSubjectChange = handleEditSubjectChange;
window.submitEditClassSchedule = submitEditClassSchedule;
window.deleteClassSchedule = deleteClassSchedule;
window.handleClassDragStart = handleClassDragStart;
window.handleSlotDragOver = handleSlotDragOver;
window.handleSlotDragLeave = handleSlotDragLeave;
window.handleSlotDrop = handleSlotDrop;
window.openManualSlotModal = openManualSlotModal;
window.closeSlotModal = closeSlotModal;
window.submitSlotAssignment = submitSlotAssignment;
window.handleSectionSearch = handleSectionSearch;
window.checkGlobalClassConflict = checkGlobalClassConflict;
window.updateScheduleStats = updateScheduleStats;

// Export
window.toggleExportMenu = toggleExportMenu;
window.exportTimetablePDF = exportTimetablePDF;
window.exportTimetablePNG = exportTimetablePNG;
window.exportAllSectionsBatchPDF = exportAllSectionsBatchPDF;
