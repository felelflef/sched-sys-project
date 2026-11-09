/* ═══════════════════════════════════════════════════
   APPLICATION BOOTSTRAPPER & INITIALIZATION
   ═══════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  renderDeptFilterOptions();
  renderSubjectDeptFilterOptions();
  renderSubjectDatalist();
  renderGrid();
  renderScheduleViewer();
  renderRoomTable();
  renderFacultyCards();
  renderSubjectTable();
  renderUserTable();
  syncUsersFromDB();
  loadServerState();
});
