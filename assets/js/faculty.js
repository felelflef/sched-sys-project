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

    const availHtml = DAYS_ABBR.map(day => {
      const am = Math.random() > 0.3 ? 'open' : 'busy';
      const pm = Math.random() > 0.4 ? 'open' : 'busy';
      return `<div style="display:flex;flex-direction:column;gap:2px;">
        <div class="avail-slot header">${day}</div>
        <div class="avail-slot ${am}">AM</div>
        <div class="avail-slot ${pm}">PM</div>
      </div>`;
    }).join('');

    const qualsHtml = (fac.quals || []).map(q => `<span class="qual-tag locked">${q}</span>`).join('');

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
        <div class="faculty-meta-label" style="margin-bottom:6px;">Weekly Availability</div>
        <div class="avail-grid" style="grid-template-columns:repeat(6,1fr);">
          ${availHtml}
        </div>
        <div class="faculty-meta-label" style="margin-top:14px; margin-bottom:6px;">MAQ Certifications</div>
        <div class="qual-tags">${qualsHtml}</div>
      </div>
    `;
    grid.appendChild(card);
  });
}

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

  // 2. Update registered account in USERS list
  const user = USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (user) {
    user.name = newName;
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
  document.getElementById('newFacQuals').value = 'ITE 101, CC 103';

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
    if (existingFac.quals) document.getElementById('newFacQuals').value = existingFac.quals.join(', ');
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
  const qualsRaw = document.getElementById('newFacQuals').value.trim();
  const quals = qualsRaw ? qualsRaw.split(',').map(s => s.trim()).filter(Boolean) : ['ITE 101'];

  const existingFacIndex = FACULTY.findIndex(f => f.email.toLowerCase() === email.toLowerCase());
  const colors = ['#25447A', '#2E7D5B', '#6C3483', '#C27A1A', '#2980B9', '#C0392B'];

  if (existingFacIndex >= 0) {
    // Update profile
    FACULTY[existingFacIndex].dept = dept;
    FACULTY[existingFacIndex].status = status;
    FACULTY[existingFacIndex].maxLoad = maxLoad;
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
      quals,
      bg: colors[Math.floor(Math.random() * colors.length)]
    });
  }

  if (VALID_USERS[user.email] && !VALID_USERS[user.email].password) {
    VALID_USERS[user.email].password = 'password';
  }

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
