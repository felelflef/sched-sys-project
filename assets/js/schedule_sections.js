/* ══════════════════════════════════════════════════════════════════════════
   STEP 4: CREATE SECTIONS
   Part of the Master Schedule; the schedule_*.js files load in order (see the page's script tags).
   ══════════════════════════════════════════════════════════════════════════ */

function renderSectionsTable() {
  const tbody = document.getElementById('sectionsTableBody');
  if (!tbody) return;

  const { activeSy, activeTerm } = getActiveAcademicContext();
  const termSections = ACADEMIC_SECTIONS.filter(s => s.termId === activeTerm.id);

  if (termSections.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:28px 16px; color:var(--text-secondary);"><div style="font-size:1.071rem; font-weight:700; color:var(--text-primary); margin-bottom:6px;">No sections created for ${escapeHtml(activeTerm.termName)} (${escapeHtml(activeSy.yearCode)})</div><div>Click <strong>"+ Add Section"</strong> to create sections for this term.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = termSections.map(sec => {
    // Count attached included curriculum subjects
    const attachedCount = CURRICULUM_SUBJECTS.filter(s => s.isIncluded && s.program === sec.program && s.year === sec.year && s.termId === activeTerm.id).length;

    return `
      <tr>
        <td style="font-weight:800; color:var(--accent-primary); font-size:0.964rem;">${escapeHtml(sec.code)}</td>
        <td style="font-weight:700; color:var(--text-primary);">${escapeHtml(sec.name)}</td>
        <td><span class="badge" style="background:#F3F4F6; color:#374151; font-size:0.857rem;">${escapeHtml(sec.program)}</span>${isRetiredProgram(sec.program) ? '<span class="badge" style="background:#FEE2E2; color:#B91C1C; font-size:0.857rem; margin-left:4px;" title="STI no longer offers this program. Move or delete this section.">No longer offered</span>' : ''}</td>
        <td>${yearLevelLabel(sec.year)}</td>
        <td><span class="badge" style="${sec.shift === 'PM' ? 'background:#FEF3C7; color:#92400E;' : (sec.shift === 'MIDSHIFT' ? 'background:#EDE9FE; color:#5B21B6;' : 'background:#E0F2FE; color:#0369A1;')} font-size:0.857rem; font-weight:700;">${escapeHtml(sec.shift || 'AM')}</span></td>
        <td>${sec.homeRoom ? `<span class="badge" style="background:#ECFDF5; color:#065F46; font-size:0.857rem; font-weight:700;">${escapeHtml(sec.homeRoom)}</span>` : '<span style="font-size:0.857rem; color:var(--text-secondary);">Automatic</span>'}</td>
        <td>${sectionAdviserName(sec) ? escapeHtml(sectionAdviserName(sec)) : '<span style="font-size:0.857rem; color:var(--text-secondary);">None yet</span>'}</td>
        <td><strong>${sec.studentCount}</strong> students</td>
        <td>${sectionSubjectsHtml(sec, attachedCount)}</td>
        <td style="text-align:right;">
          <div style="display:inline-flex; gap:6px;">
            <button class="btn btn-outline btn-sm" onclick="openEditSectionModal(${sec.id})">Edit</button>
            <button class="btn btn-outline btn-sm" onclick="openSplitSectionModal(${sec.id})">Split</button>
            <button class="btn btn-danger btn-sm" onclick="deleteSectionItem(${sec.id})">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// SHS sections read like STEM11-A; college sections keep the IT701M pattern. The server builds the same codes.
function sectionCodeFor(prog, yr, index) {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  // Codes allow only letters, numbers, spaces and hyphens: BSIT -> IT, HRS -> HRS, IT-MAWD -> IT-MAWD
  const prefix = prog.startsWith('BS') ? prog.substring(2) : prog.replace(/[^A-Za-z0-9-]/g, '');
  if (Number(yr) >= 11) return `${prefix}${yr}-${letters[index] || index + 1}`;
  return `${prefix}${yr}0${index + 1}M`;
}

// The year dropdown next to a program dropdown lists only the years that program offers (HRS: Years 1-2)
function refreshYearsForProgram(programId, yearId) {
  const program = document.getElementById(programId)?.value;
  const select = document.getElementById(yearId);
  if (!select || !program) return;
  const years = yearsForProgram(program, programId === 'curricSubjProgram' ? curricFormLevel() : activeSchoolLevel());
  const current = select.value;
  select.innerHTML = years.map(y => `<option value="${y}">${escapeHtml(yearLevelOptionLabel(y))}</option>`).join('');
  select.value = years.map(String).includes(current) ? current : String(years[0]);
}

function openAutoGenerateSectionsModal() {
  const modal = document.getElementById('autoGenerateSectionsModal');
  if (modal) {
    calculateAutoGenPreview();
    modal.style.display = 'flex';
  }
}

function closeAutoGenerateSectionsModal() {
  const modal = document.getElementById('autoGenerateSectionsModal');
  if (modal) modal.style.display = 'none';
}

function toggleAutoGenModeUI() {
  const isProj = document.getElementById('autoGenModeProj')?.checked;
  const projFields = document.getElementById('autoGenProjectionFields');
  const countFields = document.getElementById('autoGenCountFields');
  if (projFields) projFields.style.display = isProj ? 'grid' : 'none';
  if (countFields) countFields.style.display = isProj ? 'none' : 'grid';
  calculateAutoGenPreview();
}

function calculateAutoGenPreview() {
  const label = document.getElementById('autoGenPreviewLabel');
  if (!label) return;

  const isProj = document.getElementById('autoGenModeProj')?.checked;
  const prog = document.getElementById('autoGenProgram')?.value || 'all';
  const yr = document.getElementById('autoGenYear')?.value || 'all';

  let secCount = 3;
  let stuPerSec = 38;

  if (isProj) {
    const total = parseInt(document.getElementById('autoGenTotalStudents')?.value, 10) || 150;
    const max = parseInt(document.getElementById('autoGenMaxStudentsPerSec')?.value, 10) || 38;
    secCount = Math.max(1, Math.ceil(total / max));
    stuPerSec = Math.round(total / secCount);
  } else {
    secCount = parseInt(document.getElementById('autoGenDirectCount')?.value, 10) || 3;
    stuPerSec = parseInt(document.getElementById('autoGenDirectStudents')?.value, 10) || 35;
  }

  const progLabel = prog === 'all' ? 'All Programs' : prog;
  const yrLabel = yr === 'all' ? 'All Years' : yearLevelLabel(yr);
  label.textContent = `Preview: Will generate ${secCount} section${secCount > 1 ? 's' : ''} (~${stuPerSec} students each) for ${progLabel} (${yrLabel}).`;
}

async function submitAutoGenerateSections() {
  const { activeSy, activeTerm } = getActiveAcademicContext();
  const progVal = document.getElementById('autoGenProgram')?.value || 'all';
  const yrVal = document.getElementById('autoGenYear')?.value || 'all';
  const isProj = document.getElementById('autoGenModeProj')?.checked;
  const attachSubjs = document.getElementById('autoGenAttachSubjects')?.checked;

  let countPerGroup = 2;
  let studentsPerSec = 35;

  if (isProj) {
    const total = parseInt(document.getElementById('autoGenTotalStudents')?.value, 10) || 150;
    const max = parseInt(document.getElementById('autoGenMaxStudentsPerSec')?.value, 10) || 38;
    countPerGroup = Math.max(1, Math.ceil(total / max));
    studentsPerSec = Math.round(total / countPerGroup);
  } else {
    countPerGroup = parseInt(document.getElementById('autoGenDirectCount')?.value, 10) || 3;
    studentsPerSec = parseInt(document.getElementById('autoGenDirectStudents')?.value, 10) || 35;
  }

  const autoGenValue = id => document.getElementById(id)?.value ?? '';
  const autoGenProblem = isProj
    ? INPUT_RULES.int('Total students', autoGenValue('autoGenTotalStudents'), 15, 1000)
      || INPUT_RULES.int('Maximum students per section', autoGenValue('autoGenMaxStudentsPerSec'), 20, 60)
    : INPUT_RULES.int('Number of sections', autoGenValue('autoGenDirectCount'), 1, 10)
      || INPUT_RULES.int('Students per section', autoGenValue('autoGenDirectStudents'), 15, 60);
  if (autoGenProblem || countPerGroup > 26) {
    alert(autoGenProblem || `This would create ${countPerGroup} sections per group. The limit is 26, so please raise the maximum students per section.`);
    return;
  }

  const targetProgs = progVal === 'all' ? LEVEL_PROGRAMS[activeSchoolLevel()] : [progVal];
  const targetYears = yrVal === 'all' ? LEVEL_YEARS[activeSchoolLevel()] : [parseInt(yrVal, 10)];

  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  // Existing sections get the new student count, so check their rooms first
  const resetCodes = targetProgs.flatMap(prog => targetYears.filter(yr => yearsForProgram(prog, activeSchoolLevel()).includes(yr)).flatMap(yr =>
    Array.from({ length: countPerGroup }, (_, i) => sectionCodeFor(prog, yr, i))));
  const resetSections = ACADEMIC_SECTIONS.filter(s => s.termId === activeTerm.id && resetCodes.includes(s.code));
  const tooSmall = MASTER_SCHEDULE_DATA.filter(c => {
    const sec = resetSections.find(s => s.code === c.section && (c.termId || s.termId) === s.termId);
    return sec && sectionChangeBreaks(c, { ...sec, studentCount: studentsPerSec });
  });
  if (!(await askToUnscheduleBroken(tooSmall, 'Update existing sections?', `Existing sections will have ${studentsPerSec} students each, and some of their classes are in rooms that are too small.`))) return;
  removeClassesAndSave(tooSmall);

  let createdCount = 0;

  targetProgs.forEach(prog => {
    targetYears.filter(yr => yearsForProgram(prog, activeSchoolLevel()).includes(yr)).forEach(yr => {
      for (let i = 0; i < countPerGroup; i++) {
        const letter = letters[i] || String(i + 1);
        const code = sectionCodeFor(prog, yr, i);
        const name = `${prog} ${yr}${letter}`;

        let existing = ACADEMIC_SECTIONS.find(s => s.code === code && s.termId === activeTerm.id);
        if (existing) {
          existing.studentCount = studentsPerSec;
          existing.name = name;
        } else {
          const newId = ACADEMIC_SECTIONS.length ? Math.max(...ACADEMIC_SECTIONS.map(s => s.id)) + 1 : 1;
          ACADEMIC_SECTIONS.push({
            id: newId,
            termId: activeTerm.id,
            code,
            name,
            program: prog,
            year: yr,
            studentCount: studentsPerSec,
        shift: 'AM'
          });
          createdCount++;
        }
      }
    });
  });

  if (attachSubjs) {
    // Ensure curriculum subjects for these programs & years are included
    CURRICULUM_SUBJECTS.forEach(s => {
      if (targetProgs.includes(s.program) && targetYears.includes(s.year)) {
        s.isIncluded = true;
      }
    });
  }

  saveStateToStorage();
  closeAutoGenerateSectionsModal();
  renderSectionsTable();
  updateSectionDropdown();
  renderGrid();
  updateScheduleStats();
  updateSectionDropdown();
  updateScheduleStats();

  postScheduleAction({
    action: 'auto_generate_sections',
    programs: targetProgs,
    years: targetYears,
    sections_per_group: countPerGroup,
    students_per_section: studentsPerSec,
    term_id: activeTerm.id,
    attach_curriculum: attachSubjs ? 1 : 0
  });

  alert(`Academic sections generated (${createdCount} new created, ${ACADEMIC_SECTIONS.length} total sections configured).`);
}

function openAddSectionModal() {
  applySchoolLevelOptions();
  document.getElementById('secModalTitle').textContent = 'Add Academic Section';
  document.getElementById('secEditId').value = '';
  document.getElementById('secCodeInput').value = '';
  document.getElementById('secNameInput').value = '';
  document.getElementById('secProgramInput').value = LEVEL_PROGRAMS[activeSchoolLevel()][0];
  refreshYearsForProgram('secProgramInput', 'secYearInput');
  document.getElementById('secYearInput').value = String(LEVEL_YEARS[activeSchoolLevel()][0]);
  document.getElementById('secStudentsInput').value = '35';
  if (document.getElementById('secShiftInput')) document.getElementById('secShiftInput').value = 'AM';
  fillHomeRoomSelect('');
  fillAdviserSelect(null);
  renderSectionSubjectsPreview();
  document.getElementById('sectionModal').style.display = 'flex';
}

// Lecture rooms and labs a section can call home; blank lets the generator choose
function fillHomeRoomSelect(selected) {
  const sel = document.getElementById('secHomeRoomInput');
  const known = ROOMS.some(r => r.code === selected);
  sel.innerHTML = '<option value="">Automatic: the generator picks one room and keeps reusing it</option>'
    + ROOMS.slice().sort((a, b) => a.code.localeCompare(b.code)).map(r => `<option value="${escapeHtml(r.code)}">${escapeHtml(r.code)} (${escapeHtml(r.type)}, ${r.cap} seats)</option>`).join('');
  sel.value = known ? selected : '';
}

// Teachers set to teach this school year's level (or both levels); blank means no adviser yet
function fillAdviserSelect(sec) {
  const sel = document.getElementById('secAdviserInput');
  const level = activeSchoolLevel();
  const options = FACULTY.filter(f => f.email && ['mixed', level].includes(facultyTeachingLevel(f)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const current = sec ? sectionAdviser(sec) : null;
  sel.innerHTML = '<option value="">No adviser yet</option>'
    + options.map(f => `<option value="${escapeHtml(f.email)}">${escapeHtml(f.name)}</option>`).join('');
  sel.value = current && options.includes(current) ? current.email : '';
}

// The subjects a section takes: its program and year's included subjects in its term (from Step 3)
function sectionSubjects(sec) {
  return CURRICULUM_SUBJECTS.filter(s => s.isIncluded !== false && s.termId === sec.termId && s.program === sec.program && Number(s.year) === Number(sec.year))
    .sort((a, b) => a.code.localeCompare(b.code));
}
function subjectHoursText(subj) {
  const { lec, lab } = subjectPartMinutes(subj);
  return lab > 0 && lec > 0 ? `${lec / 60}h lecture + ${lab / 60}h lab` : `${(lec + lab) / 60}h ${lab > 0 ? 'lab' : 'lecture'}`;
}
// In the sections table: "6 subjects", opening to the list
function sectionSubjectsHtml(sec, count) {
  const list = sectionSubjects(sec);
  if (list.length === 0) return '<span style="font-size:0.857rem; color:var(--danger);">None yet: add them in Step 3</span>';
  return `<details class="section-subjects"><summary><span class="badge" style="background:#EFF6FF; color:#1D4ED8;">${count} subject${count === 1 ? '' : 's'}</span></summary>
    <ul>${list.map(s => `<li><strong>${escapeHtml(s.code)}</strong> ${escapeHtml(s.name)} <span>${s.units} units · ${subjectHoursText(s)}</span></li>`).join('')}</ul></details>`;
}
// In the section form: the subjects the chosen program and year take
function renderSectionSubjectsPreview() {
  const box = document.getElementById('secSubjectsPreview');
  if (!box) return;
  const idVal = document.getElementById('secEditId').value;
  const existing = idVal ? ACADEMIC_SECTIONS.find(s => String(s.id) === idVal) : null;
  const sec = {
    termId: existing ? existing.termId : getActiveAcademicContext().activeTerm.id,
    program: document.getElementById('secProgramInput').value,
    year: parseInt(document.getElementById('secYearInput').value, 10)
  };
  const list = sectionSubjects(sec);
  box.innerHTML = list.length
    ? `<ul>${list.map(s => `<li><strong>${escapeHtml(s.code)}</strong> ${escapeHtml(s.name)} <span>${s.units} units · ${subjectHoursText(s)}</span></li>`).join('')}</ul>`
    : `<p>No subjects are loaded for ${escapeHtml(sec.program)} ${yearLevelLabel(sec.year)} yet. Add them in Step 3.</p>`;
}

function openEditSectionModal(id) {
  applySchoolLevelOptions();
  const sec = ACADEMIC_SECTIONS.find(s => s.id === id);
  if (!sec) return;
  document.getElementById('secModalTitle').textContent = 'Edit Academic Section';
  document.getElementById('secEditId').value = sec.id;
  document.getElementById('secCodeInput').value = sec.code;
  document.getElementById('secNameInput').value = sec.name;
  document.getElementById('secProgramInput').value = sec.program;
  refreshYearsForProgram('secProgramInput', 'secYearInput');
  document.getElementById('secYearInput').value = String(sec.year);
  document.getElementById('secStudentsInput').value = sec.studentCount;
  if (document.getElementById('secShiftInput')) document.getElementById('secShiftInput').value = sec.shift || 'AM';
  fillHomeRoomSelect(sec.homeRoom || '');
  fillAdviserSelect(sec);
  renderSectionSubjectsPreview();
  document.getElementById('sectionModal').style.display = 'flex';
}

function closeSectionModal() {
  const modal = document.getElementById('sectionModal');
  if (modal) modal.style.display = 'none';
}

async function submitSectionModal() {
  const { activeSy, activeTerm } = getActiveAcademicContext();
  const idVal = document.getElementById('secEditId').value;
  const code = document.getElementById('secCodeInput').value.trim();
  const name = document.getElementById('secNameInput').value.trim();
  const prog = document.getElementById('secProgramInput').value;
  const yr = parseInt(document.getElementById('secYearInput').value, 10) || 1;
  const students = parseInt(document.getElementById('secStudentsInput').value, 10) || 35;
  const shift = document.getElementById('secShiftInput') ? document.getElementById('secShiftInput').value : 'AM';
  const homeRoom = document.getElementById('secHomeRoomInput').value;
  const adviser = document.getElementById('secAdviserInput').value;

  if (!code || !name) {
    alert('Please enter both Section Code and Section Name.');
    return;
  }
  if (!yearsForProgram(prog, activeSchoolLevel()).includes(yr)) {
    alert(`${prog} is a ${yearsForProgram(prog, activeSchoolLevel()).length}-year program, so choose ${yearLevelLabel(yearsForProgram(prog, activeSchoolLevel())[0])} to ${yearLevelLabel(Math.max(...yearsForProgram(prog, activeSchoolLevel())))}.`);
    return;
  }

  const sectionProblem = INPUT_RULES.code('Section code', code) || INPUT_RULES.text('Section name', name)
    || INPUT_RULES.int('Student count', document.getElementById('secStudentsInput').value, 1, 60);
  if (sectionProblem) {
    alert(sectionProblem);
    return;
  }
  const homeRoomObj = ROOMS.find(r => r.code === homeRoom);
  if (homeRoomObj && homeRoomObj.cap < students) {
    alert(`${homeRoom} seats ${homeRoomObj.cap}, but this section has ${students} students. Pick a bigger home room.`);
    return;
  }

  const savedSection = idVal ? ACADEMIC_SECTIONS.find(s => s.id === parseInt(idVal, 10)) : null;
  const previousCode = savedSection ? savedSection.code : null;

  if (ACADEMIC_SECTIONS.some(s => s.termId === activeTerm.id && s.code.toLowerCase() === code.toLowerCase() && String(s.id) !== idVal)) {
    alert(`Section code ${code} already exists in this term.`);
    return;
  }

  if (idVal) {
    const sec = ACADEMIC_SECTIONS.find(s => s.id === parseInt(idVal, 10));
    if (sec) {
      // Classes that would no longer fit their room or curriculum come off the schedule
      const updated = { ...sec, code, program: prog, year: yr, studentCount: students };
      const broken = MASTER_SCHEDULE_DATA.filter(c => c.section === sec.code && (c.termId || sec.termId) === sec.termId && sectionChangeBreaks(c, updated));
      if (!(await askToUnscheduleBroken(broken, `Change ${sec.code}?`, `With ${students} students in ${prog} ${yearLevelLabel(yr)}, some of ${sec.code}'s classes no longer fit their room or curriculum.`))) return;
      removeClassesAndSave(broken);

      // Classes follow the section when its code changes
      if (previousCode !== code) {
        MASTER_SCHEDULE_DATA.forEach(c => {
          if (c.section === previousCode && (!c.termId || c.termId === sec.termId)) c.section = code;
        });
        if (currentSelectedSection === previousCode) currentSelectedSection = code;
      }
      sec.code = code;
      sec.name = name;
      sec.program = prog;
      sec.year = yr;
      sec.studentCount = students;
      sec.shift = shift;
      sec.homeRoom = homeRoom;
      sec.adviser = adviser;
    }
  } else {
    const newId = ACADEMIC_SECTIONS.length ? Math.max(...ACADEMIC_SECTIONS.map(s => s.id)) + 1 : 1;
    ACADEMIC_SECTIONS.push({
      id: newId,
      termId: activeTerm.id,
      code,
      name,
      program: prog,
      year: yr,
      studentCount: students,
      shift,
      homeRoom,
      adviser
    });
  }

  saveStateToStorage();
  closeSectionModal();
  renderSectionsTable();
  updateSectionDropdown();
  renderGrid();
  updateScheduleStats();

  postScheduleAction({
    action: 'save_section',
    section_id: idVal,
    term_id: activeTerm.id,
    section_code: code,
    section_name: name,
    program: prog,
    year_level: yr,
    student_count: students,
    shift,
    home_room: homeRoom,
    adviser
  });
}

function openSplitSectionModal(id) {
  const sec = ACADEMIC_SECTIONS.find(s => s.id === id);
  if (!sec) return;
  document.getElementById('splitTargetSectionId').value = sec.id;
  document.getElementById('splitPromptDesc').textContent = `Split students from section ${sec.code} (${sec.name}, ${sec.studentCount} students total).`;
  document.getElementById('splitStudentsCount').value = Math.floor(sec.studentCount / 2);
  document.getElementById('splitNewCode').value = `${sec.code}-B`;
  document.getElementById('splitNewName').value = `${sec.name} (Split)`;
  document.getElementById('splitSectionModal').style.display = 'flex';
}

function closeSplitSectionModal() {
  const modal = document.getElementById('splitSectionModal');
  if (modal) modal.style.display = 'none';
}

function submitSplitSection() {
  const secId = parseInt(document.getElementById('splitTargetSectionId').value, 10);
  const splitCount = parseInt(document.getElementById('splitStudentsCount').value, 10);
  const newCode = document.getElementById('splitNewCode').value.trim();
  const newName = document.getElementById('splitNewName').value.trim();

  const sec = ACADEMIC_SECTIONS.find(s => s.id === secId);
  if (!sec) return;

  if (!(splitCount > 0) || splitCount >= sec.studentCount) {
    alert(`Split count must be between 1 and ${sec.studentCount - 1}.`);
    return;
  }

  const splitProblem = (newCode && INPUT_RULES.code('Section code', newCode)) || (newName && INPUT_RULES.text('Section name', newName));
  if (splitProblem) {
    alert(splitProblem);
    return;
  }

  const splitCode = (newCode || `${sec.code}-B`).toLowerCase();
  if (ACADEMIC_SECTIONS.some(s => s.termId === sec.termId && s.code.toLowerCase() === splitCode)) {
    alert(`Section code ${newCode || `${sec.code}-B`} already exists in this term.`);
    return;
  }

  sec.studentCount -= splitCount;
  const newId = ACADEMIC_SECTIONS.length ? Math.max(...ACADEMIC_SECTIONS.map(s => s.id)) + 1 : 1;
  ACADEMIC_SECTIONS.push({
    id: newId,
    termId: sec.termId,
    code: newCode || `${sec.code}-B`,
    name: newName || `${sec.name} (Split)`,
    program: sec.program,
    year: sec.year,
    studentCount: splitCount,
    shift: sec.shift || 'AM'
  });

  saveStateToStorage();
  closeSplitSectionModal();
  renderSectionsTable();
  updateSectionDropdown();
  renderGrid();
  updateScheduleStats();
  alert(`Section split into ${sec.code} (${sec.studentCount} students) and ${newCode} (${splitCount} students).`);

  postScheduleAction({
    action: 'split_section',
    section_id: secId,
    split_student_count: splitCount,
    new_section_code: newCode,
    new_section_name: newName
  });
}

async function deleteSectionItem(id) {
  if (ACADEMIC_SECTIONS.length <= 1) {
    alert('At least one academic section must remain.');
    return;
  }
  const target = ACADEMIC_SECTIONS.find(s => s.id === id);
  const inSection = c => target && c.section === target.code && (!c.termId || c.termId === target.termId);
  const classCount = MASTER_SCHEDULE_DATA.filter(inSection).length;
  const warning = classCount > 0
    ? `Its ${classCount} scheduled class${classCount === 1 ? '' : 'es'} will be deleted too. This can't be undone.`
    : 'This section will be removed from the term.';
  if (!(await askConfirm(warning, { title: 'Delete this section?', confirmLabel: 'Delete Section', danger: true }))) return;
  MASTER_SCHEDULE_DATA = MASTER_SCHEDULE_DATA.filter(c => !inSection(c));
  ACADEMIC_SECTIONS = ACADEMIC_SECTIONS.filter(s => s.id !== id);
  saveStateToStorage();
  renderSectionsTable();
  updateSectionDropdown();
  renderGrid();
  updateScheduleStats();

  postScheduleAction({ action: 'delete_section', section_id: id });
}
