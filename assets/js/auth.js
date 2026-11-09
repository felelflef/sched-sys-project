/* ═══════════════════════════════════════════════════
   AUTHENTICATION & USER SESSION HANDLERS
   ═══════════════════════════════════════════════════ */

// Unique ID for this specific browser instance/tab
const CURRENT_INSTANCE_ID = 'inst_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now();
let sessionHeartbeatTimer = null;
let activeSessionToken = null;
let csrfToken = null;
let lastApiFailureNoticeAt = 0;

// The local demo login only exists when the page is opened directly from disk.
const IS_STANDALONE = window.location.protocol === 'file:';
const nativeFetch = window.fetch.bind(window);

async function refreshCsrfToken() {
  try {
    const res = await nativeFetch('api/auth.php?check=1', { headers: { 'Accept': 'application/json' } });
    const data = await res.json();
    if (data.csrf_token) csrfToken = data.csrf_token;
  } catch (e) {
    // The heartbeat retries while the user stays signed in
  }
}

async function reportApiWriteFailure(res) {
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    handleSessionTerminated(data.message || 'Your session has expired. Please log in again.');
    return;
  }
  const now = Date.now();
  if (now - lastApiFailureNoticeAt < 5000) return;
  lastApiFailureNoticeAt = now;
  alert(`The server did not save this change, so it exists only in this browser.\n\n${data.message || data.error || `HTTP ${res.status}`}`);
}

// Adds the CSRF token to API writes and makes rejected saves visible.
window.fetch = async function(input, init = {}) {
  const url = typeof input === 'string' ? input : (input?.url || '');
  const method = (init.method || 'GET').toUpperCase();
  const isApiWrite = !IS_STANDALONE && method !== 'GET' && /(^|\/)api\/(schedules|users|rooms)\.php/.test(url);
  if (!isApiWrite) return nativeFetch(input, init);

  if (!csrfToken) await refreshCsrfToken();
  const headers = new Headers(init.headers || {});
  if (csrfToken) headers.set('X-CSRF-Token', csrfToken);

  const res = await nativeFetch(input, { ...init, headers });
  // quietFailure means the caller shows the error itself; an expired session is still handled here
  if (!res.ok && (res.status === 401 || !init.quietFailure)) reportApiWriteFailure(res.clone());
  else if (res.ok && typeof handleApiWriteSaved === 'function') handleApiWriteSaved(url, init.body);
  return res;
};

// Cross-tab broadcast channel for local multi-instance coordination
const sessionChannel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('sti_session_channel') : null;

if (sessionChannel) {
  sessionChannel.onmessage = (event) => {
    const data = event.data;
    if (data && data.type === 'NEW_LOGIN' && CURRENT_USER) {
      if (data.email.toLowerCase() === CURRENT_USER.email.toLowerCase() && data.instanceId !== CURRENT_INSTANCE_ID) {
        handleSessionTerminated('Your account was logged into from another window or tab.');
      }
    }
  };
}

// Storage event listener for cross-tab session displacement
window.addEventListener('storage', (e) => {
  if (e.key && e.key.startsWith('sti_active_instance_') && CURRENT_USER) {
    const userKey = 'sti_active_instance_' + CURRENT_USER.email.toLowerCase();
    if (e.key === userKey && e.newValue && e.newValue !== CURRENT_INSTANCE_ID) {
      handleSessionTerminated('Your account was logged into from another device or window.');
    }
  }
});

document.addEventListener('DOMContentLoaded', () => {
  restoreUserSession();
  const btnLogin = document.getElementById('btnLogin');
  if (btnLogin) btnLogin.addEventListener('click', handleLogin);

  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin();
    });
  }
});

function restoreUserSession() {
  try {
    const storedUserStr = localStorage.getItem('sti_auth_user');
    if (!storedUserStr) {
      document.documentElement.classList.remove('has-active-session');
      const loginPage = document.getElementById('loginPage');
      const appShell = document.getElementById('appShell');
      if (loginPage && appShell) {
        loginPage.classList.remove('hidden');
        loginPage.style.display = 'flex';
        appShell.style.display = 'none';
      }
      return false;
    }

    const user = JSON.parse(storedUserStr);
    if (!user || !user.email) return false;

    CURRENT_USER = user;
    activeSessionToken = localStorage.getItem('sti_session_token') || null;

    // Refresh active instance key for this refreshed tab to maintain ownership
    try {
      localStorage.setItem('sti_active_instance_' + user.email.toLowerCase(), CURRENT_INSTANCE_ID);
    } catch (e) {}

    document.documentElement.classList.add('has-active-session');
    const loginPage = document.getElementById('loginPage');
    const appShell = document.getElementById('appShell');
    if (loginPage && appShell) {
      loginPage.classList.add('hidden');
      loginPage.style.display = 'none';
      appShell.style.display = 'flex';
    }

    const uNameEl = document.querySelector('.sidebar-footer .user-name');
    if (uNameEl) uNameEl.textContent = user.name;
    const avatarEl = document.querySelector('.sidebar-footer .avatar');
    if (avatarEl) avatarEl.textContent = CURRENT_USER.initials || 'ST';

    const ROLE_LABELS = {
      'admin': 'System Administrator',
      'academic-head': 'Academic Head',
      'program-head': 'Program Head',
      'faculty': 'Faculty Member'
    };
    const uRoleEl = document.querySelector('.sidebar-footer .user-role');
    if (uRoleEl) uRoleEl.textContent = ROLE_LABELS[user.role] || 'User';

    if (!IS_STANDALONE) refreshCsrfToken();
    startSessionHeartbeat();
    return true;
  } catch (e) {
    console.warn('Failed to restore user session:', e);
    return false;
  }
}

function startSessionHeartbeat() {
  stopSessionHeartbeat();
  sessionHeartbeatTimer = setInterval(async () => {
    if (!CURRENT_USER) {
      stopSessionHeartbeat();
      return;
    }
    try {
      const res = await fetch('api/auth.php?check=1', {
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.csrf_token) csrfToken = data.csrf_token;
        if (data.logged_in === false) {
          handleSessionTerminated(data.message || 'Your session has expired. Please log in again.');
        }
      } else if (res.status === 401) {
        const data = await res.json().catch(() => ({}));
        if (data.code === 'SESSION_SUPERSEDED') {
          handleSessionTerminated(data.message || 'Your account was logged into from another device (e.g. phone). You have been logged out.');
        }
      }
    } catch (e) {
      // Ignore temporary network timeouts
    }
  }, 3500);
}

function stopSessionHeartbeat() {
  if (sessionHeartbeatTimer) {
    clearInterval(sessionHeartbeatTimer);
    sessionHeartbeatTimer = null;
  }
}

function handleSessionTerminated(noticeText) {
  stopSessionHeartbeat();

  document.documentElement.classList.remove('has-active-session');
  try {
    localStorage.removeItem('sti_auth_user');
    localStorage.removeItem('sti_session_token');
    localStorage.removeItem('sti_active_page');
  } catch (e) {}

  const menu = document.getElementById('userDropdownMenu');
  if (menu) menu.style.display = 'none';

  const appShell = document.getElementById('appShell');
  const loginPage = document.getElementById('loginPage');
  if (appShell && loginPage) {
    appShell.style.display = 'none';
    loginPage.style.display = 'flex';
    loginPage.classList.remove('hidden');
    document.getElementById('loginPassword').value = '';
  }

  const prevEmail = CURRENT_USER?.email;
  CURRENT_USER = null;
  activeSessionToken = null;

  if (prevEmail) {
    try {
      localStorage.removeItem('sti_active_instance_' + prevEmail.toLowerCase());
    } catch (e) {}
  }

  const errorEl = document.getElementById('loginError');
  const errorMsg = document.getElementById('loginErrorMsg');
  if (errorEl && errorMsg) {
    errorMsg.textContent = noticeText || 'Your account was logged in from another device/instance (e.g. phone). This session has been terminated.';
    errorEl.classList.add('show');
  }

  try { if (typeof renderGrid === 'function') renderGrid(); } catch (e) { console.warn('renderGrid err:', e); }
  try { if (typeof renderRoomTable === 'function') renderRoomTable(); } catch (e) {}
  try { if (typeof renderFacultyCards === 'function') renderFacultyCards(); } catch (e) {}
  try { if (typeof renderSubjectTable === 'function') renderSubjectTable(); } catch (e) {}
  try { if (typeof renderUserTable === 'function') renderUserTable(); } catch (e) {}
}

function completeLoginTransition(user, normalizedEmail, sessionToken) {
  CURRENT_USER = {
    name: user.name,
    email: normalizedEmail,
    role: user.role,
    initials: user.initials || (user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'ST')
  };
  activeSessionToken = sessionToken || null;

  // Persist authenticated user session to localStorage
  try {
    localStorage.setItem('sti_auth_user', JSON.stringify(CURRENT_USER));
    if (activeSessionToken) localStorage.setItem('sti_session_token', activeSessionToken);
    document.documentElement.classList.add('has-active-session');
    if (!localStorage.getItem('sti_active_page')) {
      localStorage.setItem('sti_active_page', 'schedule');
    }
  } catch (e) {}

  // Track active instance for this user account
  try {
    localStorage.setItem('sti_active_instance_' + normalizedEmail, CURRENT_INSTANCE_ID);
    if (sessionChannel) {
      sessionChannel.postMessage({
        type: 'NEW_LOGIN',
        email: normalizedEmail,
        instanceId: CURRENT_INSTANCE_ID
      });
    }
  } catch (e) {}

  // Start polling to detect if another instance (e.g. phone) logs in
  startSessionHeartbeat();

  const uNameEl = document.querySelector('.sidebar-footer .user-name');
  if (uNameEl) uNameEl.textContent = user.name;
  const avatarEl = document.querySelector('.sidebar-footer .avatar');
  if (avatarEl) avatarEl.textContent = CURRENT_USER.initials;

  const ROLE_LABELS = {
    'admin': 'System Administrator',
    'academic-head': 'Academic Head',
    'program-head': 'Program Head',
    'faculty': 'Faculty Member'
  };
  const uRoleEl = document.querySelector('.sidebar-footer .user-role');
  if (uRoleEl) uRoleEl.textContent = ROLE_LABELS[user.role] || 'User';

  // Refresh all role-dependent modules according to CURRENT_USER permissions
  try { if (typeof renderGrid === 'function') renderGrid(); } catch (e) { console.warn('renderGrid err:', e); }
  try { if (typeof renderRoomTable === 'function') renderRoomTable(); } catch (e) {}
  try { if (typeof renderFacultyCards === 'function') renderFacultyCards(); } catch (e) {}
  try { if (typeof renderSubjectTable === 'function') renderSubjectTable(); } catch (e) {}
  try { if (typeof renderUserTable === 'function') renderUserTable(); } catch (e) {}
  try { if (typeof renderSubjectDatalist === 'function') renderSubjectDatalist(); } catch (e) {}

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
    const res = await fetch('api/users.php');
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
              initials: initials
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
                mainQuals: [],
                bg: colors[Math.floor(Math.random() * colors.length)]
              });
            }
          }
        });
        try { if (typeof renderUserTable === 'function') renderUserTable(); } catch (e) {}
        try { if (typeof renderFacultyCards === 'function') renderFacultyCards(); } catch (e) {}
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
    const res = await fetch('api/auth.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password })
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data && data.success && data.user) {
      btn.classList.remove('loading');
      csrfToken = data.csrf_token || null;
      completeLoginTransition(data.user, normalizedEmail, data.session_token);
      syncUsersFromDB();
      loadServerState();
      return;
    }
    if (!IS_STANDALONE) {
      btn.classList.remove('loading');
      document.getElementById('loginErrorMsg').textContent = (data && data.message) || 'Unable to sign in right now. Please try again.';
      errorEl.classList.add('show');
      return;
    }
  } catch (apiErr) {
    if (!IS_STANDALONE) {
      btn.classList.remove('loading');
      document.getElementById('loginErrorMsg').textContent = 'Unable to reach the server. Please check your connection and try again.';
      errorEl.classList.add('show');
      return;
    }
  }

  // 2. Local demo accounts, only when opened directly from disk (file://)
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

    completeLoginTransition(user, normalizedEmail, 'offline_' + CURRENT_INSTANCE_ID);
  }, 400);
}

window.logoutUser = function() {
  stopSessionHeartbeat();

  document.documentElement.classList.remove('has-active-session');
  try {
    localStorage.removeItem('sti_auth_user');
    localStorage.removeItem('sti_session_token');
    localStorage.removeItem('sti_active_page');
  } catch (e) {}

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

  // Invalidate session on server
  try {
    fetch('api/auth.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' })
    }).catch(() => {});
  } catch (e) {}

  if (CURRENT_USER?.email) {
    try {
      localStorage.removeItem('sti_active_instance_' + CURRENT_USER.email.toLowerCase());
    } catch (e) {}
  }

  // Reset state and re-render safe defaults
  CURRENT_USER = null;
  activeSessionToken = null;
  try { if (typeof renderGrid === 'function') renderGrid(); } catch (e) { console.warn('renderGrid err:', e); }
  try { if (typeof renderRoomTable === 'function') renderRoomTable(); } catch (e) {}
  try { if (typeof renderFacultyCards === 'function') renderFacultyCards(); } catch (e) {}
  try { if (typeof renderSubjectTable === 'function') renderSubjectTable(); } catch (e) {}
  try { if (typeof renderUserTable === 'function') renderUserTable(); } catch (e) {}
};
