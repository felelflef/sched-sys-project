/* ═══════════════════════════════════════════════════
   AUTHENTICATION & USER SESSION HANDLERS
   ═══════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  const btnLogin = document.getElementById('btnLogin');
  if (btnLogin) btnLogin.addEventListener('click', handleLogin);

  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin();
    });
  }
});

function completeLoginTransition(user, normalizedEmail) {
  CURRENT_USER = {
    name: user.name,
    email: normalizedEmail,
    role: user.role,
    initials: user.initials || (user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'ST')
  };

  document.querySelector('.sidebar-footer .user-name').textContent = user.name;
  document.querySelector('.sidebar-footer .avatar').textContent = CURRENT_USER.initials;

  const ROLE_LABELS = {
    'admin': 'System Administrator',
    'academic-head': 'Academic Head',
    'program-head': 'Program Head',
    'faculty': 'Faculty Member'
  };
  document.querySelector('.sidebar-footer .user-role').textContent = ROLE_LABELS[user.role] || 'User';

  // Refresh all role-dependent modules according to CURRENT_USER permissions
  renderGrid();
  renderRoomTable();
  renderFacultyCards();
  renderSubjectTable();
  renderUserTable();
  renderSubjectDatalist();

  // Transition: fade out login, reveal dashboard
  const loginPage = document.getElementById('loginPage');
  const appShell = document.getElementById('appShell');

  loginPage.classList.add('hidden');
  appShell.style.display = 'flex';

  setTimeout(() => {
    loginPage.style.display = 'none';
  }, 500);
}

async function syncUsersFromDB() {
  try {
    const res = await fetch('/api/users.php');
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        data.data.forEach(u => {
          const email = u.email.toLowerCase();
          const fullName = `${u.first_name} ${u.last_name}`.trim();
          const roleLabels = {
            'admin': 'System Admin',
            'faculty': `Faculty – ${u.subject_role || 'General'}`,
            'program-head': `Program Head – ${u.subject_role || 'General'}`,
            'academic-head': 'Academic Head'
          };
          const existingIdx = USERS.findIndex(existing => existing.email.toLowerCase() === email);
          if (existingIdx === -1) {
            USERS.push({
              name: fullName,
              email: email,
              role: u.role,
              roleLabel: roleLabels[u.role] || u.role,
              lastActive: 'Active',
              status: 'Online'
            });
          } else {
            USERS[existingIdx].role = u.role;
            USERS[existingIdx].roleLabel = roleLabels[u.role] || u.role;
          }

          const initials = fullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'ST';
          if (!VALID_USERS[email]) {
            VALID_USERS[email] = {
              name: fullName,
              role: u.role,
              initials: initials,
              password: 'password'
            };
          }

          if (['faculty', 'program-head', 'academic-head'].includes(u.role)) {
            if (!FACULTY.some(f => f.email.toLowerCase() === email)) {
              const colors = ['#25447A', '#2E7D5B', '#6C3483', '#C27A1A', '#2980B9', '#C0392B'];
              FACULTY.push({
                name: fullName,
                email: email,
                dept: u.subject_role || 'IT / CS',
                status: 'Full-time',
                load: 18,
                maxLoad: 24,
                quals: [u.subject_role || 'General'],
                bg: colors[Math.floor(Math.random() * colors.length)]
              });
            }
          }
        });
        renderUserTable();
        renderFacultyCards();
      }
    }
  } catch (err) {
    console.log('Database user sync skipped (standalone or offline):', err);
  }
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const btn = document.getElementById('btnLogin');
  const errorEl = document.getElementById('loginError');

  // Hide previous errors
  errorEl.classList.remove('show');

  // Basic validation
  if (!email || !password) {
    document.getElementById('loginErrorMsg').textContent = 'Please enter both email and password.';
    errorEl.classList.add('show');
    return;
  }

  // Show loading state
  btn.classList.add('loading');
  const normalizedEmail = email.toLowerCase();

  // 1. Try real database authentication via API
  try {
    const res = await fetch('/api/auth.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.user) {
        btn.classList.remove('loading');
        completeLoginTransition(data.user, normalizedEmail);
        syncUsersFromDB();
        return;
      } else {
        btn.classList.remove('loading');
        document.getElementById('loginErrorMsg').textContent = data.message || 'Incorrect password entered.';
        errorEl.classList.add('show');
        return;
      }
    }
  } catch (apiErr) {
    console.log('Backend auth unreachable, falling back to local credentials:', apiErr);
  }

  // 2. Fallback to local accounts (for standalone file:// mode or offline)
  setTimeout(() => {
    btn.classList.remove('loading');

    // Accept any @sti.edu email
    if (!normalizedEmail.endsWith('@sti.edu')) {
      document.getElementById('loginErrorMsg').textContent = 'Access restricted to @sti.edu accounts only.';
      errorEl.classList.add('show');
      return;
    }

    // Verify account exists
    const user = VALID_USERS[normalizedEmail];
    if (!user) {
      document.getElementById('loginErrorMsg').textContent = 'Account not found. Please contact an administrator.';
      errorEl.classList.add('show');
      return;
    }

    // Verify password (default 'password' if not set)
    const expectedPassword = user.password || 'password';
    if (password !== expectedPassword) {
      document.getElementById('loginErrorMsg').textContent = 'Incorrect password entered.';
      errorEl.classList.add('show');
      return;
    }

    completeLoginTransition(user, normalizedEmail);
  }, 400);
}

window.logoutUser = function() {
  const menu = document.getElementById('userDropdownMenu');
  if (menu) menu.style.display = 'none';
  
  const appShell = document.getElementById('appShell');
  const loginPage = document.getElementById('loginPage');
  if (appShell && loginPage) {
    appShell.style.display = 'none';
    loginPage.style.display = 'flex';
    loginPage.classList.remove('hidden');
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
  }

  // Reset state and re-render safe defaults
  CURRENT_USER = null;
  renderGrid();
  renderRoomTable();
  renderFacultyCards();
  renderSubjectTable();
  renderUserTable();
};
