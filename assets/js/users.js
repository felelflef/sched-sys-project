/* ═══════════════════════════════════════════════════
   MODULE 5 — USER MANAGEMENT & ACCOUNTS (ADMIN ONLY)
   ═══════════════════════════════════════════════════ */

function renderUserTable() {
  const tbody = document.getElementById('userTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const isAdmin = CURRENT_USER && CURRENT_USER.role === 'admin';

  // Control Add Account button visibility - admin only
  const addAccBtn = document.getElementById('btnAddAccount');
  if (addAccBtn) {
    addAccBtn.style.display = isAdmin ? 'inline-flex' : 'none';
  }

  USERS.forEach(u => {
    const tr = document.createElement('tr');
    const roleBadgeClass = u.role === 'admin' ? 'role-admin' : u.role === 'academic-head' ? 'role-academic-head' : 'role-program-head';
    const isSelf = CURRENT_USER && (u.email.toLowerCase() === CURRENT_USER.email.toLowerCase());
    const matchingFac = (typeof FACULTY !== 'undefined' ? FACULTY : []).find(f => f.email && f.email.toLowerCase() === u.email.toLowerCase());
    const empStatus = u.employmentType || (matchingFac ? matchingFac.status : 'Full-time');
    const empBadgeStyle = empStatus === 'Part-time'
      ? 'background:#fef3c7; color:#b45309; border:1px solid #fde68a;'
      : 'background:#DEF7EC; color:#03543F; border:1px solid #bbf7d0;';

    let actionCellHtml = '';
    if (isSelf) {
      actionCellHtml = '<span style="font-size:11px; color:var(--text-secondary);">(Current User)</span>';
    } else if (isAdmin) {
      actionCellHtml = `
        <div style="display:inline-flex; gap:4px; align-items:center;">
          <button class="btn btn-outline" style="font-size:11px; padding:3px 8px; cursor:pointer;" onclick="window.openEditUserModal('${u.email}')">Edit</button>
          <button class="btn btn-outline" style="font-size:11px; padding:3px 8px; color:var(--danger); border-color:#fadbd8; cursor:pointer;" onclick="window.promptDeleteUser('${u.email}')">Remove</button>
        </div>
      `;
    } else {
      actionCellHtml = '<span style="font-size:11px; color:var(--text-secondary);">—</span>';
    }

    tr.innerHTML = `
      <td style="font-weight:600;">${escapeHtml(u.name)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td><span class="role-badge ${roleBadgeClass}">${escapeHtml(u.roleLabel)}</span></td>
      <td style="color:var(--text-secondary);">${escapeHtml(u.lastActive)}</td>
      <td><span class="badge" style="${empBadgeStyle} font-size:10.5px; font-weight:700;">${escapeHtml(empStatus)}</span></td>
      <td><span class="badge ${u.status === 'Online' ? 'badge-success' : ''}" style="${u.status === 'Offline' ? 'background:#F2F2F2; color:var(--text-secondary);' : ''}">● ${u.status}</span></td>
      <td style="text-align:right;">
        ${actionCellHtml}
      </td>
    `;
    tbody.appendChild(tr);
  });

  const activeCount = document.getElementById('activeUsersCount');
  if (activeCount) activeCount.textContent = USERS.length;
  const onlineCount = document.getElementById('onlineUsersCount');
  if (onlineCount) onlineCount.textContent = USERS.filter(u => u.status === 'Online').length;
}

function showAddUserError(msg) {
  const err = document.getElementById('addUserError');
  if (err) {
    err.textContent = msg;
    err.style.display = 'block';
  } else {
    alert(msg);
  }
}

window.openAddUserModal = function() {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access denied: Only system administrators can provision accounts.');
    return;
  }
  const err = document.getElementById('addUserError');
  if (err) {
    err.textContent = '';
    err.style.display = 'none';
  }
  const deptSelect = document.getElementById('newUserDept');
  deptSelect.innerHTML = '';
  DEPARTMENTS.forEach(dept => {
    const opt = document.createElement('option');
    opt.value = dept;
    opt.textContent = dept;
    deptSelect.appendChild(opt);
  });
  document.getElementById('newUserName').value = '';
  document.getElementById('newUserEmail').value = '';
  document.getElementById('newUserPassword').value = '';
  document.getElementById('newUserRole').value = 'faculty';
  document.getElementById('addUserModal').style.display = 'flex';
};

window.closeAddUserModal = function() {
  const err = document.getElementById('addUserError');
  if (err) err.style.display = 'none';
  document.getElementById('addUserModal').style.display = 'none';
};

window.submitAddUser = function() {
  const errDiv = document.getElementById('addUserError');
  if (errDiv) errDiv.style.display = 'none';

  const name = document.getElementById('newUserName').value.trim();
  let email = document.getElementById('newUserEmail').value.trim().toLowerCase();
  let password = document.getElementById('newUserPassword').value.trim();
  const role = document.getElementById('newUserRole').value;
  const dept = document.getElementById('newUserDept').value || 'IT / CS';

  if (!name) {
    showAddUserError('Please enter the full name.');
    return;
  }
  if (!email) {
    showAddUserError('Please enter an institutional email address.');
    return;
  }

  // Automatically append @sti.edu if omitted
  if (!email.includes('@')) {
    email = `${email}@sti.edu`;
  } else if (!email.endsWith('@sti.edu')) {
    showAddUserError('Only @sti.edu institutional email addresses are permitted.');
    return;
  }

  // The blank-password default only applies to the local demo mode
  if (!password && IS_STANDALONE) {
    password = 'password';
  } else if (password.length < 6) {
    showAddUserError('Password must be at least 6 characters.');
    return;
  }

  if (USERS.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    showAddUserError(`An account with email ${email} already exists.`);
    return;
  }

  const roleLabels = {
    'admin': 'System Admin',
    'faculty': `Faculty – ${dept}`,
    'program-head': `Program Head – ${dept}`,
    'academic-head': 'Academic Head'
  };

  // Persist to MySQL database via API
  const parts = name.split(' ');
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ') || parts[0];

  fetch('/api/users.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'add',
      first_name: firstName,
      last_name: lastName,
      email: email,
      password: password,
      role: role,
      subject_role: dept
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      console.log('[MySQL DB] User created successfully with ID:', data.user_id);
    } else {
      console.warn('[MySQL DB] User notice:', data.message);
    }
  })
  .catch(err => {
    console.log('[Database persistence offline/standalone mode]:', err);
  });

  const status = document.getElementById('newUserStatus')?.value || 'Full-time';

  USERS.push({
    name,
    email,
    role,
    roleLabel: roleLabels[role] || role,
    lastActive: 'Just now',
    status: 'Online',
    employmentType: status
  });

  const initials = name.split(' ').filter(w => w.length > 1).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'ST';
  VALID_USERS[email] = { name, role, initials, password };

  // Link to Faculty profiles if user has an academic teaching role
  if (role === 'faculty' || role === 'program-head' || role === 'academic-head') {
    if (!FACULTY.some(f => f.email.toLowerCase() === email.toLowerCase() || f.name.toLowerCase() === name.toLowerCase())) {
      const colors = ['#25447A', '#2E7D5B', '#6C3483', '#C27A1A', '#2980B9', '#C0392B'];
      FACULTY.push({
        name,
        email,
        dept: dept || 'IT / CS',
        status: status,
        load: status === 'Part-time' ? 12 : 18,
        maxLoad: status === 'Part-time' ? 15 : 24,
        mainQuals: [],
        bg: colors[Math.floor(Math.random() * colors.length)]
      });
      renderFacultyCards();
    }
  }

  closeAddUserModal();
  renderUserTable();
};

window.openEditUserModal = function(email) {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to edit accounts.');
    return;
  }
  const user = USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return;

  const targetEmailInput = document.getElementById('editUserTargetEmail');
  if (targetEmailInput) targetEmailInput.value = user.email;

  const emailDisplay = document.getElementById('editUserEmailDisplay');
  if (emailDisplay) emailDisplay.textContent = `${user.email} · Role: ${user.roleLabel}`;

  const nameInput = document.getElementById('editUserNameInput');
  if (nameInput) nameInput.value = user.name;

  const fac = (typeof FACULTY !== 'undefined' ? FACULTY : []).find(f => f.email && f.email.toLowerCase() === user.email.toLowerCase());
  const statusSelect = document.getElementById('editUserStatusSelect');
  if (statusSelect) {
    statusSelect.value = user.employmentType || (fac ? fac.status : 'Full-time');
  }

  const deptSelect = document.getElementById('editUserDeptSelect');
  if (deptSelect) {
    deptSelect.innerHTML = '';
    const currentDept = fac ? fac.dept : 'IT / CS';
    DEPARTMENTS.forEach(dept => {
      const opt = document.createElement('option');
      opt.value = dept;
      opt.textContent = dept;
      if (dept === currentDept) opt.selected = true;
      deptSelect.appendChild(opt);
    });
  }

  const modal = document.getElementById('editUserModal');
  if (modal) modal.style.display = 'flex';
};

window.closeEditUserModal = function() {
  const modal = document.getElementById('editUserModal');
  if (modal) modal.style.display = 'none';
};

window.submitEditUser = function() {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to edit accounts.');
    return;
  }
  const email = document.getElementById('editUserTargetEmail')?.value;
  const newName = document.getElementById('editUserNameInput')?.value.trim();
  const newStatus = document.getElementById('editUserStatusSelect')?.value || 'Full-time';
  const newDept = document.getElementById('editUserDeptSelect')?.value || 'IT / CS';

  if (!email || !newName) {
    alert('Please enter a valid user name.');
    return;
  }

  const user = USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return;

  const oldName = user.name;

  // 1. Update user in USERS
  user.name = newName;
  user.employmentType = newStatus;

  // 2. Update VALID_USERS cache
  if (VALID_USERS[email.toLowerCase()]) {
    VALID_USERS[email.toLowerCase()].name = newName;
    VALID_USERS[email.toLowerCase()].initials = newName.split(' ').filter(w => w.length > 0).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'ST';
  }

  // 3. Update or sync corresponding FACULTY profile
  const fac = (typeof FACULTY !== 'undefined' ? FACULTY : []).find(f => f.email && f.email.toLowerCase() === email.toLowerCase());
  if (fac) {
    fac.name = newName;
    fac.status = newStatus;
    if (newDept) fac.dept = newDept;
    if (newStatus === 'Part-time' && fac.maxLoad > 18) {
      fac.maxLoad = 15;
    } else if (newStatus === 'Full-time' && fac.maxLoad < 20) {
      fac.maxLoad = 24;
    }
  }

  // 4. Update MASTER_SCHEDULE_DATA if name changed
  if (oldName !== newName && typeof MASTER_SCHEDULE_DATA !== 'undefined' && Array.isArray(MASTER_SCHEDULE_DATA)) {
    MASTER_SCHEDULE_DATA.forEach(c => {
      if (c.instructor === oldName) c.instructor = newName;
    });
  }

  // 5. Update CURRENT_USER if admin edited their own account
  if (CURRENT_USER && CURRENT_USER.email.toLowerCase() === email.toLowerCase()) {
    CURRENT_USER.name = newName;
    const sidebarName = document.querySelector('.sidebar-footer .user-name');
    if (sidebarName) sidebarName.textContent = newName;
  }

  // Persist to MySQL via API
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
  }).catch(() => {});

  if (typeof saveStateToStorage === 'function') saveStateToStorage();
  closeEditUserModal();
  renderUserTable();
  if (typeof renderFacultyCards === 'function') renderFacultyCards();
  if (typeof renderGrid === 'function') renderGrid();
};

window.promptDeleteUser = function(email) {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access denied: Only system administrators are authorized to remove accounts.');
    return;
  }
  if (email.toLowerCase() === 'admin@sti.edu') {
    alert('Cannot remove the primary administrator account.');
    return;
  }
  const user = USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return;

  // Deleting an account also deletes its classes, so they must be reassigned first
  const classCount = MASTER_SCHEDULE_DATA.filter(c => c.instructor === user.name).length;
  if (!IS_STANDALONE && classCount > 0) {
    alert(`${user.name} still has ${classCount} scheduled class(es). Reassign them before removing this account.`);
    return;
  }

  document.getElementById('deleteUserTargetEmail').value = user.email;
  document.getElementById('deleteUserNameDisplay').textContent = user.name;
  document.getElementById('deleteUserEmailDisplay').textContent = `${user.email} · ${user.roleLabel}`;
  document.getElementById('deleteUserModal').style.display = 'flex';
};

window.closeDeleteUserModal = function() {
  document.getElementById('deleteUserModal').style.display = 'none';
};

window.confirmDeleteUser = function() {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access denied: Only system administrators are authorized to remove accounts.');
    closeDeleteUserModal();
    return;
  }
  const email = document.getElementById('deleteUserTargetEmail').value;
  if (!email) return;

  const user = USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
  const userName = user ? user.name : null;

  // Delete from MySQL database via API
  fetch('/api/users.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'delete_by_email',
      email: email
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      console.log('[MySQL DB] User account deleted successfully:', email);
    } else {
      console.warn('[MySQL DB] User delete notice:', data.message);
    }
  })
  .catch(err => {
    console.log('[Database deletion offline/standalone mode]:', err);
  });

  USERS = USERS.filter(u => u.email.toLowerCase() !== email.toLowerCase());
  delete VALID_USERS[email.toLowerCase()];

  // Remove corresponding faculty profile and clear any assigned schedule slots
  if (userName) {
    FACULTY = FACULTY.filter(f => f.email.toLowerCase() !== email.toLowerCase() && f.name !== userName);
    if (typeof scheduleData !== 'undefined' && scheduleData) {
      Object.keys(scheduleData).forEach(roomCode => {
        Object.keys(scheduleData[roomCode]).forEach(slotIdx => {
          if (scheduleData[roomCode][slotIdx]?.faculty === userName) {
            delete scheduleData[roomCode][slotIdx];
          }
        });
      });
    }
    if (typeof MASTER_SCHEDULE_DATA !== 'undefined' && Array.isArray(MASTER_SCHEDULE_DATA)) {
      MASTER_SCHEDULE_DATA.forEach(c => {
        if (c.instructor === userName) c.instructor = 'TBA';
      });
    }
  }

  closeDeleteUserModal();
  renderUserTable();
  renderFacultyCards();
  renderGrid();
};

// Backward-compatible alias
window.deleteUser = window.promptDeleteUser;
