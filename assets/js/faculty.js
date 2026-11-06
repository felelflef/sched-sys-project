/* ═══════════════════════════════════════════════════
   MODULE 4 — FACULTY PROFILES & DEPARTMENT MANAGEMENT
   ═══════════════════════════════════════════════════ */

function renderDeptFilterOptions() {
  const select = document.getElementById('facultyDeptFilter');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="all">All Departments</option>';
  DEPARTMENTS.forEach(dept => {
    const opt = document.createElement('option');
    opt.value = dept;
    opt.textContent = dept;
    if (dept === currentVal) opt.selected = true;
    select.appendChild(opt);
  });
}

function renderFacultyCards() {
  const grid = document.getElementById('facultyGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const isAdmin = CURRENT_USER && CURRENT_USER.role === 'admin';
  const btnAddFac = document.getElementById('btnAddFaculty');
  if (btnAddFac) {
    btnAddFac.style.display = isAdmin ? 'inline-flex' : 'none';
  }
  const btnManageDepts = document.getElementById('btnManageDepts');
  if (btnManageDepts) {
    btnManageDepts.style.display = isAdmin ? 'inline-flex' : 'none';
  }

  const deptFilter = document.getElementById('facultyDeptFilter')?.value || 'all';
  const statusFilter = document.getElementById('facultyStatusFilter')?.value || 'all';

  const filtered = FACULTY.filter(fac => {
    const matchDept = deptFilter === 'all' || fac.dept === deptFilter;
    const matchStatus = statusFilter === 'all' || fac.status === statusFilter;
    return matchDept && matchStatus;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 48px 24px; text-align: center; color: var(--text-secondary); background: white; border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
        <div style="font-size: 15px; font-weight: 600; margin-bottom: 4px;">No faculty profiles found</div>
        <div style="font-size: 12.5px;">No faculty members match the selected department and status filter criteria.</div>
      </div>
    `;
    return;
  }

  filtered.forEach(fac => {
    const initials = fac.name.split(' ').filter(w => w.length > 1).map(w => w[0]).join('').slice(0,2);
    const loadPct = Math.round((fac.load / fac.maxLoad) * 100);
    const loadColor = loadPct >= 100 ? 'var(--danger)' : loadPct >= 80 ? 'var(--warning)' : 'var(--success)';

    const mainList = Array.isArray(fac.mainQuals) ? fac.mainQuals : (fac.quals ? fac.quals.slice(0, 2) : []);
    const sideList = Array.isArray(fac.sideQuals) ? fac.sideQuals : (fac.quals ? fac.quals.slice(2) : []);
    const safeEmailId = fac.email.replace(/[^a-zA-Z0-9]/g, '_');

    const mainQualsHtml = mainList.length > 0
      ? mainList.map(q => {
          const removeBtn = isAdmin ? `<span onclick="removeFacultyQual('${escapeHtml(fac.email)}', 'main', '${escapeHtml(q)}', event)" style="margin-left:5px; cursor:pointer; font-weight:800; opacity:0.6;" title="Remove ${escapeHtml(q)}">✕</span>` : '';
          return `<span class="qual-tag locked" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-weight:600; display:inline-flex; align-items:center;" title="Main Teaching Qualification">★ ${escapeHtml(q)}${removeBtn}</span>`;
        }).join('')
      : `<span style="font-size:11px; color:var(--text-secondary); font-style:italic;">None</span>`;

    const sideQualsHtml = sideList.length > 0
      ? sideList.map(q => {
          const removeBtn = isAdmin ? `<span onclick="removeFacultyQual('${escapeHtml(fac.email)}', 'side', '${escapeHtml(q)}', event)" style="margin-left:5px; cursor:pointer; font-weight:800; opacity:0.6;" title="Remove ${escapeHtml(q)}">✕</span>` : '';
          return `<span class="qual-tag locked" style="background:#f8fafc; color:#475569; border:1px solid #cbd5e1; display:inline-flex; align-items:center;" title="Side / Secondary Qualification">✦ ${escapeHtml(q)}${removeBtn}</span>`;
        }).join('')
      : `<span style="font-size:11px; color:var(--text-secondary); font-style:italic;">None</span>`;

    const facultyActionBtns = isAdmin
      ? `<button class="btn btn-outline" style="font-size:10px; padding:1px 6px; border-radius:4px;" onclick="openChangeFacultyDeptModal('${fac.email}')">Edit Profile</button>
         <button class="btn btn-outline" style="font-size:10px; padding:1px 6px; border-radius:4px; color:var(--danger); border-color:#fadbd8;" onclick="promptDeleteFaculty('${fac.email}')">Remove</button>`
      : ``;

    const card = document.createElement('div');
    card.className = 'faculty-card';
    card.innerHTML = `
      <div class="faculty-card-header">
        <div class="faculty-avatar" style="background:${fac.bg};">${initials}</div>
        <div style="flex:1;">
          <div class="faculty-name">${fac.name}</div>
          <div class="faculty-dept" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span>${fac.dept} · ${fac.status}</span>
            <span class="badge badge-success" style="font-size:10px; padding:1px 6px;">✓ Account: ${fac.email}</span>
            ${facultyActionBtns}
          </div>
        </div>
        <span class="badge" style="background:${loadColor}20; color:${loadColor}; border:1px solid ${loadColor}40; font-size:11px;">${loadPct}% Load</span>
      </div>
      <div class="faculty-body">
        <div class="faculty-meta-row">
          <span class="faculty-meta-label">Current Load</span>
          <span class="faculty-meta-value">${fac.load} / ${fac.maxLoad} hrs</span>
        </div>
        <div style="height:6px; background:#ECEEF2; border-radius:3px; overflow:hidden; margin-bottom:14px;">
          <div style="height:100%; width:${loadPct}%; background:${loadColor}; border-radius:3px; transition:width 0.6s ease;"></div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px; margin-bottom:4px;">
          <span class="faculty-meta-label" style="margin:0; font-weight:700; color:#0369a1;">★ Main Qualifications</span>
          ${isAdmin ? `<button class="btn btn-outline" style="font-size:11px; padding:1px 7px; border-radius:4px; height:22px; line-height:1; display:inline-flex; align-items:center; gap:3px; color:#0369a1; border-color:#bae6fd;" onclick="toggleAddQualDropdown('${escapeHtml(fac.email)}', 'main', event)" title="Add Subject Qualification">+ Add</button>` : ''}
        </div>
        <div id="addQualContainer-${safeEmailId}-main" style="display:none; margin-bottom:8px;"></div>
        <div class="qual-tags" style="margin-bottom:10px;">${mainQualsHtml}</div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; margin-bottom:4px;">
          <span class="faculty-meta-label" style="margin:0; font-weight:600; color:var(--text-secondary);">✦ Side Qualifications</span>
          ${isAdmin ? `<button class="btn btn-outline" style="font-size:11px; padding:1px 7px; border-radius:4px; height:22px; line-height:1; display:inline-flex; align-items:center; gap:3px;" onclick="toggleAddQualDropdown('${escapeHtml(fac.email)}', 'side', event)" title="Add Subject Qualification">+ Add</button>` : ''}
        </div>
        <div id="addQualContainer-${safeEmailId}-side" style="display:none; margin-bottom:8px;"></div>
        <div class="qual-tags">${sideQualsHtml}</div>

      </div>
    `;
    grid.appendChild(card);
  });
}

function getAllCatalogSubjects() {
  const map = new Map();
  if (typeof SUBJECTS !== 'undefined' && Array.isArray(SUBJECTS)) {
    SUBJECTS.forEach(s => {
      const code = (s.code || '').toUpperCase().trim();
      if (code) {
        map.set(code, { code: s.code.trim(), title: s.title || s.name || s.code, dept: s.dept || '' });
      }
    });
  }
  if (typeof CURRICULUM_SUBJECTS !== 'undefined' && Array.isArray(CURRICULUM_SUBJECTS)) {
    CURRICULUM_SUBJECTS.forEach(s => {
      const code = (s.code || '').toUpperCase().trim();
      if (code && !map.has(code)) {
        map.set(code, { code: s.code.trim(), title: s.name || s.title || s.code, dept: s.dept || '' });
      }
    });
  }
  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
}
window.getAllCatalogSubjects = getAllCatalogSubjects;

window.toggleAddQualDropdown = function(email, type, event) {
  if (event) event.stopPropagation();
  const safeId = email.replace(/[^a-zA-Z0-9]/g, '_');
  const container = document.getElementById(`addQualContainer-${safeId}-${type}`);
  if (!container) return;

  if (container.style.display === 'block') {
    container.style.display = 'none';
    return;
  }

  const fac = FACULTY.find(f => f.email && f.email.toLowerCase() === email.toLowerCase());
  if (!fac) return;

  const currentQuals = new Set([...(fac.mainQuals || []), ...(fac.sideQuals || [])].map(q => q.toUpperCase()));
  const allSubjs = getAllCatalogSubjects();
  const availableSubjs = allSubjs.filter(s => !currentQuals.has(s.code.toUpperCase()));

  if (availableSubjs.length === 0) {
    container.innerHTML = `<div style="font-size:11px; color:var(--text-secondary); padding:4px;">All catalog subjects are already assigned.</div>`;
    container.style.display = 'block';
    return;
  }

  container.innerHTML = `
    <div style="display:flex; gap:6px; align-items:center; background:#F8FAFD; border:1px solid #BAE6FD; border-radius:6px; padding:6px 8px; margin-top:4px;">
      <select id="selectAddQual-${safeId}-${type}" class="form-input" style="font-size:11.5px; padding:3px 6px; flex:1; height:28px;">
        <option value="">-- Choose Subject to Add --</option>
        ${availableSubjs.map(s => `<option value="${escapeHtml(s.code)}">${escapeHtml(s.code)} — ${escapeHtml(s.title)} (${escapeHtml(s.dept || 'General')})</option>`).join('')}
      </select>
      <button class="btn btn-primary" style="font-size:11px; padding:3px 10px; height:28px; line-height:1;" onclick="confirmAddFacultyQual('${escapeHtml(fac.email)}', '${type}')">Add</button>
      <button class="btn btn-outline" style="font-size:11px; padding:3px 8px; height:28px; line-height:1;" onclick="closeAddQualDropdown('${escapeHtml(fac.email)}', '${type}')">✕</button>
    </div>
  `;
  container.style.display = 'block';
};

window.closeAddQualDropdown = function(email, type) {
  const safeId = email.replace(/[^a-zA-Z0-9]/g, '_');
  const container = document.getElementById(`addQualContainer-${safeId}-${type}`);
  if (container) container.style.display = 'none';
};

window.confirmAddFacultyQual = function(email, type) {
  const safeId = email.replace(/[^a-zA-Z0-9]/g, '_');
  const sel = document.getElementById(`selectAddQual-${safeId}-${type}`);
  const subjCode = sel ? sel.value.trim().toUpperCase() : '';
  if (!subjCode) {
    alert('Please choose a subject to add.');
    return;
  }

  const fac = FACULTY.find(f => f.email && f.email.toLowerCase() === email.toLowerCase());
  if (!fac) return;

  if (!Array.isArray(fac.mainQuals)) fac.mainQuals = Array.isArray(fac.quals) ? [...fac.quals.slice(0, 2)] : [];
  if (!Array.isArray(fac.sideQuals)) fac.sideQuals = Array.isArray(fac.quals) ? [...fac.quals.slice(2)] : [];

  if (type === 'main') {
    if (!fac.mainQuals.some(q => q.toUpperCase() === subjCode)) {
      fac.mainQuals.push(subjCode);
    }
  } else {
    if (!fac.sideQuals.some(q => q.toUpperCase() === subjCode)) {
      fac.sideQuals.push(subjCode);
    }
  }

  fac.quals = [...new Set([...fac.mainQuals, ...fac.sideQuals])];
  if (typeof saveStateToStorage === 'function') saveStateToStorage();

  renderFacultyCards();
  if (typeof renderGrid === 'function') renderGrid();
  if (typeof renderGlobalScheduleTable === 'function') renderGlobalScheduleTable();
};

window.removeFacultyQual = function(email, type, subjectCode, event) {
  if (event) event.stopPropagation();
  const fac = FACULTY.find(f => f.email && f.email.toLowerCase() === email.toLowerCase());
  if (!fac) return;

  if (!Array.isArray(fac.mainQuals)) fac.mainQuals = Array.isArray(fac.quals) ? [...fac.quals.slice(0, 2)] : [];
  if (!Array.isArray(fac.sideQuals)) fac.sideQuals = Array.isArray(fac.quals) ? [...fac.quals.slice(2)] : [];

  const target = (subjectCode || '').toUpperCase();
  if (type === 'main') {
    fac.mainQuals = fac.mainQuals.filter(q => q.toUpperCase() !== target);
  } else if (type === 'side') {
    fac.sideQuals = fac.sideQuals.filter(q => q.toUpperCase() !== target);
  }

  fac.quals = [...new Set([...fac.mainQuals, ...fac.sideQuals])];
  if (typeof saveStateToStorage === 'function') saveStateToStorage();

  renderFacultyCards();
  if (typeof renderGrid === 'function') renderGrid();
  if (typeof renderGlobalScheduleTable === 'function') renderGlobalScheduleTable();
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('facultyDeptFilter')?.addEventListener('change', renderFacultyCards);
  document.getElementById('facultyStatusFilter')?.addEventListener('change', renderFacultyCards);
});

// Department Management functions
window.openDeptModal = function() {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to manage departments.');
    return;
  }
  renderDeptList();
  document.getElementById('newDeptInput').value = '';
  document.getElementById('deptModal').style.display = 'flex';
};

window.closeDeptModal = function() {
  document.getElementById('deptModal').style.display = 'none';
};

function renderDeptList() {
  const container = document.getElementById('deptListContainer');
  if (!container) return;
  container.innerHTML = '';
  DEPARTMENTS.forEach((dept, idx) => {
    const facultyCount = FACULTY.filter(f => f.dept === dept).length;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#F8FAFD; border:1px solid var(--border-subtle); border-radius:8px; gap:8px;';
    row.innerHTML = `
      <div style="flex:1;">
        <div style="font-weight:600; font-size:13px; color:var(--text-primary);">${dept}</div>
        <div style="font-size:11px; color:var(--text-secondary);">${facultyCount} faculty assigned</div>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn btn-outline" style="padding:4px 8px; font-size:11px; color:var(--danger); border-color:#fadbd8;" onclick="deleteDepartment(${idx})">Delete</button>
      </div>
    `;
    container.appendChild(row);
  });
}

window.addDepartment = function() {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to add departments.');
    return;
  }
  const input = document.getElementById('newDeptInput');
  const name = input.value.trim();
  if (!name) {
    alert('Please enter a department name.');
    return;
  }
  if (DEPARTMENTS.some(d => d.toLowerCase() === name.toLowerCase())) {
    alert('This department already exists.');
    return;
  }
  DEPARTMENTS.push(name);
  input.value = '';
  renderDeptList();
  renderDeptFilterOptions();
  renderFacultyCards();
  renderSubjectDeptFilterOptions();
};

window.deleteDepartment = function(idx) {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to remove departments.');
    return;
  }
  if (idx < 0 || idx >= DEPARTMENTS.length) return;
  if (DEPARTMENTS.length <= 1) {
    alert('At least one academic department must remain in the system.');
    return;
  }
  const target = DEPARTMENTS[idx];
  DEPARTMENTS.splice(idx, 1);
  const fallback = DEPARTMENTS[0] || 'General';
  FACULTY.forEach(f => {
    if (f.dept === target) f.dept = fallback;
  });
  SUBJECTS.forEach(s => {
    if (s.dept === target) s.dept = fallback;
  });
  renderDeptList();
  renderDeptFilterOptions();
  renderFacultyCards();
  renderSubjectDeptFilterOptions();
  renderSubjectTable();
};

let modalCurrentMainQuals = [];
let modalCurrentSideQuals = [];

function renderModalQualBadges(type) {
  const isMain = type === 'main';
  const container = document.getElementById(isMain ? 'modalMainQualsBadgeContainer' : 'modalSideQualsBadgeContainer');
  const hiddenInput = document.getElementById(isMain ? 'changeFacultyMainQualsInput' : 'changeFacultySideQualsInput');
  const quals = isMain ? modalCurrentMainQuals : modalCurrentSideQuals;

  if (hiddenInput) {
    hiddenInput.value = quals.join(', ');
  }

  if (!container) return;

  if (quals.length === 0) {
    container.innerHTML = `<span style="font-size:11px; color:var(--text-secondary); font-style:italic; padding:3px 0;">No ${type} qualifications assigned</span>`;
    return;
  }

  container.innerHTML = quals.map(q => {
    return `<span class="qual-tag" style="background:${isMain ? '#e0f2fe' : '#f8fafc'}; color:${isMain ? '#0369a1' : '#475569'}; border:1px solid ${isMain ? '#bae6fd' : '#cbd5e1'}; font-weight:600; display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:4px; font-size:11px;">
      ${isMain ? '★' : '✦'} ${escapeHtml(q)}
      <span onclick="removeModalQual('${type}', '${escapeHtml(q)}')" style="cursor:pointer; font-weight:800; opacity:0.6; margin-left:4px;" title="Remove ${escapeHtml(q)}">✕</span>
    </span>`;
  }).join('');
}

function populateModalQualSelects() {
  const allSubjs = getAllCatalogSubjects();
  const currentAssigned = new Set([...modalCurrentMainQuals, ...modalCurrentSideQuals].map(q => q.toUpperCase()));
  const availableSubjs = allSubjs.filter(s => !currentAssigned.has(s.code.toUpperCase()));

  ['main', 'side'].forEach(type => {
    const sel = document.getElementById(type === 'main' ? 'modalAddMainQualSelect' : 'modalAddSideQualSelect');
    if (!sel) return;
    sel.innerHTML = `<option value="">-- Choose Subject --</option>` +
      availableSubjs.map(s => `<option value="${escapeHtml(s.code)}">${escapeHtml(s.code)} — ${escapeHtml(s.title)}</option>`).join('');
  });
}

window.addModalQual = function(type) {
  const sel = document.getElementById(type === 'main' ? 'modalAddMainQualSelect' : 'modalAddSideQualSelect');
  const code = sel ? sel.value.trim().toUpperCase() : '';
  if (!code) {
    alert('Please select a subject from the catalog to add.');
    return;
  }

  if (type === 'main') {
    if (!modalCurrentMainQuals.some(q => q.toUpperCase() === code)) {
      modalCurrentMainQuals.push(code);
    }
  } else {
    if (!modalCurrentSideQuals.some(q => q.toUpperCase() === code)) {
      modalCurrentSideQuals.push(code);
    }
  }

  renderModalQualBadges('main');
  renderModalQualBadges('side');
  populateModalQualSelects();
};

window.removeModalQual = function(type, code) {
  const target = (code || '').toUpperCase();
  if (type === 'main') {
    modalCurrentMainQuals = modalCurrentMainQuals.filter(q => q.toUpperCase() !== target);
  } else {
    modalCurrentSideQuals = modalCurrentSideQuals.filter(q => q.toUpperCase() !== target);
  }

  renderModalQualBadges('main');
  renderModalQualBadges('side');
  populateModalQualSelects();
};

window.openChangeFacultyDeptModal = function(identifier) {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to edit faculty profiles.');
    return;
  }
  const fac = FACULTY.find(f => (f.email && f.email.toLowerCase() === identifier.toLowerCase()) || (f.name && f.name.toLowerCase() === identifier.toLowerCase()));
  if (!fac) return;

  document.getElementById('changeFacultyDeptTargetEmail').value = fac.email;
  const nameInput = document.getElementById('changeFacultyNameInput');
  if (nameInput) nameInput.value = fac.name;

  modalCurrentMainQuals = Array.isArray(fac.mainQuals) ? [...fac.mainQuals] : (fac.quals ? [...fac.quals.slice(0, 2)] : []);
  modalCurrentSideQuals = Array.isArray(fac.sideQuals) ? [...fac.sideQuals] : (fac.quals ? [...fac.quals.slice(2)] : []);

  renderModalQualBadges('main');
  renderModalQualBadges('side');
  populateModalQualSelects();

  const nameDisplay = document.getElementById('changeFacultyDeptNameDisplay');
  if (nameDisplay) nameDisplay.textContent = fac.name;
  const emailDisplay = document.getElementById('changeFacultyDeptEmailDisplay');
  if (emailDisplay) emailDisplay.textContent = `${fac.email} · Current Dept: ${fac.dept}`;

  const select = document.getElementById('changeFacultyDeptSelect');
  select.innerHTML = '';
  DEPARTMENTS.forEach(dept => {
    const opt = document.createElement('option');
    opt.value = dept;
    opt.textContent = dept;
    if (dept === fac.dept) opt.selected = true;
    select.appendChild(opt);
  });

  const statusSelect = document.getElementById('changeFacultyStatusSelect');
  if (statusSelect) {
    statusSelect.value = fac.status || 'Full-time';
  }

  document.getElementById('changeFacultyDeptModal').style.display = 'flex';
};

window.closeChangeFacultyDeptModal = function() {
  document.getElementById('changeFacultyDeptModal').style.display = 'none';
};

window.submitChangeFacultyDept = function() {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to edit faculty profiles.');
    return;
  }
  const email = document.getElementById('changeFacultyDeptTargetEmail').value;
  const newDept = document.getElementById('changeFacultyDeptSelect').value;
  const nameInput = document.getElementById('changeFacultyNameInput');
  const newName = nameInput ? nameInput.value.trim() : '';

  if (!newName) {
    alert('Please enter a valid faculty name.');
    return;
  }

  const fac = FACULTY.find(f => f.email && f.email.toLowerCase() === email.toLowerCase());
  if (!fac) {
    alert('Faculty profile not found.');
    return;
  }

  const oldName = fac.name;

  // 1. Update faculty profile
  fac.name = newName;
  if (newDept) fac.dept = newDept;
  const statusSelect = document.getElementById('changeFacultyStatusSelect');
  const newStatus = statusSelect ? statusSelect.value : (fac.status || 'Full-time');
  fac.status = newStatus;
  if (newStatus === 'Part-time' && fac.maxLoad > 18) {
    fac.maxLoad = 15;
  } else if (newStatus === 'Full-time' && fac.maxLoad < 20) {
    fac.maxLoad = 24;
  }
  const mainQualsRaw = document.getElementById('changeFacultyMainQualsInput') ? document.getElementById('changeFacultyMainQualsInput').value.trim() : '';
  const sideQualsRaw = document.getElementById('changeFacultySideQualsInput') ? document.getElementById('changeFacultySideQualsInput').value.trim() : '';
  const parsedMainQuals = mainQualsRaw ? mainQualsRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : [];
  const parsedSideQuals = sideQualsRaw ? sideQualsRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : [];
  fac.mainQuals = parsedMainQuals;
  fac.sideQuals = parsedSideQuals;
  fac.quals = [...new Set([...parsedMainQuals, ...parsedSideQuals])];
  if (typeof saveStateToStorage === 'function') saveStateToStorage();

  // 2. Update registered account in USERS list
  const user = USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (user) {
    user.name = newName;
    user.employmentType = newStatus;
  }

  // 3. Update VALID_USERS cache
  if (VALID_USERS[email.toLowerCase()]) {
    VALID_USERS[email.toLowerCase()].name = newName;
    VALID_USERS[email.toLowerCase()].initials = newName.split(' ').filter(w => w.length > 0).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'ST';
  }

  // 4. Update assigned timetable slots if name changed
  if (oldName !== newName && typeof scheduleData !== 'undefined') {
    Object.keys(scheduleData).forEach(roomCode => {
      Object.keys(scheduleData[roomCode]).forEach(slotIdx => {
        if (scheduleData[roomCode][slotIdx]?.faculty === oldName) {
          scheduleData[roomCode][slotIdx].faculty = newName;
        }
      });
    });
  }

  // Synchronize and re-evaluate MASTER_SCHEDULE_DATA assignments for this faculty member
  if (typeof MASTER_SCHEDULE_DATA !== 'undefined' && Array.isArray(MASTER_SCHEDULE_DATA)) {
    MASTER_SCHEDULE_DATA.forEach(c => {
      if (c.instructor === oldName) {
        c.instructor = newName;
      }
      if (c.instructor === newName) {
        if (typeof checkFacultySubjectConflict === 'function') {
          const conflict = checkFacultySubjectConflict(newName, c.subjectCode, c.section);
          if (conflict) {
            // Find an eligible, qualified, or department-allowable faculty replacement
            const targetCode = (c.subjectCode || '').toUpperCase();
            const eligible = (typeof FACULTY !== 'undefined' ? FACULTY : []).filter(other => {
              if (other.name === newName) return false;
              return !checkFacultySubjectConflict(other.name, targetCode, c.section);
            });
            if (eligible.length > 0) {
              const mainMatch = eligible.find(f => (f.mainQuals || []).some(q => q.toUpperCase() === targetCode));
              const sideMatch = eligible.find(f => (f.sideQuals || []).some(q => q.toUpperCase() === targetCode));
              const replacement = mainMatch || sideMatch || eligible[0];
              if (replacement) {
                c.instructor = replacement.name;
              }
            }
          }
        }
      }
    });
  }

  // 5. Update CURRENT_USER if admin edited their own account
  if (CURRENT_USER && CURRENT_USER.email.toLowerCase() === email.toLowerCase()) {
    CURRENT_USER.name = newName;
    CURRENT_USER.initials = newName.split(' ').filter(w => w.length > 0).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'ST';
    const sidebarName = document.querySelector('.sidebar-footer .user-name');
    if (sidebarName) sidebarName.textContent = newName;
    const sidebarAvatar = document.querySelector('.sidebar-footer .avatar');
    if (sidebarAvatar) sidebarAvatar.textContent = CURRENT_USER.initials;
  }

  // 6. Persist name and subject_role to MySQL via API
  const nameParts = newName.split(' ');
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ') || nameParts[0];

  fetch('/api/users.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'edit_user',
      email: email,
      first_name: firstName,
      last_name: lastName,
      subject_role: newDept
    })
  }).catch(err => {
    console.log('[Database update offline/standalone mode]:', err);
  });

  closeChangeFacultyDeptModal();
  renderFacultyCards();
  renderUserTable();
  renderGrid();
  if (typeof renderTimetable === 'function') renderTimetable();
  if (typeof renderGlobalScheduleTable === 'function') renderGlobalScheduleTable();
  renderDeptList();
  renderDeptFilterOptions();
};

// Backward-compatible aliases
window.changeFacultyDept = window.openChangeFacultyDeptModal;
window.openEditFacultyModal = window.openChangeFacultyDeptModal;
window.submitChangeFacultyProfile = window.submitChangeFacultyDept;

// Add Faculty Modal Functions
window.openAddFacultyModal = function() {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to add faculty profiles.');
    return;
  }
  const userSelect = document.getElementById('newFacUserSelect');
  if (userSelect) {
    userSelect.innerHTML = '';
    // Registered accounts in User Management eligible for teaching
    const registeredFacultyUsers = USERS.filter(u => u.role === 'faculty' || u.role === 'program-head' || u.role === 'academic-head');
    
    if (registeredFacultyUsers.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No registered faculty accounts found in User Management';
      userSelect.appendChild(opt);
    } else {
      registeredFacultyUsers.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.email;
        const hasProfile = FACULTY.some(f => f.email.toLowerCase() === u.email.toLowerCase());
        opt.textContent = `${u.name} (${u.email}) — ${u.roleLabel}${hasProfile ? ' [Profile Active]' : ''}`;
        userSelect.appendChild(opt);
      });
    }
  }

  const deptSelect = document.getElementById('newFacDept');
  deptSelect.innerHTML = '';
  DEPARTMENTS.forEach(dept => {
    const opt = document.createElement('option');
    opt.value = dept;
    opt.textContent = dept;
    deptSelect.appendChild(opt);
  });

  document.getElementById('newFacStatus').value = 'Full-time';
  document.getElementById('newFacMaxLoad').value = '24';
  if (document.getElementById('newFacMainQuals')) document.getElementById('newFacMainQuals').value = 'ITE 101, CC 103';
  if (document.getElementById('newFacSideQuals')) document.getElementById('newFacSideQuals').value = 'IM 101';

  if (userSelect && userSelect.value) {
    window.handleFacultyUserDropdownChange(userSelect.value);
  }

  document.getElementById('addFacultyModal').style.display = 'flex';
};

window.closeAddFacultyModal = function() {
  document.getElementById('addFacultyModal').style.display = 'none';
};

window.handleFacultyUserDropdownChange = function(email) {
  if (!email) return;
  const user = USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return;

  const deptSelect = document.getElementById('newFacDept');
  for (let i = 0; i < deptSelect.options.length; i++) {
    if (user.roleLabel.toLowerCase().includes(deptSelect.options[i].value.toLowerCase())) {
      deptSelect.selectedIndex = i;
      break;
    }
  }

  const existingFac = FACULTY.find(f => f.email.toLowerCase() === email.toLowerCase());
  if (existingFac) {
    if (existingFac.dept) deptSelect.value = existingFac.dept;
    if (existingFac.status) document.getElementById('newFacStatus').value = existingFac.status;
    if (existingFac.maxLoad) document.getElementById('newFacMaxLoad').value = existingFac.maxLoad;
    if (document.getElementById('newFacMainQuals')) document.getElementById('newFacMainQuals').value = (existingFac.mainQuals || existingFac.quals?.slice(0, 2) || []).join(', ');
    if (document.getElementById('newFacSideQuals')) document.getElementById('newFacSideQuals').value = (existingFac.sideQuals || existingFac.quals?.slice(2) || []).join(', ');
  }
};

window.submitAddFaculty = function() {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to save faculty profiles.');
    closeAddFacultyModal();
    return;
  }
  const email = document.getElementById('newFacUserSelect')?.value;
  if (!email) {
    alert('Please select an account registered in User Management.');
    return;
  }

  const user = USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    alert('Selected user account was not found in User Management.');
    return;
  }

  const dept = document.getElementById('newFacDept').value;
  const status = document.getElementById('newFacStatus').value;
  const maxLoad = parseInt(document.getElementById('newFacMaxLoad').value, 10) || 24;
  const mainQualsRaw = document.getElementById('newFacMainQuals')?.value.trim() || '';
  const sideQualsRaw = document.getElementById('newFacSideQuals')?.value.trim() || '';
  const mainQuals = mainQualsRaw ? mainQualsRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : ['ITE 101'];
  const sideQuals = sideQualsRaw ? sideQualsRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : [];
  const quals = [...new Set([...mainQuals, ...sideQuals])];


  const existingFacIndex = FACULTY.findIndex(f => f.email.toLowerCase() === email.toLowerCase());
  const colors = ['#25447A', '#2E7D5B', '#6C3483', '#C27A1A', '#2980B9', '#C0392B'];

  if (existingFacIndex >= 0) {
    // Update profile
    FACULTY[existingFacIndex].dept = dept;
    FACULTY[existingFacIndex].status = status;
    FACULTY[existingFacIndex].maxLoad = maxLoad;
    FACULTY[existingFacIndex].mainQuals = mainQuals;
    FACULTY[existingFacIndex].sideQuals = sideQuals;
    FACULTY[existingFacIndex].quals = quals;
  } else {
    // Create profile
    FACULTY.push({
      name: user.name,
      email: user.email,
      dept,
      status,
      load: Math.floor(maxLoad * 0.75),
      maxLoad,
      mainQuals,
      sideQuals,
      quals,
      bg: colors[Math.floor(Math.random() * colors.length)]
    });
  }

  if (user) {
    user.employmentType = status;
  }

  if (VALID_USERS[user.email] && !VALID_USERS[user.email].password) {
    VALID_USERS[user.email].password = 'password';
  }

  if (typeof saveStateToStorage === 'function') saveStateToStorage();
  closeAddFacultyModal();
  renderFacultyCards();
  renderUserTable();
  renderDeptFilterOptions();
  if (document.getElementById('deptModal').style.display === 'flex') {
    renderDeptList();
  }
};

window.promptDeleteFaculty = function(identifier) {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to remove faculty profiles.');
    return;
  }
  const fac = FACULTY.find(f => (f.email && f.email.toLowerCase() === identifier.toLowerCase()) || (f.name && f.name.toLowerCase() === identifier.toLowerCase()));
  if (!fac) return;

  document.getElementById('deleteFacultyTargetEmail').value = fac.email;
  document.getElementById('deleteFacultyNameDisplay').textContent = fac.name;
  document.getElementById('deleteFacultyEmailDisplay').textContent = `${fac.email} · ${fac.dept} (${fac.status})`;
  document.getElementById('deleteFacultyModal').style.display = 'flex';
};

window.closeDeleteFacultyModal = function() {
  document.getElementById('deleteFacultyModal').style.display = 'none';
};

window.confirmDeleteFacultyProfile = function() {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to remove faculty profiles.');
    return;
  }
  const email = document.getElementById('deleteFacultyTargetEmail').value;
  const fac = FACULTY.find(f => f.email && f.email.toLowerCase() === email.toLowerCase());
  const facName = fac ? fac.name : null;
  FACULTY = FACULTY.filter(f => !f.email || f.email.toLowerCase() !== email.toLowerCase());
  if (facName) {
    if (typeof scheduleData !== 'undefined' && scheduleData) {
      Object.keys(scheduleData).forEach(roomCode => {
        Object.keys(scheduleData[roomCode]).forEach(slotIdx => {
          if (scheduleData[roomCode][slotIdx]?.faculty === facName) {
            delete scheduleData[roomCode][slotIdx];
          }
        });
      });
    }
    if (typeof MASTER_SCHEDULE_DATA !== 'undefined' && Array.isArray(MASTER_SCHEDULE_DATA)) {
      MASTER_SCHEDULE_DATA.forEach(c => {
        if (c.instructor === facName) c.instructor = 'TBA';
      });
    }
  }
  closeDeleteFacultyModal();
  renderFacultyCards();
  renderGrid();
};

// Backward-compatible alias
window.deleteFacultyProfile = window.promptDeleteFaculty;
