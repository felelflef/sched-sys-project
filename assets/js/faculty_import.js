/* ═══════════════════════════════════════════════════
   FACULTY IMPORT (USER MANAGEMENT, ADMIN ONLY)
   Reads faculty from an Excel or CSV file, has the server check every row (missing details, invalid values,
   duplicates) and shows the result before anything is saved. Ready rows are then saved with temporary passwords.
   ═══════════════════════════════════════════════════ */

const FACULTY_IMPORT_COLUMNS = [
  // [field sent to the server, template header, other header spellings accepted]
  ['first_name', 'First Name', ['first', 'givenname']],
  ['last_name', 'Last Name', ['last', 'surname', 'familyname']],
  ['email', 'Email', ['emailaddress', 'institutionalemail']],
  ['department', 'Department', ['dept', 'subjectarea', 'area']],
  ['role', 'Role', ['accountrole']],
  ['employment_status', 'Employment Status', ['status', 'employment']],
  ['available_days', 'Available Days', ['days']],
  ['available_from', 'Available From', ['from', 'starttime']],
  ['available_to', 'Available To', ['to', 'endtime']],
  ['min_load', 'Min Load', ['minimumload', 'minload']],
  ['max_load', 'Max Load', ['maximumload', 'maxload']],
  ['teaches', 'Teaches', ['teachinglevel', 'level']],
  ['fcc_certificates', 'FCC Certificates', ['certificates', 'fcc', 'certificate']]
];
const FACULTY_IMPORT_REQUIRED = ['first_name', 'last_name', 'email', 'department'];
let facultyImportRows = [];
let facultyImportCreated = [];

function facultyImportHeaderKey(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function loadSpreadsheetReader() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'assets/vendor/xlsx-0.20.3.full.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("The spreadsheet reader couldn't be loaded. Reload the page and try again."));
    document.head.appendChild(script);
  });
}

function setFacultyImportStep(step) {
  ['facultyImportStepFile', 'facultyImportStepCheck', 'facultyImportStepDone'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === step ? 'block' : 'none';
  });
}

function showFacultyImportError(message) {
  const box = document.getElementById('facultyImportError');
  if (!box) return;
  box.textContent = message || '';
  box.style.display = message ? 'block' : 'none';
}

window.openFacultyImportModal = function() {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') return;
  facultyImportRows = [];
  facultyImportCreated = [];
  const input = document.getElementById('facultyImportFile');
  if (input) input.value = '';
  showFacultyImportError('');
  setFacultyImportStep('facultyImportStepFile');
  document.getElementById('facultyImportModal').style.display = 'flex';
};

window.closeFacultyImportModal = function() {
  document.getElementById('facultyImportModal').style.display = 'none';
  // Passwords are shown once; leaving the window drops them from the page
  facultyImportCreated = [];
};

function downloadTextFile(name, text, type) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

window.downloadFacultyImportTemplate = function() {
  const header = FACULTY_IMPORT_COLUMNS.map(c => c[1]);
  const examples = [
    ['Maria', 'Santos', 'maria.santos@sti.edu', 'General Education', 'Faculty', 'Full-time', '', '', '', '24', '30', 'Both', 'FCC - General Education'],
    ['Carlo', 'Navarro', 'carlo.navarro@sti.edu', 'Tourism', 'Faculty', 'Part-time', 'Mon, Wed, Fri', '1:00 PM', '5:00 PM', '15', '24', 'College', 'FCC - Tourism']
  ];
  downloadTextFile('faculty-import-template.csv', [header, ...examples].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n', 'text/csv;charset=utf-8');
};

// Reads the first sheet: the first non-empty row is the header, the rest are faculty. Row numbers match the sheet.
async function readFacultyFile(file) {
  await loadSpreadsheetReader();
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('The file has no sheets.');
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: true });
  const isBlank = row => !row || row.every(cell => String(cell).trim() === '');
  const headerIndex = grid.findIndex(row => !isBlank(row));
  if (headerIndex < 0) throw new Error('The file is empty.');

  const columnOf = {};
  grid[headerIndex].forEach((title, col) => {
    const key = facultyImportHeaderKey(title);
    const match = FACULTY_IMPORT_COLUMNS.find(([field, header, others]) => facultyImportHeaderKey(header) === key || facultyImportHeaderKey(field) === key || others.includes(key));
    if (match && columnOf[match[0]] === undefined) columnOf[match[0]] = col;
  });
  const missing = FACULTY_IMPORT_REQUIRED.filter(field => columnOf[field] === undefined)
    .map(field => FACULTY_IMPORT_COLUMNS.find(c => c[0] === field)[1]);
  if (missing.length) {
    throw new Error(`The file is missing these columns: ${missing.join(', ')}. Download the template to see the expected columns.`);
  }

  const rows = [];
  for (let r = headerIndex + 1; r < grid.length; r++) {
    if (isBlank(grid[r])) continue;
    const row = { line: r + 1 };
    Object.entries(columnOf).forEach(([field, col]) => { row[field] = String(grid[r][col] ?? '').trim(); });
    rows.push(row);
  }
  if (!rows.length) throw new Error('The file has a header row but no faculty rows.');
  if (rows.length > 500) throw new Error(`The file has ${rows.length} faculty rows; import at most 500 at a time.`);
  return rows;
}

async function postFacultyImport(mode) {
  const res = await fetch('api/users.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'import_faculty', mode, rows: facultyImportRows }),
    quietFailure: true
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.message || data.error || `The server answered ${res.status}.`);
  return data.data;
}

window.handleFacultyImportFile = async function(input) {
  showFacultyImportError('');
  const file = input.files && input.files[0];
  if (!file) return;
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    showFacultyImportError('Choose an Excel (.xlsx, .xls) or CSV (.csv) file.');
    input.value = '';
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    showFacultyImportError('The file is larger than 2 MB. Split it into smaller files.');
    input.value = '';
    return;
  }
  const label = document.getElementById('facultyImportFileLabel');
  if (label) label.textContent = `Checking ${file.name}…`;
  try {
    facultyImportRows = await readFacultyFile(file);
    const result = await postFacultyImport('check');
    renderFacultyImportCheck(result, file.name);
    setFacultyImportStep('facultyImportStepCheck');
  } catch (e) {
    showFacultyImportError(e.message || String(e));
  } finally {
    if (label) label.textContent = '';
    input.value = '';
  }
};

function renderFacultyImportCheck(result, fileName) {
  const c = result.counts;
  const statusBadge = {
    ready: '<span class="badge" style="background:#DEF7EC; color:#03543F;">Ready</span>',
    error: '<span class="badge" style="background:#FDE8E8; color:#9B1C1C;">Needs fixing</span>',
    duplicate: '<span class="badge" style="background:#FEF3C7; color:#92400E;">Duplicate</span>'
  };
  document.getElementById('facultyImportSummary').innerHTML =
    `<strong>${escapeHtml(fileName)}</strong>: ${c.ready} ready to import, ${c.error} need fixing, ${c.duplicate} duplicate${c.duplicate === 1 ? '' : 's'} (skipped). `
    + (c.error ? 'Rows that need fixing are not imported; fix them in the file and choose it again, or import the ready rows now.' : 'Nothing has been saved yet.');
  document.getElementById('facultyImportTableBody').innerHTML = result.rows.map(r => `
    <tr>
      <td>${r.line}</td>
      <td>${escapeHtml(r.name || '—')}</td>
      <td>${escapeHtml(r.email || '—')}</td>
      <td>${statusBadge[r.status] || escapeHtml(r.status)}</td>
      <td style="font-size:0.857rem;">${r.notes.length ? r.notes.map(n => escapeHtml(n)).join('<br>') : '—'}</td>
    </tr>`).join('');
  const button = document.getElementById('btnFacultyImportSave');
  button.disabled = c.ready === 0;
  button.textContent = c.ready === 1 ? 'Import 1 Ready Row' : `Import ${c.ready} Ready Rows`;
}

window.saveFacultyImport = async function() {
  const button = document.getElementById('btnFacultyImportSave');
  button.disabled = true;
  showFacultyImportError('');
  try {
    const result = await postFacultyImport('save');
    facultyImportCreated = result.created;
    const skipped = result.counts.error + result.counts.duplicate;
    document.getElementById('facultyImportDoneSummary').textContent =
      `Created ${result.created.length} account${result.created.length === 1 ? '' : 's'}${skipped ? `; ${skipped} row${skipped === 1 ? ' was' : 's were'} skipped` : ''}. `
      + 'Download the temporary passwords now: they are shown only once. Each teacher should change theirs after signing in.';
    document.getElementById('facultyImportDoneBody').innerHTML = result.created.map(u => `
      <tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td>${u.role === 'program-head' ? 'Program Head' : 'Faculty'}</td><td><code>${escapeHtml(u.temporary_password)}</code></td></tr>`).join('');
    setFacultyImportStep('facultyImportStepDone');
    // The new accounts and profiles appear in User Management and Faculty Profiles
    if (typeof syncUsersFromDB === 'function') syncUsersFromDB();
    if (typeof loadServerState === 'function') loadServerState();
  } catch (e) {
    showFacultyImportError(e.message || String(e));
    button.disabled = false;
  }
};

window.downloadFacultyImportPasswords = function() {
  if (!facultyImportCreated.length) return;
  const lines = [['Name', 'Email', 'Role', 'Temporary Password']]
    .concat(facultyImportCreated.map(u => [u.name, u.email, u.role === 'program-head' ? 'Program Head' : 'Faculty', u.temporary_password]));
  downloadTextFile('faculty-temporary-passwords.csv', lines.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n', 'text/csv;charset=utf-8');
};

window.backToFacultyImportFile = function() {
  showFacultyImportError('');
  setFacultyImportStep('facultyImportStepFile');
};
