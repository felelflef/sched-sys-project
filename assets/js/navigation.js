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
        document.getElementById('headerTitle').textContent = info.title;
        document.getElementById('headerSubtitle').textContent = info.sub;
      }

      // Freshly evaluate and render modules based on active role
      if (mod === 'rooms') renderRoomTable();
      if (mod === 'minimap') {
        const activeFloor = document.querySelector('.floor-tab.active')?.dataset.floor || '1';
        if (typeof renderFloorMap === 'function') renderFloorMap(activeFloor + 'F');
      }
      if (mod === 'faculty') renderFacultyCards();
      if (mod === 'subjects') renderSubjectTable();
      if (mod === 'schedule') renderGrid();
      if (mod === 'users') renderUserTable();
      if (mod === 'ai' && typeof initAiModule === 'function') initAiModule();
    });
  });

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
