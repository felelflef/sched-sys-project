/* ═══════════════════════════════════════════════════
   SCHEDULE OVERVIEW
   Professor loads, room use and missing hours for the active term.
   ═══════════════════════════════════════════════════ */

// Six school days of the hours classes can be held (7:00 AM to 8:30 PM)
const ROOM_WEEKLY_HOURS = (CLASS_DAY_END - CLASS_DAY_START) / 60 * 6;

function reportTable(headings, rows, emptyMessage) {
  if (rows.length === 0) return `<p class="report-empty">${escapeHtml(emptyMessage)}</p>`;
  return `<div class="data-table-wrapper"><table class="data-table">
    <thead><tr>${headings.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

function renderScheduleReports() {
  const root = document.getElementById('reportsContent');
  if (!root) return;

  const { activeSy, activeTerm } = getActiveAcademicContext();
  const classes = activeTermClasses();

  const loads = FACULTY.map(fac => ({
    name: fac.name,
    status: fac.status || 'Full-time',
    classes: classes.filter(c => c.instructor === fac.name).length,
    hours: facultyWeeklyHours(fac.name),
    max: fac.maxLoad || 24
  })).sort((a, b) => b.hours - a.hours);

  const rooms = ROOMS.map(room => {
    const roomClasses = classes.filter(c => c.room === room.code);
    const hours = roomClasses.reduce((sum, c) => sum + classMinutes(c), 0) / 60;
    return { code: room.code, type: room.type, classes: roomClasses.length, hours, percent: Math.round(hours / ROOM_WEEKLY_HOURS * 100) };
  }).sort((a, b) => b.hours - a.hours);

  const missing = ACADEMIC_SECTIONS.filter(s => s.termId === activeTerm.id).flatMap(section =>
    sectionSubjectProgress(section)
      .filter(p => p.scheduledMinutes < p.requiredMinutes)
      .map(p => ({ section: section.code, subject: p.subject, required: p.requiredMinutes / 60, scheduled: p.scheduledMinutes / 60 })));
  const overLimit = loads.filter(l => l.hours > l.max);

  const summary = [
    ['Classes This Term', classes.length],
    ['Subjects Missing Hours', missing.length],
    ['Professors Over Limit', overLimit.length]
  ];

  const statusBadge = (ok, okText, badText) => `<span class="badge ${ok ? 'badge-success' : 'badge-danger'}">${escapeHtml(ok ? okText : badText)}</span>`;

  root.innerHTML = `
    <p class="report-term">${escapeHtml(activeTerm.termName)} ${escapeHtml(activeSy.yearCode)}</p>
    <div class="stats-row">${summary.map(([label, value]) => `
      <div class="stat-card"><div><div class="stat-value">${value}</div><div class="stat-label">${escapeHtml(label)}</div></div></div>`).join('')}
    </div>
    <div class="card report-card"><div class="card-header"><div><h3>Subjects Missing Hours</h3><p>Included subjects that don't have their full weekly hours yet</p></div></div>
      ${reportTable(['Section', 'Subject', 'Required', 'Scheduled'], missing.map(m => [escapeHtml(m.section), `${escapeHtml(m.subject.code)} ${escapeHtml(m.subject.name)}`, `${m.required} hrs`, `${m.scheduled} hrs`]), 'Every subject has its full weekly hours.')}
    </div>
    <div class="card report-card"><div class="card-header"><div><h3>Professor Loads</h3><p>Weekly teaching hours against each professor's limit</p></div></div>
      ${reportTable(['Professor', 'Status', 'Classes', 'Hours', 'Limit', ''], loads.map(l => [escapeHtml(l.name), escapeHtml(l.status), l.classes, `${l.hours.toFixed(1)} hrs`, `${l.max} hrs`, statusBadge(l.hours <= l.max, 'Within limit', 'Over limit')]), 'No professors yet.')}
    </div>
    <div class="card report-card"><div class="card-header"><div><h3>Room Use</h3><p>Share of the ${ROOM_WEEKLY_HOURS}-hour school week (Mon–Sat, 7:00 AM–8:30 PM) each room is booked</p></div></div>
      ${reportTable(['Room', 'Type', 'Classes', 'Hours', 'Use'], rooms.map(r => [escapeHtml(r.code), escapeHtml(r.type), r.classes, `${r.hours.toFixed(1)} hrs`, `${r.percent}%`]), 'No rooms yet.')}
    </div>
  `;
}

window.renderScheduleReports = renderScheduleReports;
