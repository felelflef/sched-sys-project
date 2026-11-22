/* ══════════════════════════════════════════════════════════════════════════
   MASTER SCHEDULE: SHARED STATE, HELPERS AND STEP NAVIGATION
   Part of the Master Schedule; the schedule_*.js files load in order (see the page's script tags).
   ══════════════════════════════════════════════════════════════════════════ */

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Global repositories and runtime trackers
let MASTER_SCHEDULE_DATA = [];
let currentSelectedSection = '';

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

// Each person picks the term they work on, kept in their browser, so a College registrar and an SHS coordinator
// can each work on their own term. The school's current term (set for everyone in Step 2) is the default, and
// the server keeps using it for its own checks. Everything that says "active term" in the app means this one.
let viewingTermId = (() => { try { return Number(localStorage.getItem('sti_viewing_term')) || null; } catch (e) { return null; } })();
function setViewingTerm(termId) {
  viewingTermId = termId || null;
  try {
    if (viewingTermId) localStorage.setItem('sti_viewing_term', String(viewingTermId));
    else localStorage.removeItem('sti_viewing_term');
  } catch (e) {}
  if (typeof refreshAllSchedulingViews === 'function') refreshAllSchedulingViews();
}
window.setViewingTerm = setViewingTerm;

function getActiveAcademicContext() {
  const viewed = viewingTermId && typeof SCHOOL_TERMS !== 'undefined' ? SCHOOL_TERMS.find(t => t.id === viewingTermId) : null;
  const viewedYear = viewed && typeof SCHOOL_YEARS !== 'undefined' ? SCHOOL_YEARS.find(y => y.id === viewed.yearId) : null;
  if (viewed && viewedYear) return { activeSy: viewedYear, activeTerm: viewed };
  return getSchoolCurrentContext();
}

// The school's current year and term, as set for everyone
function getSchoolCurrentContext() {
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
  if (!SCHOOL_YEARS.length) return { step: 1, reason: 'Add a school year.' };
  const { activeSy } = getActiveAcademicContext();
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

  // On a screen too narrow for all seven steps, the bar scrolls sideways so the current step is in view
  const activeBtn = document.getElementById(`stepBtn-${stepNumber}`);
  const bar = activeBtn && activeBtn.parentElement;
  if (bar && bar.scrollWidth > bar.clientWidth) {
    const left = activeBtn.getBoundingClientRect().left - bar.getBoundingClientRect().left + bar.scrollLeft;
    if (left < bar.scrollLeft || left + activeBtn.offsetWidth > bar.scrollLeft + bar.clientWidth) {
      bar.scrollLeft = left - (bar.clientWidth - activeBtn.offsetWidth) / 2;
    }
  }

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
