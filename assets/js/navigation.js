/* ═══════════════════════════════════════════════════
   NAVIGATION & APP SHELL CONTROLLER
   ═══════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-item[data-module]').forEach(item => {
    item.addEventListener('click', () => {
      // A page hidden from this role, such as User Management, opens the role's home page instead, even from a saved page
      const role = CURRENT_USER && CURRENT_USER.role;
      const home = homePageForRole(role);
      const hiddenForRole = getComputedStyle(item).display === 'none'
        || (item.dataset.module === 'users' && CURRENT_USER && role !== 'admin')
        || (item.dataset.module === 'schedule' && role === 'faculty');
      if (hiddenForRole && item.dataset.module !== home) {
        window.switchPage(home);
        return;
      }
      const mod = item.dataset.module;
      // Toggle nav active
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      syncMobileSection(item);
      // Toggle page
      document.querySelectorAll('.module-page').forEach(p => p.classList.remove('active'));
      const pageEl = document.getElementById(`page-${mod}`);
      if (pageEl) pageEl.classList.add('active');
      // Update header
      const info = MODULE_TITLES[mod];
      if (info) {
        const hTitle = document.getElementById('headerTitle');
        if (hTitle) hTitle.textContent = info.title;
        const hSub = document.getElementById('headerSubtitle');
        if (hSub) hSub.textContent = info.sub;
      }
      // The AI Assistant button shows only where the side panel belongs
      const aiToggle = document.getElementById('aiPanelToggle');
      if (aiToggle) aiToggle.hidden = !(mod === 'schedule' || mod === 'viewer');
      if (mod !== 'schedule' && mod !== 'viewer' && typeof closeAiPanel === 'function') closeAiPanel();
      try {
        localStorage.setItem('sti_active_page', mod);
      } catch (e) {}

      // Freshly evaluate and render modules based on active role
      if (mod === 'rooms') renderRoomTable();
      if (mod === 'viewer') {
        if (typeof renderScheduleViewer === 'function') renderScheduleViewer();
      }
      if (mod === 'faculty') renderFacultyCards();
      if (mod === 'subjects') renderSubjectTable();
      if (mod === 'schedule') { renderGrid(); updateScheduleStats(); }
      if (mod === 'users') renderUserTable();
      if (mod === 'activity') loadActivityLog(true);
      if (mod === 'reports') renderScheduleReports();
    });
  });

  // Restore saved active page on page load / refresh
  try {
    const savedPage = localStorage.getItem('sti_active_page');
    // A page that no longer exists, such as the old AI Assistant page, opens the role's home page
    if (savedPage) {
      window.switchPage(document.querySelector(`.nav-item[data-module="${savedPage}"]`) ? savedPage : homePageForRole(CURRENT_USER && CURRENT_USER.role));
    }
  } catch (e) {}
  syncMobileSection(document.querySelector('.nav-item.active'));

  document.addEventListener('click', function(e) {
    const menu = document.getElementById('userDropdownMenu');
    const btn = document.getElementById('userMenuBtn');
    if (menu && menu.style.display === 'block' && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
      menu.style.display = 'none';
    }
  });
});

/* ─── Phone section bar ───
   Marks the section of the open page, so the top bar shows only that section's pages. */
const lastPageInSection = {};
function syncMobileSection(item) {
  const section = item && item.closest('.nav-section[data-section]');
  if (!section) return;
  const name = section.dataset.section;
  lastPageInSection[name] = item.dataset.module;
  document.querySelectorAll('.nav-section[data-section]').forEach(s => s.classList.toggle('mobile-current', s === section));
  document.querySelectorAll('.mobile-section-btn').forEach(btn => {
    const isCurrent = btn.dataset.section === name;
    btn.classList.toggle('active', isCurrent);
    if (isCurrent) btn.setAttribute('aria-current', 'true');
    else btn.removeAttribute('aria-current');
  });
}

// Opens the page last used in that section, or else its first page this user can see
window.openMobileSection = function(name) {
  const section = document.querySelector(`.nav-section[data-section="${name}"]`);
  if (!section) return;
  const pages = [...section.querySelectorAll('.nav-item[data-module]')].filter(item => getComputedStyle(item).display !== 'none');
  const target = pages.find(item => item.dataset.module === lastPageInSection[name]) || pages[0];
  if (target) target.click();
};

window.switchPage = function(mod) {
  const navItem = document.querySelector(`.nav-item[data-module="${mod}"]`);
  if (navItem) navItem.click();
};

window.toggleUserMenu = function(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('userDropdownMenu');
  if (menu) {
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
  }
};
