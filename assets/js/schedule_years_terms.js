/* ══════════════════════════════════════════════════════════════════════════
   STEPS 1 AND 2: SCHOOL YEARS AND SCHOOL TERMS
   Part of the Master Schedule; the schedule_*.js files load in order (see the page's script tags).
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

// The year field takes only numbers and a dash, such as 2026-2027; the dash is added after the first 4 digits
function formatSchoolYearInput(input) {
  const digits = input.value.replace(/\D/g, '').slice(0, 8);
  input.value = digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
}

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
