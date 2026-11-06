/* ═══════════════════════════════════════════════════
   APPLICATION BOOTSTRAPPER & INITIALIZATION
   ═══════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  renderDeptFilterOptions();
  renderSubjectDeptFilterOptions();
  renderSubjectDatalist();
  renderGrid();
  renderFloorMap('1F');
  renderRoomTable();
  renderFacultyCards();
  renderSubjectTable();
  renderUserTable();
  syncUsersFromDB();
  loadServerState();
});
