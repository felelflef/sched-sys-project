/* ══════════════════════════════════════════════════════════════════════════
   SEARCH (page header)
   One box that finds a section, professor, room or subject and opens it: sections, professors and rooms open
   their timetable in View Schedule; subjects open in the Subject Catalog.
   ══════════════════════════════════════════════════════════════════════════ */

let searchResults = [];
let searchActiveIndex = -1;

function searchCandidates() {
  const { activeTerm } = getActiveAcademicContext();
  const sections = ACADEMIC_SECTIONS.filter(s => s.termId === activeTerm.id).map(s => ({ kind: 'section', label: s.code, detail: s.name, value: s.code }));
  const teachers = FACULTY.map(f => ({ kind: 'teacher', label: f.name, detail: f.dept || 'Professor', value: f.name }));
  const rooms = ROOMS.map(r => ({ kind: 'room', label: r.code, detail: `${r.type}, ${r.cap} seats`, value: r.code }));
  const subjects = SUBJECTS.map(s => ({ kind: 'subject', label: s.code, detail: s.title || s.name || '', value: s.code }));
  return [...sections, ...teachers, ...rooms, ...subjects];
}

const SEARCH_KIND_LABELS = { section: 'Section', teacher: 'Professor', room: 'Room', subject: 'Subject' };

function renderSearchResults() {
  const list = document.getElementById('globalSearchResults');
  const input = document.getElementById('globalSearchInput');
  if (!list || !input) return;
  const query = input.value.trim().toLowerCase();
  if (!query) {
    searchResults = [];
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    return;
  }
  // Matches at the start of a name come first, then matches anywhere
  const scored = searchCandidates().map(item => {
    const label = item.label.toLowerCase();
    const text = `${label} ${item.detail.toLowerCase()}`;
    const score = label.startsWith(query) ? 0 : text.includes(query) ? 1 : -1;
    return { item, score };
  }).filter(x => x.score >= 0);
  scored.sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label));
  searchResults = scored.slice(0, 8).map(x => x.item);
  searchActiveIndex = searchResults.length ? 0 : -1;
  list.innerHTML = searchResults.length
    ? searchResults.map((r, i) => `<li role="option" id="globalSearchOption${i}" class="global-search-option${i === searchActiveIndex ? ' active' : ''}" aria-selected="${i === searchActiveIndex}"
        onmousedown="event.preventDefault(); openSearchResult(${i})"><span class="global-search-kind">${SEARCH_KIND_LABELS[r.kind]}</span>
        <strong>${escapeHtml(r.label)}</strong> <span class="global-search-detail">${escapeHtml(r.detail)}</span></li>`).join('')
    : '<li class="global-search-empty">No section, professor, room or subject matches.</li>';
  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-activedescendant', searchActiveIndex >= 0 ? `globalSearchOption${searchActiveIndex}` : '');
}

function openSearchResult(index) {
  const result = searchResults[index];
  if (!result) return;
  const input = document.getElementById('globalSearchInput');
  input.value = '';
  renderSearchResults();
  input.blur();
  if (result.kind === 'subject') {
    switchPage('subjects');
    const filter = document.getElementById('subjectSearchInput');
    if (filter) { filter.value = result.value; renderSubjectTable(); }
    return;
  }
  switchPage('viewer');
  setViewerMode(result.kind);
  setViewerSelection(result.value);
}

function handleSearchKeys(event) {
  if (!searchResults.length && event.key !== 'Escape') return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    searchActiveIndex = (searchActiveIndex + step + searchResults.length) % searchResults.length;
    document.querySelectorAll('.global-search-option').forEach((li, i) => {
      li.classList.toggle('active', i === searchActiveIndex);
      li.setAttribute('aria-selected', String(i === searchActiveIndex));
    });
    event.target.setAttribute('aria-activedescendant', `globalSearchOption${searchActiveIndex}`);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    openSearchResult(Math.max(searchActiveIndex, 0));
  } else if (event.key === 'Escape') {
    event.target.value = '';
    renderSearchResults();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('globalSearchInput');
  if (!input) return;
  input.addEventListener('input', renderSearchResults);
  input.addEventListener('keydown', handleSearchKeys);
  input.addEventListener('blur', () => setTimeout(() => { const list = document.getElementById('globalSearchResults'); if (list) list.hidden = true; }, 150));
  input.addEventListener('focus', () => { if (input.value.trim()) renderSearchResults(); });
});
