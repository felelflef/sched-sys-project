/* ═══════════════════════════════════════════════════
   NAVIGATION & APP SHELL CONTROLLER
   ═══════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-item[data-module]').forEach(item => {
    item.addEventListener('click', () => {
      const mod = item.dataset.module;
      // Toggle nav active
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
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
      if (mod === 'schedule') renderGrid();
      if (mod === 'users') renderUserTable();
      if (mod === 'reports') renderScheduleReports();
    });
  });

  // Restore saved active page on page load / refresh
  try {
    const savedPage = localStorage.getItem('sti_active_page');
    if (savedPage) {
      window.switchPage(savedPage);
    }
  } catch (e) {}

  document.addEventListener('click', function(e) {
    const menu = document.getElementById('userDropdownMenu');
    const btn = document.getElementById('userMenuBtn');
    if (menu && menu.style.display === 'block' && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
      menu.style.display = 'none';
    }
  });
});

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
