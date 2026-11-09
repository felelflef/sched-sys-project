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

  const isAdmin = CURRENT_USER && CURRENT_USER.role === 'admin';
  const btnAdd = document.getElementById('btnAddSubject');
  if (btnAdd) {
    btnAdd.style.display = isAdmin ? 'inline-flex' : 'none';
  }

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
  const isAdmin = CURRENT_USER && CURRENT_USER.role === 'admin';

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
// A professor can't be taken off a subject they still teach this term
function subjectFormRemovalProblem(form, code) {
  const target = code.toUpperCase();
  const selected = subjectFormProfessors[form];
  const teaching = FACULTY.find(fac => !selected.includes(fac.email) && isFacultyQualified(fac, target)
    && activeTermClasses().some(c => c.instructor === fac.name && (c.subjectCode || '').toUpperCase() === target));
  return teaching ? `${teaching.name} still teaches ${target} this term. Reassign those classes before removing them.` : null;
}

function saveSubjectFormProfessors(form, code, subjectSaved) {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') return;

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
    changed.forEach(saveFacultyQualifications);
  });
}

window.openAddSubjectModal = function() {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to add subjects.');
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
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to edit subjects.');
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

window.submitSubjectForm = function() {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to save subjects.');
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

  const subjectQualProblem = origCode ? subjectFormRemovalProblem('subject', origCode) : null;
  if (subjectQualProblem) {
    alert(subjectQualProblem);
    return;
  }

  const subjectProblem = INPUT_RULES.code('Course code', code) || INPUT_RULES.text('Subject title', title)
    || INPUT_RULES.int('Units', document.getElementById('subjectUnitsInput').value, 1, 6);
  if (subjectProblem) {
    alert(subjectProblem);
    return;
  }

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
  saveSubjectFormProfessors('subject', origCode || code, subjectSaved);
};

window.promptDeleteSubject = function(code) {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to remove subjects.');
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
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to remove subjects.');
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
