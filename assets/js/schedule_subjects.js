/* ══════════════════════════════════════════════════════════════════════════
   STEP 3: LOAD SUBJECTS
   Part of the Master Schedule; the schedule_*.js files load in order (see the page's script tags).
   ══════════════════════════════════════════════════════════════════════════ */

// The active term the filter last showed, so a term change can move the filter to it
let curriculumFilterActiveTermId = null;

function updateCurriculumTermFilter() {
  const sel = document.getElementById('curriculumTermFilter');
  if (!sel) return;
  const { activeSy, activeTerm } = getActiveAcademicContext();
  const terms = activeSy ? termsOfYear(activeSy.id) : SCHOOL_TERMS;

  // A term the user picked stays picked, until the active term itself changes
  const activeTermChanged = activeTerm && activeTerm.id !== curriculumFilterActiveTermId;
  curriculumFilterActiveTermId = activeTerm ? activeTerm.id : null;
  const currentVal = activeTermChanged ? '' : sel.value;
  sel.innerHTML = `<option value="all">All Terms</option>` + terms.map(t => `
    <option value="${t.id}" ${t.id === activeTerm.id ? 'selected' : ''}>
      ${escapeHtml(t.termName)}${t.id === activeTerm.id ? ' (working on)' : ''}${t.isActive ? ' (current)' : ''}
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

// the active one (an SHS term viewed while College is active lists the strands and Grades 11-12); All Terms lists both
function fillCurriculumFilterOptions() {
  const value = document.getElementById('curriculumTermFilter')?.value;
  const levels = value && value !== 'all' ? [termSchoolLevel(parseInt(value, 10))] : Object.keys(LEVEL_PROGRAMS);
  fillLevelSelect('curriculumProgFilter', levels.flatMap(level => LEVEL_PROGRAMS[level]), p => p);
  fillLevelSelect('curriculumYearFilter', levels.flatMap(level => LEVEL_YEARS[level]), yearLevelOptionLabel);
}

function renderSubjectOfferingTable() {
  fillCurriculumFilterOptions();
  updateScheduleStats();   // the stepper's subject count follows every add, edit, delete and include/exclude
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
            <button class="btn btn-outline btn-sm" onclick="openEditCurriculumSubjectModal(${subj.id})">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteSubjectOffering(${subj.id})">Remove</button>
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
    if (scheduled.length > 0 && !(await askConfirm(`${subj.code} has ${scheduledClassesNote(scheduled)}. Excluding it also takes ${scheduled.length === 1 ? 'that class' : 'those classes'} off the schedule.`, { title: 'Exclude this subject?', confirmLabel: 'Exclude and Unschedule', danger: true }))) {
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
  if (scheduled.length > 0 && !(await askConfirm(`The listed subjects have ${scheduledClassesNote(scheduled)}. Excluding them also takes those classes off the schedule.`, { title: `Exclude ${listed.length} subject${listed.length === 1 ? '' : 's'}?`, confirmLabel: 'Exclude and Unschedule', danger: true }))) return;
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
  const startHours = defaultSubjectHours(3, 0, curricFormLevel());
  setCurriculumUnitFields(3, 0, startHours.lec, startHours.lab);
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

// SHS subjects meet 4.5 hours a week by default; college hours follow the units (1 hour per lecture unit,
// 3 per lab unit). Either can be changed for a subject that differs.
const SHS_WEEKLY_HOURS = 4.5;
function defaultSubjectHours(lecUnits, labUnits, level) {
  if (level !== 'shs') return { lec: lecUnits, lab: labUnits * LAB_HOURS_PER_UNIT };
  const lab = Math.min(labUnits * LAB_HOURS_PER_UNIT, SHS_WEEKLY_HOURS);
  return { lec: SHS_WEEKLY_HOURS - lab, lab };
}
function syncCurriculumUnitHours() {
  const lecUnits = Math.max(parseInt(document.getElementById('curricSubjLecUnits').value, 10) || 0, 0);
  const labUnits = Math.max(parseInt(document.getElementById('curricSubjLabUnits').value, 10) || 0, 0);
  const hours = defaultSubjectHours(lecUnits, labUnits, curricFormLevel());
  document.getElementById('curricSubjUnits').value = lecUnits + labUnits;
  document.getElementById('curricSubjLecHrs').value = hours.lec;
  document.getElementById('curricSubjLabHrs').value = hours.lab;
}

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
    const hours = defaultSubjectHours(units, 0, curricFormLevel());
    setCurriculumUnitFields(units, 0, hours.lec, hours.lab);
  }
  document.getElementById('curricSubjType').value = previous ? (previous.type || 'lecture') : 'lecture';
  fillCurriculumAreaSelect(subj.code);
}

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
    const { activeTerm } = getActiveAcademicContext();
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
  if (!(await askConfirm(message, { title: 'Remove this subject from the term?', confirmLabel: scheduled.length > 0 ? 'Remove and Unschedule' : 'Remove Subject', danger: true }))) return;
  removeClassesAndSave(scheduled);
  CURRICULUM_SUBJECTS = CURRICULUM_SUBJECTS.filter(s => s.id !== id);
  saveStateToStorage();
  renderSubjectOfferingTable();

  postScheduleAction({ action: 'delete_term_subject', subject_id: id });
}
