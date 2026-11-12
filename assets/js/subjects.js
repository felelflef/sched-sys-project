/* ═══════════════════════════════════════════════════
   MODULE — SUBJECT CATALOG & CURRICULUM MANAGEMENT
   ═══════════════════════════════════════════════════ */

function renderSubjectDeptFilterOptions() {
  const select = document.getElementById('subjectDeptFilter');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="all">All Departments & Subjects</option>';
  DEPARTMENTS.forEach(dept => {
    const opt = document.createElement('option');
    opt.value = dept;
    opt.textContent = `${dept} Department`;
    if (dept === currentVal) opt.selected = true;
    select.appendChild(opt);
  });
}

function renderSubjectDatalist() {
  const dl = document.getElementById('subjectDatalist');
  if (!dl) return;
  dl.innerHTML = '';
  SUBJECTS.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.code;
    opt.label = `${s.title} (${s.itOnly ? 'IT/CS Only' : s.dept})`;
    dl.appendChild(opt);
  });
}

function renderSubjectTable() {
  const tbody = document.getElementById('subjectTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const isAdmin = canManageData();
  const btnAdd = document.getElementById('btnAddSubject');
  if (btnAdd) {
    btnAdd.style.display = isAdmin ? 'inline-flex' : 'none';
  }

  renderSubjectSetTable();
  showCatalogTab(catalogTab);

  const filterVal = document.getElementById('subjectDeptFilter')?.value || 'all';
  const searchVal = (document.getElementById('subjectSearchInput')?.value || '').trim().toLowerCase();

  const filtered = SUBJECTS.filter(s => {
    // Department / eligibility filter
    let matchDept = true;
    if (filterVal !== 'all') {
      matchDept = s.dept === filterVal;
    }

    // Search filter
    let matchSearch = true;
    if (searchVal) {
      matchSearch = s.code.toLowerCase().includes(searchVal) || s.title.toLowerCase().includes(searchVal);
    }

    return matchDept && matchSearch;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:32px 16px; color:var(--text-secondary);">
          No subjects found matching the selected criteria.
        </td>
      </tr>
    `;
    return;
  }

  const sortChoice = document.getElementById('subjectSortSelect')?.value || 'az';
  sortByChoice(filtered, sortChoice, s => s.addedOrder, s => s.code).forEach(subj => {
    const tr = document.createElement('tr');

    const actionButtons = isAdmin
      ? `<button class="btn btn-outline" style="font-size:11px; padding:3px 8px; margin-right:4px;" onclick="openEditSubjectModal(${jsArg(subj.code)})">Edit</button>
         <button class="btn btn-outline" style="font-size:11px; padding:3px 8px; color:var(--danger); border-color:#fadbd8;" onclick="promptDeleteSubject(${jsArg(subj.code)})">Remove</button>`
      : `<span style="font-size:11px; color:var(--text-secondary);">&mdash;</span>`;

    tr.innerHTML = `
      <td style="font-weight:700; color:var(--accent-primary);">${escapeHtml(subj.code)}</td>
      <td>
        <div style="font-weight:600; color:var(--text-primary); font-size:13px;">${escapeHtml(subj.title)}</div>
      </td>
      <td><span class="badge" style="background:#F8FAFC; border:1px solid var(--border-subtle); color:var(--text-primary);">${escapeHtml(subj.dept)}</span></td>
      <td>${qualifiedProfessorsHtml(subj)}</td>
      <td style="text-align:center; font-weight:600;">${subj.units || 3}</td>
      <td style="text-align:right;">${actionButtons}</td>
    `;
    tbody.appendChild(tr);
  });
}

// The professors allowed to teach a subject, stored in each professor's Main Qualifications
function qualifiedProfessorsHtml(subj) {
  const tags = FACULTY.filter(f => isFacultyQualified(f, subj.code)).map(f =>
    `<span class="qual-tag locked" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-weight:600; display:inline-flex; align-items:center;">★ ${escapeHtml(f.name)}</span>`
  ).join('');
  return `<div class="qual-tags">${tags || '<span style="font-size:11px; color:var(--danger); font-style:italic;">None: no one can teach this</span>'}</div>`;
}

// Main Qualification picker shared by the Subject Catalog and Step 3 subject forms
const subjectFormProfessors = { subject: [], curricSubj: [] };

function renderSubjectFormProfessors(form) {
  const selected = subjectFormProfessors[form];
  const isAdmin = canManageData();

  document.getElementById(`${form}ProfAddRow`).style.display = isAdmin ? 'flex' : 'none';
  document.getElementById(`${form}ProfSelect`).innerHTML = '<option value="">-- Choose Professor --</option>' +
    FACULTY.filter(f => !selected.includes(f.email))
      .map(f => `<option value="${escapeHtml(f.email)}">${escapeHtml(f.name)}</option>`).join('');

  const badges = selected.map(email => {
    const fac = FACULTY.find(f => f.email === email);
    if (!fac) return '';
    const remove = isAdmin
      ? `<span data-form="${form}" data-email="${escapeHtml(email)}" onclick="removeSubjectFormProfessor(this)" style="cursor:pointer; font-weight:800; opacity:0.6; margin-left:4px;" title="Remove ${escapeHtml(fac.name)}">✕</span>`
      : '';
    return `<span class="qual-tag" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-weight:600; display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:4px; font-size:11px;">★ ${escapeHtml(fac.name)}${remove}</span>`;
  }).join('');
  document.getElementById(`${form}ProfBadges`).innerHTML = badges ||
    '<span style="font-size:11px; color:var(--danger); font-style:italic; padding:3px 0;">No professors: this subject cannot be scheduled</span>';
}

function openSubjectFormProfessors(form, code) {
  subjectFormProfessors[form] = code ? FACULTY.filter(f => isFacultyQualified(f, code)).map(f => f.email) : [];
  renderSubjectFormProfessors(form);
}

window.addSubjectFormProfessor = function(form) {
  const email = document.getElementById(`${form}ProfSelect`).value;
  if (!email) {
    alert('Please select a professor to add.');
    return;
  }
  subjectFormProfessors[form].push(email);
  renderSubjectFormProfessors(form);
};

window.removeSubjectFormProfessor = function(button) {
  const { form, email } = button.dataset;
  subjectFormProfessors[form] = subjectFormProfessors[form].filter(e => e !== email);
  renderSubjectFormProfessors(form);
};

// Runs after the subject is saved, because the server only accepts subjects it already knows
// Professors taken off a subject they still teach this term need confirmation, and lose those classes
function confirmSubjectFormRemoval(form, code) {
  const target = code.toUpperCase();
  const removedNames = FACULTY.filter(fac => !subjectFormProfessors[form].includes(fac.email) && isFacultyQualified(fac, target)).map(fac => fac.name);
  return confirmClassRemoval(activeTermClasses().filter(c => removedNames.includes(c.instructor) && (c.subjectCode || '').toUpperCase() === target));
}

function saveSubjectFormProfessors(form, code, subjectSaved, removeClasses = false) {
  if (!canManageData()) return;

  const target = code.toUpperCase();
  const selected = subjectFormProfessors[form];
  const changed = [];

  FACULTY.forEach(fac => {
    const wanted = selected.includes(fac.email);
    if (wanted === isFacultyQualified(fac, target)) return;
    if (wanted) {
      fac.mainQuals = [...(fac.mainQuals || []), target];
    } else {
      fac.mainQuals = fac.mainQuals.filter(q => q.trim().toUpperCase() !== target);
    }
    changed.push(fac);
  });

  if (changed.length === 0) return;
  saveStateToStorage();
  renderSubjectTable();
  renderFacultyCards();

  Promise.resolve(subjectSaved).then(response => {
    if (response && !response.ok) return;
    changed.forEach(fac => saveFacultyQualifications(fac, removeClasses));
  });
}

window.openAddSubjectModal = function() {
  if (!canManageData()) {
    alert('Access Denied: Only the System Administrator or a Program Head can add subjects.');
    return;
  }
  document.getElementById('subjectModalTitle').textContent = 'Add Subject to Catalog';
  document.getElementById('subjectEditOriginalCode').value = '';
  document.getElementById('subjectCodeInput').value = '';
  document.getElementById('subjectCodeInput').disabled = false;
  document.getElementById('subjectTitleInput').value = '';
  document.getElementById('subjectUnitsInput').value = '3';

  const deptSelect = document.getElementById('subjectDeptSelect');
  deptSelect.innerHTML = '';
  DEPARTMENTS.forEach(dept => {
    const opt = document.createElement('option');
    opt.value = dept;
    opt.textContent = dept;
    deptSelect.appendChild(opt);
  });
  deptSelect.value = 'IT / CS';

  openSubjectFormProfessors('subject', '');
  document.getElementById('subjectModalSubmitBtn').textContent = 'Add Subject';
  document.getElementById('subjectModal').style.display = 'flex';
};

window.openEditSubjectModal = function(code) {
  if (!canManageData()) {
    alert('Access Denied: Only the System Administrator or a Program Head can edit subjects.');
    return;
  }
  const subj = SUBJECTS.find(s => s.code.toLowerCase() === code.toLowerCase());
  if (!subj) return;

  document.getElementById('subjectModalTitle').textContent = `Edit Subject (${subj.code})`;
  document.getElementById('subjectEditOriginalCode').value = subj.code;
  document.getElementById('subjectCodeInput').value = subj.code;
  document.getElementById('subjectCodeInput').disabled = true;
  document.getElementById('subjectTitleInput').value = subj.title;
  document.getElementById('subjectUnitsInput').value = subj.units || 3;

  const deptSelect = document.getElementById('subjectDeptSelect');
  deptSelect.innerHTML = '';
  DEPARTMENTS.forEach(dept => {
    const opt = document.createElement('option');
    opt.value = dept;
    opt.textContent = dept;
    if (dept === subj.dept) opt.selected = true;
    deptSelect.appendChild(opt);
  });

  openSubjectFormProfessors('subject', subj.code);
  document.getElementById('subjectModalSubmitBtn').textContent = 'Save Changes';
  document.getElementById('subjectModal').style.display = 'flex';
};

window.closeSubjectModal = function() {
  document.getElementById('subjectModal').style.display = 'none';
};

window.submitSubjectForm = async function() {
  if (!canManageData()) {
    alert('Access Denied: Only the System Administrator or a Program Head can save subjects.');
    closeSubjectModal();
    return;
  }
  const origCode = document.getElementById('subjectEditOriginalCode').value;
  const code = document.getElementById('subjectCodeInput').value.trim().toUpperCase();
  const title = document.getElementById('subjectTitleInput').value.trim();
  const units = parseInt(document.getElementById('subjectUnitsInput').value, 10) || 3;
  const dept = document.getElementById('subjectDeptSelect').value;
  const isItDept = dept === 'IT / CS';

  if (!code) {
    alert('Please enter a course code.');
    return;
  }
  if (!title) {
    alert('Please enter a subject title.');
    return;
  }

  const subjectProblem = INPUT_RULES.code('Course code', code) || INPUT_RULES.text('Subject title', title)
    || INPUT_RULES.int('Units', document.getElementById('subjectUnitsInput').value, 1, 6);
  if (subjectProblem) {
    alert(subjectProblem);
    return;
  }

  const subjectRemoval = origCode ? await confirmSubjectFormRemoval('subject', origCode) : { removeClasses: false };
  if (!subjectRemoval) return;

  let subjectSaved;
  if (origCode) {
    // Edit existing
    const subj = SUBJECTS.find(s => s.code.toLowerCase() === origCode.toLowerCase());
    if (subj) {
      // Eligibility follows the department; an unchanged department keeps its saved value
      if (subj.dept !== dept) subj.itOnly = isItDept;
      subj.title = title;
      subj.units = units;
      subj.dept = dept;
      subjectSaved = saveCatalogSubject(subj);
    }
  } else {
    // Add new
    if (SUBJECTS.some(s => s.code.toLowerCase() === code.toLowerCase())) {
      alert(`Subject code ${code} already exists in the catalog.`);
      return;
    }
    SUBJECTS.push({
      code,
      title,
      dept,
      itOnly: isItDept,
      units
    });
    subjectSaved = saveCatalogSubject(SUBJECTS[SUBJECTS.length - 1]);
  }

  saveStateToStorage();
  closeSubjectModal();
  renderSubjectTable();
  renderSubjectDatalist();
  saveSubjectFormProfessors('subject', origCode || code, subjectSaved, subjectRemoval.removeClasses);
};

window.promptDeleteSubject = function(code) {
  if (!canManageData()) {
    alert('Access Denied: Only the System Administrator or a Program Head can remove subjects.');
    return;
  }
  const subj = SUBJECTS.find(s => s.code.toLowerCase() === code.toLowerCase());
  if (!subj) return;

  document.getElementById('deleteSubjectTargetCode').value = subj.code;
  document.getElementById('deleteSubjectCodeDisplay').textContent = subj.code;
  document.getElementById('deleteSubjectTitleDisplay').textContent = `${subj.title} \u2022 ${subj.dept} (${subj.itOnly ? 'IT/CS Only' : 'Other Dept'})`;
  document.getElementById('deleteSubjectModal').style.display = 'flex';
};

window.closeDeleteSubjectModal = function() {
  document.getElementById('deleteSubjectModal').style.display = 'none';
};

window.confirmDeleteSubject = function() {
  if (!canManageData()) {
    alert('Access Denied: Only the System Administrator or a Program Head can remove subjects.');
    return;
  }
  const code = document.getElementById('deleteSubjectTargetCode').value;
  SUBJECTS = SUBJECTS.filter(s => s.code.toLowerCase() !== code.toLowerCase());
  deleteCatalogSubject(code);

  saveStateToStorage();
  closeDeleteSubjectModal();
  renderSubjectTable();
  renderSubjectDatalist();
};

// Backward-compatible alias
window.deleteSubject = window.promptDeleteSubject;

/* ─── SAVED SUBJECT SETS ───
   Reusable subject lists (for example a 1st or 2nd semester), made here in the Subject Catalog
   and loaded into a term with Load Saved Subjects in Step 3. Both screens use SUBJECT_SETS. */

let subjectSetDraft = { id: null, items: [] };
let loadSubjectSetTermId = null;

function canManageSubjectSets() {
  return canManageData();
}

// The same subject for the same program and year counts once
function subjectSetKey(item) {
  return `${String(item.code || '').trim().toUpperCase()}|${item.program}|${Number(item.year)}`;
}

function termLabelFor(termId) {
  const term = SCHOOL_TERMS.find(t => t.id === termId);
  if (!term) return 'this term';
  const year = SCHOOL_YEARS.find(y => y.id === term.yearId);
  return `${term.termName}${year ? ` ${year.yearCode}` : ''}`;
}

// A term's subjects as set items, without repeats
function termSubjectSetItems(termId) {
  const seen = new Set();
  return CURRICULUM_SUBJECTS.filter(s => s.termId === termId).map(subjectSetItem).filter(item => {
    const key = subjectSetKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortSubjectSetItems(items) {
  return items.sort((a, b) => a.program.localeCompare(b.program) || Number(a.year) - Number(b.year) || a.code.localeCompare(b.code));
}

// The Subject Catalog shows its subjects or its saved subject sets, one tab at a time
let catalogTab = 'subjects';
function showCatalogTab(tab) {
  catalogTab = tab === 'sets' ? 'sets' : 'subjects';
  [['subjects', 'catalogTabSubjects', 'subjectCatalogCard'], ['sets', 'catalogTabSets', 'subjectSetsCard']].forEach(([name, tabId, panelId]) => {
    const isOpen = name === catalogTab;
    const tabButton = document.getElementById(tabId);
    const panel = document.getElementById(panelId);
    if (!tabButton || !panel) return;
    tabButton.classList.toggle('btn-primary', isOpen);
    tabButton.classList.toggle('btn-outline', !isOpen);
    tabButton.setAttribute('aria-selected', String(isOpen));
    panel.style.display = isOpen ? '' : 'none';
  });
}

function renderSubjectSetTable() {
  const tbody = document.getElementById('subjectSetTableBody');
  if (!tbody) return;
  const countBadge = document.getElementById('catalogSetCount');
  if (countBadge) countBadge.textContent = String(SUBJECT_SETS.length);
  const canManage = canManageSubjectSets();
  const btn = document.getElementById('btnAddSubjectSet');
  if (btn) btn.style.display = canManage ? 'inline-flex' : 'none';

  if (SUBJECT_SETS.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:28px 16px; color:var(--text-secondary);">No saved subject sets yet.${canManage ? ' Choose + New Set to make one.' : ''}</td></tr>`;
    return;
  }

  tbody.innerHTML = SUBJECT_SETS.slice().sort((a, b) => a.name.localeCompare(b.name)).map(set => {
    const programs = [...new Set(set.items.map(i => i.program))].sort();
    const actions = canManage
      ? `<button class="btn btn-outline" style="font-size:11px; padding:3px 8px; margin-right:4px;" onclick="openSubjectSetModal(${Number(set.id)})">Edit</button>
         <button class="btn btn-outline" style="font-size:11px; padding:3px 8px; color:var(--danger); border-color:#fadbd8;" onclick="deleteSubjectSet(${Number(set.id)})">Remove</button>`
      : '<span style="font-size:11px; color:var(--text-secondary);">&mdash;</span>';
    return `
      <tr>
        <td style="font-weight:700; color:var(--accent-primary);">${escapeHtml(set.name)}</td>
        <td style="text-align:center; font-weight:600;">${set.items.length}</td>
        <td>${programs.map(p => `<span class="badge" style="background:#F3F4F6; color:#374151; font-size:10.5px; margin:1px 2px;">${escapeHtml(p)}</span>`).join('')}</td>
        <td style="text-align:right;">${actions}</td>
      </tr>
    `;
  }).join('');
}

function showSubjectSetError(message) {
  const el = document.getElementById('subjectSetError');
  el.textContent = message;
  el.style.display = message ? 'block' : 'none';
}

// Opens the set editor for a new set, an existing set, or a ready-made list (preset)
function openSubjectSetModal(id, preset) {
  if (!canManageSubjectSets()) {
    alert('Only the System Administrator or a Program Head can make or edit subject sets.');
    return;
  }
  const set = id ? SUBJECT_SETS.find(s => s.id === id) : null;
  const source = preset ? preset.items : (set ? set.items : []);
  subjectSetDraft = { id: set ? set.id : null, items: sortSubjectSetItems(source.map(item => ({ ...item }))) };

  document.getElementById('subjectSetModalTitle').textContent = set ? 'Edit Subject Set' : 'New Subject Set';
  document.getElementById('subjectSetName').value = preset ? preset.name : (set ? set.name : '');
  showSubjectSetError('');

  document.getElementById('subjectSetCopyTerm').innerHTML = '<option value="">-- Choose a term --</option>' +
    SCHOOL_TERMS.filter(t => CURRICULUM_SUBJECTS.some(s => s.termId === t.id))
      .map(t => `<option value="${Number(t.id)}">${escapeHtml(termLabelFor(t.id))}</option>`).join('');
  renderSubjectSetItems();
  document.getElementById('subjectSetModal').style.display = 'flex';
}

function closeSubjectSetModal() {
  document.getElementById('subjectSetModal').style.display = 'none';
}

function renderSubjectSetItems() {
  const items = subjectSetDraft.items;
  document.getElementById('subjectSetItemsBody').innerHTML = items.length === 0
    ? '<tr><td colspan="6" style="text-align:center; padding:18px; color:var(--text-secondary);">No subjects yet. Copy them from a term or add them from the catalog.</td></tr>'
    : items.map((item, index) => `
      <tr>
        <td style="font-weight:700; color:var(--accent-primary);">${escapeHtml(item.code)}</td>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.program)}</td>
        <td>Year ${Number(item.year)}</td>
        <td>${Number(item.units)}</td>
        <td style="text-align:right;"><button type="button" class="btn btn-outline" style="font-size:11px; padding:2px 7px; color:var(--danger); border-color:#fadbd8;" onclick="removeSubjectSetItem(${index})" aria-label="Remove ${escapeHtml(item.code)} for ${escapeHtml(item.program)} Year ${Number(item.year)}">&times;</button></td>
      </tr>
    `).join('');
  document.getElementById('subjectSetCount').textContent = `${items.length} subject${items.length === 1 ? '' : 's'} in this set`;
  renderSubjectSetPicker();
}

// Checkboxes for the catalog subjects. Ones already in the set for the chosen program and year are ticked and locked.
function renderSubjectSetPicker() {
  const picker = document.getElementById('subjectSetPicker');
  if (!picker) return;
  const program = document.getElementById('subjectSetProgram').value;
  const year = parseInt(document.getElementById('subjectSetYear').value, 10) || 1;
  const inSet = new Set(subjectSetDraft.items.map(subjectSetKey));
  const catalog = SUBJECTS.slice().sort((a, b) => a.code.localeCompare(b.code));
  picker.innerHTML = catalog.length === 0
    ? '<span style="font-size:12px; color:var(--text-secondary);">The Subject Catalog has no subjects yet.</span>'
    : catalog.map(s => {
      const added = inSet.has(subjectSetKey({ code: s.code, program, year }));
      return `<label class="availability-option" title="${escapeHtml(s.title || s.code)}${added ? ' (already in this set)' : ''}" style="${added ? 'opacity:0.55;' : ''}">
        <input type="checkbox" value="${escapeHtml(s.code)}" ${added ? 'checked disabled' : ''} /> ${escapeHtml(s.code)}
      </label>`;
    }).join('');
}

function tickAllSubjectSetPicker() {
  const boxes = [...document.querySelectorAll('#subjectSetPicker input:not(:disabled)')];
  const tickAll = boxes.some(box => !box.checked);
  boxes.forEach(box => { box.checked = tickAll; });
}

function copyTermIntoSubjectSet() {
  const termId = parseInt(document.getElementById('subjectSetCopyTerm').value, 10);
  if (!termId) {
    showSubjectSetError('Choose a term to copy from.');
    return;
  }
  const keys = new Set(subjectSetDraft.items.map(subjectSetKey));
  const added = termSubjectSetItems(termId).filter(item => !keys.has(subjectSetKey(item)));
  subjectSetDraft.items = sortSubjectSetItems([...subjectSetDraft.items, ...added]);
  const nameInput = document.getElementById('subjectSetName');
  if (!nameInput.value.trim()) nameInput.value = termLabelFor(termId);
  showSubjectSetError(added.length === 0 ? 'Every subject from that term is already in this set.' : '');
  renderSubjectSetItems();
}

// Adds every ticked subject for the chosen program and year.
// Hours and type come from the newest curriculum entry with the same code, as in the Step 3 form.
function addCatalogSubjectToSet() {
  const codes = [...document.querySelectorAll('#subjectSetPicker input:checked:not(:disabled)')].map(box => box.value);
  if (codes.length === 0) {
    showSubjectSetError('Tick at least one subject to add.');
    return;
  }
  const program = document.getElementById('subjectSetProgram').value;
  const year = parseInt(document.getElementById('subjectSetYear').value, 10) || 1;
  const keys = new Set(subjectSetDraft.items.map(subjectSetKey));
  const added = [];
  codes.forEach(code => {
    const subj = SUBJECTS.find(s => s.code === code);
    if (!subj || keys.has(subjectSetKey({ code, program, year }))) return;
    const previous = CURRICULUM_SUBJECTS.filter(s => (s.code || '').toUpperCase() === code.toUpperCase()).sort((a, b) => b.id - a.id)[0];
    const units = subj.units || (previous && previous.units) || 3;
    added.push({
      code: subj.code,
      name: subj.title || subj.code,
      units,
      lecHours: previous ? (previous.lecHours || 0) : units,
      labHours: previous ? (previous.labHours || 0) : 0,
      type: previous ? (previous.type || 'lecture') : 'lecture',
      program,
      year
    });
  });
  showSubjectSetError('');
  subjectSetDraft.items = sortSubjectSetItems([...subjectSetDraft.items, ...added]);
  renderSubjectSetItems();
}

function removeSubjectSetItem(index) {
  subjectSetDraft.items.splice(index, 1);
  renderSubjectSetItems();
}

let subjectSetSaving = false;

async function submitSubjectSet() {
  if (!canManageSubjectSets() || subjectSetSaving) return;
  const name = document.getElementById('subjectSetName').value.trim().replace(/\s+/g, ' ');
  if (!name) return showSubjectSetError('Please name the subject set.');
  const nameProblem = name.length > 60 ? 'Set name must be 60 characters or fewer.' : INPUT_RULES.text('Set name', name);
  if (nameProblem) return showSubjectSetError(nameProblem);
  if (SUBJECT_SETS.some(s => s.id !== subjectSetDraft.id && s.name.toLowerCase() === name.toLowerCase())) {
    return showSubjectSetError('Another subject set already has that name.');
  }
  if (subjectSetDraft.items.length === 0) return showSubjectSetError('Add at least one subject to the set.');

  let id = subjectSetDraft.id;
  const items = subjectSetDraft.items.map(item => ({ ...item }));

  // Online, the set is only shown once the server has saved it
  if (!IS_STANDALONE) {
    subjectSetSaving = true;
    const btn = document.getElementById('subjectSetSaveBtn');
    btn.disabled = true;
    try {
      const res = await fetch('api/schedules.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        quietFailure: true,
        body: JSON.stringify({ action: 'save_subject_set', set_id: id || 0, set_name: name, items })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) return showSubjectSetError(body.message || 'The subject set could not be saved.');
      id = Number(body.set_id) || id;
    } catch (e) {
      return showSubjectSetError('Could not reach the server, so the subject set was not saved.');
    } finally {
      subjectSetSaving = false;
      btn.disabled = false;
    }
  }

  if (!id) id = SUBJECT_SETS.length ? Math.max(...SUBJECT_SETS.map(s => s.id)) + 1 : 1;
  const existing = SUBJECT_SETS.find(s => s.id === id);
  if (existing) {
    existing.name = name;
    existing.items = items;
  } else {
    SUBJECT_SETS.push({ id, name, items });
  }
  saveStateToStorage();
  closeSubjectSetModal();
  renderSubjectSetTable();
}

async function deleteSubjectSet(id) {
  if (!canManageSubjectSets()) return;
  const set = SUBJECT_SETS.find(s => s.id === id);
  if (!set) return;
  if (!(await askConfirm(`"${set.name}" will be removed. Subjects already loaded into a term stay in that term.`, { title: 'Remove this subject set?', confirmLabel: 'Remove set', danger: true }))) return;
  SUBJECT_SETS = SUBJECT_SETS.filter(s => s.id !== id);
  saveStateToStorage();
  renderSubjectSetTable();
  postScheduleAction({ action: 'delete_subject_set', set_id: id });
}

// ── Step 3: Load Saved Subjects ──

function openLoadSubjectSetModal() {
  // The same term the Step 3 Add Subject form adds to
  const { activeTerm } = getActiveAcademicContext();
  const termFilter = document.getElementById('curriculumTermFilter')?.value;
  loadSubjectSetTermId = (termFilter && termFilter !== 'all') ? parseInt(termFilter, 10) : (activeTerm ? activeTerm.id : null);
  if (!loadSubjectSetTermId) return;

  document.getElementById('loadSubjectSetTarget').innerHTML = `Subjects are added to <strong>${escapeHtml(termLabelFor(loadSubjectSetTermId))}</strong>. Subjects this term already offers are skipped.`;

  const sets = SUBJECT_SETS.slice().sort((a, b) => a.name.localeCompare(b.name));
  const sel = document.getElementById('loadSubjectSetSelect');
  sel.innerHTML = sets.length
    ? sets.map(s => `<option value="${Number(s.id)}">${escapeHtml(s.name)} (${s.items.length} subject${s.items.length === 1 ? '' : 's'})</option>`).join('')
    : '<option value="">No saved subject sets yet</option>';
  // Start on a set for the same kind of term, such as "2nd Sem" for a 2nd Sem term
  const term = SCHOOL_TERMS.find(t => t.id === loadSubjectSetTermId);
  const match = term && sets.find(s => s.name.toLowerCase().startsWith(term.termName.toLowerCase()));
  if (match) sel.value = String(match.id);

  document.getElementById('btnSaveTermAsSet').style.display =
    canManageSubjectSets() && CURRICULUM_SUBJECTS.some(s => s.termId === loadSubjectSetTermId) ? '' : 'none';
  renderLoadSubjectSetPreview();
  document.getElementById('loadSubjectSetModal').style.display = 'flex';
}

function closeLoadSubjectSetModal() {
  document.getElementById('loadSubjectSetModal').style.display = 'none';
}

function selectedLoadSubjectSet() {
  return SUBJECT_SETS.find(s => s.id === parseInt(document.getElementById('loadSubjectSetSelect').value, 10)) || null;
}

function renderLoadSubjectSetPreview() {
  const preview = document.getElementById('loadSubjectSetPreview');
  const set = selectedLoadSubjectSet();
  if (!set) {
    preview.innerHTML = `<div style="padding:18px; text-align:center; color:var(--text-secondary); font-size:12.5px;">No saved subject sets yet. ${canManageSubjectSets() ? 'Make one in Subject Catalog, or save this term as a set.' : 'The System Administrator or a Program Head can make one in Subject Catalog.'}</div>`;
    updateLoadSubjectSetSummary();
    return;
  }
  const offered = new Set(CURRICULUM_SUBJECTS.filter(s => s.termId === loadSubjectSetTermId).map(subjectSetKey));
  preview.innerHTML = set.items.map((item, index) => {
    const already = offered.has(subjectSetKey(item));
    return `
      <label style="display:flex; gap:10px; align-items:center; padding:8px 12px; border-bottom:1px solid var(--border-subtle); font-size:12.5px; margin:0; ${already ? 'opacity:0.55;' : 'cursor:pointer;'}">
        <input type="checkbox" class="load-set-item" data-index="${index}" ${already ? 'disabled' : 'checked'} onchange="updateLoadSubjectSetSummary()" style="width:16px; height:16px; flex:none;" />
        <span style="font-weight:700; color:var(--accent-primary); min-width:68px;">${escapeHtml(item.code)}</span>
        <span style="flex:1; min-width:0;">${escapeHtml(item.name)}</span>
        <span class="badge" style="background:#F3F4F6; color:#374151; font-size:10.5px; white-space:nowrap;">${escapeHtml(item.program)} · Year ${Number(item.year)}</span>
        ${already ? '<span style="font-size:11px; color:var(--text-secondary); white-space:nowrap;">Already in this term</span>' : ''}
      </label>
    `;
  }).join('') || '<div style="padding:18px; text-align:center; color:var(--text-secondary); font-size:12.5px;">This set has no subjects.</div>';
  updateLoadSubjectSetSummary();
}

function updateLoadSubjectSetSummary() {
  const boxes = [...document.querySelectorAll('#loadSubjectSetPreview .load-set-item')];
  const open = boxes.filter(b => !b.disabled);
  const picked = open.filter(b => b.checked).length;
  const skipped = boxes.length - open.length;
  document.getElementById('loadSubjectSetSummary').textContent = boxes.length
    ? `${picked} of ${open.length} selected${skipped ? ` · ${skipped} already in this term` : ''}`
    : '';
  const submit = document.getElementById('loadSubjectSetSubmit');
  submit.disabled = picked === 0;
  submit.textContent = picked ? `Load ${picked} subject${picked === 1 ? '' : 's'}` : 'Load subjects';
}

function tickAllLoadSubjectSet(checked) {
  document.querySelectorAll('#loadSubjectSetPreview .load-set-item:not(:disabled)').forEach(b => { b.checked = checked; });
  updateLoadSubjectSetSummary();
}

function submitLoadSubjectSet() {
  const set = selectedLoadSubjectSet();
  const termId = loadSubjectSetTermId;
  if (!set || !termId) return;
  const offered = new Set(CURRICULUM_SUBJECTS.filter(s => s.termId === termId).map(subjectSetKey));
  const toAdd = [...document.querySelectorAll('#loadSubjectSetPreview .load-set-item:checked')]
    .map(b => set.items[Number(b.dataset.index)])
    .filter(item => item && !offered.has(subjectSetKey(item)));
  if (toAdd.length === 0) return;

  const term = SCHOOL_TERMS.find(t => t.id === termId);
  let nextId = CURRICULUM_SUBJECTS.length ? Math.max(...CURRICULUM_SUBJECTS.map(s => s.id)) + 1 : 1;
  toAdd.forEach(item => {
    CURRICULUM_SUBJECTS.push({
      id: nextId++,
      termId,
      termName: term ? term.termName : undefined,
      code: item.code,
      name: item.name,
      units: item.units,
      lecHours: item.lecHours,
      labHours: item.labHours,
      type: item.type,
      program: item.program,
      year: Number(item.year),
      curriculum: '2024 Revised',
      isIncluded: true
    });
  });
  saveStateToStorage();
  closeLoadSubjectSetModal();
  renderSubjectOfferingTable();

  // The server adds the same subjects; the reload after it brings back their database IDs
  postScheduleAction({ action: 'add_term_subjects', term_id: termId, items: toAdd });
}

// Opens the set editor filled with the Step 3 term's subjects
function saveTermAsSubjectSet() {
  const termId = loadSubjectSetTermId;
  if (!termId || !canManageSubjectSets()) return;
  let name = termLabelFor(termId);
  if (SUBJECT_SETS.some(s => s.name.toLowerCase() === name.toLowerCase())) name = `${name} (copy)`.slice(0, 60);
  closeLoadSubjectSetModal();
  openSubjectSetModal(null, { name, items: termSubjectSetItems(termId) });
}