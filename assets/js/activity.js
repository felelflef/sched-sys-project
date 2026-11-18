/* ═══════════════════════════════════════════════════
   MODULE — ACTIVITY LOG
   Who changed what, and when. The server records each successful save;
   this page lists them newest first.
   ═══════════════════════════════════════════════════ */

const ACTIVITY_PAGE_SIZE = 100;
const ACTIVITY_ROLE_LABELS = { admin: 'System Admin', 'program-head': 'Program Head', faculty: 'Faculty' };
const ACTIVITY_CATEGORY_STYLES = {
  Schedule: 'background:#DBEAFE; color:#1E40AF;',
  Setup: 'background:#F3E8FF; color:#6B21A8;',
  Resources: 'background:#DEF7EC; color:#03543F;',
  Accounts: 'background:#FEF3C7; color:#92400E;',
  'Sign-in': 'background:#F3F4F6; color:#374151;'
};

let activityRows = [];
let activityHasMore = false;
let activityLoading = false;
let activitySearchTimer = null;

function activityMessageRow(message) {
  return `<tr><td colspan="4" style="text-align:center; padding:32px 16px; color:var(--text-secondary);">${escapeHtml(message)}</td></tr>`;
}

// "Nov 13, 2026, 2:05 PM" with "5 min ago" under it
function activityTimeHtml(seconds) {
  const when = new Date(Number(seconds) * 1000);
  const minutes = Math.round((Date.now() - when.getTime()) / 60000);
  const ago = minutes < 1 ? 'Just now'
    : minutes < 60 ? `${minutes} min ago`
    : minutes < 1440 ? `${Math.round(minutes / 60)} hr ago`
    : `${Math.round(minutes / 1440)} day${Math.round(minutes / 1440) === 1 ? '' : 's'} ago`;
  const full = when.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
  return `<div style="font-weight:600;">${escapeHtml(full)}</div><div style="font-size:0.857rem; color:var(--text-secondary);">${ago}</div>`;
}

function renderActivityTable() {
  const body = document.getElementById('activityTableBody');
  if (!body) return;
  const filtered = !!(document.getElementById('activityCategoryFilter')?.value || document.getElementById('activitySearchInput')?.value.trim());
  body.innerHTML = activityRows.length === 0
    ? activityMessageRow(filtered ? 'No changes match these filters.' : 'No changes have been recorded yet. Saved changes appear here.')
    : activityRows.map(row => `
      <tr>
        <td>${activityTimeHtml(row.at)}</td>
        <td>
          <div style="font-weight:600;">${escapeHtml(row.user_name || row.user_email)}</div>
          <div style="font-size:0.857rem; color:var(--text-secondary);">${escapeHtml(ACTIVITY_ROLE_LABELS[row.user_role] || row.user_role)}</div>
        </td>
        <td><span class="badge" style="${ACTIVITY_CATEGORY_STYLES[row.category] || ''} font-size:0.857rem; font-weight:700; white-space:nowrap;">${escapeHtml(row.category)}</span></td>
        <td style="overflow-wrap:anywhere;">${escapeHtml(row.summary)}</td>
      </tr>
    `).join('');
  const more = document.getElementById('activityLoadMore');
  if (more) more.style.display = activityHasMore ? 'inline-flex' : 'none';
}

// reset: start again from the newest change; otherwise load the next older page
async function loadActivityLog(reset = true) {
  const body = document.getElementById('activityTableBody');
  if (!body) return;
  if (IS_STANDALONE) {
    body.innerHTML = activityMessageRow('The activity log is kept by the server, so it is not available in the offline demo.');
    return;
  }
  if (activityLoading) return;
  activityLoading = true;
  if (reset) {
    activityRows = [];
    body.innerHTML = activityMessageRow('Loading the activity log…');
  }

  const params = new URLSearchParams({ limit: String(ACTIVITY_PAGE_SIZE) });
  const category = document.getElementById('activityCategoryFilter')?.value || '';
  const search = document.getElementById('activitySearchInput')?.value.trim() || '';
  if (category) params.set('category', category);
  if (search) params.set('q', search);
  if (!reset && activityRows.length) params.set('before', String(activityRows[activityRows.length - 1].log_id));

  try {
    const res = await fetch(`api/activity.php?${params}`, { headers: { Accept: 'application/json' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || 'The activity log could not be loaded.');
    activityRows = activityRows.concat(data.data || []);
    activityHasMore = (data.data || []).length === ACTIVITY_PAGE_SIZE;
    renderActivityTable();
  } catch (e) {
    body.innerHTML = activityMessageRow('Could not load the activity log. Check your connection, then choose Refresh.');
  } finally {
    activityLoading = false;
  }
}

function queueActivitySearch() {
  clearTimeout(activitySearchTimer);
  activitySearchTimer = setTimeout(() => loadActivityLog(true), 300);
}

window.loadActivityLog = loadActivityLog;
window.queueActivitySearch = queueActivitySearch;
