/* ══════════════════════════════════════════════════════════════════════════
   INITIALIZATION & EVENT BINDINGS
   ══════════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  // The offline demo starts with a generated schedule; a signed-in app loads the saved one
  const { activeSy, activeTerm } = getActiveAcademicContext();
  if (IS_STANDALONE) {
    MASTER_SCHEDULE_DATA = MASTER_SCHEDULE_DATA.filter(c => c.termId && c.termId !== activeTerm.id).concat(generateSmartBaselineSchedules());
  }

  // Filter bindings
  const progFilter = document.getElementById('programFilter');
  if (progFilter) progFilter.addEventListener('change', () => {
    updateSectionDropdown();
    renderGrid();
  });

  const yrFilter = document.getElementById('yearFilter');
  if (yrFilter) yrFilter.addEventListener('change', () => {
    updateSectionDropdown();
    renderGrid();
  });

  const sectionSelect = document.getElementById('sectionSelect');
  if (sectionSelect) {
    sectionSelect.addEventListener('change', (e) => {
      currentSelectedSection = e.target.value;
      renderGrid();
    });
  }

  // Dismiss export menu on outside click
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('exportDropdownMenu');
    const btn = document.getElementById('btnExport');
    if (menu && menu.style.display === 'block' && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

  // Initial step setup
  // Initial step setup (without popup alerts)
  // Load saved schedule if available
  try {
    const savedSched = localStorage.getItem('sti_master_schedule_data');
    if (savedSched) {
      const parsed = JSON.parse(savedSched);
      if (Array.isArray(parsed) && parsed.length > 0) {
        MASTER_SCHEDULE_DATA = parsed;
      }
    }
  } catch (e) {
    console.warn('Failed parsing saved master schedule', e);
  }

  syncAllSyFilters();
  goToScheduleStep(ACTIVE_SCHEDULE_STEP || 7);
  isScheduleInitialized = true;
});
