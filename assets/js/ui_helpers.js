/* ═══════════════════════════════════════════════════
   SHARED INTERFACE HELPERS
   Non-blocking messages, keyboard use and sortable tables.
   ═══════════════════════════════════════════════════ */

// Messages appear in the corner instead of stopping the page
window.alert = function(message) {
  const text = String(message);
  let stack = document.getElementById('toastStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toastStack';
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }

  const isProblem = /^(\s*⚠|cannot|can't|could not|failed|access denied|the server did not|please|someone else|this class can't)/i.test(text)
    || /(can't|cannot|wasn't saved|already exists|no changes were made|not available|reassign)/i.test(text);
  const toast = document.createElement('div');
  toast.className = `toast ${isProblem ? 'toast-problem' : 'toast-info'}`;
  toast.setAttribute('role', isProblem ? 'alert' : 'status');

  const body = document.createElement('div');
  body.className = 'toast-text';
  body.textContent = text;

  const close = document.createElement('button');
  close.className = 'toast-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss message');
  close.textContent = '×';
  close.addEventListener('click', () => toast.remove());

  toast.append(body, close);
  stack.appendChild(toast);
  setTimeout(() => toast.remove(), isProblem ? 12000 : 6000);
};

// Esc closes the dialog on top, using its own close button so any cleanup still runs
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const open = [...document.querySelectorAll('.modal-overlay')].filter(m => getComputedStyle(m).display !== 'none');
  const top = open[open.length - 1];
  if (!top) return;
  const closeButton = top.querySelector('button[onclick*="close" i]');
  if (closeButton) closeButton.click();
  else top.style.display = 'none';
});

// The sidebar and step bar are div elements, so they need keyboard support added
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-item, .stepper-step').forEach(item => {
    item.setAttribute('tabindex', '0');
    item.setAttribute('role', 'button');
  });
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const item = event.target.closest && event.target.closest('.nav-item, .stepper-step');
  if (!item) return;
  event.preventDefault();
  item.click();
});

// Returns a sorted copy for a "Sort by" dropdown. Items with no saved order yet count as newest.
function sortByChoice(items, choice, addedOrder, label) {
  const added = new Map(items.map((item, index) => [item, addedOrder(item) ?? 1e9 + index]));
  const byLabel = (a, b) => label(a).localeCompare(label(b), undefined, { numeric: true, sensitivity: 'base' });
  const compare = {
    first: (a, b) => added.get(a) - added.get(b),
    recent: (a, b) => added.get(b) - added.get(a),
    az: byLabel,
    za: (a, b) => byLabel(b, a)
  }[choice] || byLabel;
  return [...items].sort(compare);
}

// A dropdown choice replaces any column heading sort on that table
function clearTableSort(bodyId) {
  const table = document.getElementById(bodyId).closest('table');
  const sort = tableSorts.get(table);
  if (sort) sort.observer.disconnect();
  tableSorts.delete(table);
  table.querySelectorAll('th[data-sorted]').forEach(heading => heading.removeAttribute('data-sorted'));
}

// Click a column heading to sort. The sort is kept when the table redraws.
const SORTABLE_HEADINGS = '#page-rooms .data-table th, #page-subjects .data-table th, #page-users .data-table th, #page-reports .data-table th, #stepPanel-5 .lifecycle-table th';
const tableSorts = new WeakMap();

function applyTableSort(table) {
  const sort = tableSorts.get(table);
  const body = table.tBodies[0];
  if (!sort || !body) return;
  const rows = [...body.rows];
  if (rows.length < 2 || rows.some(row => row.cells.length <= sort.column)) return;
  const text = row => row.cells[sort.column].innerText.trim();
  rows.sort((a, b) => text(a).localeCompare(text(b), undefined, { numeric: true, sensitivity: 'base' }) * sort.direction);
  sort.observer.disconnect();
  rows.forEach(row => body.appendChild(row));
  sort.observer.observe(body, { childList: true });
}

function isSortableHeading(th) {
  return th.matches(SORTABLE_HEADINGS) && !/^actions?$/i.test(th.innerText.trim());
}

document.addEventListener('click', event => {
  const th = event.target.closest && event.target.closest('th');
  if (!th || !isSortableHeading(th)) return;
  const table = th.closest('table');
  const previous = tableSorts.get(table);
  const direction = previous && previous.column === th.cellIndex ? -previous.direction : 1;
  const observer = previous ? previous.observer : new MutationObserver(() => applyTableSort(table));

  table.querySelectorAll('th[data-sorted]').forEach(heading => heading.removeAttribute('data-sorted'));
  th.setAttribute('data-sorted', direction === 1 ? 'asc' : 'desc');
  tableSorts.set(table, { column: th.cellIndex, direction, observer });
  applyTableSort(table);
});
