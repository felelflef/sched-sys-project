/* ══════════════════════════════════════════════════════════════════════════
   STEP HELP, STEP 5: ROOMS & INSTRUCTORS, STEP 6: VALIDATE RESOURCES
   Part of the Master Schedule; the schedule_*.js files load in order (see the page's script tags).
   ══════════════════════════════════════════════════════════════════════════ */

// The "What to do here" box at the top of each Master Schedule step
const STEP_HELP = {
  1: ['Choose the school year', 'Pick the school year you are planning, or add a new one by typing it like 2026-2027. Then press Next.'],
  2: ['Choose the term', 'Pick the college or Senior High term you are planning. Its terms were made for you with the school year. Then press Next.'],
  3: ['Load the subjects', 'Add the subjects each program and year takes this term. Every section of that program and year gets these subjects.'],
  4: ['Create the sections', 'Add each section with its number of students and adviser. Open "subjects" in a row to see what that section takes.'],
  5: ['Pick rooms and teachers', 'For each section, choose its room and who teaches each subject. Leave anything on Automatic and the system picks for you.'],
  6: ['Check that there is enough', 'This step checks there are enough teachers and rooms. Fix anything marked red, then press Next.'],
  7: ['Build the timetable', 'Press Generate to fill the week, or click an empty box to add a class yourself. Click a class to change it.']
};
function renderStepHelp(stepNumber) {
  const box = document.getElementById('stepHelp');
  if (!box) return;
  const help = STEP_HELP[stepNumber];
  box.style.display = help && canEditSchedule() ? '' : 'none';
  if (help) box.innerHTML = `<div class="step-help-icon" aria-hidden="true">?</div><div><div class="step-help-title">What to do here: ${help[0]}</div><p>${help[1]}</p></div>`;
}

/* ==================== STEP 5: ROOMS & INSTRUCTORS ==================== */
// Each section gets a room and, for each subject, an instructor. Automatic leaves the choice to the generator,
// which keeps the section in its room whenever the room is free and gives each subject the chosen instructor.
// One section shows at a time, picked from a list that says what each section already has set.
const roomPlanSelection = {};   // the section shown, for each term

// "CS101M (BSCS 1A) · room LR-104 · 2 of 6 teachers chosen"
function roomPlanSectionLabel(sec) {
  const chosen = Object.keys(sec.subjectTeachers || {}).length;
  const status = [sec.homeRoom ? `room ${sec.homeRoom}` : '', chosen ? `${chosen} of ${sectionSubjects(sec).length} teachers chosen` : ''].filter(Boolean);
  return `${sec.code} (${sec.name})${status.length ? ` · ${status.join(' · ')}` : ' · all Automatic'}`;
}

function roomPlanPickerHtml(sections, current) {
  const index = sections.indexOf(current);
  const options = sections.map(sec => `<option value="${escapeHtml(sec.code)}" ${sec === current ? 'selected' : ''}>${escapeHtml(roomPlanSectionLabel(sec))}</option>`).join('');
  return `<div class="room-plan-picker">
    <label class="room-plan-picker-label">Section
      <select class="room-plan-select" onchange="selectRoomPlanSection(this.value)">${options}</select></label>
    <div class="room-plan-picker-nav">
      <button type="button" class="btn btn-outline" onclick="stepRoomPlanSection(-1)" ${index <= 0 ? 'disabled' : ''}>&lsaquo; Previous</button>
      <span>${index + 1} of ${sections.length}</span>
      <button type="button" class="btn btn-outline" onclick="stepRoomPlanSection(1)" ${index >= sections.length - 1 ? 'disabled' : ''}>Next &rsaquo;</button>
    </div>
  </div>`;
}

function roomPlanSections() {
  const { activeTerm } = getActiveAcademicContext();
  return ACADEMIC_SECTIONS.filter(s => s.termId === activeTerm.id).sort((a, b) => a.code.localeCompare(b.code));
}

window.selectRoomPlanSection = function(code) {
  roomPlanSelection[getActiveAcademicContext().activeTerm.id] = code;
  renderRoomPlan();
};

window.stepRoomPlanSection = function(delta) {
  const sections = roomPlanSections();
  const current = sections.findIndex(s => s.code === roomPlanSelection[getActiveAcademicContext().activeTerm.id]);
  const next = sections[Math.max(0, Math.min(sections.length - 1, current + delta))];
  if (next) selectRoomPlanSection(next.code);
};

function renderRoomPlan() {
  const box = document.getElementById('roomPlanList');
  if (!box) return;
  const { activeTerm } = getActiveAcademicContext();
  const level = termSchoolLevel(activeTerm.id);
  const canEdit = canManageData();
  const sections = roomPlanSections();
  if (sections.length === 0) {
    box.innerHTML = '<p class="term-empty">No sections yet. Create them in Step 4 first.</p>';
    return;
  }
  const current = sections.find(s => s.code === roomPlanSelection[activeTerm.id]) || sections[0];
  roomPlanSelection[activeTerm.id] = current.code;
  const loadText = f => `${formatUnits(facultyLoadUnits(f.name) + concurrentLoadUnits(f.name, activeTerm.id))} of ${facultyMaxUnits(f)} units`;
  box.innerHTML = roomPlanPickerHtml(sections, current) + [current].map(sec => {
    const rooms = ROOMS.filter(r => r.cap >= sec.studentCount).sort((a, b) => a.code.localeCompare(b.code));
    const sharing = code => sections.filter(o => o !== sec && o.homeRoom === code).map(o => o.code);
    const roomOptions = '<option value="">Automatic (the generator picks one room and reuses it)</option>' + rooms.map(r => {
      const others = sharing(r.code);
      return `<option value="${escapeHtml(r.code)}" ${r.code === sec.homeRoom ? 'selected' : ''}>${escapeHtml(r.code)} · ${escapeHtml(r.type)}, ${r.cap} seats${others.length ? ` · also ${others.join(', ')}` : ''}</option>`;
    }).join('');
    const subjects = sectionSubjects(sec);
    const rows = subjects.map(subj => {
      const code = subj.code.toUpperCase();
      const teachers = FACULTY.filter(f => isFacultyQualified(f, subj.code) && facultyTeachesLevel(f, level)).sort((a, b) => a.name.localeCompare(b.name));
      const chosen = sectionChosenTeacher(sec, code);
      const stale = chosen && !teachers.includes(chosen);
      const options = '<option value="">Automatic</option>' + teachers.map(f =>
        `<option value="${escapeHtml(f.email)}" ${chosen === f ? 'selected' : ''}>${escapeHtml(f.name)} · ${loadText(f)}</option>`).join('')
        + (stale ? `<option value="${escapeHtml(chosen.email)}" selected>${escapeHtml(chosen.name)} (no longer qualified)</option>` : '');
      return `<tr>
        <td><strong>${escapeHtml(subj.code)}</strong> ${escapeHtml(subj.name)}</td>
        <td>${subj.units} units · ${subjectHoursText(subj)}</td>
        <td><select class="room-plan-select" aria-label="Teacher for ${escapeHtml(subj.code)}, ${escapeHtml(sec.code)}" ${canEdit ? '' : 'disabled'}
          onchange="setSectionTeacher(${sec.id}, ${jsArg(code)}, this.value)">${options}</select>
          ${teachers.length === 0 ? '<div class="room-plan-warning">No qualified teacher for this level. Give someone the FCC certificate for its area.</div>' : ''}
          ${stale ? '<div class="room-plan-warning">This teacher can no longer teach it. Choose another or Automatic.</div>' : ''}</td>
      </tr>`;
    }).join('');
    return `<div class="room-plan-card">
      <div class="room-plan-head">
        <div><div class="room-plan-title">${escapeHtml(sec.code)} <span>${escapeHtml(sec.name)}</span></div>
          <div class="room-plan-meta">${escapeHtml(sec.program)} ${yearLevelLabel(sec.year)} · ${sec.studentCount} students · ${escapeHtml(sec.shift || 'AM')} shift${sectionAdviserName(sec) ? ` · Adviser: ${escapeHtml(sectionAdviserName(sec))}` : ''}</div></div>
        <label class="room-plan-room">Room
          <select class="room-plan-select" ${canEdit ? '' : 'disabled'} onchange="setSectionRoom(${sec.id}, this.value)">${roomOptions}</select></label>
      </div>
      ${subjects.length ? `<table class="lifecycle-table room-plan-table"><thead><tr><th>Subject</th><th>Units and hours</th><th>Teacher</th></tr></thead><tbody>${rows}</tbody></table>`
        : '<p class="room-plan-warning">No subjects for this section yet. Add them in Step 3.</p>'}
    </div>`;
  }).join('');
}

function saveSectionPlan(sec) {
  saveStateToStorage();
  postScheduleAction({ action: 'save_section_plan', section_id: sec.id, home_room: sec.homeRoom || '', subject_teachers: sec.subjectTeachers || {} });
  renderRoomPlan();
  updateScheduleStats();
}
window.setSectionRoom = function(id, roomCode) {
  const sec = ACADEMIC_SECTIONS.find(s => s.id === id);
  if (!sec || !canManageData()) return;
  const room = ROOMS.find(r => r.code === roomCode);
  if (room && room.cap < sec.studentCount) {
    alert(`${room.code} seats ${room.cap}, but ${sec.code} has ${sec.studentCount} students. Pick a bigger room.`);
    renderRoomPlan();
    return;
  }
  sec.homeRoom = roomCode;
  saveSectionPlan(sec);
};
window.setSectionTeacher = function(id, subjectCode, email) {
  const sec = ACADEMIC_SECTIONS.find(s => s.id === id);
  if (!sec || !canManageData()) return;
  const plan = { ...(sec.subjectTeachers || {}) };
  if (email) plan[subjectCode] = email;
  else delete plan[subjectCode];
  sec.subjectTeachers = plan;
  saveSectionPlan(sec);
};

/* ==================== Resource Readiness Evaluation Engine ==================== */
function evaluateResourceReadiness() {
  const lecRooms = ROOMS.filter(r => r.type === 'Lecture');
  const labRooms = ROOMS.filter(r => r.type === 'CompLab');
  const specialRooms = ROOMS.filter(r => r.type === 'Special');
  const kitchenRooms = ROOMS.filter(r => (r.code && r.code.toLowerCase().includes('kitchen')) || (r.name && r.name.toLowerCase().includes('kitchen')));
  const tourismRooms = ROOMS.filter(r => (r.code && r.code.toLowerCase().includes('tourism')) || (r.name && r.name.toLowerCase().includes('tourism')));

  const { activeSy, activeTerm } = getActiveAcademicContext();

  const includedSubjects = CURRICULUM_SUBJECTS.filter(s => s.isIncluded && s.termId === activeTerm.id);
  const compLabSubjects = includedSubjects.filter(s => s.type === 'lab' || (s.labHours && s.labHours > 0));
  const culinarySubjects = includedSubjects.filter(s => KITCHEN_PROGRAMS.includes(s.program) && subjectPartMinutes(s).lab > 0);
  const tourismSubjects = includedSubjects.filter(s => TOURISM_LAB_PROGRAMS.includes(s.program) && subjectPartMinutes(s).lab > 0);

  const totalMaxLoad = FACULTY.reduce((sum, f) => sum + facultyMaxUnits(f), 0);
  // Every section takes each of its subjects, so the units needed are counted per section
  const totalRequiredUnits = ACADEMIC_SECTIONS.filter(sec => sec.termId === activeTerm.id)
    .reduce((sum, sec) => sum + includedSubjects.filter(s => s.program === sec.program && Number(s.year) === Number(sec.year))
      .reduce((units, s) => units + subjectLoadUnits(s, activeTerm.id), 0), 0);

  function checkSubjectHasQualifiedFaculty(subj) {
    return FACULTY.some(f => isFacultyQualified(f, subj.code) && facultyTeachesLevel(f, termSchoolLevel(subj.termId)));
  }

  const unqualifiedSubjects = includedSubjects.filter(s => !checkSubjectHasQualifiedFaculty(s));
  const overloadedTeachers = FACULTY.filter(f => facultyLoadUnits(f.name) + concurrentLoadUnits(f.name, activeTerm.id) > facultyMaxUnits(f) + 0.001);

  const checks = [];
  const criticalReasons = [];

  // Check 1: Classroom Physical Capacity
  if ((typeof ROOMS === 'undefined' ? 0 : ROOMS.length) === 0) {
    checks.push({
      status: 'critical',
      title: 'No Classrooms Available',
      desc: 'Zero active rooms configured in the campus directory. Add classrooms before proceeding.'
    });
    criticalReasons.push('No classrooms configured in the campus inventory.');
  } else if (lecRooms.length < 5) {
    checks.push({
      status: 'warning',
      title: 'Low Lecture Room Availability',
      desc: `Only ${lecRooms.length} lecture room(s) available. May constrain simultaneous class scheduling.`
    });
  } else {
    checks.push({
      status: 'pass',
      title: 'Classroom Physical Capacity Check Passed',
      desc: `${ROOMS.length} active classrooms available on campus (${lecRooms.length} lecture halls, ${labRooms.length} computer labs, ${specialRooms.length} specialized facilities).`
    });
  }

  // Check 2: Laboratories & Specialized Rooms
  if (compLabSubjects.length > 0 && labRooms.length === 0) {
    checks.push({
      status: 'critical',
      title: 'Missing Room Type: Computer Laboratories',
      desc: `Curriculum requires computer lab rooms for ${compLabSubjects.length} practical course(s), but NO computer labs exist in the room directory!`
    });
    criticalReasons.push(`Missing Computer Labs for ${compLabSubjects.length} practical courses.`);
  } else if (culinarySubjects.length > 0 && kitchenRooms.length === 0) {
    checks.push({
      status: 'critical',
      title: 'Missing Room Type: Commercial Kitchen Lab',
      desc: `HRS and HTCUA subjects need the culinary kitchen lab for ${culinarySubjects.length} course(s), but NO kitchen lab is registered!`
    });
    criticalReasons.push(`Missing Commercial Kitchen Lab for ${culinarySubjects.length} culinary courses.`);
  } else if (tourismSubjects.length > 0 && tourismRooms.length === 0) {
    checks.push({
      status: 'warning',
      title: 'Missing Room Type: Tourism Mock Center',
      desc: `BSTM and HTTO subjects need the tourism mock center for ${tourismSubjects.length} course(s), but none is registered.`
    });
  } else {
    checks.push({
      status: 'pass',
      title: 'Computer & Specialized Laboratories Ready',
      desc: `${labRooms.length} Computer Labs (CL-101 to CL-104), Culinary Kitchen Lab, and Tourism Center fully operational.`
    });
  }

  // Check 3: Faculty Qualifications & Teaching Capacity
  if ((typeof FACULTY === 'undefined' ? 0 : FACULTY.length) === 0) {
    checks.push({
      status: 'critical',
      title: 'No Teaching Faculty Configured',
      desc: 'No teachers found. Add them in Faculty Profiles.'
    });
    criticalReasons.push('No teachers in Faculty Profiles.');
  } else if (unqualifiedSubjects.length > 0) {
    const uniqueUnqualifiedCodes = [...new Set(unqualifiedSubjects.map(s => s.code))];
    checks.push({
      status: 'critical',
      title: 'Subjects with No Qualified Faculty',
      desc: `No faculty member has an FCC certificate covering these ${uniqueUnqualifiedCodes.length} subject(s): ${uniqueUnqualifiedCodes.join(', ')}.`
    });
    criticalReasons.push(`Not enough teachers: ${uniqueUnqualifiedCodes.length} course(s) lack qualified faculty (${uniqueUnqualifiedCodes.join(', ')}).`);
  } else if (totalMaxLoad < totalRequiredUnits) {
    checks.push({
      status: 'critical',
      title: 'Insufficient Total Teaching Capacity',
      desc: `Teachers can take up to ${totalMaxLoad} units in total, but this term's sections need ${totalRequiredUnits} units. Please assign more teachers.`
    });
    criticalReasons.push(`Insufficient faculty capacity: ${totalRequiredUnits} units needed vs ${totalMaxLoad} units total max faculty capacity.`);
  } else if (overloadedTeachers.length > 0) {
    checks.push({
      status: 'warning',
      title: 'Faculty Max Load Warning',
      desc: `${overloadedTeachers.length} teacher(s) over their maximum load: ${overloadedTeachers.map(f => f.name).join(', ')}.`
    });
  } else {
    checks.push({
      status: 'pass',
      title: 'Faculty Qualifications & Workload Readiness',
      desc: `All ${FACULTY.length} active faculty have certified profiles matching offered subject specializations with balanced loads.`
    });
  }

  // Check 4: Curriculum verification
  if (includedSubjects.length === 0) {
    checks.push({
      status: 'critical',
      title: 'No Subjects Included for Term',
      desc: 'Zero curriculum subjects are marked included for this semester. Please include subjects in Step 3.'
    });
    criticalReasons.push('No curriculum subjects marked as included for this term.');
  } else if (includedSubjects.length < 5) {
    checks.push({
      status: 'warning',
      title: 'Low Curriculum Count',
      desc: `Only ${includedSubjects.length} subjects are currently included for this semester. Review Step 3.`
    });
  } else {
    checks.push({
      status: 'pass',
      title: 'Semester Curriculum Offerings Validated',
      desc: `${includedSubjects.length} subjects included for scheduling across all academic programs in ${escapeHtml(activeTerm.termName)} (${escapeHtml(activeSy.yearCode)}).`
    });
  }

  const hasCritical = checks.some(c => c.status === 'critical');
  const hasWarning = checks.some(c => c.status === 'warning');

  return {
    hasCritical,
    hasWarning,
    checks,
    criticalReasons,
    unqualifiedSubjects,
    lecRoomsCount: lecRooms.length,
    labRoomsCount: labRooms.length + specialRooms.length,
    totalMaxLoad,
    totalRequiredUnits
  };
}

function renderResourceValidation() {
  const roomTbody = document.getElementById('valRoomTableBody');
  const facTbody = document.getElementById('valFacultyTableBody');
  const checkContainer = document.getElementById('readinessChecklistContainer');
  const badgeContainer = document.getElementById('readinessStatusBadge');
  const btnStep5 = document.getElementById('btnProceedFromValidate');

  const readiness = evaluateResourceReadiness();

  const elLec = document.getElementById('valLecRoomsCount');
  if (elLec) elLec.textContent = `${readiness.lecRoomsCount} Lecture Room${readiness.lecRoomsCount === 1 ? '' : 's'}`;

  const elLab = document.getElementById('valLabRoomsCount');
  if (elLab) elLab.textContent = `${readiness.labRoomsCount} Labs`;

  const totalCurrentLoad = FACULTY.reduce((sum, f) => sum + facultyLoadUnits(f.name), 0);
  const elFac = document.getElementById('valFacultyCapacity');
  if (elFac) elFac.textContent = `${readiness.totalMaxLoad} Units Max (${formatUnits(totalCurrentLoad)} Assigned)`;

  // The lines under each total, counted from the actual rooms and teachers
  const lectureCaps = ROOMS.filter(r => r.type === 'Lecture').map(r => r.cap);
  const elLecDetail = document.getElementById('valLecRoomsDetail');
  if (elLecDetail) {
    const low = Math.min(...lectureCaps), high = Math.max(...lectureCaps);
    elLecDetail.textContent = lectureCaps.length ? `Capacity: ${low === high ? low : `${low}-${high}`} students/room` : 'No lecture rooms yet';
  }
  const elLabDetail = document.getElementById('valLabRoomsDetail');
  if (elLabDetail) {
    const kitchen = ROOMS.filter(r => r.type !== 'Lecture' && /kitchen/i.test(r.code)).length;
    const tourism = ROOMS.filter(r => r.type !== 'Lecture' && /tourism/i.test(r.code)).length;
    const otherSpecial = ROOMS.filter(r => r.type === 'Special' && !/kitchen|tourism/i.test(r.code)).length;
    const parts = [[ROOMS.filter(r => r.type === 'CompLab').length, 'CompLab', 'CompLabs'], [kitchen, 'Kitchen', 'Kitchens'], [tourism, 'Tourism', 'Tourism'], [otherSpecial, 'Other Lab', 'Other Labs']]
      .filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
    elLabDetail.textContent = parts.length ? parts.join(' • ') : 'No labs yet';
  }
  const elFacDetail = document.getElementById('valFacultyDetail');
  if (elFacDetail) elFacDetail.textContent = `${FACULTY.length} Active Teaching Faculty`;

  // Populate Room Table
  if (roomTbody && typeof ROOMS !== 'undefined') {
    roomTbody.innerHTML = ROOMS.map(r => `
      <tr>
        <td style="font-weight:700; color:var(--accent-primary);">${escapeHtml(r.code)}</td>
        <td><span class="badge" style="font-size:0.857rem;">${escapeHtml(r.type)}</span></td>
        <td>${r.cap} seats</td>
        <td><span style="color:#10B981; font-weight:700;">Ready (${r.floor || '1F'})</span></td>
      </tr>
    `).join('');
  }

  // Populate Faculty Table
  if (facTbody && typeof FACULTY !== 'undefined') {
    facTbody.innerHTML = FACULTY.map(f => {
      const units = facultyLoadUnits(f.name) + concurrentLoadUnits(f.name, getActiveAcademicContext().activeTerm.id);
      const isOverloaded = units > facultyMaxUnits(f) + 0.001;
      const isUnder = units < facultyMinUnits(f);
      return `
        <tr>
          <td style="font-weight:700; color:var(--text-primary);">${escapeHtml(f.name)}</td>
          <td><span class="badge" style="font-size:0.857rem;">${escapeHtml(f.dept || '—')}</span></td>
          <td style="${isOverloaded ? 'color:#DC2626; font-weight:800;' : isUnder ? 'color:#B45309; font-weight:700;' : ''}">${formatUnits(units)} units</td>
          <td>${facultyMinUnits(f)}–${facultyMaxUnits(f)} units</td>
        </tr>
      `;
    }).join('');
  }

  // Render Checklist
  if (checkContainer) {
    checkContainer.innerHTML = readiness.checks.map(c => `
      <div class="readiness-item">
        <div class="readiness-icon ${c.status}">
          ${c.status === 'pass' ? '&check;' : (c.status === 'warning' ? '!' : '&times;')}
        </div>
        <div>
          <div style="font-weight:700; font-size:0.893rem; color:${c.status === 'critical' ? '#991B1B' : (c.status === 'warning' ? '#92400E' : '#065F46')};">
            ${escapeHtml(c.title)}
          </div>
          <div style="font-size:0.857rem; color:var(--text-secondary); margin-top:1px;">
            ${escapeHtml(c.desc)}
          </div>
        </div>
      </div>
    `).join('');
  }

  if (badgeContainer) {
    if (readiness.hasCritical) {
      badgeContainer.innerHTML = `<span class="badge" style="background:#FEE2E2; color:#991B1B; font-size:0.857rem; font-weight:800;">&times; Critical Resource Error</span>`;
    } else if (readiness.hasWarning) {
      badgeContainer.innerHTML = `<span class="badge" style="background:#FEF3C7; color:#92400E; font-size:0.857rem; font-weight:800;">&#9888; Ready with Warnings</span>`;
    } else {
      badgeContainer.innerHTML = `<span class="badge" style="background:#DEF7EC; color:#03543F; font-size:0.857rem; font-weight:800;">&check; Ready to Schedule</span>`;
    }
  }

  // Strictly Block Next Step on Critical Errors
  if (btnStep5) {
    btnStep5.disabled = readiness.hasCritical;
    btnStep5.style.opacity = readiness.hasCritical ? '0.5' : '1';
    btnStep5.style.cursor = readiness.hasCritical ? 'not-allowed' : 'pointer';
    btnStep5.title = readiness.hasCritical ? 'Blocked: Resolve critical teacher and room shortages to proceed.' : '';
    btnStep5.onclick = function() {
      if (readiness.hasCritical) {
        alert('Cannot go to Step 7 (Timetable) yet:\n\nPlease resolve the critical teacher/room shortages listed in the readiness checklist above.');
      } else {
        goToScheduleStep(7);
      }
    };
  }

  // Also update stepper locked indicators
  updateStepLocks();
}
