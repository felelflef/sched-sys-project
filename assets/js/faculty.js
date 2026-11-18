/* ═══════════════════════════════════════════════════
   MODULE 4 — FACULTY PROFILES & DEPARTMENT MANAGEMENT
   ═══════════════════════════════════════════════════ */

function renderDeptFilterOptions() {
  const select = document.getElementById('facultyDeptFilter');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="all">All Departments</option>';
  DEPARTMENTS.forEach(dept => {
    const opt = document.createElement('option');
    opt.value = dept;
    opt.textContent = dept;
    if (dept === currentVal) opt.selected = true;
    select.appendChild(opt);
  });
}

function renderFacultyCards() {
  const grid = document.getElementById('facultyGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const isAdmin = canManageData();
  const btnAddFac = document.getElementById('btnAddFaculty');
  if (btnAddFac) {
    btnAddFac.style.display = isAdmin ? 'inline-flex' : 'none';
  }
  const btnManageDepts = document.getElementById('btnManageDepts');
  if (btnManageDepts) {
    btnManageDepts.style.display = isAdmin ? 'inline-flex' : 'none';
  }
  const btnManageCerts = document.getElementById('btnManageCerts');
  if (btnManageCerts) {
    btnManageCerts.style.display = isAdmin ? 'inline-flex' : 'none';
  }

  const deptFilter = document.getElementById('facultyDeptFilter')?.value || 'all';
  const statusFilter = document.getElementById('facultyStatusFilter')?.value || 'all';

  const filtered = FACULTY.filter(fac => {
    const matchDept = deptFilter === 'all' || fac.dept === deptFilter;
    const matchStatus = statusFilter === 'all' || fac.status === statusFilter;
    return matchDept && matchStatus;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 48px 24px; text-align: center; color: var(--text-secondary); background: white; border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
        <div style="font-size: 1.071rem; font-weight: 600; margin-bottom: 4px;">No faculty profiles found</div>
        <div style="font-size: 0.893rem;">No faculty members match the selected department and status filter criteria.</div>
      </div>
    `;
    return;
  }

  filtered.forEach(fac => {
    const initials = fac.name.split(' ').filter(w => w.length > 1).map(w => w[0]).join('').slice(0,2);

    const safeEmailId = fac.email.replace(/[^a-zA-Z0-9]/g, '_');

    const certsHtml = facultyCertificates(fac).map(c => {
      const removeBtn = isAdmin ? `<span onclick="removeFacultyCertificate(${jsArg(fac.email)}, ${c.id}, event)" style="margin-left:5px; cursor:pointer; font-weight:800; opacity:0.6;" title="Remove ${escapeHtml(c.name)}">✕</span>` : '';
      return `<span class="qual-tag locked" style="background:#F5F3FF; color:#6D28D9; border:1px solid #DDD6FE; font-weight:600; display:inline-flex; align-items:center;" title="Can teach every ${escapeHtml(c.areas.join(', '))} subject in the catalog">🎓 ${escapeHtml(c.name)}<span style="font-weight:500; opacity:0.75; margin-left:4px;">(${escapeHtml(c.areas.join(', '))})</span>${removeBtn}</span>`;
    }).join('') || `<span style="font-size:0.857rem; color:var(--danger); font-style:italic;">None: cannot be assigned any classes</span>`;

    const facultyActionBtns = isAdmin
      ? `<button class="btn btn-outline" style="font-size:0.857rem; padding:1px 6px; border-radius:4px;" onclick="openChangeFacultyDeptModal(${jsArg(fac.email)})">Edit Profile</button>
         <button class="btn btn-outline" style="font-size:0.857rem; padding:1px 6px; border-radius:4px; color:var(--danger); border-color:#fadbd8;" onclick="promptDeleteFaculty(${jsArg(fac.email)})">Remove</button>`
      : ``;

    const card = document.createElement('div');
    card.className = 'faculty-card';
    card.innerHTML = `
      <div class="faculty-card-header">
        <div class="faculty-avatar" style="background:${escapeHtml(fac.bg)};">${escapeHtml(initials)}</div>
        <div style="flex:1;">
          <div class="faculty-name">${escapeHtml(fac.name)}</div>
          <div class="faculty-dept" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span>${escapeHtml(fac.dept)} · ${escapeHtml(fac.status)}</span>
            <span class="badge" style="${facultyTeachingLevel(fac) === 'shs' ? 'background:#F3E8FF; color:#6B21A8;' : facultyTeachingLevel(fac) === 'mixed' ? 'background:#FEF3C7; color:#92400E;' : 'background:#DBEAFE; color:#1E40AF;'} font-size:0.857rem; padding:1px 6px;" title="Levels this teacher may teach">Teaches: ${escapeHtml(TEACHING_LEVEL_NAMES[facultyTeachingLevel(fac)])}</span>
            ${fac.seasoned ? '<span class="badge" style="background:#FEF9C3; color:#854D0E; font-size:0.857rem; padding:1px 6px;" title="Preferred when the generator hands out classes">⭐ Seasoned</span>' : ''}
            <span class="badge badge-success" style="font-size:0.857rem; padding:1px 6px;">✓ Account: ${escapeHtml(fac.email)}</span>
            ${fac.status === 'Part-time' ? `<div class="faculty-availability">${(fac.availableDays || []).length
              ? `Available: ${escapeHtml(fac.availableDays.join(', '))} · ${escapeHtml(fac.availableShifts.join(', ').replace('MIDSHIFT', 'Midshift'))}`
              : 'Availability not set: can be scheduled any time'}</div>` : ''}
            <div class="faculty-card-actions">${facultyActionBtns}</div>
          </div>
        </div>
      </div>
      <div class="faculty-body">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px; margin-bottom:4px;">
          <span class="faculty-meta-label" style="margin:0; font-weight:700; color:#7C3AED;">🎓 FCC Certificates</span>
          ${isAdmin ? `<button class="btn btn-outline" style="font-size:0.857rem; padding:1px 7px; border-radius:4px; height:22px; line-height:1; display:inline-flex; align-items:center; gap:3px; color:#6D28D9; border-color:#DDD6FE;" onclick="toggleAddCertDropdown(${jsArg(fac.email)}, event)" title="Add an FCC certificate">+ Add</button>` : ''}
        </div>
        <div id="addCertContainer-${safeEmailId}" style="display:none; margin-bottom:8px;"></div>
        <div class="qual-tags">${certsHtml}</div>
        <div style="font-size:0.857rem; color:var(--text-secondary); margin-top:6px;">Each certificate lets this teacher teach every catalog subject in its areas</div>
      </div>
    `;
    grid.appendChild(card);
  });
}


// Asks before removing qualifications a professor still teaches this term. If the user agrees,
// those classes come off the schedule with the qualification, so Quick Generate can reassign them.
// Returns null if cancelled, otherwise whether classes were removed.
async function confirmClassRemoval(affected) {
  if (affected.length === 0) return { removeClasses: false };
  const teacherNames = [...new Set(affected.map(c => c.instructor))];
  const teachers = teacherNames.join(', ');
  const codes = [...new Set(affected.map(c => c.subjectCode))].join(', ');
  const count = affected.length;
  const ok = await askConfirm(`${teachers} ${teacherNames.length === 1 ? 'teaches' : 'teach'} ${count} ${codes} class${count === 1 ? '' : 'es'} this term.\n\nRemoving the qualification also takes ${count === 1 ? 'that class' : 'those classes'} off the schedule. You can then run Quick Generate to give ${count === 1 ? 'it' : 'them'} to another qualified professor.`, { title: 'Remove the qualification?', confirmLabel: `Remove and unschedule ${count === 1 ? 'class' : 'classes'}`, danger: true });
  if (!ok) return null;
  MASTER_SCHEDULE_DATA = MASTER_SCHEDULE_DATA.filter(c => !affected.includes(c));
  return { removeClasses: true };
}

// Checks a profile change against the professor's scheduled classes.
// A lowered max load below what they already teach is refused; classes outside new availability are returned.
function facultyChangeImpact(fac, status, days, shifts, maxLoad) {
  const theirs = MASTER_SCHEDULE_DATA.filter(c => c.instructor === fac.name);
  const limited = status === 'Part-time' && days.length > 0 && shifts.length > 0;
  const broken = limited ? theirs.filter(c => !isWithinAvailability(days, shifts, c.day, c.startTime, c.endTime)) : [];
  if (maxLoad < facultyMaxUnits(fac)) {
    // Each term's units plus the busiest overlapping term of each other level, as the scheduler counts them
    const unitsIn = id => facultyLoadUnits(fac.name, theirs.filter(c => c.termId === id && !broken.includes(c)));
    for (const termId of new Set(theirs.map(c => c.termId))) {
      const busiest = {};
      concurrentTermIds(termId).forEach(other => {
        const level = termSchoolLevel(other);
        busiest[level] = Math.max(busiest[level] || 0, unitsIn(other));
      });
      const otherUnits = Object.values(busiest).reduce((sum, u) => sum + u, 0);
      const units = unitsIn(termId) + otherUnits;
      if (units > maxLoad + 0.001) {
        const term = SCHOOL_TERMS.find(t => t.id === termId);
        return { refuse: `${fac.name} already teaches ${formatUnits(units)} units${term ? ` in ${term.termName}` : ''}${otherUnits > 0 ? ', counting the overlapping College or SHS term' : ''}, so the max load can't be set to ${maxLoad}. Move some of their classes to another professor first.` };
      }
    }
  }
  return { broken };
}

// Min and max load inputs (units). Changing the status fills in that status's usual range.
function setLoadInputs(prefix, min, max) {
  document.getElementById(`${prefix}MinLoad`).value = min;
  document.getElementById(`${prefix}MaxLoad`).value = max;
}
function applyLoadDefaults(prefix, status) {
  const range = defaultLoadUnits(status);
  setLoadInputs(prefix, range.min, range.max);
}
window.applyLoadDefaults = applyLoadDefaults;
function readLoadInputs(prefix) {
  const minRaw = document.getElementById(`${prefix}MinLoad`).value;
  const maxRaw = document.getElementById(`${prefix}MaxLoad`).value;
  const problem = INPUT_RULES.int('Minimum load', minRaw, 0, 40) || INPUT_RULES.int('Maximum load', maxRaw, 3, 40);
  if (problem) return { problem };
  const min = parseInt(minRaw, 10);
  const max = parseInt(maxRaw, 10);
  if (min > max) return { problem: `The minimum load (${min} units) can't be more than the maximum (${max} units).` };
  return { min, max };
}

// Classes a teacher would no longer be allowed to teach under a new teaching level
function teachingLevelBroken(fac, newLevel) {
  if (newLevel === 'mixed') return [];
  return MASTER_SCHEDULE_DATA.filter(c => c.instructor === fac.name && c.termId && termSchoolLevel(c.termId) !== newLevel);
}

function askTeachingLevelUnschedule(fac, broken, newLevel) {
  return askToUnscheduleBroken(broken, 'Change teaching level?', `As a ${TEACHING_LEVEL_NAMES[newLevel]} teacher, ${fac.name} can't keep their ${newLevel === 'shs' ? 'college' : 'Senior High School'} classes.`);
}

function askAvailabilityUnschedule(fac, broken) {
  return askToUnscheduleBroken(broken, 'Change availability?', `${fac.name}'s new available days and shifts don't cover some of their classes.`);
}

// Current classes (active term and terms running alongside it) whose teacher stops being qualified after a change.
// change.certs is the certificate list after the change; change.fac holds one teacher's new certificates.
function classesLosingQualification(change) {
  const certs = change.certs || FCC_CERTIFICATES;
  return currentAndOverlappingClasses().filter(c => {
    const fac = FACULTY.find(f => f.name === c.instructor);
    if (!fac || !isFacultyQualified(fac, c.subjectCode)) return false;
    const after = change.fac && (fac.email || '').toLowerCase() === change.fac.email.toLowerCase() ? { ...fac, ...change.fac } : fac;
    return !isFacultyQualified(after, c.subjectCode, certs);
  });
}


function renderCertificatePicker(containerId, selected = []) {
  const box = document.getElementById(containerId);
  if (!box) return;
  box.innerHTML = FCC_CERTIFICATES.map(c =>
    `<label class="availability-option" title="Covers ${escapeHtml(c.areas.join(', '))}"><input type="checkbox" data-cert="${containerId}" value="${c.id}" ${selected.includes(c.id) ? 'checked' : ''} /> ${escapeHtml(c.name)}</label>`
  ).join('') || '<span style="font-size:0.857rem; color:var(--text-secondary);">No FCC certificates yet. Add them with the FCC Certificates button.</span>';
}

function readCertificatePicker(containerId) {
  return [...document.querySelectorAll(`input[data-cert="${containerId}"]:checked`)].map(i => Number(i.value));
}

// ─── FCC certificate manager ───
window.openCertModal = function() {
  if (!canManageData()) {
    alert('Access Denied: Only the System Administrator or a Program Head can manage FCC certificates.');
    return;
  }
  resetCertForm();
  renderCertList();
  document.getElementById('certModal').style.display = 'flex';
};

window.closeCertModal = function() {
  document.getElementById('certModal').style.display = 'none';
};

function renderCertAreaPicker(selected = []) {
  document.getElementById('certAreaPicker').innerHTML = DEPARTMENTS.map(dept =>
    `<label class="availability-option"><input type="checkbox" data-group="cert-area" value="${escapeHtml(dept)}" ${selected.includes(dept) ? 'checked' : ''} /> ${escapeHtml(dept)}</label>`
  ).join('');
}

function resetCertForm() {
  document.getElementById('certEditId').value = '';
  document.getElementById('certNameInput').value = '';
  document.getElementById('certFormTitle').textContent = 'New certificate';
  document.getElementById('certSubmitBtn').textContent = '+ Add Certificate';
  document.getElementById('certCancelEditBtn').style.display = 'none';
  renderCertAreaPicker();
}
window.resetCertForm = resetCertForm;

function renderCertList() {
  const box = document.getElementById('certListContainer');
  if (!box) return;
  box.innerHTML = FCC_CERTIFICATES.map(c => {
    const holders = FACULTY.filter(f => (f.certificates || []).includes(c.id)).map(f => f.name);
    const subjects = SUBJECTS.filter(s => c.areas.includes(s.dept)).length;
    return `<div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#F8FAFD; border:1px solid var(--border-subtle); border-radius:8px; gap:8px;">
      <div style="flex:1; min-width:0;">
        <div style="font-weight:600; font-size:0.929rem; color:var(--text-primary);">🎓 ${escapeHtml(c.name)}</div>
        <div style="font-size:0.857rem; color:var(--text-secondary);">Covers ${escapeHtml(c.areas.join(', '))} · ${subjects} catalog subject${subjects === 1 ? '' : 's'}</div>
        <div style="font-size:0.857rem; color:var(--text-secondary);">${holders.length ? `Held by ${escapeHtml(holders.join(', '))}` : 'No holders yet: give it to teachers in Edit Profile'}</div>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn btn-outline" style="padding:4px 8px; font-size:0.857rem;" onclick="editCertificate(${c.id})">Edit</button>
        <button class="btn btn-outline" style="padding:4px 8px; font-size:0.857rem; color:var(--danger); border-color:#fadbd8;" onclick="deleteCertificate(${c.id})">Delete</button>
      </div>
    </div>`;
  }).join('') || '<div style="font-size:0.857rem; color:var(--text-secondary);">No certificates yet.</div>';
}

window.editCertificate = function(id) {
  const cert = FCC_CERTIFICATES.find(c => c.id === id);
  if (!cert) return;
  document.getElementById('certEditId').value = cert.id;
  document.getElementById('certNameInput').value = cert.name;
  document.getElementById('certFormTitle').textContent = `Edit ${cert.name}`;
  document.getElementById('certSubmitBtn').textContent = 'Save Certificate';
  document.getElementById('certCancelEditBtn').style.display = '';
  renderCertAreaPicker(cert.areas);
  document.getElementById('certNameInput').focus();
};

function refreshAfterCertificateChange() {
  saveStateToStorage();
  resetCertForm();
  renderCertList();
  renderFacultyCards();
  renderSubjectTable();
  if (typeof renderSubjectOfferingTable === 'function') renderSubjectOfferingTable();
  if (typeof renderGrid === 'function') renderGrid();
}

window.submitCertificate = async function() {
  if (!canManageData()) {
    alert('Access Denied: Only the System Administrator or a Program Head can manage FCC certificates.');
    return;
  }
  const id = parseInt(document.getElementById('certEditId').value, 10) || 0;
  const name = document.getElementById('certNameInput').value.trim().replace(/\s+/g, ' ');
  const areas = [...document.querySelectorAll('input[data-group="cert-area"]:checked')].map(i => i.value);
  if (!name) {
    alert('Please name the certificate, for example FCC - IT / CS.');
    return;
  }
  const nameProblem = name.length > 60 ? 'Certificate name must be 60 characters or fewer.' : INPUT_RULES.text('Certificate name', name);
  if (nameProblem) {
    alert(nameProblem);
    return;
  }
  if (areas.length === 0) {
    alert('Tick at least one subject area the certificate covers.');
    return;
  }
  if (FCC_CERTIFICATES.some(c => c.id !== id && c.name.toLowerCase() === name.toLowerCase())) {
    alert('Another certificate already has that name.');
    return;
  }
  const newId = FCC_CERTIFICATES.reduce((max, c) => Math.max(max, c.id), 0) + 1;
  const cert = { id: id || newId, name, areas };
  const updated = id ? FCC_CERTIFICATES.map(c => c.id === id ? cert : c) : [...FCC_CERTIFICATES, cert];
  const lost = id ? classesLosingQualification({ certs: updated }) : [];
  if (!(await askToUnscheduleBroken(lost, `Change ${name}?`, `${name} would no longer cover some subjects its holders teach this term.`))) return;
  MASTER_SCHEDULE_DATA = MASTER_SCHEDULE_DATA.filter(c => !lost.includes(c));
  FCC_CERTIFICATES = updated;
  saveCertificateToServer(cert, !id, lost.length > 0);
  refreshAfterCertificateChange();
};

window.deleteCertificate = async function(id) {
  if (!canManageData()) {
    alert('Access Denied: Only the System Administrator or a Program Head can manage FCC certificates.');
    return;
  }
  const cert = FCC_CERTIFICATES.find(c => c.id === id);
  if (!cert) return;
  const remaining = FCC_CERTIFICATES.filter(c => c.id !== id);
  const lost = classesLosingQualification({ certs: remaining });
  const holders = FACULTY.filter(f => (f.certificates || []).includes(id));
  const ok = lost.length > 0
    ? await askToUnscheduleBroken(lost, `Delete ${cert.name}?`, `Teachers rely on ${cert.name} for some of their classes this term.`)
    : await askConfirm(`${cert.name} will be deleted${holders.length ? ` and taken away from ${holders.map(f => f.name).join(', ')}` : ''}.`, { title: 'Delete this certificate?', confirmLabel: 'Delete certificate', danger: true });
  if (!ok) return;
  MASTER_SCHEDULE_DATA = MASTER_SCHEDULE_DATA.filter(c => !lost.includes(c));
  FCC_CERTIFICATES = remaining;
  holders.forEach(f => { f.certificates = f.certificates.filter(c => c !== id); });
  deleteCertificateFromServer(id, lost.length > 0);
  refreshAfterCertificateChange();
};

// Card quick actions: add or remove one FCC certificate
window.toggleAddCertDropdown = function(email, event) {
  if (event) event.stopPropagation();
  const safeId = email.replace(/[^a-zA-Z0-9]/g, '_');
  const container = document.getElementById(`addCertContainer-${safeId}`);
  if (!container) return;
  if (container.style.display === 'block') {
    container.style.display = 'none';
    return;
  }
  const fac = FACULTY.find(f => f.email && f.email.toLowerCase() === email.toLowerCase());
  if (!fac) return;
  const available = FCC_CERTIFICATES.filter(c => !(fac.certificates || []).includes(c.id));
  container.innerHTML = available.length === 0
    ? '<div style="font-size:0.857rem; color:var(--text-secondary); padding:4px;">This teacher already holds every certificate. Make new ones with the FCC Certificates button.</div>'
    : `<div style="background:#F8FAFD; border:1px solid #DDD6FE; border-radius:6px; padding:6px 8px; margin-top:4px;">
        <div id="selectAddCert-${safeId}" class="availability-options" style="margin-bottom:6px;">
          ${available.map(c => `<label class="availability-option" title="Covers ${escapeHtml(c.areas.join(', '))}"><input type="checkbox" value="${c.id}" /> ${escapeHtml(c.name)}</label>`).join('')}
        </div>
        <div style="display:flex; gap:6px; justify-content:flex-end;">
          <button class="btn btn-outline" style="font-size:0.857rem; padding:3px 8px; height:28px; line-height:1;" onclick="toggleAddCertDropdown(${jsArg(fac.email)})">Cancel</button>
          <button class="btn btn-primary" style="font-size:0.857rem; padding:3px 10px; height:28px; line-height:1;" onclick="confirmAddFacultyCert(${jsArg(fac.email)})">Add selected</button>
        </div>
      </div>`;
  container.style.display = 'block';
};

window.confirmAddFacultyCert = function(email) {
  const safeId = email.replace(/[^a-zA-Z0-9]/g, '_');
  const picker = document.getElementById(`selectAddCert-${safeId}`);
  const ids = picker ? [...picker.querySelectorAll('input[type="checkbox"]:checked')].map(cb => Number(cb.value)) : [];
  if (ids.length === 0) {
    alert('Tick at least one certificate to add.');
    return;
  }
  const fac = FACULTY.find(f => f.email && f.email.toLowerCase() === email.toLowerCase());
  if (!fac) return;
  fac.certificates = [...new Set([...(fac.certificates || []), ...ids])];
  if (typeof saveStateToStorage === 'function') saveStateToStorage();
  saveFacultyQualifications(fac);
  renderFacultyCards();
  if (typeof renderGrid === 'function') renderGrid();
};

window.removeFacultyCertificate = async function(email, certId, event) {
  if (event) event.stopPropagation();
  const fac = FACULTY.find(f => f.email && f.email.toLowerCase() === email.toLowerCase());
  if (!fac) return;
  const kept = (fac.certificates || []).filter(id => id !== certId);
  const removal = await confirmClassRemoval(classesLosingQualification({ fac: { email: fac.email, certificates: kept } }));
  if (!removal) return;
  fac.certificates = kept;
  if (typeof saveStateToStorage === 'function') saveStateToStorage();
  saveFacultyQualifications(fac, removal.removeClasses);
  renderFacultyCards();
  if (typeof renderGrid === 'function') renderGrid();
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('facultyDeptFilter')?.addEventListener('change', renderFacultyCards);
  document.getElementById('facultyStatusFilter')?.addEventListener('change', renderFacultyCards);
});

// Department Management functions
window.openDeptModal = function() {
  if (!canManageData()) {
    alert('Access Denied: Only the System Administrator or a Program Head can manage departments.');
    return;
  }
  renderDeptList();
  document.getElementById('newDeptInput').value = '';
  document.getElementById('deptModal').style.display = 'flex';
};

window.closeDeptModal = function() {
  document.getElementById('deptModal').style.display = 'none';
};

function renderDeptList() {
  const container = document.getElementById('deptListContainer');
  if (!container) return;
  container.innerHTML = '';
  DEPARTMENTS.forEach((dept, idx) => {
    const facultyCount = FACULTY.filter(f => f.dept === dept).length;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#F8FAFD; border:1px solid var(--border-subtle); border-radius:8px; gap:8px;';
    row.innerHTML = `
      <div style="flex:1;">
        <div style="font-weight:600; font-size:0.929rem; color:var(--text-primary);">${escapeHtml(dept)}</div>
        <div style="font-size:0.857rem; color:var(--text-secondary);">${facultyCount} faculty assigned</div>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn btn-outline" style="padding:4px 8px; font-size:0.857rem; color:var(--danger); border-color:#fadbd8;" onclick="deleteDepartment(${idx})">Delete</button>
      </div>
    `;
    container.appendChild(row);
  });
}

window.addDepartment = function() {
  if (!canManageData()) {
    alert('Access Denied: Only the System Administrator or a Program Head can add departments.');
    return;
  }
  const input = document.getElementById('newDeptInput');
  const name = input.value.trim();
  if (!name) {
    alert('Please enter a department name.');
    return;
  }
  const deptProblem = name.length > 50 ? 'Department must be 50 characters or fewer.' : INPUT_RULES.text('Department', name);
  if (deptProblem) {
    alert(deptProblem);
    return;
  }
  if (DEPARTMENTS.some(d => d.toLowerCase() === name.toLowerCase())) {
    alert('This department already exists.');
    return;
  }
  DEPARTMENTS.push(name);
  input.value = '';
  saveStateToStorage();
  saveDepartmentsToServer();
  renderDeptList();
  renderDeptFilterOptions();
  renderFacultyCards();
  renderSubjectDeptFilterOptions();
};

window.deleteDepartment = function(idx) {
  if (!canManageData()) {
    alert('Access Denied: Only the System Administrator or a Program Head can remove departments.');
    return;
  }
  if (idx < 0 || idx >= DEPARTMENTS.length) return;
  if (DEPARTMENTS.length <= 1) {
    alert('At least one academic department must remain in the system.');
    return;
  }
  const target = DEPARTMENTS[idx];
  DEPARTMENTS.splice(idx, 1);
  const fallback = DEPARTMENTS[0] || 'General';
  FACULTY.forEach(f => {
    if (f.dept === target) f.dept = fallback;
  });
  SUBJECTS.forEach(s => {
    if (s.dept === target) s.dept = fallback;
  });
  FCC_CERTIFICATES.forEach(c => {
    c.areas = [...new Set(c.areas.map(a => a === target ? fallback : a))];
  });
  saveStateToStorage();
  saveDepartmentsToServer();
  renderDeptList();
  renderDeptFilterOptions();
  renderFacultyCards();
  renderSubjectDeptFilterOptions();
  renderSubjectTable();
};

const AVAILABILITY_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const AVAILABILITY_SHIFTS = [
  { value: 'AM', label: 'AM', hours: '7:00 AM – 1:00 PM' },
  { value: 'MIDSHIFT', label: 'Midshift', hours: '10:00 AM – 4:00 PM' },
  { value: 'PM', label: 'PM', hours: '1:00 PM onward' }
];

function renderAvailabilityPicker(prefix, status, days = [], shifts = []) {
  const option = (group, value, text, checked) =>
    `<label class="availability-option"><input type="checkbox" data-group="${prefix}-${group}" value="${value}" ${checked ? 'checked' : ''} /> ${text}</label>`;
  document.getElementById(`${prefix}Availability`).innerHTML = `
    <div class="form-label">Available Days</div>
    <div class="availability-options">${AVAILABILITY_DAYS.map(d => option('day', d, d, days.includes(d))).join('')}</div>
    <div class="form-label" style="margin-top:10px;">Available Shifts</div>
    <div class="availability-options">${AVAILABILITY_SHIFTS.map(s => option('shift', s.value, `${s.label} <small>${s.hours}</small>`, shifts.includes(s.value))).join('')}</div>
  `;
  toggleAvailabilityPicker(prefix, status);
}

window.toggleAvailabilityPicker = function(prefix, status) {
  document.getElementById(`${prefix}Availability`).style.display = status === 'Part-time' ? 'block' : 'none';
};

function readAvailabilityPicker(prefix) {
  const checked = group => [...document.querySelectorAll(`input[data-group="${prefix}-${group}"]:checked`)].map(i => i.value);
  return { days: checked('day'), shifts: checked('shift') };
}

// Returns an error message, or null if this availability can be saved for the professor
function availabilityFormProblem(name, status, picked) {
  if (status !== 'Part-time') return null;
  if (!picked.days.length || !picked.shifts.length) return 'Choose at least one day and one shift for a part-time professor.';
  // Classes outside the new availability are handled by facultyChangeImpact, which asks before unscheduling them
  return null;
}

window.openChangeFacultyDeptModal = function(identifier) {
  if (!canManageData()) {
    alert('Access Denied: Only the System Administrator or a Program Head can edit faculty profiles.');
    return;
  }
  const fac = FACULTY.find(f => (f.email && f.email.toLowerCase() === identifier.toLowerCase()) || (f.name && f.name.toLowerCase() === identifier.toLowerCase()));
  if (!fac) return;

  document.getElementById('changeFacultyDeptTargetEmail').value = fac.email;
  const nameInput = document.getElementById('changeFacultyNameInput');
  if (nameInput) nameInput.value = fac.name;


  const emailDisplay = document.getElementById('changeFacultyDeptEmailDisplay');
  if (emailDisplay) emailDisplay.textContent = `${fac.email} · Current Dept: ${fac.dept}`;

  const select = document.getElementById('changeFacultyDeptSelect');
  select.innerHTML = '';
  DEPARTMENTS.forEach(dept => {
    const opt = document.createElement('option');
    opt.value = dept;
    opt.textContent = dept;
    if (dept === fac.dept) opt.selected = true;
    select.appendChild(opt);
  });

  const statusSelect = document.getElementById('changeFacultyStatusSelect');
  if (statusSelect) {
    statusSelect.value = fac.status || 'Full-time';
  }
  document.getElementById('changeFacultyLevelSelect').value = facultyTeachingLevel(fac);
  renderCertificatePicker('changeFacultyCertPicker', fac.certificates || []);
  document.getElementById('changeFacultySeasoned').checked = !!fac.seasoned;
  renderAvailabilityPicker('changeFaculty', fac.status || 'Full-time', fac.availableDays || [], fac.availableShifts || []);
  setLoadInputs('changeFaculty', facultyMinUnits(fac), facultyMaxUnits(fac));

  document.getElementById('changeFacultyDeptModal').style.display = 'flex';
};

window.closeChangeFacultyDeptModal = function() {
  document.getElementById('changeFacultyDeptModal').style.display = 'none';
};

window.submitChangeFacultyDept = async function() {
  if (!canManageData()) {
    alert('Access Denied: Only the System Administrator or a Program Head can edit faculty profiles.');
    return;
  }
  const email = document.getElementById('changeFacultyDeptTargetEmail').value;
  const newDept = document.getElementById('changeFacultyDeptSelect').value;
  const nameInput = document.getElementById('changeFacultyNameInput');
  const newName = nameInput ? nameInput.value.trim() : '';

  if (!newName) {
    alert('Please enter a valid faculty name.');
    return;
  }
  const facultyNameProblem = INPUT_RULES.fullName(newName);
  if (facultyNameProblem) {
    alert(facultyNameProblem);
    return;
  }

  const fac = FACULTY.find(f => f.email && f.email.toLowerCase() === email.toLowerCase());
  if (!fac) {
    alert('Faculty profile not found.');
    return;
  }

  const pickedAvailability = readAvailabilityPicker('changeFaculty');
  const availabilityProblem = availabilityFormProblem(fac.name, document.getElementById('changeFacultyStatusSelect').value, pickedAvailability);
  if (availabilityProblem) {
    alert(availabilityProblem);
    return;
  }

  const statusSelect = document.getElementById('changeFacultyStatusSelect');
  const newStatus = statusSelect ? statusSelect.value : (fac.status || 'Full-time');
  const load = readLoadInputs('changeFaculty');
  if (load.problem) {
    alert(load.problem);
    return;
  }
  const newMaxLoad = load.max;
  const impact = facultyChangeImpact(fac, newStatus, newStatus === 'Part-time' ? pickedAvailability.days : [], newStatus === 'Part-time' ? pickedAvailability.shifts : [], newMaxLoad);
  if (impact.refuse) {
    alert(impact.refuse);
    return;
  }
  if (!(await askAvailabilityUnschedule(fac, impact.broken))) return;
  const newTeachingLevel = document.getElementById('changeFacultyLevelSelect').value;
  const levelBroken = teachingLevelBroken(fac, newTeachingLevel).filter(c => !impact.broken.includes(c));
  if (!(await askTeachingLevelUnschedule(fac, levelBroken, newTeachingLevel))) return;
  impact.broken.push(...levelBroken);

  const newCerts = readCertificatePicker('changeFacultyCertPicker');
  const qualRemoval = await confirmClassRemoval(classesLosingQualification({ fac: { email: fac.email, certificates: newCerts } }));
  if (!qualRemoval) return;
  removeClassesAndSave(impact.broken);

  const oldName = fac.name;

  // 1. Update faculty profile
  fac.name = newName;
  if (newDept) fac.dept = newDept;
  fac.status = newStatus;
  fac.availableDays = newStatus === 'Part-time' ? pickedAvailability.days : [];
  fac.availableShifts = newStatus === 'Part-time' ? pickedAvailability.shifts : [];
  fac.maxLoad = newMaxLoad;
  fac.minLoad = load.min;
  fac.teachingLevel = newTeachingLevel;
  fac.seasoned = document.getElementById('changeFacultySeasoned').checked;
  fac.certificates = newCerts;
  if (typeof saveStateToStorage === 'function') saveStateToStorage();
  saveFacultyQualifications(fac, qualRemoval.removeClasses);
  saveFacultyAvailability(fac);

  // 2. Update registered account in USERS list
  const user = USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (user) {
    user.name = newName;
    user.employmentType = newStatus;
  }

  // 3. Update VALID_USERS cache
  if (VALID_USERS[email.toLowerCase()]) {
    VALID_USERS[email.toLowerCase()].name = newName;
    VALID_USERS[email.toLowerCase()].initials = newName.split(' ').filter(w => w.length > 0).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'ST';
  }

  // 4. Update assigned timetable slots if name changed

  // A renamed professor keeps their classes
  if (typeof MASTER_SCHEDULE_DATA !== 'undefined' && Array.isArray(MASTER_SCHEDULE_DATA)) {
    MASTER_SCHEDULE_DATA.forEach(c => {
      if (c.instructor === oldName) {
        c.instructor = newName;
      }
    });
    queueScheduleSave();
  }

  // 5. Update CURRENT_USER if admin edited their own account
  if (CURRENT_USER && CURRENT_USER.email.toLowerCase() === email.toLowerCase()) {
    CURRENT_USER.name = newName;
    CURRENT_USER.initials = newName.split(' ').filter(w => w.length > 0).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'ST';
    const sidebarName = document.querySelector('.sidebar-footer .user-name');
    if (sidebarName) sidebarName.textContent = newName;
    const sidebarAvatar = document.querySelector('.sidebar-footer .avatar');
    if (sidebarAvatar) sidebarAvatar.textContent = CURRENT_USER.initials;
  }

  // 6. Persist name and subject_role to MySQL via API
  const nameParts = newName.split(' ');
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ') || nameParts[0];

  fetch('/api/users.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'edit_user',
      email: email,
      first_name: firstName,
      last_name: lastName,
      subject_role: newDept
    })
  }).catch(() => {});

  closeChangeFacultyDeptModal();
  renderFacultyCards();
  renderUserTable();
  renderGrid();
  renderDeptList();
  renderDeptFilterOptions();
};

// Add Faculty Modal Functions
window.openAddFacultyModal = function() {
  if (!canManageData()) {
    alert('Access Denied: Only the System Administrator or a Program Head can add faculty profiles.');
    return;
  }
  const userSelect = document.getElementById('newFacUserSelect');
  if (userSelect) {
    userSelect.innerHTML = '';
    // Registered accounts in User Management eligible for teaching
    const registeredFacultyUsers = USERS.filter(u => u.role === 'faculty' || u.role === 'program-head');
    
    if (registeredFacultyUsers.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No registered faculty accounts found in User Management';
      userSelect.appendChild(opt);
    } else {
      registeredFacultyUsers.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.email;
        const hasProfile = FACULTY.some(f => f.email.toLowerCase() === u.email.toLowerCase());
        opt.textContent = `${u.name} (${u.email}) — ${u.roleLabel}${hasProfile ? ' [Profile Active]' : ''}`;
        userSelect.appendChild(opt);
      });
    }
  }

  const deptSelect = document.getElementById('newFacDept');
  deptSelect.innerHTML = '';
  DEPARTMENTS.forEach(dept => {
    const opt = document.createElement('option');
    opt.value = dept;
    opt.textContent = dept;
    deptSelect.appendChild(opt);
  });

  document.getElementById('newFacStatus').value = 'Full-time';
  document.getElementById('newFacLevel').value = 'tertiary';
  document.getElementById('newFacSeasoned').checked = false;
  renderAvailabilityPicker('newFac', 'Full-time');
  applyLoadDefaults('newFac', 'Full-time');
  renderCertificatePicker('newFacCertPicker');

  if (userSelect && userSelect.value) {
    window.handleFacultyUserDropdownChange(userSelect.value);
  }

  document.getElementById('addFacultyModal').style.display = 'flex';
};

window.closeAddFacultyModal = function() {
  document.getElementById('addFacultyModal').style.display = 'none';
};

window.handleFacultyUserDropdownChange = function(email) {
  if (!email) return;
  const user = USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return;

  const deptSelect = document.getElementById('newFacDept');
  for (let i = 0; i < deptSelect.options.length; i++) {
    if (user.roleLabel.toLowerCase().includes(deptSelect.options[i].value.toLowerCase())) {
      deptSelect.selectedIndex = i;
      break;
    }
  }

  const existingFac = FACULTY.find(f => f.email.toLowerCase() === email.toLowerCase());
  if (existingFac) {
    if (existingFac.dept) deptSelect.value = existingFac.dept;
    if (existingFac.status) document.getElementById('newFacStatus').value = existingFac.status;
    document.getElementById('newFacLevel').value = facultyTeachingLevel(existingFac);
    document.getElementById('newFacSeasoned').checked = !!existingFac.seasoned;
    renderAvailabilityPicker('newFac', existingFac.status || 'Full-time', existingFac.availableDays || [], existingFac.availableShifts || []);
    setLoadInputs('newFac', facultyMinUnits(existingFac), facultyMaxUnits(existingFac));
    renderCertificatePicker('newFacCertPicker', existingFac.certificates || []);
  }
};

window.submitAddFaculty = async function() {
  if (!canManageData()) {
    alert('Access Denied: Only the System Administrator or a Program Head can save faculty profiles.');
    closeAddFacultyModal();
    return;
  }
  const email = document.getElementById('newFacUserSelect')?.value;
  if (!email) {
    alert('Please select an account registered in User Management.');
    return;
  }

  const user = USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    alert('Selected user account was not found in User Management.');
    return;
  }

  const dept = document.getElementById('newFacDept').value;
  const status = document.getElementById('newFacStatus').value;
  const load = readLoadInputs('newFac');
  if (load.problem) {
    alert(load.problem);
    return;
  }
  const picked = readAvailabilityPicker('newFac');
  const availabilityProblem = availabilityFormProblem(user.name, status, picked);
  if (availabilityProblem) {
    alert(availabilityProblem);
    return;
  }
  const availableDays = status === 'Part-time' ? picked.days : [];
  const availableShifts = status === 'Part-time' ? picked.shifts : [];
  const maxLoad = load.max;
  const minLoad = load.min;
  const teachingLevel = document.getElementById('newFacLevel').value;
  const certificates = readCertificatePicker('newFacCertPicker');
  const seasoned = document.getElementById('newFacSeasoned').checked;

  const existingFacIndex = FACULTY.findIndex(f => f.email.toLowerCase() === email.toLowerCase());
  let removeClasses = false;
  if (existingFacIndex >= 0) {
    const impact = facultyChangeImpact(FACULTY[existingFacIndex], status, availableDays, availableShifts, maxLoad);
    if (impact.refuse) {
      alert(impact.refuse);
      return;
    }
    if (!(await askAvailabilityUnschedule(FACULTY[existingFacIndex], impact.broken))) return;
    const levelBroken = teachingLevelBroken(FACULTY[existingFacIndex], teachingLevel).filter(c => !impact.broken.includes(c));
    if (!(await askTeachingLevelUnschedule(FACULTY[existingFacIndex], levelBroken, teachingLevel))) return;
    impact.broken.push(...levelBroken);
    const removal = await confirmClassRemoval(classesLosingQualification({ fac: { email, certificates } }));
    if (!removal) return;
    removeClasses = removal.removeClasses;
    removeClassesAndSave(impact.broken);
  }
  const colors = ['#25447A', '#2E7D5B', '#6C3483', '#C27A1A', '#2980B9', '#C0392B'];

  if (existingFacIndex >= 0) {
    // Update profile
    FACULTY[existingFacIndex].dept = dept;
    FACULTY[existingFacIndex].status = status;
    FACULTY[existingFacIndex].maxLoad = maxLoad;
    FACULTY[existingFacIndex].minLoad = minLoad;
    FACULTY[existingFacIndex].teachingLevel = teachingLevel;
    FACULTY[existingFacIndex].certificates = certificates;
    FACULTY[existingFacIndex].seasoned = seasoned;
    FACULTY[existingFacIndex].availableDays = availableDays;
    FACULTY[existingFacIndex].availableShifts = availableShifts;
  } else {
    // Create profile
    FACULTY.push({
      name: user.name,
      email: user.email,
      dept,
      status,
      maxLoad,
      minLoad,
      teachingLevel,
      certificates,
      seasoned,
      availableDays,
      availableShifts,
      bg: colors[Math.floor(Math.random() * colors.length)]
    });
  }

  if (user) {
    user.employmentType = status;
  }

  if (IS_STANDALONE && VALID_USERS[user.email] && !VALID_USERS[user.email].password) {
    VALID_USERS[user.email].password = 'password';
  }

  if (typeof saveStateToStorage === 'function') saveStateToStorage();
  saveFacultyQualifications({ email: user.email, certificates }, removeClasses);
  saveFacultyAvailability({ email: user.email, status, availableDays, availableShifts, maxLoad, minLoad, teachingLevel, seasoned });
  closeAddFacultyModal();
  renderFacultyCards();
  renderUserTable();
  renderDeptFilterOptions();
  if (document.getElementById('deptModal').style.display === 'flex') {
    renderDeptList();
  }
};

window.promptDeleteFaculty = function(identifier) {
  if (!canManageData()) {
    alert('Access Denied: Only the System Administrator or a Program Head can remove faculty profiles.');
    return;
  }
  const fac = FACULTY.find(f => (f.email && f.email.toLowerCase() === identifier.toLowerCase()) || (f.name && f.name.toLowerCase() === identifier.toLowerCase()));
  if (!fac) return;

  document.getElementById('deleteFacultyTargetEmail').value = fac.email;
  document.getElementById('deleteFacultyNameDisplay').textContent = fac.name;
  document.getElementById('deleteFacultyEmailDisplay').textContent = `${fac.email} · ${fac.dept} (${fac.status})`;
  document.getElementById('deleteFacultyModal').style.display = 'flex';
};

window.closeDeleteFacultyModal = function() {
  document.getElementById('deleteFacultyModal').style.display = 'none';
};

window.confirmDeleteFacultyProfile = function() {
  if (!canManageData()) {
    alert('Access Denied: Only the System Administrator or a Program Head can remove faculty profiles.');
    return;
  }
  const email = document.getElementById('deleteFacultyTargetEmail').value;
  const fac = FACULTY.find(f => f.email && f.email.toLowerCase() === email.toLowerCase());
  const facName = fac ? fac.name : null;
  if (!IS_STANDALONE && MASTER_SCHEDULE_DATA.some(c => c.instructor === facName)) {
    alert(`${facName} still has scheduled classes. Reassign them before removing this profile.`);
    closeDeleteFacultyModal();
    return;
  }
  saveFacultyQualifications({ email, certificates: [] });
  FACULTY = FACULTY.filter(f => !f.email || f.email.toLowerCase() !== email.toLowerCase());
  if (facName) {
    if (typeof MASTER_SCHEDULE_DATA !== 'undefined' && Array.isArray(MASTER_SCHEDULE_DATA)) {
      MASTER_SCHEDULE_DATA.forEach(c => {
        if (c.instructor === facName) c.instructor = 'TBA';
      });
    }
  }
  if (typeof saveStateToStorage === 'function') saveStateToStorage();
  closeDeleteFacultyModal();
  renderFacultyCards();
  renderGrid();
};

