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
    const roleBadgeClass = u.role === 'admin' ? 'role-admin' : u.role === 'program-head' ? 'role-program-head' : 'role-faculty';
    const isSelf = CURRENT_USER && (u.email.toLowerCase() === CURRENT_USER.email.toLowerCase());
    const matchingFac = FACULTY.find(f => f.email && f.email.toLowerCase() === u.email.toLowerCase());
    const empStatus = u.employmentType || (matchingFac ? matchingFac.status : 'Full-time');
    const empBadgeStyle = empStatus === 'Part-time'
      ? 'background:#fef3c7; color:#b45309; border:1px solid #fde68a;'
      : 'background:#DEF7EC; color:#03543F; border:1px solid #bbf7d0;';

    let actionCellHtml = '';
    if (isSelf) {
      actionCellHtml = '<span style="font-size:0.857rem; color:var(--text-secondary);">(Current User)</span>';
    } else if (isAdmin) {
      actionCellHtml = `
        <div style="display:inline-flex; gap:4px; align-items:center;">
          <button class="btn btn-outline" style="font-size:0.857rem; padding:3px 8px; cursor:pointer;" onclick="window.openEditUserModal(${jsArg(u.email)})">Edit</button>
          <button class="btn btn-outline" style="font-size:0.857rem; padding:3px 8px; cursor:pointer;" onclick="window.openResetPasswordModal(${jsArg(u.email)})">Reset Password</button>
          <button class="btn btn-outline" style="font-size:0.857rem; padding:3px 8px; color:var(--danger); border-color:#fadbd8; cursor:pointer;" onclick="window.promptDeleteUser(${jsArg(u.email)})">Remove</button>
        </div>
      `;
    } else {
      actionCellHtml = '<span style="font-size:0.857rem; color:var(--text-secondary);">—</span>';
    }

    tr.innerHTML = `
      <td style="font-weight:600;">${escapeHtml(u.name)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td><span class="role-badge ${roleBadgeClass}">${escapeHtml(u.roleLabel)}</span></td>
      <td><span class="badge" style="${empBadgeStyle} font-size:0.857rem; font-weight:700;">${escapeHtml(empStatus)}</span></td>
      <td style="text-align:right;">
        ${actionCellHtml}
      </td>
    `;
    tbody.appendChild(tr);
  });

  const activeCount = document.getElementById('activeUsersCount');
  if (activeCount) activeCount.textContent = USERS.length;
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
  document.getElementById('newUserLevel').value = 'tertiary';
  updateNewUserRoleFields();
  document.getElementById('addUserModal').style.display = 'flex';
};

// Employment status and department only apply to Faculty / Professor accounts
window.updateNewUserRoleFields = function() {
  const role = document.getElementById('newUserRole').value;
  const isAdmin = role === 'admin';
  document.getElementById('newUserStatusGroup').style.display = isAdmin ? 'none' : '';
  document.getElementById('newUserDeptGroup').style.display = isAdmin ? 'none' : '';
  document.getElementById('newUserLevelGroup').style.display = isAdmin ? 'none' : '';
  document.getElementById('newUserRoleHint').textContent = {
    admin: 'Can manage accounts, rooms, faculty, subjects and schedules.',
    'program-head': 'Can manage rooms, faculty, subjects and schedules, but not user accounts. Also gets a faculty profile for teaching.',
    faculty: 'Can view schedules and download their timetable. Also gets a faculty profile for teaching.'
  }[role];
};

window.closeAddUserModal = function() {
  const err = document.getElementById('addUserError');
  if (err) err.style.display = 'none';
  document.getElementById('addUserModal').style.display = 'none';
};

let addUserSaving = false;

window.submitAddUser = async function() {
  const errDiv = document.getElementById('addUserError');
  if (errDiv) errDiv.style.display = 'none';

  const name = document.getElementById('newUserName').value.trim();
  let email = document.getElementById('newUserEmail').value.trim().toLowerCase();
  let password = document.getElementById('newUserPassword').value.trim();
  const chosenRole = document.getElementById('newUserRole').value;
  const role = ['admin', 'program-head'].includes(chosenRole) ? chosenRole : 'faculty';
  const dept = document.getElementById('newUserDept').value || DEPARTMENTS[0];

  if (!name) {
    showAddUserError('Please enter the full name.');
    return;
  }
  const nameProblem = INPUT_RULES.fullName(name);
  if (nameProblem) {
    showAddUserError(nameProblem);
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
  if (!/^[a-z0-9._-]+@sti\.edu$/.test(email)) {
    showAddUserError('Email can only use letters, numbers, dots, hyphens and underscores before @sti.edu.');
    return;
  }

  // The blank-password default only applies to the local demo mode
  if (!password && IS_STANDALONE) {
    password = 'password';
  } else if (INPUT_RULES.password(password)) {
    showAddUserError(INPUT_RULES.password(password));
    return;
  }

  if (USERS.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    showAddUserError(`An account with email ${email} already exists.`);
    return;
  }

  const roleLabels = {
    'admin': 'System Admin',
    'program-head': `Program Head – ${dept}`,
    'faculty': `Faculty – ${dept}`
  };

  // Persist to MySQL database via API
  const parts = name.split(' ');
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ') || parts[0];

  // The account is only shown once the server has actually saved it
  if (!IS_STANDALONE) {
    if (addUserSaving) return;
    addUserSaving = true;
    let data;
    try {
      const res = await fetch('/api/users.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        quietFailure: true,
        body: JSON.stringify({
          action: 'add',
          first_name: firstName,
          last_name: lastName,
          email: email,
          password: password,
          role: role,
          subject_role: dept,
          teaching_level: document.getElementById('newUserLevel').value
        })
      });
      data = await res.json();
    } catch (err) {
      showAddUserError('Could not reach the server, so the account was not created.');
      return;
    } finally {
      addUserSaving = false;
    }
    if (!data.success) {
      showAddUserError(data.message || 'The account could not be created.');
      return;
    }
  }

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
  // Only the offline demo checks passwords in the browser; online, the server holds them
  VALID_USERS[email] = IS_STANDALONE ? { name, role, initials, password } : { name, role, initials };

  // Link to Faculty profiles if user has an academic teaching role
  if (role === 'faculty' || role === 'program-head') {
    if (!FACULTY.some(f => f.email.toLowerCase() === email.toLowerCase() || f.name.toLowerCase() === name.toLowerCase())) {
      const colors = ['#25447A', '#2E7D5B', '#6C3483', '#C27A1A', '#2980B9', '#C0392B'];
      FACULTY.push({
        name,
        email,
        dept: dept || DEPARTMENTS[0],
        status: status,
        maxLoad: defaultLoadUnits(status).max,
        minLoad: defaultLoadUnits(status).min,
        teachingLevel: document.getElementById('newUserLevel').value,
        certificates: [],
        bg: colors[Math.floor(Math.random() * colors.length)]
      });
      saveFacultyAvailability(FACULTY[FACULTY.length - 1]);
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

  const fac = FACULTY.find(f => f.email && f.email.toLowerCase() === user.email.toLowerCase());
  const statusSelect = document.getElementById('editUserStatusSelect');
  if (statusSelect) {
    statusSelect.value = user.employmentType || (fac ? fac.status : 'Full-time');
  }

  const deptSelect = document.getElementById('editUserDeptSelect');
  if (deptSelect) {
    deptSelect.innerHTML = '';
    const currentDept = fac ? fac.dept : DEPARTMENTS[0];
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
  const newDept = document.getElementById('editUserDeptSelect')?.value || DEPARTMENTS[0];

  if (!email || !newName) {
    alert('Please enter a valid user name.');
    return;
  }
  const editNameProblem = INPUT_RULES.fullName(newName);
  if (editNameProblem) {
    alert(editNameProblem);
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
  const fac = FACULTY.find(f => f.email && f.email.toLowerCase() === email.toLowerCase());
  if (fac) {
    fac.name = newName;
    const previousStatus = fac.status;
    fac.status = newStatus;
    if (newStatus === 'Full-time') {
      fac.availableDays = [];
      fac.availableShifts = [];
    }
    if (newDept) fac.dept = newDept;
    // A new status starts from that status's usual load range
    if (fac.status !== undefined && previousStatus !== newStatus) {
      fac.maxLoad = defaultLoadUnits(newStatus).max;
      fac.minLoad = defaultLoadUnits(newStatus).min;
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
  if (fac) saveFacultyAvailability(fac);

  if (typeof saveStateToStorage === 'function') saveStateToStorage();
  closeEditUserModal();
  renderUserTable();
  if (typeof renderFacultyCards === 'function') renderFacultyCards();
  if (typeof renderGrid === 'function') renderGrid();
};

function showPasswordModal({ title, note, email, askCurrent }) {
  document.getElementById('passwordModalTitle').textContent = title;
  document.getElementById('passwordModalNote').textContent = note;
  document.getElementById('passwordTargetEmail').value = email;
  document.getElementById('currentPasswordGroup').style.display = askCurrent ? 'block' : 'none';
  ['currentPasswordInput', 'newPasswordInput', 'confirmPasswordInput'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('passwordError').style.display = 'none';
  document.getElementById('passwordModal').style.display = 'flex';
}

window.openChangePasswordModal = function() {
  const menu = document.getElementById('userDropdownMenu');
  if (menu) menu.style.display = 'none';
  if (IS_STANDALONE) {
    alert('Passwords cannot be changed in demo mode.');
    return;
  }
  showPasswordModal({ title: 'Change Password', note: 'Choose a new password for your account.', email: '', askCurrent: true });
};

window.openResetPasswordModal = function(email) {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access denied: Only system administrators are authorized to reset passwords.');
    return;
  }
  if (IS_STANDALONE) {
    alert('Passwords cannot be changed in demo mode.');
    return;
  }
  showPasswordModal({ title: 'Reset Password', note: `Set a new password for ${email}. They will be signed out of any device they are using.`, email, askCurrent: false });
};

window.closePasswordModal = function() {
  document.getElementById('passwordModal').style.display = 'none';
};

window.submitPasswordModal = async function() {
  const errorEl = document.getElementById('passwordError');
  const showError = message => {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  };
  const email = document.getElementById('passwordTargetEmail').value;
  const currentPassword = document.getElementById('currentPasswordInput').value;
  const newPassword = document.getElementById('newPasswordInput').value;

  const newPasswordProblem = INPUT_RULES.password(newPassword);
  if (newPasswordProblem) {
    showError(newPasswordProblem);
    return;
  }
  if (newPassword !== document.getElementById('confirmPasswordInput').value) {
    showError('The new passwords do not match.');
    return;
  }

  const btn = document.getElementById('passwordSubmitBtn');
  btn.disabled = true;
  try {
    const res = await fetch('api/auth.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken || '' },
      body: JSON.stringify(email
        ? { action: 'admin_reset_password', email, new_password: newPassword }
        : { action: 'change_password', current_password: currentPassword, new_password: newPassword })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      showError(data.message || 'Could not save the password. Please try again.');
      return;
    }
    closePasswordModal();
    alert(data.message);
  } catch (e) {
    showError('Could not reach the server. Please try again.');
  } finally {
    btn.disabled = false;
  }
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
  .catch(() => {});

  USERS = USERS.filter(u => u.email.toLowerCase() !== email.toLowerCase());
  delete VALID_USERS[email.toLowerCase()];

  // Remove corresponding faculty profile and clear any assigned schedule slots
  if (userName) {
    FACULTY = FACULTY.filter(f => f.email.toLowerCase() !== email.toLowerCase() && f.name !== userName);
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
