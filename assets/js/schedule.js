/* ══════════════════════════════════════════════════════════════════════════
   MODULE 1 — ACADEMIC SCHEDULING LIFECYCLE CONTROLLER & TIMETABLE ENGINE
   ══════════════════════════════════════════════════════════════════════════ */

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Global repositories and runtime trackers
let MASTER_SCHEDULE_DATA = [];
let currentSelectedSection = 'IT701M';
let currentSelectedRoom = 'LR-101';
let currentSelectedTeacher = 'Academic Head';

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

  const terms = (typeof SCHOOL_TERMS !== 'undefined') ? SCHOOL_TERMS.filter(t => t.yearId === activeSy.id) : [];
  let activeTerm = terms.find(t => t.isActive);

  if (!activeTerm && terms.length > 0) {
    activeTerm = terms.find(t => t.termName === '1st Sem') || terms[0];
    activeTerm.isActive = true;
  }

  if (!activeTerm) {
    activeTerm = { id: 1, yearId: activeSy.id, termName: '1st Sem', status: 'active', isActive: true };
  }

  return { activeSy, activeTerm };
}

// Returns the first setup step that isn't finished, or null when Step 5 may open
function firstIncompleteStep() {
  const activeSy = SCHOOL_YEARS.find(y => y.isActive);
  if (!activeSy) return { step: 1, reason: 'Set an active school year.' };
  if (!SCHOOL_TERMS.some(t => t.yearId === activeSy.id)) return { step: 2, reason: `Add a school term for ${activeSy.yearCode}.` };

  const { activeTerm } = getActiveAcademicContext();
  if (!CURRICULUM_SUBJECTS.some(s => s.termId === activeTerm.id && s.isIncluded)) {
    return { step: 3, reason: `Load and include subjects for ${activeTerm.termName} (${activeSy.yearCode}).` };
  }

  const readiness = evaluateResourceReadiness();
  if (readiness.hasCritical) return { step: 4, reason: readiness.criticalReasons.join('\n• ') };
  return null;
}

function updateStepLocks() {
  const incomplete = firstIncompleteStep();
  const hasCritical = evaluateResourceReadiness().hasCritical;
  [5, 6].forEach(step => {
    const btn = document.getElementById(`stepBtn-${step}`);
    if (!btn) return;
    const locked = step === 5 ? !!incomplete : hasCritical;
    btn.classList.toggle('locked', locked);
    if (locked) {
      btn.title = step === 5 ? `Locked: finish Step ${incomplete.step} first` : 'Locked: Resolve critical professor and room shortages in Step 4 to unlock';
    } else {
      btn.removeAttribute('title');
    }
  });
}

function goToScheduleStep(stepNumber) {
  stepNumber = parseInt(stepNumber, 10);
  if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 6) stepNumber = 6;
  applyScheduleRole();
  if (!canEditSchedule()) stepNumber = 6;

  // Gatekeeper: Step 5 (Create Sections) opens only once Steps 1 to 4 are finished.
  // Note: Only block when user explicitly attempts to proceed during the workflow; NEVER block or alert during initial page startup.
  if (isScheduleInitialized && stepNumber === 5) {
    const incomplete = firstIncompleteStep();
    if (incomplete) {
      alert(`\u26A0 Cannot open Step 5 (Create Sections) yet.\n\nFinish Step ${incomplete.step} first:\n\u2022 ${incomplete.reason}`);
      goToScheduleStep(incomplete.step);
      return;
    }
  }
  if (isScheduleInitialized && typeof evaluateResourceReadiness === 'function') {
    const readiness = evaluateResourceReadiness();
    if (readiness.hasCritical) {
      if (stepNumber === 6 && (typeof ACADEMIC_SECTIONS === 'undefined' || ACADEMIC_SECTIONS.filter(s => s.termId === (getActiveAcademicContext().activeTerm.id)).length === 0)) {
        alert(`\u26A0 Cannot proceed to Step 6 (Master Schedule & Timetable):\n\nNo sections have been created and critical resource deficits were detected in Step 4.\n\nPlease resolve shortages in Step 4 and create sections in Step 5 first.`);
        goToScheduleStep(4);
        return;
      }
    }
  }
  ACTIVE_SCHEDULE_STEP = stepNumber;

  // A step only shows as done when it really is finished
  const incompleteStep = firstIncompleteStep();
  const isStepDone = i => i < stepNumber && !(incompleteStep && incompleteStep.step <= i);

  // Update Stepper Bar Indicators
  for (let i = 1; i <= 6; i++) {
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
  for (let i = 1; i <= 6; i++) {
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
  if (stepNumber === 4) renderResourceValidation();
  if (stepNumber === 5) renderSectionsTable();
  if (stepNumber === 6) {
    updateSectionDropdown();
    updateRoomDropdown();
    updateTeacherDropdown();
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
    const termsCount = SCHOOL_TERMS.filter(t => t.yearId === sy.id).length || 3;
    const statusBadge = sy.isActive
      ? `<span class="badge" style="background:#DEF7EC; color:#03543F; font-weight:800; font-size:11px;">✓ ACTIVE</span>`
      : `<span class="badge" style="background:#F3F4F6; color:#4B5563; font-weight:600; font-size:11px;">Inactive</span>`;

    const activeBtn = sy.isActive
      ? `<button class="btn btn-outline" disabled style="font-size:11px; padding:3px 8px; opacity:0.6;">Current Active</button>`
      : `<button class="btn btn-outline" onclick="setActiveSchoolYear(${sy.id})" style="font-size:11px; padding:3px 8px;">Set as Active</button>`;

    return `
      <tr>
        <td style="font-weight:700; color:var(--accent-primary); font-size:13.5px;">${escapeHtml(sy.yearCode)}</td>
        <td>${statusBadge}</td>
        <td>${termsCount} Terms</td>
        <td style="color:var(--text-secondary);">${escapeHtml(sy.created || '2026-06-01')}</td>
        <td style="text-align:right;">
          <div style="display:inline-flex; gap:6px; align-items:center;">
            ${activeBtn}
            <button class="btn btn-outline" onclick="openEditSchoolYearModal(${sy.id})" style="font-size:11px; padding:3px 8px;">Edit</button>
            <button class="btn btn-outline" onclick="deleteSchoolYear(${sy.id})" style="font-size:11px; padding:3px 8px; color:#DC2626; border-color:#FCA5A5;">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openAddSchoolYearModal() {
  document.getElementById('syModalTitle').textContent = 'Add School Year';
  document.getElementById('syEditId').value = '';
  document.getElementById('syCodeInput').value = '';
  document.getElementById('syIsActiveInput').checked = true;
  document.getElementById('schoolYearModal').style.display = 'flex';
}

function openEditSchoolYearModal(id) {
  const sy = SCHOOL_YEARS.find(y => y.id === id);
  if (!sy) return;
  document.getElementById('syModalTitle').textContent = 'Edit School Year';
  document.getElementById('syEditId').value = sy.id;
  document.getElementById('syCodeInput').value = sy.yearCode;
  document.getElementById('syIsActiveInput').checked = !!sy.isActive;
  document.getElementById('schoolYearModal').style.display = 'flex';
}

function closeSchoolYearModal() {
  const modal = document.getElementById('schoolYearModal');
  if (modal) modal.style.display = 'none';
}

function refreshAllSchedulingViews() {
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

function submitSchoolYearModal() {
  const idVal = document.getElementById('syEditId').value;
  const codeVal = document.getElementById('syCodeInput').value.trim();
  const isActiveVal = document.getElementById('syIsActiveInput').checked;

  if (!codeVal) {
    alert('Please enter an academic school year code (e.g., AY 2026-2027).');
    return;
  }

  const yearCodeProblem = INPUT_RULES.schoolYear(codeVal);
  if (yearCodeProblem) {
    alert(yearCodeProblem);
    return;
  }

  if (SCHOOL_YEARS.some(y => y.yearCode.toLowerCase() === codeVal.toLowerCase() && String(y.id) !== idVal)) {
    alert(`School year ${codeVal} already exists.`);
    return;
  }

  // Parse start and end years dynamically from user-provided year code
  const yearMatches = codeVal.match(/\b(20\d{2})\b/g);
  const startYr = yearMatches && yearMatches[0] ? parseInt(yearMatches[0], 10) : new Date().getFullYear();
  const endYr = yearMatches && yearMatches[1] ? parseInt(yearMatches[1], 10) : (startYr + 1);

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

  // Ensure 3 terms exist for this year with year-matched dates
  let yearTerms = SCHOOL_TERMS.filter(t => t.yearId === targetSyId);
  if (yearTerms.length === 0) {
    const baseId = Date.now();
    const newTerms = [
      { id: baseId + 1, yearId: targetSyId, termName: '1st Sem', startDate: `${startYr}-08-16`, endDate: `${startYr}-12-17`, status: 'active', isActive: isActiveVal },
      { id: baseId + 2, yearId: targetSyId, termName: '2nd Sem', startDate: `${endYr}-01-10`, endDate: `${endYr}-05-26`, status: 'draft',  isActive: false },
      { id: baseId + 3, yearId: targetSyId, termName: 'Summer',  startDate: `${endYr}-06-05`, endDate: `${endYr}-07-21`, status: 'draft',  isActive: false }
    ];
    SCHOOL_TERMS.push(...newTerms);
    yearTerms = newTerms;
  } else {
    yearTerms.forEach(t => {
      if (t.termName === '1st Sem') {
        t.startDate = `${startYr}-08-16`;
        t.endDate = `${startYr}-12-17`;
        if (isActiveVal) t.isActive = true;
      } else if (t.termName === '2nd Sem') {
        t.startDate = `${endYr}-01-10`;
        t.endDate = `${endYr}-05-26`;
      } else if (t.termName === 'Summer') {
        t.startDate = `${endYr}-06-05`;
        t.endDate = `${endYr}-07-21`;
      }
    });
  }

  if (isActiveVal) {
    const term1 = yearTerms.find(t => t.termName === '1st Sem') || yearTerms[0];
    SCHOOL_TERMS.forEach(t => {
      t.isActive = (t.id === term1.id);
    });
  }

  saveStateToStorage();
  closeSchoolYearModal();
  refreshAllSchedulingViews();

  // Try API sync if connected
  fetch('api/schedules.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'save_school_year', year_id: idVal ? targetSyId : 0, year_code: codeVal, is_active: isActiveVal, terms: yearTerms })
  }).catch(() => {});
}

function setActiveSchoolYear(id) {
  SCHOOL_YEARS.forEach(y => y.isActive = (y.id === id));

  // Auto-activate the 1st Sem of this school year
  const yearTerms = SCHOOL_TERMS.filter(t => t.yearId === id);
  if (yearTerms.length > 0) {
    const term1 = yearTerms.find(t => t.termName === '1st Sem') || yearTerms[0];
    SCHOOL_TERMS.forEach(t => {
      t.isActive = (t.yearId === id && t.id === term1.id);
    });
  }

  saveStateToStorage();
  refreshAllSchedulingViews();

  fetch('api/schedules.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'set_active_year', year_id: id })
  }).catch(() => {});
}

// The year dropdowns change the shared active year, so confirm before switching
function handleActiveYearFilter(select) {
  const id = parseInt(select.value, 10);
  const target = SCHOOL_YEARS.find(y => y.id === id);
  if (!target || !confirm(`Switch the active school year to ${target.yearCode}?\n\nThis changes it for all users, not just this view.`)) {
    syncAllSyFilters();
    return;
  }
  setActiveSchoolYear(id);
}
window.handleActiveYearFilter = handleActiveYearFilter;

function deleteSchoolYear(id) {
  if (SCHOOL_YEARS.length <= 1) {
    alert('At least one school year must remain in the system.');
    return;
  }
  if (!confirm('Are you sure you want to delete this school year?')) return;
  SCHOOL_YEARS = SCHOOL_YEARS.filter(y => y.id !== id);
  if (!SCHOOL_YEARS.some(y => y.isActive)) SCHOOL_YEARS[0].isActive = true;
  saveStateToStorage();
  renderSchoolYearTable();

  fetch('api/schedules.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete_school_year', year_id: id })
  }).catch(() => {});
}

/* ══════════════════════════════════════════════════════════════════════════
   STEP 2: SCHOOL TERM MANAGEMENT
   ══════════════════════════════════════════════════════════════════════════ */

function renderSchoolTermTable() {
  const tbody = document.getElementById('schoolTermTableBody');
  if (!tbody) return;

  const activeSy = SCHOOL_YEARS.find(y => y.isActive) || SCHOOL_YEARS[0];
  const syLabel = document.getElementById('termActiveSyLabel');
  if (syLabel && activeSy) syLabel.textContent = activeSy.yearCode;

  if (!activeSy) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-secondary);">No active school year selected.</td></tr>`;
    return;
  }

  // Ensure terms exist for this active year
  let terms = SCHOOL_TERMS.filter(t => t.yearId === activeSy.id);
  if (terms.length === 0) {
    const yearMatches = (activeSy.yearCode || '').match(/\b(20\d{2})\b/g);
    const startYr = yearMatches && yearMatches[0] ? parseInt(yearMatches[0], 10) : 2027;
    const endYr = yearMatches && yearMatches[1] ? parseInt(yearMatches[1], 10) : (startYr + 1);
    const baseId = Date.now();
    terms = [
      { id: baseId + 1, yearId: activeSy.id, termName: '1st Sem', startDate: `${startYr}-08-16`, endDate: `${startYr}-12-17`, status: 'active', isActive: true },
      { id: baseId + 2, yearId: activeSy.id, termName: '2nd Sem', startDate: `${endYr}-01-10`, endDate: `${endYr}-05-26`, status: 'draft',  isActive: false },
      { id: baseId + 3, yearId: activeSy.id, termName: 'Summer',  startDate: `${endYr}-06-05`, endDate: `${endYr}-07-21`, status: 'draft',  isActive: false }
    ];
    SCHOOL_TERMS.push(...terms);
    saveStateToStorage();
  }

  const activeTerm = terms.find(t => t.isActive) || terms[0];
  const sub2 = document.getElementById('stepSub-2');
  if (sub2 && activeTerm) sub2.textContent = activeTerm.termName;

  tbody.innerHTML = terms.map(term => {
    let statusPill = '';
    if (term.status === 'active') {
      statusPill = `<span class="badge" style="background:#DEF7EC; color:#03543F; font-weight:800; font-size:11px;">Active</span>`;
    } else if (term.status === 'closed') {
      statusPill = `<span class="badge" style="background:#F3F4F6; color:#4B5563; font-weight:700; font-size:11px;">Closed</span>`;
    } else {
      statusPill = `<span class="badge" style="background:#FEF3C7; color:#92400E; font-weight:700; font-size:11px;">Draft</span>`;
    }

    const cycleBadge = term.isActive
      ? `<span class="badge" style="background:#DBEAFE; color:#1E40AF; font-weight:800; font-size:11px;">Current Working Term</span>`
      : `<button class="btn btn-outline" onclick="setActiveSchoolTerm(${term.id})" style="font-size:11px; padding:3px 8px;">Switch to Term</button>`;

    return `
      <tr>
        <td style="font-weight:700; color:var(--text-primary); font-size:13.5px;">${escapeHtml(term.termName)}</td>
        <td>${escapeHtml(term.startDate || '2026-08-17')}</td>
        <td>${escapeHtml(term.endDate || '2026-12-18')}</td>
        <td>${statusPill}</td>
        <td>${cycleBadge}</td>
        <td style="text-align:right;">
          <div style="display:inline-flex; gap:6px;">
            <select onchange="updateTermStatusDirectly(${term.id}, this.value)" style="padding:3px 6px; font-size:11px;">
              <option value="draft" ${term.status === 'draft' ? 'selected' : ''}>Draft</option>
              <option value="active" ${term.status === 'active' ? 'selected' : ''}>Active</option>
              <option value="closed" ${term.status === 'closed' ? 'selected' : ''}>Closed</option>
            </select>
            <button class="btn btn-outline" onclick="openEditTermModal(${term.id})" style="font-size:11px; padding:3px 8px;">Edit Dates</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function updateTermStatusDirectly(termId, newStatus) {
  const term = SCHOOL_TERMS.find(t => t.id === termId);
  if (term) {
    term.status = newStatus;
    saveStateToStorage();
    renderSchoolTermTable();

    fetch('api/schedules.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_term', term_id: term.id, status: newStatus, term_name: term.termName, start_date: term.startDate, end_date: term.endDate })
    }).catch(() => {});
  }
}

function setActiveSchoolTerm(termId) {
  const targetTerm = SCHOOL_TERMS.find(t => t.id === termId);
  if (!targetTerm) return;

  // Make sure parent year is active
  SCHOOL_YEARS.forEach(y => y.isActive = (y.id === targetTerm.yearId));
  SCHOOL_TERMS.forEach(t => t.isActive = (t.id === termId));

  saveStateToStorage();
  refreshAllSchedulingViews();

  fetch('api/schedules.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'set_active_term', term_id: termId })
  }).catch(() => {});
}

function openEditTermModal(termId) {
  const term = SCHOOL_TERMS.find(t => t.id === termId);
  if (!term) return;
  document.getElementById('termEditId').value = term.id;
  document.getElementById('termNameSelect').value = term.termName;
  document.getElementById('termStartDateInput').value = term.startDate || '2026-08-17';
  document.getElementById('termEndDateInput').value = term.endDate || '2026-12-18';
  document.getElementById('termStatusSelect').value = term.status || 'draft';
  document.getElementById('termModal').style.display = 'flex';
}

function closeTermModal() {
  const modal = document.getElementById('termModal');
  if (modal) modal.style.display = 'none';
}

function submitTermModal() {
  const termId = parseInt(document.getElementById('termEditId').value, 10);
  const nameVal = document.getElementById('termNameSelect').value;
  const startVal = document.getElementById('termStartDateInput').value;
  const endVal = document.getElementById('termEndDateInput').value;
  const statusVal = document.getElementById('termStatusSelect').value;

  if (!startVal || !endVal || endVal <= startVal) {
    alert('The term end date must be after its start date.');
    return;
  }

  const term = SCHOOL_TERMS.find(t => t.id === termId);
  if (term) {
    term.termName = nameVal;
    term.startDate = startVal;
    term.endDate = endVal;
    term.status = statusVal;
  }

  saveStateToStorage();
  closeTermModal();
  renderSchoolTermTable();

  fetch('api/schedules.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'save_term', term_id: termId, term_name: nameVal, start_date: startVal, end_date: endVal, status: statusVal })
  }).catch(() => {});
}

/* ══════════════════════════════════════════════════════════════════════════
   STEP 3: LOAD SUBJECTS & CURRICULUM
   ══════════════════════════════════════════════════════════════════════════ */

function updateCurriculumTermFilter() {
  const sel = document.getElementById('curriculumTermFilter');
  if (!sel) return;
  const activeSy = SCHOOL_YEARS.find(y => y.isActive) || SCHOOL_YEARS[0];
  const terms = SCHOOL_TERMS.filter(t => !activeSy || t.yearId === activeSy.id);
  const activeTerm = terms.find(t => t.isActive) || terms[0];

  const currentVal = sel.value;
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

function renderSubjectOfferingTable() {
  const tbody = document.getElementById('subjectOfferingTableBody');
  if (!tbody) return;

  const termFilter = document.getElementById('curriculumTermFilter')?.value || 'all';
  const progFilter = document.getElementById('curriculumProgFilter')?.value || 'all';
  const yrFilter = document.getElementById('curriculumYearFilter')?.value || 'all';
  const revFilter = document.getElementById('curriculumRevisionFilter')?.value || 'all';

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
  if (revFilter !== 'all') {
    list = list.filter(s => s.curriculum === revFilter);
  }

  const countLabel = document.getElementById('subjectOfferingCountLabel');
  const includedCount = list.filter(s => s.isIncluded).length;
  if (countLabel) {
    countLabel.textContent = `Showing ${list.length} subject${list.length === 1 ? '' : 's'} (${includedCount} included, ${list.length - includedCount} excluded)`;
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:24px; color:var(--text-secondary);">No subjects found matching filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(subj => {
    let typeBadge = '';
    if (subj.type === 'lab') {
      typeBadge = `<span class="badge" style="background:#DEF7EC; color:#03543F; font-size:10.5px; font-weight:700;">Laboratory</span>`;
    } else if (subj.type === 'pe') {
      typeBadge = `<span class="badge" style="background:#FEF3C7; color:#92400E; font-size:10.5px; font-weight:700;">PE</span>`;
    } else if (subj.type === 'special') {
      typeBadge = `<span class="badge" style="background:#F3E8FF; color:#6B21A8; font-size:10.5px; font-weight:700;">Special / NSTP</span>`;
    } else {
      typeBadge = `<span class="badge" style="background:#DBEAFE; color:#1E40AF; font-size:10.5px; font-weight:700;">Lecture</span>`;
    }

    return `
      <tr style="${!subj.isIncluded ? 'opacity:0.55; background:#FAFAFA;' : ''}">
        <td style="text-align:center;">
          <input type="checkbox" ${subj.isIncluded ? 'checked' : ''} onchange="toggleSubjectInclusion(${subj.id}, this.checked)" style="width:16px; height:16px; cursor:pointer;" />
        </td>
        <td style="font-weight:700; color:var(--accent-primary); font-size:13px;">${escapeHtml(subj.code)}</td>
        <td style="font-weight:600; color:var(--text-primary);">${escapeHtml(subj.name)}</td>
        <td><strong>${subj.units}</strong></td>
        <td>${typeBadge}</td>
        <td>${subj.lecHours || 3}h</td>
        <td>${subj.labHours || 0}h</td>
        <td><span class="badge" style="background:#F3F4F6; color:#374151; font-size:10.5px;">${escapeHtml(subj.program)}</span></td>
        <td>Year ${subj.year}</td>
        <td style="text-align:right;">
          <div style="display:inline-flex; gap:6px;">
            <button class="btn btn-outline" onclick="openEditCurriculumSubjectModal(${subj.id})" style="font-size:11px; padding:3px 7px;">Edit</button>
            <button class="btn btn-outline" onclick="deleteSubjectOffering(${subj.id})" style="font-size:11px; padding:3px 7px; color:#DC2626; border-color:#FCA5A5;">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function toggleSubjectInclusion(id, isIncluded) {
  const subj = CURRICULUM_SUBJECTS.find(s => s.id === id);
  if (subj) {
    subj.isIncluded = isIncluded;
    saveStateToStorage();
    renderSubjectOfferingTable();

    fetch('api/schedules.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_term_subject', subject_id: id })
    }).catch(() => {});
  }
}

function toggleAllSubjectInclusion(status) {
  CURRICULUM_SUBJECTS.forEach(s => s.isIncluded = status);
  saveStateToStorage();
  renderSubjectOfferingTable();

  fetch('api/schedules.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'set_all_subjects_included', is_included: status })
  }).catch(() => {});
}

function openAddCurriculumSubjectModal() {
  document.getElementById('curricSubjModalTitle').textContent = 'Add Curriculum Subject';
  document.getElementById('curricSubjEditId').value = '';
  document.getElementById('curricSubjCode').value = '';
  document.getElementById('curricSubjName').value = '';
  document.getElementById('curricSubjUnits').value = '3';
  document.getElementById('curricSubjLecHrs').value = '3';
  document.getElementById('curricSubjLabHrs').value = '0';
  document.getElementById('curricSubjType').value = 'lecture';
  document.getElementById('curricSubjProgram').value = 'BSIT';
  document.getElementById('curricSubjYear').value = '1';
  openSubjectFormProfessors('curricSubj', '');
  document.getElementById('manualSubjectModal').style.display = 'flex';
}

function openEditCurriculumSubjectModal(id) {
  const subj = CURRICULUM_SUBJECTS.find(s => s.id === id);
  if (!subj) return;
  document.getElementById('curricSubjModalTitle').textContent = 'Edit Curriculum Subject';
  document.getElementById('curricSubjEditId').value = subj.id;
  document.getElementById('curricSubjCode').value = subj.code;
  document.getElementById('curricSubjName').value = subj.name;
  document.getElementById('curricSubjUnits').value = subj.units || 3;
  document.getElementById('curricSubjLecHrs').value = subj.lecHours || 3;
  document.getElementById('curricSubjLabHrs').value = subj.labHours || 0;
  document.getElementById('curricSubjType').value = subj.type || 'lecture';
  document.getElementById('curricSubjProgram').value = subj.program || 'BSIT';
  document.getElementById('curricSubjYear').value = String(subj.year || 1);
  openSubjectFormProfessors('curricSubj', subj.code);
  document.getElementById('manualSubjectModal').style.display = 'flex';
}

function closeAddSubjectModal() {
  const modal = document.getElementById('manualSubjectModal');
  if (modal) modal.style.display = 'none';
}

function submitAddSubjectModal() {
  const idVal = document.getElementById('curricSubjEditId').value;
  const code = document.getElementById('curricSubjCode').value.trim();
  const name = document.getElementById('curricSubjName').value.trim();
  const units = parseInt(document.getElementById('curricSubjUnits').value, 10) || 3;
  const lecHrs = parseFloat(document.getElementById('curricSubjLecHrs').value) || 0;
  const labHrs = parseFloat(document.getElementById('curricSubjLabHrs').value) || 0;
  const type = document.getElementById('curricSubjType').value;
  const program = document.getElementById('curricSubjProgram').value;
  const year = parseInt(document.getElementById('curricSubjYear').value, 10) || 1;

  if (!code || !name) {
    alert('Please enter both subject code and subject name.');
    return;
  }

  const curricQualProblem = subjectFormRemovalProblem('curricSubj', code);
  if (curricQualProblem) {
    alert(curricQualProblem);
    return;
  }

  const curricProblem = INPUT_RULES.code('Subject code', code) || INPUT_RULES.text('Subject name', name)
    || INPUT_RULES.int('Units', document.getElementById('curricSubjUnits').value, 1, 6)
    || INPUT_RULES.hours('Lecture hours', document.getElementById('curricSubjLecHrs').value)
    || INPUT_RULES.hours('Lab hours', document.getElementById('curricSubjLabHrs').value);
  if (curricProblem) {
    alert(curricProblem);
    return;
  }

  let newSubjectTermId;
  if (idVal) {
    const subj = CURRICULUM_SUBJECTS.find(s => s.id === parseInt(idVal, 10));
    if (subj) {
      subj.code = code;
      subj.name = name;
      subj.units = units;
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

  const subjectSaved = fetch('api/schedules.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'save_term_subject',
      subject_id: idVal,
      term_id: newSubjectTermId,
      subject_code: code,
      subject_name: name,
      units,
      lecture_hours: lecHrs,
      lab_hours: labHrs,
      subject_type: type,
      program,
      year_level: year,
      curriculum: '2024 Revised',
      is_included: 1
    })
  }).catch(() => {});

  saveSubjectFormProfessors('curricSubj', code, subjectSaved);
}

function deleteSubjectOffering(id) {
  if (!confirm('Are you sure you want to remove this subject from the term curriculum?')) return;
  CURRICULUM_SUBJECTS = CURRICULUM_SUBJECTS.filter(s => s.id !== id);
  saveStateToStorage();
  renderSubjectOfferingTable();

  fetch('api/schedules.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete_term_subject', subject_id: id })
  }).catch(() => {});
}

/* ══════════════════════════════════════════════════════════════════════════
   STEP 4: VALIDATE RESOURCES
   ══════════════════════════════════════════════════════════════════════════ */

/* ==================== Resource Readiness Evaluation Engine ==================== */
function evaluateResourceReadiness() {
  const lecRooms = (typeof ROOMS !== 'undefined' ? ROOMS : []).filter(r => r.type === 'Lecture');
  const labRooms = (typeof ROOMS !== 'undefined' ? ROOMS : []).filter(r => r.type === 'CompLab');
  const specialRooms = (typeof ROOMS !== 'undefined' ? ROOMS : []).filter(r => r.type === 'Special');
  const kitchenRooms = (typeof ROOMS !== 'undefined' ? ROOMS : []).filter(r => (r.code && r.code.toLowerCase().includes('kitchen')) || (r.name && r.name.toLowerCase().includes('kitchen')));
  const tourismRooms = (typeof ROOMS !== 'undefined' ? ROOMS : []).filter(r => (r.code && r.code.toLowerCase().includes('tourism')) || (r.name && r.name.toLowerCase().includes('tourism')));

  const { activeSy, activeTerm } = getActiveAcademicContext();

  const includedSubjects = CURRICULUM_SUBJECTS.filter(s => s.isIncluded && s.termId === activeTerm.id);
  const compLabSubjects = includedSubjects.filter(s => s.type === 'lab' || (s.labHours && s.labHours > 0));
  const culinarySubjects = includedSubjects.filter(s => s.program === 'BSHM' && (s.type === 'special' || (s.code && s.code.includes('HM'))));
  const tourismSubjects = includedSubjects.filter(s => s.program === 'BSTM' && (s.type === 'special' || (s.code && s.code.includes('TM'))));

  const totalMaxLoad = (typeof FACULTY !== 'undefined' ? FACULTY : []).reduce((sum, f) => sum + (f.maxLoad || 24), 0);
  const totalRequiredHours = includedSubjects.reduce((sum, s) => sum + subjectWeeklyMinutes(s) / 60, 0);

  function checkSubjectHasQualifiedFaculty(subj) {
    return (typeof FACULTY !== 'undefined' ? FACULTY : []).some(f => isFacultyQualified(f, subj.code));
  }

  const unqualifiedSubjects = includedSubjects.filter(s => !checkSubjectHasQualifiedFaculty(s));
  const overloadedTeachers = (typeof FACULTY !== 'undefined' ? FACULTY : []).filter(f => facultyWeeklyHours(f.name) > (f.maxLoad || 24));

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
      desc: `BSHM curriculum requires specialized culinary lab for ${culinarySubjects.length} course(s), but NO kitchen lab is registered!`
    });
    criticalReasons.push(`Missing Commercial Kitchen Lab for ${culinarySubjects.length} culinary courses.`);
  } else if (tourismSubjects.length > 0 && tourismRooms.length === 0) {
    checks.push({
      status: 'warning',
      title: 'Missing Room Type: Tourism Mock Center',
      desc: `BSTM curriculum requires specialized tourism mock center for ${tourismSubjects.length} course(s), but none is registered.`
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
      desc: `No faculty member has these ${uniqueUnqualifiedCodes.length} subject(s) in their main qualifications: ${uniqueUnqualifiedCodes.join(', ')}.`
    });
    criticalReasons.push(`Insufficient professors: ${uniqueUnqualifiedCodes.length} course(s) lack qualified faculty (${uniqueUnqualifiedCodes.join(', ')}).`);
  } else if (totalMaxLoad < totalRequiredHours) {
    checks.push({
      status: 'critical',
      title: 'Insufficient Total Teaching Capacity',
      desc: `Total faculty load limit is ${totalMaxLoad} hours, but included curriculum courses require ${totalRequiredHours} hours. Please assign more professors.`
    });
    criticalReasons.push(`Insufficient faculty capacity: ${totalRequiredHours} hours needed vs ${totalMaxLoad} hours total max faculty capacity.`);
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
    totalRequiredHours
  };
}

function renderResourceValidation() {
  const roomTbody = document.getElementById('valRoomTableBody');
  const facTbody = document.getElementById('valFacultyTableBody');
  const checkContainer = document.getElementById('readinessChecklistContainer');
  const badgeContainer = document.getElementById('readinessStatusBadge');
  const btnStep5 = document.getElementById('btnProceedToStep5');

  const readiness = evaluateResourceReadiness();

  const elLec = document.getElementById('valLecRoomsCount');
  if (elLec) elLec.textContent = `${readiness.lecRoomsCount} Lecture Room${readiness.lecRoomsCount === 1 ? '' : 's'}`;

  const elLab = document.getElementById('valLabRoomsCount');
  if (elLab) elLab.textContent = `${readiness.labRoomsCount} Labs`;

  const totalCurrentLoad = (typeof FACULTY !== 'undefined' ? FACULTY : []).reduce((sum, f) => sum + facultyWeeklyHours(f.name), 0);
  const elFac = document.getElementById('valFacultyCapacity');
  if (elFac) elFac.textContent = `${readiness.totalMaxLoad} Hours Max (${totalCurrentLoad.toFixed(1)} Assigned)`;

  // Populate Room Table
  if (roomTbody && typeof ROOMS !== 'undefined') {
    roomTbody.innerHTML = ROOMS.map(r => `
      <tr>
        <td style="font-weight:700; color:var(--accent-primary);">${escapeHtml(r.code)}</td>
        <td><span class="badge" style="font-size:10.5px;">${escapeHtml(r.type)}</span></td>
        <td>${r.cap} seats</td>
        <td><span style="color:#10B981; font-weight:700;">Ready (${r.floor || '1F'})</span></td>
      </tr>
    `).join('');
  }

  // Populate Faculty Table
  if (facTbody && typeof FACULTY !== 'undefined') {
    facTbody.innerHTML = FACULTY.map(f => {
      const weeklyHours = facultyWeeklyHours(f.name);
      const isOverloaded = weeklyHours > (f.maxLoad || 24);
      return `
        <tr>
          <td style="font-weight:700; color:var(--text-primary);">${escapeHtml(f.name)}</td>
          <td><span class="badge" style="font-size:10.5px;">${escapeHtml(f.dept || 'IT / CS')}</span></td>
          <td style="${isOverloaded ? 'color:#DC2626; font-weight:800;' : ''}">${weeklyHours.toFixed(1)} hrs</td>
          <td>${f.maxLoad || 24} hrs max</td>
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
          <div style="font-weight:700; font-size:12.5px; color:${c.status === 'critical' ? '#991B1B' : (c.status === 'warning' ? '#92400E' : '#065F46')};">
            ${escapeHtml(c.title)}
          </div>
          <div style="font-size:12px; color:var(--text-secondary); margin-top:1px;">
            ${escapeHtml(c.desc)}
          </div>
        </div>
      </div>
    `).join('');
  }

  if (badgeContainer) {
    if (readiness.hasCritical) {
      badgeContainer.innerHTML = `<span class="badge" style="background:#FEE2E2; color:#991B1B; font-size:12px; font-weight:800;">&times; Critical Resource Error</span>`;
    } else if (readiness.hasWarning) {
      badgeContainer.innerHTML = `<span class="badge" style="background:#FEF3C7; color:#92400E; font-size:12px; font-weight:800;">&#9888; Ready with Warnings</span>`;
    } else {
      badgeContainer.innerHTML = `<span class="badge" style="background:#DEF7EC; color:#03543F; font-size:12px; font-weight:800;">&check; Ready to Schedule</span>`;
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
        alert('Cannot proceed to Step 5 (Create Sections):\n\nPlease resolve the critical professor/room shortages listed in the readiness checklist above.');
      } else {
        goToScheduleStep(5);
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
  const termSections = (typeof ACADEMIC_SECTIONS !== 'undefined' ? ACADEMIC_SECTIONS : []).filter(s => s.termId === activeTerm.id);

  if (termSections.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:28px 16px; color:var(--text-secondary);"><div style="font-size:15px; font-weight:700; color:var(--text-primary); margin-bottom:6px;">No sections created for ${escapeHtml(activeTerm.termName)} (${escapeHtml(activeSy.yearCode)})</div><div>Click <strong>"+ Add Section"</strong> to create sections for this term.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = termSections.map(sec => {
    // Count attached included curriculum subjects
    const attachedCount = CURRICULUM_SUBJECTS.filter(s => s.isIncluded && s.program === sec.program && s.year === sec.year && s.termId === activeTerm.id).length;

    return `
      <tr>
        <td style="font-weight:800; color:var(--accent-primary); font-size:13.5px;">${escapeHtml(sec.code)}</td>
        <td style="font-weight:700; color:var(--text-primary);">${escapeHtml(sec.name)}</td>
        <td><span class="badge" style="background:#F3F4F6; color:#374151; font-size:11px;">${escapeHtml(sec.program)}</span></td>
        <td>Year ${sec.year}</td>
        <td><span class="badge" style="${sec.shift === 'PM' ? 'background:#FEF3C7; color:#92400E;' : (sec.shift === 'MIDSHIFT' ? 'background:#EDE9FE; color:#5B21B6;' : 'background:#E0F2FE; color:#0369A1;')} font-size:11px; font-weight:700;">${escapeHtml(sec.shift || 'AM')}</span></td>
        <td><strong>${sec.studentCount}</strong> students</td>
        <td><span class="badge" style="background:#EFF6FF; color:#1D4ED8; font-size:11px;">${attachedCount} subject${attachedCount === 1 ? '' : 's'}</span></td>
        <td style="color:var(--text-secondary); font-size:12px;">${escapeHtml(sec.adviser || '—')}</td>
        <td style="text-align:right;">
          <div style="display:inline-flex; gap:6px;">
            <button class="btn btn-outline" onclick="openEditSectionModal(${sec.id})" style="font-size:11px; padding:3px 7px;">Edit</button>
            <button class="btn btn-outline" onclick="openSplitSectionModal(${sec.id})" style="font-size:11px; padding:3px 7px;">Split</button>
            <button class="btn btn-outline" onclick="openMergeSectionsModal(${sec.id})" style="font-size:11px; padding:3px 7px;">Merge</button>
            <button class="btn btn-outline" onclick="deleteSectionItem(${sec.id})" style="font-size:11px; padding:3px 7px; color:#DC2626; border-color:#FCA5A5;">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function executeQuickGenerateSections() {
  const { activeSy, activeTerm } = getActiveAcademicContext();
  const prog = document.getElementById('quickSecProg').value;
  const yr = parseInt(document.getElementById('quickSecYear').value, 10);
  const count = parseInt(document.getElementById('quickSecCount').value, 10) || 2;
  const students = parseInt(document.getElementById('quickSecStudents').value, 10) || 38;

  const quickProblem = INPUT_RULES.int('Number of sections', document.getElementById('quickSecCount').value, 1, 10)
    || INPUT_RULES.int('Students per section', document.getElementById('quickSecStudents').value, 15, 50);
  if (quickProblem) {
    alert(quickProblem);
    return;
  }

  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

  for (let i = 0; i < count; i++) {
    const letter = letters[i] || String(i + 1);
    const code = `${prog.substring(2) || prog}${yr}0${i + 1}M`;
    const name = `${prog} ${yr}${letter}`;

    // Avoid duplicate code
    if (!ACADEMIC_SECTIONS.some(s => s.code === code && s.termId === activeTerm.id)) {
      const newId = ACADEMIC_SECTIONS.length ? Math.max(...ACADEMIC_SECTIONS.map(s => s.id)) + 1 : 1;
      ACADEMIC_SECTIONS.push({
        id: newId,
        termId: activeTerm.id,
        code,
        name,
        program: prog,
        year: yr,
        studentCount: students,
        adviser: '',
        shift: 'AM'
      });
    }
  }

  saveStateToStorage();
  renderSectionsTable();
  updateSectionDropdown();
  renderGrid();
  updateScheduleStats();
  updateSectionDropdown();
  updateScheduleStats();

  fetch('api/schedules.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'auto_generate_sections',
      programs: [prog],
      years: [yr],
      sections_per_group: count,
      students_per_section: students,
      term_id: activeTerm.id
    })
  }).catch(() => {});

  alert(`Generated ${count} sections for ${prog} Year ${yr}.`);
}

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
  const yrLabel = yr === 'all' ? 'All Years' : `Year ${yr}`;
  label.textContent = `Preview: Will generate ${secCount} section${secCount > 1 ? 's' : ''} (~${stuPerSec} students each) for ${progLabel} (${yrLabel}).`;
}

function submitAutoGenerateSections() {
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

  const targetProgs = progVal === 'all' ? ['BSIT', 'BSCS', 'BSCpE', 'BSHM', 'BSTM', 'BSBA'] : [progVal];
  const targetYears = yrVal === 'all' ? [1, 2, 3, 4] : [parseInt(yrVal, 10)];

  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  let createdCount = 0;

  targetProgs.forEach(prog => {
    targetYears.forEach(yr => {
      for (let i = 0; i < countPerGroup; i++) {
        const letter = letters[i] || String(i + 1);
        const code = `${prog.substring(2) || prog}${yr}0${i + 1}M`;
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
            adviser: '',
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

  fetch('api/schedules.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'auto_generate_sections',
      programs: targetProgs,
      years: targetYears,
      sections_per_group: countPerGroup,
      students_per_section: studentsPerSec,
      term_id: activeTerm.id,
      attach_curriculum: attachSubjs ? 1 : 0
    })
  }).catch(() => {});

  alert(`Academic sections generated (${createdCount} new created, ${ACADEMIC_SECTIONS.length} total sections configured).`);
}

function populateAdviserDropdown(selectedAdviser = '') {
  const sel = document.getElementById('secAdviserInput');
  if (!sel) return;
  const facultyList = (typeof FACULTY !== 'undefined' ? FACULTY.map(f => f.name) : []);
  const userList = (typeof USERS !== 'undefined' ? USERS.filter(u => !u.role || u.role === 'faculty' || u.role === 'program-head' || u.role === 'academic-head').map(u => u.name) : []);
  const uniqueNames = Array.from(new Set([...facultyList, ...userList])).filter(Boolean).sort();

  let html = '<option value="">-- Select Section Adviser --</option>';
  uniqueNames.forEach(name => {
    html += `<option value="${escapeHtml(name)}" ${name === selectedAdviser ? 'selected' : ''}>${escapeHtml(name)}</option>`;
  });

  if (selectedAdviser && !uniqueNames.includes(selectedAdviser)) {
    html += `<option value="${escapeHtml(selectedAdviser)}" selected>${escapeHtml(selectedAdviser)}</option>`;
  }

  sel.innerHTML = html;
  if (selectedAdviser) {
    sel.value = selectedAdviser;
  }
}

function openAddSectionModal() {
  document.getElementById('secModalTitle').textContent = 'Add Academic Section';
  document.getElementById('secEditId').value = '';
  document.getElementById('secCodeInput').value = '';
  document.getElementById('secNameInput').value = '';
  document.getElementById('secProgramInput').value = 'BSIT';
  document.getElementById('secYearInput').value = '1';
  document.getElementById('secStudentsInput').value = '35';
  if (document.getElementById('secShiftInput')) document.getElementById('secShiftInput').value = 'AM';
  populateAdviserDropdown();
  document.getElementById('sectionModal').style.display = 'flex';
}

function openEditSectionModal(id) {
  const sec = ACADEMIC_SECTIONS.find(s => s.id === id);
  if (!sec) return;
  document.getElementById('secModalTitle').textContent = 'Edit Academic Section';
  document.getElementById('secEditId').value = sec.id;
  document.getElementById('secCodeInput').value = sec.code;
  document.getElementById('secNameInput').value = sec.name;
  document.getElementById('secProgramInput').value = sec.program;
  document.getElementById('secYearInput').value = String(sec.year);
  document.getElementById('secStudentsInput').value = sec.studentCount;
  if (document.getElementById('secShiftInput')) document.getElementById('secShiftInput').value = sec.shift || 'AM';
  populateAdviserDropdown(sec.adviser || '');
  document.getElementById('sectionModal').style.display = 'flex';
}

function closeSectionModal() {
  const modal = document.getElementById('sectionModal');
  if (modal) modal.style.display = 'none';
}

function submitSectionModal() {
  const { activeSy, activeTerm } = getActiveAcademicContext();
  const idVal = document.getElementById('secEditId').value;
  const code = document.getElementById('secCodeInput').value.trim();
  const name = document.getElementById('secNameInput').value.trim();
  const prog = document.getElementById('secProgramInput').value;
  const yr = parseInt(document.getElementById('secYearInput').value, 10) || 1;
  const students = parseInt(document.getElementById('secStudentsInput').value, 10) || 35;
  const adviser = document.getElementById('secAdviserInput').value.trim();
  const shift = document.getElementById('secShiftInput') ? document.getElementById('secShiftInput').value : 'AM';

  if (!code || !name) {
    alert('Please enter both Section Code and Section Name.');
    return;
  }

  const sectionProblem = INPUT_RULES.code('Section code', code) || INPUT_RULES.text('Section name', name)
    || INPUT_RULES.int('Student count', document.getElementById('secStudentsInput').value, 1, 60);
  if (sectionProblem) {
    alert(sectionProblem);
    return;
  }

  // An adviser can't teach their own section, so they can't take over one they already teach
  const savedSection = idVal ? ACADEMIC_SECTIONS.find(s => s.id === parseInt(idVal, 10)) : null;
  const previousCode = savedSection ? savedSection.code : null;
  const adviserClash = savedSection && MASTER_SCHEDULE_DATA.find(c =>
    c.section === savedSection.code && c.termId === activeTerm.id && isSameProfessor(c.instructor, adviser));
  if (adviserClash) {
    alert(`${adviser} teaches ${adviserClash.subjectCode} for this section, so they can't be its adviser. Reassign that class first.`);
    return;
  }

  if (ACADEMIC_SECTIONS.some(s => s.termId === activeTerm.id && s.code.toLowerCase() === code.toLowerCase() && String(s.id) !== idVal)) {
    alert(`Section code ${code} already exists in this term.`);
    return;
  }

  if (idVal) {
    const sec = ACADEMIC_SECTIONS.find(s => s.id === parseInt(idVal, 10));
    if (sec) {
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
      sec.adviser = adviser;
      sec.shift = shift;
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
      adviser,
      shift
    });
  }

  saveStateToStorage();
  closeSectionModal();
  renderSectionsTable();
  updateSectionDropdown();
  renderGrid();
  updateScheduleStats();

  fetch('api/schedules.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'save_section',
      section_id: idVal,
      term_id: activeTerm.id,
      section_code: code,
      section_name: name,
      program: prog,
      year_level: yr,
      student_count: students,
      adviser,
      shift
    })
  }).catch(() => {});
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
    adviser: sec.adviser,
    shift: sec.shift || 'AM'
  });

  saveStateToStorage();
  closeSplitSectionModal();
  renderSectionsTable();
  updateSectionDropdown();
  renderGrid();
  updateScheduleStats();
  alert(`Section split into ${sec.code} (${sec.studentCount} students) and ${newCode} (${splitCount} students).`);

  fetch('api/schedules.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'split_section',
      section_id: secId,
      split_student_count: splitCount,
      new_section_code: newCode,
      new_section_name: newName
    })
  }).catch(() => {});
}

function openMergeSectionsModal(id) {
  const sec = ACADEMIC_SECTIONS.find(s => s.id === id);
  if (!sec) return;
  document.getElementById('mergePrimarySectionId').value = sec.id;
  document.getElementById('mergePromptDesc').textContent = `Select a secondary section to merge into ${sec.code} (${sec.name}).`;

  const sel = document.getElementById('mergeSecondarySectionSelect');
  const others = ACADEMIC_SECTIONS.filter(s => s.id !== id && s.program === sec.program && s.termId === sec.termId);
  if (others.length === 0) {
    alert(`No compatible sections in ${sec.program} to merge with.`);
    return;
  }

  sel.innerHTML = others.map(s => `
    <option value="${s.id}">${escapeHtml(s.code)} - ${escapeHtml(s.name)} (${s.studentCount} students)</option>
  `).join('');

  document.getElementById('mergeSectionsModal').style.display = 'flex';
}

function closeMergeSectionsModal() {
  const modal = document.getElementById('mergeSectionsModal');
  if (modal) modal.style.display = 'none';
}

function submitMergeSections() {
  const primaryId = parseInt(document.getElementById('mergePrimarySectionId').value, 10);
  const secId = parseInt(document.getElementById('mergeSecondarySectionSelect').value, 10);

  const sec1 = ACADEMIC_SECTIONS.find(s => s.id === primaryId);
  const sec2 = ACADEMIC_SECTIONS.find(s => s.id === secId);

  if (!sec1 || !sec2) return;

  if (sec1.studentCount + sec2.studentCount > 60) {
    alert(`Merging would make ${sec1.studentCount + sec2.studentCount} students. A section can have at most 60.`);
    return;
  }

  sec1.studentCount += sec2.studentCount;
  // Re-link any schedules from sec2 to sec1
  MASTER_SCHEDULE_DATA.forEach(item => {
    if (item.section === sec2.code) item.section = sec1.code;
  });

  ACADEMIC_SECTIONS = ACADEMIC_SECTIONS.filter(s => s.id !== secId);
  saveStateToStorage();
  closeMergeSectionsModal();
  renderSectionsTable();
  updateSectionDropdown();
  renderGrid();
  updateScheduleStats();
  alert(`Sections successfully merged into ${sec1.code}. Combined students: ${sec1.studentCount}.`);

  fetch('api/schedules.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'merge_sections',
      primary_section_id: primaryId,
      secondary_section_id: secId
    })
  }).catch(() => {});
}

function deleteSectionItem(id) {
  if (ACADEMIC_SECTIONS.length <= 1) {
    alert('At least one academic section must remain.');
    return;
  }
  const target = ACADEMIC_SECTIONS.find(s => s.id === id);
  const inSection = c => target && c.section === target.code && (!c.termId || c.termId === target.termId);
  const classCount = MASTER_SCHEDULE_DATA.filter(inSection).length;
  const warning = classCount > 0
    ? `Delete this section and its ${classCount} scheduled class${classCount === 1 ? '' : 'es'}? This can't be undone.`
    : 'Are you sure you want to delete this section?';
  if (!confirm(warning)) return;
  MASTER_SCHEDULE_DATA = MASTER_SCHEDULE_DATA.filter(c => !inSection(c));
  ACADEMIC_SECTIONS = ACADEMIC_SECTIONS.filter(s => s.id !== id);
  saveStateToStorage();
  renderSectionsTable();
  updateSectionDropdown();
  renderGrid();
  updateScheduleStats();

  fetch('api/schedules.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete_section', section_id: id })
  }).catch(() => {});
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

function executeGenerateBaseline() {
  closeConfirmRegenerateModal();
  const sectionsToSchedule = (typeof ACADEMIC_SECTIONS !== 'undefined' ? ACADEMIC_SECTIONS : []).filter(s => s.termId === (getActiveAcademicContext().activeTerm.id));

  if (sectionsToSchedule.length === 0) {
    const ctx = getActiveAcademicContext();
    alert(`No academic sections found for ${ctx.activeTerm.termName} (${ctx.activeSy.yearCode}).\n\nPlease go to Step 5 (Create Sections) to create sections before generating a schedule.`);
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
  updateRoomDropdown();
  updateTeacherDropdown();
  renderGrid();
  updateScheduleStats();

  const banner = document.getElementById('unassignedBanner');
  const list = document.getElementById('unassignedList');
  if (banner && list) {
    if (UNASSIGNED_CLASSES.length > 0) {
      list.innerHTML = UNASSIGNED_CLASSES.map(u => `
        <li><strong>${escapeHtml(u.section)} - ${escapeHtml(u.code)}:</strong> ${escapeHtml(u.reason)}</li>
      `).join('');
      banner.classList.add('show');
    } else {
      banner.classList.remove('show');
    }
  }

  // Persist to DB, then reload to pick up saved IDs and the Undo option
  saveTermSchedule('generate_baseline', activeTerm.id, newSchedules, { strict: true })
    .then(res => { if (res.ok && !IS_STANDALONE) loadServerState(); })
    .catch(() => alert('Could not reach the server, so this schedule exists only in this browser.'));

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
  if (!confirm(`Replace the current ${activeTerm.termName} schedule with the one saved before the last generate? You can undo this too.`)) return;
  const res = await fetch('api/schedules.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'restore_schedule', term_id: activeTerm.id, expected_version: activeTerm.scheduleVersion })
  });
  await loadServerState();
  if (res.ok) alert('The previous schedule has been restored.');
};

/* ─── Smart Constraint-Honoring Baseline Schedule Generator ─── */
// The AI draft passes seed to keep the classes it already placed
function generateSmartBaselineSchedules({ seed = [] } = {}) {
  UNASSIGNED_CLASSES = [];
  const schedules = [...seed];

  function fitsTeacherLoad(teacher, addedMinutes) {
    const usedMinutes = schedules
      .filter(c => c.instructor === teacher.name)
      .reduce((sum, c) => sum + timeToMinutes(c.endTime) - timeToMinutes(c.startTime), 0);
    return usedMinutes + addedMinutes <= (teacher.maxLoad || 24) * 60;
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


  function hasOverlap(day, start, end, room, teacher, section) {
    const sMin = timeToMinutes(start);
    const eMin = timeToMinutes(end);

    for (const b of schedules) {
      if (b.day !== day) continue;
      const bsMin = timeToMinutes(b.startTime);
      const beMin = timeToMinutes(b.endTime);

      const timesOverlap = sMin < beMin && eMin > bsMin;
      if (!timesOverlap) continue;

      if (b.room === room) return true; // Room overlap
      if (b.instructor === teacher) return true; // Teacher overlap
      if (b.section === section) return true; // Section overlap
    }
    return false;
  }

  const { activeSy, activeTerm } = getActiveAcademicContext();
  const sectionsToSchedule = (typeof ACADEMIC_SECTIONS !== 'undefined' ? ACADEMIC_SECTIONS : []).filter(s => s.termId === activeTerm.id);

  let schedCounter = 100;

  sectionsToSchedule.forEach(sec => {
    // Only the subjects included for this section in the active term
    const subjects = CURRICULUM_SUBJECTS.filter(s => s.isIncluded !== false && s.termId === activeTerm.id && s.program === sec.program && Number(s.year) === Number(sec.year));

    subjects.forEach((subj, subjIdx) => {
      if (seed.some(c => c.section === sec.code && c.subjectCode === subj.code)) return;
      let placed = false;

      // Determine eligible rooms based on subject type
      let candidateRooms = [];
      if (subj.type === 'lab' || (subj.labHours && subj.labHours > 0)) {
        if (sec.program === 'BSHM') {
          candidateRooms = ROOMS.filter(r => r.code.includes('Kitchen') || r.type === 'Special');
        } else if (sec.program === 'BSTM') {
          candidateRooms = ROOMS.filter(r => r.code.includes('Tourism') || r.type === 'Special');
        } else {
          candidateRooms = ROOMS.filter(r => r.type === 'CompLab');
        }
      } else if (subj.type === 'pe') {
        candidateRooms = ROOMS.filter(r => r.code === 'LR-103' || r.type === 'Lecture');
      } else {
        // Lecture
        candidateRooms = ROOMS.filter(r => r.type === 'Lecture' && r.cap >= sec.studentCount);
      }

      // If no room with enough capacity, fallback to largest lecture room
      if (candidateRooms.length === 0) {
        candidateRooms = ROOMS.filter(r => r.type === 'Lecture');
      }

      // Prefer rooms that seat the whole section; keep all candidates if none are big enough
      const roomsThatFit = candidateRooms.filter(r => r.cap >= sec.studentCount);
      if (roomsThatFit.length > 0) candidateRooms = roomsThatFit;

      // Determine candidate faculty
      // Check faculty qualified/allowable for this subject
      const targetSubjCode = (subj.code || '').toUpperCase();
      let candidateTeachers = FACULTY.filter(f => isFacultyQualified(f, targetSubjCode));
      const hasQualifiedFaculty = candidateTeachers.length > 0;

      // Ensure section adviser is not assigned to teach the section's classes
      const adviserNameClean = (sec.adviser || '').replace(/^(Prof\.|Dr\.|Engr\.|Chef)\s*/i, '').trim().toLowerCase();
      if (adviserNameClean) {
        const nonAdviserTeachers = candidateTeachers.filter(f => {
          const fClean = (f.name || '').replace(/^(Prof\.|Dr\.|Engr\.|Chef)\s*/i, '').trim().toLowerCase();
          return fClean !== adviserNameClean && !fClean.includes(adviserNameClean) && !adviserNameClean.includes(fClean);
        });
        candidateTeachers = nonAdviserTeachers;
      }

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

      // Meetings add up to the subject's full weekly hours
      const weeklyMinutes = subjectWeeklyMinutes(subj);
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

      // The least-loaded qualified professor goes first, so classes spread out
      const usedMinutes = t => schedules.filter(c => c.instructor === t.name)
        .reduce((sum, c) => sum + timeToMinutes(c.endTime) - timeToMinutes(c.startTime), 0);
      const teachersToTry = candidateTeachers
        .filter(t => fitsTeacherLoad(t, weeklyMinutes))
        .sort((a, b) => usedMinutes(a) - usedMinutes(b));

      const tryPlace = () => {
        for (const starts of [inShiftStarts, otherStarts]) {
          for (const days of dayPlans) {
            for (const start of starts) {
              const meetings = days.map((day, i) => ({ day, start, end: minutesToTime(timeToMinutes(start) + meetingLengths[i]) }));
              if (meetings.some(m => timeToMinutes(m.end) > LAST_GENERATED_MINUTE)) continue;
              for (const roomObj of candidateRooms) {
                for (const teacherObj of teachersToTry) {
                  const fits = meetings.every(m =>
                    !hasOverlap(m.day, m.start, m.end, roomObj.code, teacherObj.name, sec.code)
                    && !facultyAvailabilityProblem(teacherObj.name, m.day, m.start, m.end));
                  if (!fits) continue;
                  meetings.forEach((m, i) => {
                    schedCounter++;
                    schedules.push({
                      id: `SCH-${schedCounter}`,
                      termId: activeTerm.id,
                      section: sec.code,
                      program: sec.program,
                      year: String(sec.year),
                      subjectCode: subj.code,
                      subjectTitle: subj.name,
                      type: subj.type,
                      units: Math.round(((subj.units || 3) * meetingLengths[i] / weeklyMinutes) * 100) / 100,
                      room: roomObj.code,
                      instructor: teacherObj.name,
                      day: m.day,
                      startTime: m.start,
                      endTime: m.end
                    });
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

      if (!placed) {
        UNASSIGNED_CLASSES.push({
          section: sec.code,
          code: subj.code,
          reason: !hasQualifiedFaculty
            ? `No faculty member has ${subj.code} in their main qualifications.`
            : candidateTeachers.length === 0
              ? `The only professor qualified for ${subj.code} is this section's adviser, who cannot teach their own section.`
              : `No conflict-free ${weeklyMinutes / 60}-hour weekly schedule fits the room capacity (${sec.studentCount} seats), professor availability and teaching limits.`
        });
      }
    });
  });

  return schedules;
}

/* ══════════════════════════════════════════════════════════════════════════
   TIMETABLE VIEW RENDERING (SECTION, ROOM, TEACHER VIEWS)
   ══════════════════════════════════════════════════════════════════════════ */

function switchTimetableView(viewType = 'section') {
  CURRENT_TIMETABLE_VIEW = 'section';

  const fSec = document.getElementById('filterGroupSection');
  if (fSec) fSec.style.display = 'flex';

  renderGrid();
}

function setTimetableStyle(styleType = 'spreadsheet') {
  TIMETABLE_STYLE = styleType;
  const card = document.getElementById('sectionTimetableCard');
  if (card) {
    if (styleType === 'plain-print') {
      card.classList.add('plain-print-style');
    } else {
      card.classList.remove('plain-print-style');
    }
  }
}

function updateSectionDropdown() {
  const prog = document.getElementById('programFilter')?.value || 'all';
  const yr = document.getElementById('yearFilter')?.value || 'all';
  const secSelect = document.getElementById('sectionSelect');
  if (!secSelect) return;

  const { activeTerm } = getActiveAcademicContext();
  let list = (typeof ACADEMIC_SECTIONS !== 'undefined' ? ACADEMIC_SECTIONS : []).filter(s => !activeTerm || s.termId === activeTerm.id);
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

function updateRoomDropdown() {
  const roomSelect = document.getElementById('roomSelect');
  if (!roomSelect) return;

  roomSelect.innerHTML = ROOMS.map(r => `
    <option value="${escapeHtml(r.code)}" ${r.code === currentSelectedRoom ? 'selected' : ''}>
      ${escapeHtml(r.code)} (${escapeHtml(r.type)}, Cap: ${r.cap})
    </option>
  `).join('');
}

function updateTeacherDropdown() {
  const teacherSelect = document.getElementById('teacherSelect');
  if (!teacherSelect) return;

  teacherSelect.innerHTML = FACULTY.map(f => `
    <option value="${escapeHtml(f.name)}" ${f.name === currentSelectedTeacher ? 'selected' : ''}>
      ${escapeHtml(f.name)} (${escapeHtml(f.dept || 'IT')})
    </option>
  `).join('');
}

/* ─── Faculty Qualification & Department Eligibility Conflict Checker ─── */
// Matches the server's SHIFT_WINDOWS, in minutes from midnight
const SHIFT_WINDOWS = { AM: [420, 780], MIDSHIFT: [600, 960], PM: [780, 1230] };

// Generated classes finish by 7:00 PM
const LAST_GENERATED_MINUTE = 19 * 60;

function subjectWeeklyMinutes(subj) {
  const hours = (subj.lecHours || 0) + (subj.labHours || 0);
  return Math.round((hours || subj.units || 3) * 60);
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

function activeTermClasses() {
  const { activeTerm } = getActiveAcademicContext();
  return MASTER_SCHEDULE_DATA.filter(c => !c.termId || c.termId === activeTerm.id);
}

function classMinutes(c) {
  return timeToMinutes(c.endTime) - timeToMinutes(c.startTime);
}

function facultyWeeklyHours(name) {
  return activeTermClasses().filter(c => c.instructor === name).reduce((sum, c) => sum + classMinutes(c), 0) / 60;
}

// Subjects a section still needs hours for this term, with how many are scheduled
function sectionSubjectProgress(section) {
  const { activeTerm } = getActiveAcademicContext();
  const classes = activeTermClasses().filter(c => c.section === section.code);
  return CURRICULUM_SUBJECTS
    .filter(s => s.isIncluded !== false && s.termId === activeTerm.id && s.program === section.program && Number(s.year) === Number(section.year))
    .map(subject => ({
      subject,
      requiredMinutes: subjectWeeklyMinutes(subject),
      scheduledMinutes: classes.filter(c => (c.subjectCode || '').toUpperCase() === subject.code.toUpperCase()).reduce((sum, c) => sum + classMinutes(c), 0)
    }));
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
function facultyAvailabilityProblem(instructorName, day, startTime, endTime) {
  const fac = FACULTY.find(f => f.name && f.name.toLowerCase() === (instructorName || '').toLowerCase());
  if (!fac || fac.status !== 'Part-time' || !(fac.availableDays || []).length || !(fac.availableShifts || []).length) return null;
  if (isWithinAvailability(fac.availableDays, fac.availableShifts, day, startTime, endTime)) return null;
  return `Not Available: ${fac.name} only teaches ${fac.availableDays.join(', ')} during ${fac.availableShifts.join(', ')} shift`;
}

// Compares two professor names, ignoring titles such as Prof. or Engr.
function isSameProfessor(nameA, nameB) {
  const clean = name => (name || '').replace(/^(Prof\.|Dr\.|Engr\.|Chef)\s*/i, '').trim().toLowerCase();
  const a = clean(nameA);
  const b = clean(nameB);
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
}

function checkFacultySubjectConflict(instructorName, subjectCode, sectionCode) {
  if (!instructorName || instructorName === 'TBA' || instructorName === 'Unassigned') {
    return 'Instructor Unassigned';
  }

  // 1. Check Section Adviser conflict
  if (sectionCode && typeof ACADEMIC_SECTIONS !== 'undefined') {
    const sec = ACADEMIC_SECTIONS.find(s => s.code === sectionCode);
    if (sec && sec.adviser) {
      const advClean = (sec.adviser || '').replace(/^(Prof\.|Dr\.|Engr\.|Chef)\s*/i, '').trim().toLowerCase();
      const instClean = (instructorName || '').replace(/^(Prof\.|Dr\.|Engr\.|Chef)\s*/i, '').trim().toLowerCase();
      if (advClean && instClean && (advClean === instClean || advClean.includes(instClean) || instClean.includes(advClean))) {
        return `Adviser Conflict: Section adviser cannot teach ${sectionCode}`;
      }
    }
  }

  // 2. Check Faculty profile
  const fac = (typeof FACULTY !== 'undefined' ? FACULTY : []).find(f => f.name && f.name.toLowerCase() === instructorName.toLowerCase());
  if (!fac) {
    return `Unregistered Faculty: ${instructorName}`;
  }

  // Main qualifications are the only list of what a teacher may teach
  if (!isFacultyQualified(fac, subjectCode)) {
    return `Not Qualified: ${fac.name} does not have ${(subjectCode || '').toUpperCase()} in their main qualifications`;
  }

  return null;
}
window.checkFacultySubjectConflict = checkFacultySubjectConflict;

/* ─── Main Timetable Grid Renderer ─── */
function renderGrid() {
  const tbody = document.getElementById('sectionGridBody');
  if (!tbody) return;
  applyScheduleRole();
  if (!canEditSchedule() && ACTIVE_SCHEDULE_STEP !== 6) {
    goToScheduleStep(6);
    return;
  }

  const { activeSy, activeTerm } = getActiveAcademicContext();
  let filteredClasses = [];

  // Section View
  if (CURRENT_TIMETABLE_VIEW === 'section') {
    if (!currentSelectedSection) {
      document.getElementById('sheetProgramYear').textContent = `${activeTerm.termName} ${activeSy.yearCode}`;
      document.getElementById('sheetSectionTitle').textContent = 'No Section Selected';
      document.getElementById('sheetStatLabel1').textContent = 'Total Units';
      document.getElementById('sheetTotalUnits').textContent = '0';
      document.getElementById('sheetStatLabel2').textContent = '# of Students';
      document.getElementById('sheetStudentsCount').textContent = '0';
      document.getElementById('sheetStatLabel3').textContent = 'Adviser';
      document.getElementById('sheetAdviser').textContent = '—';
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:48px 16px; color:var(--text-secondary);"><div style="font-size:16px; font-weight:700; color:var(--text-primary); margin-bottom:8px;">No Sections Configured for ${escapeHtml(activeTerm.termName)} ${escapeHtml(activeSy.yearCode)}</div><div>Please go to <strong>Step 5 (Create Sections)</strong> to add or generate sections for this academic period.</div></td></tr>`;
      return;
    }
    filteredClasses = MASTER_SCHEDULE_DATA.filter(c => c.section === currentSelectedSection && (!c.termId || c.termId === activeTerm.id));

    const secMeta = ACADEMIC_SECTIONS.find(s => s.code === currentSelectedSection && s.termId === activeTerm.id) || ACADEMIC_SECTIONS.find(s => s.code === currentSelectedSection) || {
      code: currentSelectedSection,
      name: currentSelectedSection,
      program: 'BSIT',
      year: 1,
      studentCount: 38,
      adviser: 'Prof. Academic Head',
      shift: 'AM'
    };

    const totalUnits = filteredClasses.reduce((sum, c) => sum + (c.units || 0), 0);






    document.getElementById('sheetSectionTitle').textContent = secMeta.code;
    document.getElementById('sheetProgramYear').textContent = `${secMeta.program} \u2022 Year ${secMeta.year} (${secMeta.name}) \u2022 ${activeTerm.termName} ${activeSy.yearCode}`;
    document.getElementById('sheetStatLabel1').textContent = 'Total Units';
    document.getElementById('sheetTotalUnits').textContent = String(totalUnits);
    document.getElementById('sheetStatLabel2').textContent = '# of Students';
    document.getElementById('sheetStudentsCount').textContent = String(secMeta.studentCount || 35);
    document.getElementById('sheetStatLabel3').textContent = 'Adviser';
    document.getElementById('sheetAdviser').textContent = secMeta.adviser || '—';
  }
  // Room View
  else if (CURRENT_TIMETABLE_VIEW === 'room') {
    filteredClasses = MASTER_SCHEDULE_DATA.filter(c => c.room === currentSelectedRoom && (!c.termId || c.termId === activeTerm.id));

    const roomMeta = ROOMS.find(r => r.code === currentSelectedRoom) || { code: currentSelectedRoom, type: 'Lecture', cap: 45, floor: '1F' };
    const totalWeeklyMins = filteredClasses.reduce((sum, c) => sum + (timeToMinutes(c.endTime) - timeToMinutes(c.startTime)), 0);


    document.getElementById('sheetSectionTitle').textContent = roomMeta.code;
    document.getElementById('sheetProgramYear').textContent = `Room Timetable \u2022 ${roomMeta.code} (${roomMeta.type}) \u2022 ${activeTerm.termName} ${activeSy.yearCode}`;
    document.getElementById('sheetStatLabel1').textContent = 'Room Type';
    document.getElementById('sheetTotalUnits').textContent = roomMeta.type;
    document.getElementById('sheetStatLabel2').textContent = 'Capacity';
    document.getElementById('sheetStudentsCount').textContent = `${roomMeta.cap} Seats`;
    document.getElementById('sheetStatLabel3').textContent = 'Weekly Hours';
    document.getElementById('sheetAdviser').textContent = `${(totalWeeklyMins / 60).toFixed(1)} hrs`;
  }
  // Teacher View
  else if (CURRENT_TIMETABLE_VIEW === 'teacher') {
    filteredClasses = MASTER_SCHEDULE_DATA.filter(c => c.instructor === currentSelectedTeacher && (!c.termId || c.termId === activeTerm.id));

    const facMeta = FACULTY.find(f => f.name === currentSelectedTeacher) || { name: currentSelectedTeacher, dept: 'IT / CS', maxLoad: 24 };
    const totalUnits = filteredClasses.reduce((sum, c) => sum + (c.units || 0), 0);
    const totalWeeklyMins = filteredClasses.reduce((sum, c) => sum + (timeToMinutes(c.endTime) - timeToMinutes(c.startTime)), 0);


    document.getElementById('sheetSectionTitle').textContent = facMeta.name;
    document.getElementById('sheetProgramYear').textContent = `Faculty Schedule \u2022 ${facMeta.name} (${facMeta.dept || 'Faculty'}) \u2022 ${activeTerm.termName} ${activeSy.yearCode}`;
    document.getElementById('sheetStatLabel1').textContent = 'Teaching Load';
    document.getElementById('sheetTotalUnits').textContent = `${totalUnits} Units`;
    document.getElementById('sheetStatLabel2').textContent = 'Weekly Teaching';
    document.getElementById('sheetStudentsCount').textContent = `${(totalWeeklyMins / 60).toFixed(1)} hrs`;
    document.getElementById('sheetStatLabel3').textContent = 'Max Load';
    document.getElementById('sheetAdviser').textContent = `${facMeta.maxLoad || 24} hrs`;
  }

  tbody.innerHTML = timetableRowsHtml(filteredClasses, !canEditSchedule());
  renderTimetableHours(filteredClasses, 'hrs-', 'weeklyTotalHours');
}

// Builds the timetable rows. readOnly leaves out editing, dragging and conflict notes.
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
              onclick="showClassDetails('${item.id}')"`}
              title="${escapeHtml(item.subjectCode)}: ${escapeHtml(item.subjectTitle || '')} (${formatTime12(item.startTime)} – ${formatTime12(item.endTime)})">
            <div class="class-cell-inner">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:4px;">
                <span class="class-sec-badge">${escapeHtml(item.section)}${item.aiPlaced ? ' <span class="class-ai-badge" title="Placed by AI">AI</span>' : ''}</span>
                ${readOnly ? '' : `<button class="cell-quick-edit-btn" onclick="event.stopPropagation(); openEditClassScheduleModal('${item.id}')" title="Edit Subject or Time">✏️</button>`}
              </div>
              <span class="class-subj-title">${escapeHtml(item.subjectCode)}</span>
              <span class="class-subj-name">${escapeHtml(item.subjectTitle || '')}</span>
              <span class="class-meta-line">📍 ${escapeHtml(item.room)} · 👤 ${escapeHtml(item.instructor)}</span>
              <span class="class-units-line">${item.units || 3} Units · ${formatTime12(item.startTime)}–${formatTime12(item.endTime)}</span>
              ${conflictReason ? `<span class="class-conflict-badge">⚠️ ${escapeHtml(conflictReason)}</span>` : ''}
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
        <button class="btn btn-outline" style="color:var(--danger); border-color:#FCA5A5; font-size:12px; padding:6px 12px;" onclick="deleteClassSchedule('${escapeHtml(item.id)}')">
          🗑️ Remove
        </button>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary" style="font-size:12px; padding:6px 14px;" onclick="closeClassDetailModal()">Close</button>
          <button class="btn btn-primary" style="font-size:12px; padding:6px 16px; font-weight:700;" onclick="openEditClassScheduleModal('${escapeHtml(item.id)}')">
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
      qualBadge = `<span class="badge" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-size:10.5px; padding:1px 6px; margin-left:6px; font-weight:700;">⭐ Main Qualified</span>`;
    } else {
      qualBadge = `<span class="badge" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; font-size:10.5px; padding:1px 6px; margin-left:6px; font-weight:700;">⚠️ Not Qualified</span>`;
    }
  }

  body.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
      <div>
        <div style="font-size:18px; font-weight:800; color:var(--accent-primary);">${escapeHtml(item.subjectCode)}</div>
        <div style="font-size:13.5px; color:var(--text-secondary); margin-top:2px;">${escapeHtml(item.subjectTitle || 'No title available')}</div>
      </div>
      <span class="badge" style="background:#EEF1F7; color:var(--accent-primary); font-weight:700; font-size:11.5px; text-transform:uppercase;">
        ${escapeHtml(item.type || 'Lecture')}${item.aiPlaced ? ' · Placed by AI' : ''}
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
          <button class="btn btn-outline" style="font-size:10.5px; padding:2px 7px; display:inline-flex; align-items:center; gap:3px; font-weight:600;" onclick="viewRoomSchedule(${jsArg(item.room)})">
            📅 Schedule ↗
          </button>
        </div>
      </div>
      <div>
        <div style="color:var(--text-secondary); font-size:11px; font-weight:700; text-transform:uppercase;">Instructor</div>
        <div style="font-weight:700; color:var(--text-primary); margin-top:2px; display:flex; align-items:center; flex-wrap:wrap;"><span>${escapeHtml(item.instructor)}</span>${qualBadge}</div>
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
    <div id="editScheduleError" style="display:none; color:var(--danger); font-size:12px; margin-bottom:12px; padding:8px 12px; background:#FFF5F5; border-radius:6px; border:1px solid #FADBD8;"></div>

    <div class="form-group" style="margin-bottom:12px;">
      <label class="form-label" style="font-weight:700; font-size:12px;">Course / Subject</label>
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
      <label class="form-label" style="font-weight:700; font-size:12px;">Subject Title / Name</label>
      <input type="text" id="editScheduleSubjTitle" class="form-input" value="${escapeHtml(item.subjectTitle || '')}" style="width:100%;" />
    </div>

    <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:12px;">
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label" style="font-weight:700; font-size:12px;">Day of Week</label>
        <select id="editScheduleDay" class="form-input" style="width:100%;">
          ${DAYS.map(d => `<option value="${d}" ${d === item.day ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label" style="font-weight:700; font-size:12px;">Start Time</label>
        <select id="editScheduleStartTime" class="form-input" style="width:100%;">
          ${timeOptions.map(t => `<option value="${t.value}" ${t.value === item.startTime ? 'selected' : ''}>${t.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label" style="font-weight:700; font-size:12px;">End Time</label>
        <select id="editScheduleEndTime" class="form-input" style="width:100%;">
          ${timeOptions.map(t => `<option value="${t.value}" ${t.value === item.endTime ? 'selected' : ''}>${t.label}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label" style="font-weight:700; font-size:12px;">Classroom / Room</label>
        <select id="editScheduleRoom" class="form-input" style="width:100%;">
          ${ROOMS.map(r => `<option value="${escapeHtml(r.code)}" ${r.code === item.room ? 'selected' : ''}>${escapeHtml(r.code)} (${r.type} · ${r.cap} seats)</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label" style="font-weight:700; font-size:12px;">Instructor / Faculty</label>
        <select id="editScheduleInstructor" class="form-input" style="width:100%;">
          ${FACULTY.map(f => {
            const qualTag = isFacultyQualified(f, item.subjectCode) ? ' [⭐ Main Qualified]' : ' [⚠️ Not Qualified]';
            return `<option value="${escapeHtml(f.name)}" ${f.name === item.instructor ? 'selected' : ''}>${escapeHtml(f.name)} (${escapeHtml(f.dept || 'Faculty')})${qualTag}</option>`;
          }).join('')}
        </select>
      </div>
    </div>

    <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:0;">
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label" style="font-weight:700; font-size:12px;">Section</label>
        <input type="text" id="editScheduleSection" class="form-input" value="${escapeHtml(item.section)}" style="width:100%; font-weight:700;" />
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label" style="font-weight:700; font-size:12px;">Units</label>
        <input type="number" step="0.5" id="editScheduleUnits" class="form-input" value="${item.units || 1.5}" style="width:100%;" />
      </div>
    </div>
  `;

  if (footer) {
    footer.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
        <button class="btn btn-outline" style="color:var(--danger); border-color:#FCA5A5; font-size:12.5px; padding:6px 14px;" onclick="deleteClassSchedule('${escapeHtml(item.id)}')">
          🗑️ Remove
        </button>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary" style="font-size:12.5px; padding:6px 14px;" onclick="showClassDetails('${escapeHtml(item.id)}')">Cancel</button>
          <button class="btn btn-primary" style="font-size:12.5px; padding:6px 16px; font-weight:700;" onclick="submitEditClassSchedule()">Save Changes</button>
        </div>
      </div>
    `;
  }

  modal.style.display = 'flex';
}

function handleEditSubjectChange(code) {
  const subj = CURRICULUM_SUBJECTS.find(s => s.code.toUpperCase() === (code || '').toUpperCase());
  const titleInput = document.getElementById('editScheduleSubjTitle');
  const unitsInput = document.getElementById('editScheduleUnits');
  if (subj) {
    if (titleInput) titleInput.value = subj.name;
    if (unitsInput) unitsInput.value = (subj.units >= 3 ? 1.5 : subj.units);
  }
  const instSelect = document.getElementById('editScheduleInstructor');
  if (instSelect) {
    const curVal = instSelect.value;
    const targetCode = (code || '').toUpperCase();
    instSelect.innerHTML = FACULTY.map(f => {
      const qualTag = isFacultyQualified(f, targetCode) ? ' [⭐ Main Qualified]' : ' [⚠️ Not Qualified]';
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
  const units = parseFloat(document.getElementById('editScheduleUnits')?.value || '1.5');

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
  item.units = units;

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

function deleteClassSchedule(classId) {
  if (!confirm('Are you sure you want to remove this class from the schedule?')) return;
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
      <option value="${escapeHtml(f.name)}" ${CURRENT_TIMETABLE_VIEW === 'teacher' && f.name === currentSelectedTeacher ? 'selected' : ''}>
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
  const instructor = facSel?.value || (FACULTY.length > 0 ? FACULTY[0].name : 'Prof. Academic Head');
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

  // Subject metadata lookup
  const matchingSubj = CURRICULUM_SUBJECTS.find(s => s.code.toUpperCase() === subjectCode);
  const subjectTitle = matchingSubj ? matchingSubj.name : subjectCode;
  const units = matchingSubj ? matchingSubj.units : 3;
  const type = matchingSubj ? matchingSubj.type : 'lecture';

  const newId = `SCH-MANUAL-${Date.now()}`;
  const newClass = {
    id: newId,
    termId: (getActiveAcademicContext().activeTerm.id),
    section,
    program,
    year: '1',
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

  const qualConflict = checkFacultySubjectConflict(classItem.instructor, classItem.subjectCode, classItem.section);
  if (qualConflict) return qualConflict;
  return null;
}

/* ─── Section Search Handler ─── */
function handleSectionSearch(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return;

  const { activeTerm } = getActiveAcademicContext();
  const termSections = (typeof ACADEMIC_SECTIONS !== 'undefined' ? ACADEMIC_SECTIONS : []).filter(s => s.termId === activeTerm.id);
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
  const termSections = (typeof ACADEMIC_SECTIONS !== 'undefined' ? ACADEMIC_SECTIONS : []).filter(s => s.termId === activeTerm.id);
  const totalSections = termSections.length;
  const fullyScheduledSections = termSections.filter(isSectionFullyScheduled).length;
  const totalRooms = typeof ROOMS !== 'undefined' ? ROOMS.length : 0;

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
    const inc = CURRICULUM_SUBJECTS.filter(s => s.isIncluded).length;
    sub3.textContent = `${inc} Subjects`;
  }

  const sub5 = document.getElementById('stepSub-5');
  if (sub5) sub5.textContent = `${totalSections} Sections`;
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

function exportTimetablePDF() {
  const menu = document.getElementById('exportDropdownMenu');
  if (menu) menu.style.display = 'none';

  const titlePrefix = CURRENT_TIMETABLE_VIEW === 'section'
    ? currentSelectedSection
    : (CURRENT_TIMETABLE_VIEW === 'room' ? currentSelectedRoom : currentSelectedTeacher);

  const originalTitle = document.title;
  document.title = `${titlePrefix}_STI_Timetable`;

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
    alert('html2canvas is loading. Please use Export as PDF in the meantime.');
    return;
  }

  try {
    const canvas = await html2canvas(card, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#FFFFFF',
      logging: false
    });

    const titlePrefix = CURRENT_TIMETABLE_VIEW === 'section'
      ? currentSelectedSection
      : (CURRENT_TIMETABLE_VIEW === 'room' ? currentSelectedRoom : currentSelectedTeacher);

    const link = document.createElement('a');
    link.download = `${titlePrefix}_Timetable.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    alert('Unable to generate PNG image. Please use Export as PDF.');
  }
}

function exportAllSectionsBatchPDF() {
  const menu = document.getElementById('exportDropdownMenu');
  if (menu) menu.style.display = 'none';

  // Open clean printable multi-page batch document
  const printWin = window.open('', '_blank');
  if (!printWin) {
    alert('Please allow popups to generate batch timetable PDF.');
    return;
  }

  const { activeSy, activeTerm } = getActiveAcademicContext();
  const sections = (typeof ACADEMIC_SECTIONS !== 'undefined' ? ACADEMIC_SECTIONS : []).filter(s => s.termId === activeTerm.id);
  if (sections.length === 0) {
    printWin.close();
    alert(`No sections found for ${activeTerm.termName} (${activeSy.yearCode}) to export.`);
    return;
  }
  let batchHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>STI_Academic_Sections_Master_Timetables</title>
      <style>
        @page { size: landscape; margin: 8mm; }
        body { font-family: Arial, Calibri, sans-serif; margin: 0; padding: 0; color: #000; font-size: 8.5px; }
        .section-page { page-break-after: always; padding: 10px; margin-bottom: 20px; }
        .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
        .title { font-size: 18px; font-weight: bold; }
        .meta { font-size: 10px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; border: 1.5px solid #000; table-layout: fixed; }
        th, td { border: 1px solid #000; padding: 4px; text-align: center; }
        th { background: #1C3664; color: #fff; font-size: 9px; }
        .time-col { width: 75px; background: #eee; font-weight: bold; }
        .class-box { background: #f0f4f8; border-left: 4px solid #2563eb; text-align: left; padding: 3px 5px; font-size: 8.5px; }
        .class-box.lab { border-left-color: #059669; background: #eafaf1; }
        .class-box.pe { border-left-color: #d97706; background: #fef9e7; }
        .subj-code { font-weight: bold; font-size: 9.5px; }
      </style>
    </head>
    <body>
  `;

  sections.forEach(sec => {
    const secClasses = MASTER_SCHEDULE_DATA.filter(c => c.section === sec.code && (!c.termId || c.termId === activeTerm.id));
    const totalUnits = secClasses.reduce((sum, c) => sum + (c.units || 0), 0);

    batchHtml += `
      <div class="section-page">
        <div class="header">
          <div>
            <div class="meta">${escapeHtml(sec.program)} · Year ${escapeHtml(sec.year)}</div>
            <div class="title">${escapeHtml(sec.code)} (${escapeHtml(sec.name)})</div>
          </div>
          <div style="text-align:right;">
            <div class="meta">Adviser: ${escapeHtml(sec.adviser || '—')} · Students: ${sec.studentCount} · Units: ${totalUnits}</div>
            <div style="font-size:8.5px; color:#555;">STI Academic Scheduling Master Timetable</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th class="time-col">TIME</th>
              <th>MON</th><th>TUE</th><th>WED</th><th>THU</th><th>FRI</th><th>SAT</th>
            </tr>
          </thead>
          <tbody>
    `;

    // Hourly rows covering the generator's full 7:00 AM - 7:00 PM range
    for (let m = 7 * 60; m < 19 * 60; m += 60) {
      const tStr = minutesToTime(m);
      const tEndStr = minutesToTime(m + 60);
      batchHtml += `<tr><td class="time-col">${formatTime12(tStr)}</td>`;

      DAYS.forEach(day => {
        const cls = secClasses.find(c => c.day === day && timeToMinutes(c.startTime) <= m && timeToMinutes(c.endTime) > m);
        if (cls) {
          batchHtml += `
            <td class="class-box ${escapeHtml(cls.type)}">
              <div class="subj-code">${escapeHtml(cls.subjectCode)}</div>
              <div>${escapeHtml(cls.room)} · ${escapeHtml(cls.instructor)}</div>
              <div>${cls.units} Units (${formatTime12(cls.startTime)}–${formatTime12(cls.endTime)})</div>
            </td>
          `;
        } else {
          batchHtml += `<td></td>`;
        }
      });

      batchHtml += `</tr>`;
    }

    batchHtml += `
          </tbody>
        </table>
      </div>
    `;
  });

  batchHtml += `
      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `;

  printWin.document.open();
  printWin.document.write(batchHtml);
  printWin.document.close();
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

  const roomSelect = document.getElementById('roomSelect');
  if (roomSelect) {
    roomSelect.addEventListener('change', (e) => {
      currentSelectedRoom = e.target.value;
      renderGrid();
    });
  }

  const teacherSelect = document.getElementById('teacherSelect');
  if (teacherSelect) {
    teacherSelect.addEventListener('change', (e) => {
      currentSelectedTeacher = e.target.value;
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
  goToScheduleStep(ACTIVE_SCHEDULE_STEP || 6);
  isScheduleInitialized = true;
});

// Global window assignments for inline handlers
window.evaluateResourceReadiness = evaluateResourceReadiness;
window.goToScheduleStep = goToScheduleStep;
window.renderGrid = renderGrid;
window.refreshAllSchedulingViews = refreshAllSchedulingViews;
window.switchTimetableView = switchTimetableView;
window.setTimetableStyle = setTimetableStyle;
window.updateSectionDropdown = updateSectionDropdown;
window.updateRoomDropdown = updateRoomDropdown;
window.updateTeacherDropdown = updateTeacherDropdown;

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
window.executeQuickGenerateSections = executeQuickGenerateSections;
window.openAutoGenerateSectionsModal = openAutoGenerateSectionsModal;
window.closeAutoGenerateSectionsModal = closeAutoGenerateSectionsModal;
window.toggleAutoGenModeUI = toggleAutoGenModeUI;
window.calculateAutoGenPreview = calculateAutoGenPreview;
window.submitAutoGenerateSections = submitAutoGenerateSections;
window.openAddSectionModal = openAddSectionModal;
window.populateAdviserDropdown = populateAdviserDropdown;
window.openEditSectionModal = openEditSectionModal;
window.closeSectionModal = closeSectionModal;
window.submitSectionModal = submitSectionModal;
window.openSplitSectionModal = openSplitSectionModal;
window.closeSplitSectionModal = closeSplitSectionModal;
window.submitSplitSection = submitSplitSection;
window.openMergeSectionsModal = openMergeSectionsModal;
window.closeMergeSectionsModal = closeMergeSectionsModal;
window.submitMergeSections = submitMergeSections;
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
