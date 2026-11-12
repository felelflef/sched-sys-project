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

// Each dialog's × button is announced as "Close"
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-overlay button').forEach(btn => {
    if (!btn.getAttribute('aria-label') && /^[×✕]$/.test(btn.textContent.trim())) btn.setAttribute('aria-label', 'Close');
  });
});

// An opened dialog takes keyboard focus, and gives it back to where it was when it closes.
// On touch screens the dialog itself gets focus, so the on-screen keyboard doesn't pop up.
const dialogReturnFocus = new Map();
function focusOpenedDialog(overlay) {
  const box = overlay.querySelector('.modal') || overlay;
  const visible = el => el.offsetParent !== null;
  let target = null;
  if (!window.matchMedia('(pointer: coarse)').matches) {
    target = [...box.querySelectorAll('input:not([type=hidden]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])')].find(visible)
      || [...box.querySelectorAll('button:not([disabled])')].find(visible);
  }
  if (!target) {
    if (!box.hasAttribute('tabindex')) box.setAttribute('tabindex', '-1');
    target = box;
  }
  target.focus({ preventScroll: true });
}
document.addEventListener('DOMContentLoaded', () => {
  new MutationObserver(records => {
    records.forEach(record => {
      const overlay = record.target;
      if (!overlay.classList || !overlay.classList.contains('modal-overlay')) return;
      const isOpen = getComputedStyle(overlay).display !== 'none';
      if (isOpen && !dialogReturnFocus.has(overlay)) {
        dialogReturnFocus.set(overlay, document.activeElement);
        setTimeout(() => focusOpenedDialog(overlay), 0); // after the dialog has been filled in
      } else if (!isOpen && dialogReturnFocus.has(overlay)) {
        const previous = dialogReturnFocus.get(overlay);
        dialogReturnFocus.delete(overlay);
        if (previous && previous.isConnected && typeof previous.focus === 'function') previous.focus({ preventScroll: true });
      }
    });
  }).observe(document.body, { attributes: true, attributeFilter: ['style', 'class'], subtree: true });
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
  // Real buttons and fields inside a card handle their own keys
  if (event.target.matches && event.target.matches('button, a, input, select, textarea')) return;
  const item = event.target.closest && event.target.closest('.nav-item, .stepper-step, .class-block-cell[tabindex]');
  if (!item) return;
  event.preventDefault();
  item.click();
});

// Connects each visible label to its field, so screen readers announce the label and clicking it focuses the field.
// A field with only a placeholder gets the placeholder as its name. Runs again whenever forms are drawn.
const LABELLED_FIELD = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea';
let labelLinkCount = 0;
function linkFormLabels() {
  document.querySelectorAll('label:not([for]), .form-label:not(label)').forEach(label => {
    if (label.querySelector('input, select, textarea')) return;
    let field = label.nextElementSibling && label.nextElementSibling.matches(LABELLED_FIELD) ? label.nextElementSibling : null;
    if (!field) {
      const group = label.closest('.form-group');
      const fields = group ? group.querySelectorAll(LABELLED_FIELD) : [];
      if (fields.length === 1) field = fields[0];
    }
    if (!field || field.getAttribute('aria-labelledby') || (field.labels && field.labels.length)) return;
    if (!field.id) field.id = `labelled-field-${++labelLinkCount}`;
    if (label.tagName === 'LABEL') {
      label.htmlFor = field.id;
    } else {
      if (!label.id) label.id = `field-label-${++labelLinkCount}`;
      field.setAttribute('aria-labelledby', label.id);
    }
  });
  document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(field => {
    if (!(field.labels && field.labels.length) && !field.getAttribute('aria-label') && !field.getAttribute('aria-labelledby')) {
      field.setAttribute('aria-label', field.placeholder);
    }
  });
}
let labelLinkTimer = null;
document.addEventListener('DOMContentLoaded', () => {
  linkFormLabels();
  new MutationObserver(() => {
    clearTimeout(labelLinkTimer);
    labelLinkTimer = setTimeout(linkFormLabels, 100);
  }).observe(document.body, { childList: true, subtree: true });
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

// In-app replacement for confirm(). Resolves true for the confirm button, false for Cancel, Esc or a click outside.
function askConfirm(message, { title = 'Please confirm', confirmLabel = 'Confirm', danger = false } = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-dialog-overlay';
    overlay.innerHTML = `
      <div class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirmDialogTitle" aria-describedby="confirmDialogText">
        <h3 id="confirmDialogTitle"></h3>
        <p id="confirmDialogText"></p>
        <div class="confirm-dialog-actions">
          <button type="button" class="btn btn-outline" data-answer="no">Cancel</button>
          <button type="button" class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" data-answer="yes"></button>
        </div>
      </div>`;
    overlay.querySelector('h3').textContent = title;
    overlay.querySelector('p').textContent = String(message);
    overlay.querySelector('[data-answer="yes"]').textContent = confirmLabel;

    const previousFocus = document.activeElement;
    const finish = answer => {
      window.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (previousFocus && previousFocus.focus) previousFocus.focus();
      resolve(answer);
    };
    // Captured first so the shared Esc handler doesn't also close the form underneath
    const onKey = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish(false);
      } else if (event.key === 'Tab') {
        const buttons = [...overlay.querySelectorAll('button')];
        const index = buttons.indexOf(document.activeElement);
        event.preventDefault();
        buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
      }
    };
    overlay.addEventListener('click', event => {
      if (event.target === overlay) finish(false);
      const button = event.target.closest('[data-answer]');
      if (button) finish(button.dataset.answer === 'yes');
    });
    window.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    overlay.querySelector(danger ? '[data-answer="no"]' : '[data-answer="yes"]').focus();
  });
}
window.askConfirm = askConfirm;
