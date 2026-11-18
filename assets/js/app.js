/* ═══════════════════════════════════════════════════
   APPLICATION BOOTSTRAPPER & INITIALIZATION
   ═══════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  fillSavedYearsMissingLevelTerms();
  applySchoolLevelOptions();
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
