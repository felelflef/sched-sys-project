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

    let actionCellHtml = '';
    if (isSelf) {
      actionCellHtml = '<span style="font-size:11px; color:var(--text-secondary);">(Current User)</span>';
    } else if (isAdmin) {
      actionCellHtml = `<button class="btn btn-outline" style="font-size:11px; padding:3px 8px; color:var(--danger); border-color:#fadbd8; cursor:pointer;" onclick="window.promptDeleteUser('${u.email}')">Remove</button>`;
    } else {
      actionCellHtml = '<span style="font-size:11px; color:var(--text-secondary);">—</span>';
    }

    tr.innerHTML = `
      <td style="font-weight:600;">${u.name}</td>
      <td>${u.email}</td>
      <td><span class="role-badge ${roleBadgeClass}">${u.roleLabel}</span></td>
      <td style="color:var(--text-secondary);">${u.lastActive}</td>
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

  // Default password to 'password' if left blank
  if (!password) {
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

  USERS.push({
    name,
    email,
    role,
    roleLabel: roleLabels[role] || role,
    lastActive: 'Just now',
    status: 'Online'
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
        status: 'Full-time',
        load: 18,
        maxLoad: 24,
        quals: dept === 'IT / CS' ? ['ITE 101', 'CC 103'] : dept === 'Hospitality' ? ['HM 201', 'TM 301'] : ['BA 101'],
        bg: colors[Math.floor(Math.random() * colors.length)]
      });
      renderFacultyCards();
    }
  }

  closeAddUserModal();
  renderUserTable();
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
    Object.keys(scheduleData).forEach(roomCode => {
      Object.keys(scheduleData[roomCode]).forEach(slotIdx => {
        if (scheduleData[roomCode][slotIdx]?.faculty === userName) {
          delete scheduleData[roomCode][slotIdx];
        }
      });
    });
  }

  closeDeleteUserModal();
  renderUserTable();
  renderFacultyCards();
  renderGrid();
};

// Backward-compatible alias
window.deleteUser = window.promptDeleteUser;
