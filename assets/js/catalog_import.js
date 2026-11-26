/* ═══════════════════════════════════════════════════
   SUBJECT CATALOG IMPORT (ADMIN AND PROGRAM HEADS)
   Reads course codes, titles, subject areas and units from an Excel or CSV file, has the server check every row
   (missing details, invalid values, codes already in the catalog or repeated) and shows the result before saving.
   Uses the spreadsheet reader and file helpers from faculty_import.js.
   ═══════════════════════════════════════════════════ */

const CATALOG_IMPORT_COLUMNS = [
  // [field sent to the server, template header, other header spellings accepted]
  ['subject_code', 'Course Code', ['subjectcode', 'code', 'coursecode']],
  ['subject_title', 'Subject Title', ['title', 'subjectname', 'coursetitle', 'description', 'descriptivetitle', 'name']],
  ['department', 'Subject Area', ['area', 'department', 'dept']],
  ['units', 'Units', ['creditunits', 'credits', 'unit']],
  ['level', 'Level', ['schoollevel']]
];
const CATALOG_IMPORT_REQUIRED = ['subject_code', 'subject_title', 'department', 'units'];
let catalogImportRows = [];

function setCatalogImportStep(step) {
  ['catalogImportStepFile', 'catalogImportStepCheck', 'catalogImportStepDone'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === step ? 'block' : 'none';
  });
}

function showCatalogImportError(message) {
  const box = document.getElementById('catalogImportError');
  if (!box) return;
  box.textContent = message || '';
  box.style.display = message ? 'block' : 'none';
}

window.openCatalogImportModal = function() {
  if (!canManageData()) return;
  catalogImportRows = [];
  const input = document.getElementById('catalogImportFile');
  if (input) input.value = '';
  showCatalogImportError('');
  setCatalogImportStep('catalogImportStepFile');
  document.getElementById('catalogImportModal').style.display = 'flex';
};

window.closeCatalogImportModal = function() {
  document.getElementById('catalogImportModal').style.display = 'none';
};

window.backToCatalogImportFile = function() {
  showCatalogImportError('');
  setCatalogImportStep('catalogImportStepFile');
};

window.downloadCatalogImportTemplate = function() {
  const rows = [
    CATALOG_IMPORT_COLUMNS.map(c => c[1]),
    ['IT 201', 'Advanced Web Development', 'IT / Computing', '3', 'College'],
    ['MAWD 105', 'Game Development Basics', 'IT / Computing', '3', 'SHS']
  ];
  downloadTextFile('subject-catalog-template.csv', rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n', 'text/csv;charset=utf-8');
};

// Reads the first sheet: the first non-empty row is the header, the rest are subjects. Row numbers match the sheet.
async function readCatalogFile(file) {
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
    const match = CATALOG_IMPORT_COLUMNS.find(([field, header, others]) => facultyImportHeaderKey(header) === key || facultyImportHeaderKey(field) === key || others.includes(key));
    if (match && columnOf[match[0]] === undefined) columnOf[match[0]] = col;
  });
  const missing = CATALOG_IMPORT_REQUIRED.filter(field => columnOf[field] === undefined)
    .map(field => CATALOG_IMPORT_COLUMNS.find(c => c[0] === field)[1]);
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
  if (!rows.length) throw new Error('The file has a header row but no subject rows.');
  if (rows.length > 1000) throw new Error(`The file has ${rows.length} subject rows; import at most 1,000 at a time.`);
  return rows;
}

async function postCatalogImport(mode) {
  const res = await fetch('api/schedules.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'import_catalog', mode, rows: catalogImportRows }),
    quietFailure: true
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.message || data.error || `The server answered ${res.status}.`);
  return data.data;
}

window.handleCatalogImportFile = async function(input) {
  showCatalogImportError('');
  const file = input.files && input.files[0];
  if (!file) return;
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    showCatalogImportError('Choose an Excel (.xlsx, .xls) or CSV (.csv) file.');
    input.value = '';
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    showCatalogImportError('The file is larger than 2 MB. Split it into smaller files.');
    input.value = '';
    return;
  }
  const label = document.getElementById('catalogImportFileLabel');
  if (label) label.textContent = `Checking ${file.name}…`;
  try {
    catalogImportRows = await readCatalogFile(file);
    renderCatalogImportCheck(await postCatalogImport('check'), file.name);
    setCatalogImportStep('catalogImportStepCheck');
  } catch (e) {
    showCatalogImportError(e.message || String(e));
  } finally {
    if (label) label.textContent = '';
    input.value = '';
  }
};

function renderCatalogImportCheck(result, fileName) {
  const c = result.counts;
  const statusBadge = {
    ready: '<span class="badge" style="background:#DEF7EC; color:#03543F;">Ready</span>',
    error: '<span class="badge" style="background:#FDE8E8; color:#9B1C1C;">Needs fixing</span>',
    duplicate: '<span class="badge" style="background:#FEF3C7; color:#92400E;">Already there</span>'
  };
  document.getElementById('catalogImportSummary').innerHTML =
    `<strong>${escapeHtml(fileName)}</strong>: ${c.ready} ready to import, ${c.error} need fixing, ${c.duplicate} already in the catalog or repeated (skipped). `
    + (c.error ? 'Rows that need fixing are not imported; fix them in the file and choose it again, or import the ready rows now.' : 'Nothing has been saved yet.');
  document.getElementById('catalogImportTableBody').innerHTML = result.rows.map(r => `
    <tr>
      <td>${r.line}</td>
      <td>${escapeHtml(r.code || '—')}</td>
      <td>${escapeHtml(r.title || '—')}</td>
      <td>${r.units ?? '—'}</td>
      <td>${statusBadge[r.status] || escapeHtml(r.status)}</td>
      <td style="font-size:0.857rem;">${r.notes.length ? r.notes.map(n => escapeHtml(n)).join('<br>') : '—'}</td>
    </tr>`).join('');
  const button = document.getElementById('btnCatalogImportSave');
  button.disabled = c.ready === 0;
  button.textContent = c.ready === 1 ? 'Import 1 Ready Row' : `Import ${c.ready} Ready Rows`;
}

window.saveCatalogImport = async function() {
  const button = document.getElementById('btnCatalogImportSave');
  button.disabled = true;
  showCatalogImportError('');
  try {
    const result = await postCatalogImport('save');
    const skipped = result.counts.error + result.counts.duplicate;
    document.getElementById('catalogImportDoneSummary').textContent =
      `Added ${result.added} subject${result.added === 1 ? '' : 's'} to the Subject Catalog${skipped ? `; ${skipped} row${skipped === 1 ? ' was' : 's were'} skipped` : ''}. `
      + 'They now fill in their title, units and subject area wherever a course code is typed or picked.';
    setCatalogImportStep('catalogImportStepDone');
    if (typeof loadServerState === 'function') loadServerState();
  } catch (e) {
    showCatalogImportError(e.message || String(e));
    button.disabled = false;
  }
};
