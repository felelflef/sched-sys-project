/* ═══════════════════════════════════════════════════
   MODULE — SUBJECT CATALOG & CURRICULUM MANAGEMENT
   ═══════════════════════════════════════════════════ */

function renderSubjectDeptFilterOptions() {
  const select = document.getElementById('subjectDeptFilter');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="all">All Departments & Subjects</option><option value="it-only">💻 IT / CS Professor Only</option>';
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
    if (filterVal === 'it-only') {
      matchDept = s.itOnly === true;
    } else if (filterVal !== 'all') {
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

  filtered.forEach(subj => {
    const tr = document.createElement('tr');

    const eligBadge = subj.itOnly
      ? `<span class="badge" style="background:#EEF2FF; color:var(--accent-primary); border:1px solid #C7D2FE; font-weight:600;">💻 IT / CS Professor Only</span>`
      : `<span class="badge" style="background:#F1F5F9; color:var(--text-secondary); border:1px solid #CBD5E1;">🌐 Other Department (${subj.dept})</span>`;

    const actionButtons = isAdmin
      ? `<button class="btn btn-outline" style="font-size:11px; padding:3px 8px; margin-right:4px;" onclick="openEditSubjectModal('${subj.code}')">Edit</button>
         <button class="btn btn-outline" style="font-size:11px; padding:3px 8px; color:var(--danger); border-color:#fadbd8;" onclick="promptDeleteSubject('${subj.code}')">Remove</button>`
      : `<span style="font-size:11px; color:var(--text-secondary);">&mdash;</span>`;

    tr.innerHTML = `
      <td style="font-weight:700; color:var(--accent-primary);">${subj.code}</td>
      <td>
        <div style="font-weight:600; color:var(--text-primary); font-size:13px;">${subj.title}</div>
      </td>
      <td><span class="badge" style="background:#F8FAFC; border:1px solid var(--border-subtle); color:var(--text-primary);">${subj.dept}</span></td>
      <td>${eligBadge}</td>
      <td style="text-align:center; font-weight:600;">${subj.units || 3}</td>
      <td style="text-align:right;">${actionButtons}</td>
    `;
    tbody.appendChild(tr);
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

  document.getElementById('eligibilityITOnly').checked = true;
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

  if (subj.itOnly) {
    document.getElementById('eligibilityITOnly').checked = true;
  } else {
    document.getElementById('eligibilityOther').checked = true;
  }

  document.getElementById('subjectModalSubmitBtn').textContent = 'Save Changes';
  document.getElementById('subjectModal').style.display = 'flex';
};

window.closeSubjectModal = function() {
  document.getElementById('subjectModal').style.display = 'none';
};

window.handleSubjectDeptChange = function(dept) {
  if (dept === 'IT / CS') {
    document.getElementById('eligibilityITOnly').checked = true;
  } else {
    document.getElementById('eligibilityOther').checked = true;
  }
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
  const itOnly = document.getElementById('eligibilityITOnly').checked;

  if (!code) {
    alert('Please enter a course code.');
    return;
  }
  if (!title) {
    alert('Please enter a subject title.');
    return;
  }

  if (origCode) {
    // Edit existing
    const subj = SUBJECTS.find(s => s.code.toLowerCase() === origCode.toLowerCase());
    if (subj) {
      subj.title = title;
      subj.units = units;
      subj.dept = dept;
      subj.itOnly = itOnly;
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
      itOnly,
      units
    });
  }

  closeSubjectModal();
  renderSubjectTable();
  renderSubjectDatalist();
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
  document.getElementById('deleteSubjectTitleDisplay').textContent = `${subj.title} · ${subj.dept} (${subj.itOnly ? 'IT/CS Only' : 'Other Dept'})`;
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

  closeDeleteSubjectModal();
  renderSubjectTable();
  renderSubjectDatalist();
};

// Backward-compatible alias
window.deleteSubject = window.promptDeleteSubject;
