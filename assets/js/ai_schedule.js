/* ═══════════════════════════════════════════════════
   AI SCHEDULE DRAFT
   Gemini proposes classes, every class is checked here,
   the normal generator fills the gaps, and nothing is
   saved until an admin clicks Apply.
   ═══════════════════════════════════════════════════ */

const AI_DRAFT_BATCH_SIZE = 8;
const AI_DRAFT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let aiDraftResult = null;

function aiDraftSubjectsFor(section, termId) {
  return CURRICULUM_SUBJECTS.filter(s =>
    s.isIncluded !== false && s.termId === termId && s.program === section.program && s.year === section.year
  );
}

function aiDraftRoomFits(room, subject, section) {
  if (room.cap < section.studentCount) return false;
  if (subject.type === 'lab' || subject.labHours > 0) {
    if (section.program === 'BSHM') return room.code.includes('Kitchen') || room.type === 'Special';
    if (section.program === 'BSTM') return room.code.includes('Tourism') || room.type === 'Special';
    return room.type === 'CompLab';
  }
  return room.type === 'Lecture';
}

function aiDraftHours(cls) {
  return (timeToMinutes(cls.endTime) - timeToMinutes(cls.startTime)) / 60;
}

/** Returns a reason this class can't be used, or null if it passes every rule. */
function aiDraftRejectReason(raw, accepted, sections, termId) {
  const section = sections.find(s => s.code === raw.section);
  if (!section) return 'Unknown section';

  const subject = aiDraftSubjectsFor(section, termId).find(s => s.code === raw.subject);
  if (!subject) return 'Subject is not in this section\'s curriculum';

  const room = ROOMS.find(r => r.code === raw.room);
  if (!room) return 'Unknown room';
  if (!aiDraftRoomFits(room, subject, section)) return 'Room is too small or the wrong type';

  const teacher = FACULTY.find(f => f.name === raw.teacher);
  if (!teacher) return 'Unknown teacher';
  const eligibility = checkFacultySubjectConflict(raw.teacher, raw.subject, raw.section);
  if (eligibility) return 'Teacher is not qualified for this subject';

  if (!AI_DRAFT_DAYS.includes(raw.day)) return 'Invalid day';
  if (!/^\d{2}:\d{2}$/.test(raw.start || '') || !/^\d{2}:\d{2}$/.test(raw.end || '')) return 'Invalid time';
  const start = timeToMinutes(raw.start);
  const end = timeToMinutes(raw.end);
  if (start < 7 * 60 || end > 19 * 60 || end - start < 60 || end - start > 240) return 'Time is outside school hours or an invalid length';

  if (facultyAvailabilityProblem(raw.teacher, raw.day, raw.start, raw.end)) return 'Teacher is not available at that time';

  for (const other of accepted) {
    if (other.day !== raw.day) continue;
    if (start < timeToMinutes(other.endTime) && end > timeToMinutes(other.startTime)) {
      if (other.room === raw.room) return 'Room is double-booked';
      if (other.instructor === raw.teacher) return 'Teacher is double-booked';
      if (other.section === raw.section) return 'Section is double-booked';
    }
  }

  const hours = (end - start) / 60;
  const subjectHours = accepted.filter(c => c.section === raw.section && c.subjectCode === raw.subject).reduce((sum, c) => sum + aiDraftHours(c), 0);
  if (subjectHours + hours > subject.lecHours + subject.labHours) return 'More hours than the subject requires';

  const teacherHours = accepted.filter(c => c.instructor === raw.teacher).reduce((sum, c) => sum + aiDraftHours(c), 0);
  if (teacherHours + hours > (teacher.maxLoad || 24)) return 'Teacher would exceed their maximum load';

  return null;
}

function aiDraftBuildClass(raw, sections, termId, index) {
  const section = sections.find(s => s.code === raw.section);
  const subject = aiDraftSubjectsFor(section, termId).find(s => s.code === raw.subject);
  const hours = (timeToMinutes(raw.end) - timeToMinutes(raw.start)) / 60;
  const totalHours = subject.lecHours + subject.labHours;
  return {
    id: `AI-${index}`,
    aiPlaced: true,
    termId,
    section: raw.section,
    program: section.program,
    year: String(section.year),
    subjectCode: raw.subject,
    subjectTitle: subject.name,
    type: subject.type,
    units: Math.round((subject.units * hours / totalHours) * 100) / 100,
    room: raw.room,
    instructor: raw.teacher,
    day: raw.day,
    startTime: raw.start,
    endTime: raw.end
  };
}

// Matches the time ranges the generator tries first for each shift
function aiDraftInShift(cls, shift) {
  const start = timeToMinutes(cls.startTime);
  const end = timeToMinutes(cls.endTime);
  if (shift === 'PM') return start >= 13 * 60;
  if (shift === 'MIDSHIFT') return start >= 10 * 60 && end <= 16 * 60;
  return end <= 13 * 60;
}

function aiDraftWarnings(schedules, sections, termId) {
  const warnings = [];
  sections.forEach(section => {
    aiDraftSubjectsFor(section, termId).forEach(subject => {
      const scheduled = schedules.filter(c => c.section === section.code && c.subjectCode === subject.code).reduce((sum, c) => sum + aiDraftHours(c), 0);
      const required = subject.lecHours + subject.labHours;
      if (scheduled > 0 && scheduled < required) {
        warnings.push(`${section.code} ${subject.code}: ${scheduled} of ${required} required hours`);
      }
    });
  });
  schedules.forEach(cls => {
    const section = sections.find(s => s.code === cls.section);
    if (section && !aiDraftInShift(cls, section.shift)) {
      warnings.push(`${cls.section} ${cls.subjectCode}: outside its ${section.shift || 'AM'} shift (${cls.day} ${formatTime12(cls.startTime)})`);
    }
  });
  schedules.filter(c => !c.aiPlaced).forEach(cls => {
    const section = sections.find(s => s.code === cls.section);
    const room = ROOMS.find(r => r.code === cls.room);
    if (section && room && room.cap < section.studentCount) {
      warnings.push(`${cls.section} ${cls.subjectCode}: ${section.studentCount} students in ${room.code} (${room.cap} seats)`);
    }
  });
  return [...new Set(warnings)];
}

function aiDraftSetStage(stage) {
  ['aiDraftSetup', 'aiDraftProgress', 'aiDraftPreview'].forEach(id => {
    document.getElementById(id).style.display = id === stage ? 'block' : 'none';
  });
  document.getElementById('aiDraftGenerateBtn').style.display = stage === 'aiDraftSetup' ? 'inline-flex' : 'none';
  document.getElementById('aiDraftApplyBtn').style.display = stage === 'aiDraftPreview' ? 'inline-flex' : 'none';
}

window.openAiDraftModal = function() {
  if (IS_STANDALONE) {
    alert('AI scheduling is not available in demo mode.');
    return;
  }
  if (!CURRENT_USER || CURRENT_USER.role === 'faculty') {
    alert('Only scheduling staff can generate schedules.');
    return;
  }
  aiDraftResult = null;
  document.getElementById('aiDraftError').style.display = 'none';
  aiDraftSetStage('aiDraftSetup');
  document.getElementById('aiDraftModal').style.display = 'flex';
};

window.closeAiDraftModal = function() {
  aiDraftResult = null;
  document.getElementById('aiDraftModal').style.display = 'none';
};

function aiDraftShowError(message) {
  const el = document.getElementById('aiDraftError');
  el.textContent = message;
  el.style.display = 'block';
}

async function aiDraftRequestBatch(body) {
  const res = await fetch('api/ai_schedule.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken || '' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.message || 'The AI service could not create a draft.');
  return data.data.classes;
}

window.runAiDraft = async function() {
  const { activeTerm } = getActiveAcademicContext();
  const sections = ACADEMIC_SECTIONS.filter(s => s.termId === activeTerm.id);
  if (sections.length === 0) {
    aiDraftShowError('Create sections in Step 5 before generating a schedule.');
    return;
  }

  const instructions = document.getElementById('aiDraftInstructions').value.trim();
  const limits = Object.fromEntries(FACULTY.map(f => [f.name, f.maxLoad || 24]));
  const batches = [];
  for (let i = 0; i < sections.length; i += AI_DRAFT_BATCH_SIZE) {
    batches.push(sections.slice(i, i + AI_DRAFT_BATCH_SIZE));
  }

  document.getElementById('aiDraftError').style.display = 'none';
  aiDraftSetStage('aiDraftProgress');

  const accepted = [];
  const rejected = {};
  let proposed = 0;
  let failedBatches = 0;
  let lastError = '';

  for (let i = 0; i < batches.length; i++) {
    document.getElementById('aiDraftProgressText').textContent = `Gemini is drafting part ${i + 1} of ${batches.length}. This can take up to a minute.`;
    try {
      const classes = await aiDraftRequestBatch({
        term_id: activeTerm.id,
        section_codes: batches[i].map(s => s.code),
        limits,
        instructions,
        booked: accepted.map(c => ({ day: c.day, start: c.startTime, end: c.endTime, room: c.room, teacher: c.instructor }))
      });
      proposed += classes.length;
      classes.forEach(raw => {
        const reason = aiDraftRejectReason(raw, accepted, sections, activeTerm.id);
        if (reason) rejected[reason] = (rejected[reason] || 0) + 1;
        else accepted.push(aiDraftBuildClass(raw, sections, activeTerm.id, accepted.length + 1));
      });
    } catch (e) {
      failedBatches++;
      lastError = e.message;
    }
  }

  if (document.getElementById('aiDraftModal').style.display === 'none') return;

  if (failedBatches === batches.length) {
    aiDraftSetStage('aiDraftSetup');
    aiDraftShowError(`${lastError} Your current schedule was not changed.`);
    return;
  }

  // A subject left with too few valid meetings goes back to the generator to be placed whole
  const complete = accepted.filter(cls => {
    const section = sections.find(s => s.code === cls.section);
    const subject = aiDraftSubjectsFor(section, activeTerm.id).find(s => s.code === cls.subjectCode);
    const hours = accepted.filter(c => c.section === cls.section && c.subjectCode === cls.subjectCode).reduce((sum, c) => sum + aiDraftHours(c), 0);
    return hours >= Math.min(subject.lecHours + subject.labHours, 3);
  });
  if (complete.length < accepted.length) {
    rejected['Too few valid meetings for the subject, so it was rescheduled whole'] = accepted.length - complete.length;
  }

  // The normal generator fills anything Gemini missed or got wrong, within teaching limits
  const schedules = generateSmartBaselineSchedules({ seed: complete });
  aiDraftResult = { schedules, termId: activeTerm.id };
  aiDraftRenderPreview({
    schedules,
    sections,
    proposed,
    accepted: complete.length,
    rejected,
    failedBatches,
    totalBatches: batches.length,
    warnings: aiDraftWarnings(schedules, sections, activeTerm.id),
    unassigned: UNASSIGNED_CLASSES
  });
  aiDraftSetStage('aiDraftPreview');
};

function aiDraftRenderPreview(r) {
  const filled = r.schedules.length - r.accepted;
  const notes = [];
  if (r.failedBatches > 0) notes.push(`${r.failedBatches} of ${r.totalBatches} AI request(s) failed, so the normal generator handled those sections.`);
  Object.entries(r.rejected).sort((a, b) => b[1] - a[1]).forEach(([reason, count]) => notes.push(`Rejected ${count}: ${reason}`));

  const listHtml = (title, items, color) => items.length === 0 ? '' : `
    <div style="margin-top:12px;">
      <div style="font-weight:700; font-size:12.5px; color:${color}; margin-bottom:4px;">${escapeHtml(title)}</div>
      <ul style="margin:0; padding-left:18px; font-size:12px; color:var(--text-secondary);">
        ${items.slice(0, 12).map(i => `<li>${escapeHtml(i)}</li>`).join('')}
        ${items.length > 12 ? `<li>and ${items.length - 12} more</li>` : ''}
      </ul>
    </div>`;

  const stat = (value, label) => `
    <div style="flex:1; min-width:90px; background:#F8FAFD; border:1px solid var(--border-subtle); border-radius:8px; padding:10px; text-align:center;">
      <div style="font-size:20px; font-weight:800; color:var(--accent-primary);">${value}</div>
      <div style="font-size:11px; color:var(--text-secondary);">${escapeHtml(label)}</div>
    </div>`;

  const sectionTables = r.sections.map(section => {
    const rows = r.schedules
      .filter(c => c.section === section.code)
      .sort((a, b) => AI_DRAFT_DAYS.indexOf(a.day) - AI_DRAFT_DAYS.indexOf(b.day) || timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
      .map(c => `<tr>
        <td>${escapeHtml(c.day)}</td>
        <td>${formatTime12(c.startTime)} – ${formatTime12(c.endTime)}</td>
        <td style="font-weight:600;">${escapeHtml(c.subjectCode)}</td>
        <td>${escapeHtml(c.room)}</td>
        <td>${escapeHtml(c.instructor)}</td>
        <td>${c.aiPlaced ? 'AI' : 'Filled'}</td>
      </tr>`).join('');
    return `<details style="margin-top:8px;">
      <summary style="cursor:pointer; font-weight:700; font-size:13px;">${escapeHtml(section.code)} (${escapeHtml(section.name)})</summary>
      <div style="overflow-x:auto;"><table style="width:100%; font-size:12px; margin-top:6px;">
        <thead><tr><th style="text-align:left;">Day</th><th style="text-align:left;">Time</th><th style="text-align:left;">Subject</th><th style="text-align:left;">Room</th><th style="text-align:left;">Teacher</th><th style="text-align:left;">Source</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6">No classes</td></tr>'}</tbody>
      </table></div>
    </details>`;
  }).join('');

  document.getElementById('aiDraftPreview').innerHTML = `
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      ${stat(r.schedules.length, 'Total classes')}
      ${stat(r.accepted, 'Placed by AI')}
      ${stat(filled, 'Filled by generator')}
      ${stat(r.unassigned.length, 'Unassigned')}
    </div>
    ${listHtml('Problems with the AI draft (these classes were not used)', notes, '#92400E')}
    ${listHtml('Could not be scheduled', r.unassigned.map(u => `${u.section} ${u.code}: ${u.reason}`), '#991B1B')}
    ${listHtml('Please review', r.warnings, '#92400E')}
    <div style="margin-top:14px; font-weight:700; font-size:13px;">Preview by section</div>
    ${sectionTables}
    <div style="margin-top:14px; font-size:12px; color:var(--text-secondary);">Nothing has been saved. Apply replaces this term's current schedule.</div>
  `;
}

window.applyAiDraft = async function() {
  if (!aiDraftResult) return;
  const btn = document.getElementById('aiDraftApplyBtn');
  const { schedules, termId } = aiDraftResult;
  btn.disabled = true;
  try {
    const res = await saveTermSchedule('generate_baseline', termId, schedules, { strict: true });
    if (!res.ok) return; // The save helper has already shown the server's message
    closeAiDraftModal();
    await loadServerState();
    alert(`AI schedule applied: ${schedules.length} classes saved.`);
  } catch (e) {
    aiDraftShowError('Could not reach the server. Your current schedule was not changed.');
  } finally {
    btn.disabled = false;
  }
};
