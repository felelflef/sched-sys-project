/* ═══════════════════════════════════════════════════
   MODULE 1 — MASTER SCHEDULE GRID + DRAG & DROP
   ═══════════════════════════════════════════════════ */

function generateScheduleData() {
  const data = {};
  const programs = ['BSIT', 'BSCS', 'BSCpE', 'BSHM', 'BSTM', 'BSBA'];

  // Initialize empty rooms
  ROOMS.forEach(room => {
    data[room.code] = {};
  });

  // Track assigned faculty and sections per time slot to prevent duplicates/overlaps
  const bookedFacultyPerSlot = Array.from({ length: TIME_SLOTS.length }, () => new Set());
  const bookedSectionsPerSlot = Array.from({ length: TIME_SLOTS.length }, () => new Set());

  // Pre-reserve demo conflict slot if LR-201 exists so Academic Head is not booked elsewhere at slot 2
  bookedFacultyPerSlot[2].add('Academic Head');

  // Distribute classes per time slot across rooms with strict 1:1 faculty availability
  TIME_SLOTS.forEach((slot, si) => {
    // Shuffle rooms for realistic, varied allocation
    const shuffledRooms = [...ROOMS].sort(() => Math.random() - 0.5);

    shuffledRooms.forEach(room => {
      // Reserve slot 2 in LR-201 for the demo conflict
      if (room.code === 'LR-201' && si === 2) return;

      // ~65% target utilization
      if (Math.random() < 0.65) {
        // Filter strictly for faculty not yet booked anywhere at this exact time slot
        const freeFaculty = FACULTY.filter(f => !bookedFacultyPerSlot[si].has(f.name));
        if (freeFaculty.length === 0) return; // All faculty busy at this time frame

        // Prefer technical faculty for computer labs
        let candidateFaculty = freeFaculty;
        if (room.type === 'CompLab') {
          const techFaculty = freeFaculty.filter(f => f.dept === 'IT / CS' || f.dept === 'Engineering');
          if (techFaculty.length > 0) candidateFaculty = techFaculty;
        }

        const fac = candidateFaculty[Math.floor(Math.random() * candidateFaculty.length)];
        const subj = fac.quals && fac.quals.length > 0 
          ? fac.quals[Math.floor(Math.random() * fac.quals.length)]
          : (SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)]?.code || 'ITE 101');

        // Derive appropriate academic program
        let prog = 'BSIT';
        if (fac.dept === 'Engineering') prog = 'BSCpE';
        else if (fac.dept === 'Hospitality') prog = Math.random() < 0.5 ? 'BSHM' : 'BSTM';
        else if (fac.dept === 'Business Admin') prog = 'BSBA';
        else if (fac.dept === 'General Education') prog = programs[Math.floor(Math.random() * programs.length)];
        else prog = Math.random() < 0.5 ? 'BSIT' : 'BSCS';

        const yr = Math.ceil(Math.random() * 4);
        const secLetter = String.fromCharCode(65 + Math.floor(Math.random() * 3));
        let section = `${prog} ${yr}${secLetter}`;

        let attempt = 0;
        while (bookedSectionsPerSlot[si].has(section) && attempt < 5) {
          const altLetter = String.fromCharCode(65 + Math.floor(Math.random() * 4));
          section = `${prog} ${yr}${altLetter}`;
          attempt++;
        }

        const types = ['ai-generated', 'ai-generated', 'ai-generated', 'manual-override'];
        const type = types[Math.floor(Math.random() * types.length)];

        data[room.code][si] = {
          subj,
          faculty: fac.name,
          section,
          program: prog,
          year: String(yr),
          type,
          id: `${room.code}-${si}`
        };

        // Lock this faculty member and section for this time slot
        bookedFacultyPerSlot[si].add(fac.name);
        bookedSectionsPerSlot[si].add(section);
      }
    });
  });

  // Force demo conflict in LR-201 at slot 2
  if (data['LR-201']) {
    data['LR-201'][2] = {
      subj: 'ITE 101',
      faculty: 'Academic Head',
      section: 'BSIT 1A',
      program: 'BSIT',
      year: '1',
      type: 'conflict',
      id: 'LR-201-2'
    };
  }

  return data;
}

let scheduleData = generateScheduleData();
let draggedBlock = null;
let dragSourceCell = null;

function renderGrid() {
  const tbody = document.getElementById('gridBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const isAdmin = CURRENT_USER && CURRENT_USER.role === 'admin';

  // Restrict "Generate Baseline" button to admins
  const btnGen = document.getElementById('btnGenerate');
  if (btnGen) {
    btnGen.style.display = isAdmin ? 'inline-flex' : 'none';
  }

  // Show/remove Read-Only status badge in grid controls
  let roBadge = document.getElementById('schedReadOnlyBadge');
  const controlsContainer = document.querySelector('.grid-controls');
  if (!isAdmin) {
    if (!roBadge && controlsContainer) {
      roBadge = document.createElement('div');
      roBadge.id = 'schedReadOnlyBadge';
      roBadge.style.cssText = 'background:#F1F5F9; color:#475569; border:1px solid #CBD5E1; font-size:11.5px; padding:5px 11px; border-radius:6px; font-weight:600; display:inline-flex; align-items:center; gap:6px;';
      roBadge.innerHTML = '<span>🔒</span> Read-Only (System Admin edits only)';
      controlsContainer.insertBefore(roBadge, controlsContainer.children[2] || null);
    }
  } else if (roBadge) {
    roBadge.remove();
  }

  const progFilter = document.getElementById('programFilter')?.value || 'all';
  const yrFilter = document.getElementById('yearFilter')?.value || 'all';

  Object.entries(scheduleData).forEach(([room, slots]) => {
    const tr = document.createElement('tr');

    // Room label
    const roomTd = document.createElement('td');
    const roomInfo = ROOMS.find(r => r.code === room);
    roomTd.innerHTML = `<div>${room}</div><div style="font-size:10px;color:var(--text-secondary);font-weight:400;">${roomInfo?.type === 'CompLab' ? 'Lab' : 'Lecture'} · ${roomInfo?.cap || 40} seats</div>`;
    tr.appendChild(roomTd);

    // Time slots
    TIME_SLOTS.forEach((_, si) => {
      const td = document.createElement('td');
      td.className = 'drop-zone';
      td.dataset.room = room;
      td.dataset.slot = si;

      if (slots[si]) {
        const blockData = slots[si];
        const matchProg = progFilter === 'all' || blockData.program === progFilter;
        const matchYr = yrFilter === 'all' || blockData.year === yrFilter;
        if (matchProg && matchYr) {
          const block = createBlock(blockData);
          td.appendChild(block);
        }
      }

      // Drop zone events (only active if admin)
      if (isAdmin) {
        td.addEventListener('dragover', handleDragOver);
        td.addEventListener('dragenter', handleDragEnter);
        td.addEventListener('dragleave', handleDragLeave);
        td.addEventListener('drop', handleDrop);
      }

      // Right-click context menu (Add / Remove / Change Professor or Read-only view)
      td.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openScheduleContextMenu(e, room, si);
      });

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

// Grid filters change listeners
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('programFilter')?.addEventListener('change', renderGrid);
  document.getElementById('yearFilter')?.addEventListener('change', renderGrid);
});

function createBlock(data) {
  const isAdmin = CURRENT_USER && CURRENT_USER.role === 'admin';
  const block = document.createElement('div');
  block.className = `schedule-block ${data.type}`;
  block.draggable = isAdmin;
  if (!isAdmin) {
    block.style.cursor = 'default';
  }
  block.dataset.id = data.id;
  block.title = isAdmin
    ? 'Right-click to remove or change professor · Drag to move'
    : `${data.subj} · ${data.faculty} (${data.section}) [Read-Only: System Admin edits only]`;
  block.innerHTML = `
    <div class="block-subject">${data.subj}</div>
    <div class="block-meta">${data.faculty.split(' ').slice(-1)[0]} · ${data.section}</div>
  `;

  if (isAdmin) {
    block.addEventListener('dragstart', handleDragStart);
    block.addEventListener('dragend', handleDragEnd);
  }

  // Right-click context menu directly on block
  block.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const parentTd = block.closest('.drop-zone');
    if (parentTd) {
      openScheduleContextMenu(e, parentTd.dataset.room, parseInt(parentTd.dataset.slot, 10));
    }
  });

  return block;
}

function handleDragStart(e) {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    e.preventDefault();
    return false;
  }
  draggedBlock = e.target;
  dragSourceCell = e.target.closest('.drop-zone');
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', e.target.dataset.id);

  const aiStatus = document.getElementById('aiStatus');
  if (aiStatus) {
    aiStatus.className = 'ai-status processing';
    aiStatus.innerHTML = '<span class="ai-dot"></span> Monitoring Swap…';
  }
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  document.querySelectorAll('.drop-zone.drag-over').forEach(el => el.classList.remove('drag-over'));

  const aiStatus = document.getElementById('aiStatus');
  if (aiStatus) {
    aiStatus.className = 'ai-status active';
    aiStatus.innerHTML = '<span class="ai-dot"></span> AI Engine Active';
  }
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
  e.preventDefault();
  const cell = e.target.closest('.drop-zone');
  if (cell) cell.classList.add('drag-over');
}

function handleDragLeave(e) {
  const cell = e.target.closest('.drop-zone');
  if (cell && !cell.contains(e.relatedTarget)) {
    cell.classList.remove('drag-over');
  }
}

function handleDrop(e) {
  e.preventDefault();
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') return;
  const targetCell = e.target.closest('.drop-zone');
  if (!targetCell || !draggedBlock) return;

  targetCell.classList.remove('drag-over');

  const sourceRoom = dragSourceCell.dataset.room;
  const sourceSlot = parseInt(dragSourceCell.dataset.slot);
  const targetRoom = targetCell.dataset.room;
  const targetSlot = parseInt(targetCell.dataset.slot);

  // Check if target already has a block — trigger conflict alert
  const existingBlock = targetCell.querySelector('.schedule-block');
  if (existingBlock && existingBlock !== draggedBlock) {
    triggerConflictAlert(sourceRoom, sourceSlot, targetRoom, targetSlot);
    return;
  }

  const sourceData = scheduleData[sourceRoom]?.[sourceSlot];
  if (!sourceData) return;

  // Check if the instructor is already teaching in another room at targetSlot
  let overlappingRoom = null;
  for (const roomCode of Object.keys(scheduleData)) {
    if (roomCode !== sourceRoom && scheduleData[roomCode]?.[targetSlot]?.faculty === sourceData.faculty) {
      overlappingRoom = roomCode;
      break;
    }
  }

  if (overlappingRoom) {
    triggerFacultyOverlapAlert(sourceData.faculty, overlappingRoom, targetSlot, targetRoom);
    return;
  }

  // Check if the section is already attending class in another room at targetSlot
  let overlappingSecRoom = null;
  for (const roomCode of Object.keys(scheduleData)) {
    if (roomCode !== sourceRoom && scheduleData[roomCode]?.[targetSlot]?.section === sourceData.section) {
      overlappingSecRoom = roomCode;
      break;
    }
  }

  if (overlappingSecRoom) {
    triggerSectionOverlapAlert(sourceData.section, overlappingSecRoom, targetSlot, targetRoom);
    return;
  }

  // Perform schedule relocation
  if (!scheduleData[targetRoom]) scheduleData[targetRoom] = {};
  sourceData.type = 'manual-override';
  sourceData.id = `${targetRoom}-${targetSlot}`;
  scheduleData[targetRoom][targetSlot] = sourceData;
  delete scheduleData[sourceRoom][sourceSlot];

  renderGrid();

  const aiStatus = document.getElementById('aiStatus');
  if (aiStatus) {
    aiStatus.className = 'ai-status processing';
    aiStatus.innerHTML = '<span class="ai-dot"></span> Validating constraints…';
    setTimeout(() => {
      aiStatus.className = 'ai-status active';
      aiStatus.innerHTML = '<span class="ai-dot"></span> AI Engine Active';
    }, 1200);
  }
}

function triggerConflictAlert(srcRoom, srcSlot, tgtRoom, tgtSlot) {
  const srcData = scheduleData[srcRoom]?.[srcSlot];
  const tgtData = scheduleData[tgtRoom]?.[tgtSlot];

  if (srcData && tgtData) {
    const toast = document.getElementById('conflictToast');
    const toastTitle = document.getElementById('toastTitle');
    const toastMsg = document.getElementById('toastMsg');
    if (toast && toastTitle && toastMsg) {
      toastTitle.textContent = 'Room Conflict Detected';
      toastMsg.textContent =
        `Room ${tgtRoom} at ${TIME_SLOTS[tgtSlot]} is occupied by ${tgtData.faculty} (${tgtData.subj}). Cannot place ${srcData.faculty} (${srcData.subj}) into the same room.`;
      toast.classList.add('show');
    }
  }
}

function triggerFacultyOverlapAlert(facName, bookedRoom, tgtSlot, attemptedRoom) {
  const toast = document.getElementById('conflictToast');
  const toastTitle = document.getElementById('toastTitle');
  const toastMsg = document.getElementById('toastMsg');
  if (toast && toastTitle && toastMsg) {
    toastTitle.textContent = 'Faculty Overlap Prevented';
    toastMsg.textContent =
      `Cannot assign ${facName} to ${attemptedRoom} at ${TIME_SLOTS[tgtSlot]} — this professor is already teaching in Room ${bookedRoom} during this time frame. Overlapping faculty schedules are not permitted.`;
    toast.classList.add('show');
  }
}

function triggerSectionOverlapAlert(secName, bookedRoom, tgtSlot, attemptedRoom) {
  const toast = document.getElementById('conflictToast');
  const toastTitle = document.getElementById('toastTitle');
  const toastMsg = document.getElementById('toastMsg');
  if (toast && toastTitle && toastMsg) {
    toastTitle.textContent = 'Section Overlap Prevented';
    toastMsg.textContent =
      `Cannot schedule section ${secName} to ${attemptedRoom} at ${TIME_SLOTS[tgtSlot]} — this section is already attending class in Room ${bookedRoom} during this time frame.`;
    toast.classList.add('show');
  }
}

function hideConflictToast() {
  const toast = document.getElementById('conflictToast');
  if (toast) toast.classList.remove('show');
}

function resolveConflict() {
  const aiStatus = document.getElementById('aiStatus');
  if (aiStatus) {
    aiStatus.className = 'ai-status processing';
    aiStatus.innerHTML = '<span class="ai-dot"></span> AI resolving conflict…';
  }

  hideConflictToast();

  setTimeout(() => {
    if (scheduleData['LR-201']?.[2]?.type === 'conflict') {
      scheduleData['LR-201'][2].type = 'ai-generated';
      renderGrid();
    }
    if (aiStatus) {
      aiStatus.className = 'ai-status active';
      aiStatus.innerHTML = '<span class="ai-dot"></span> AI Engine Active';
    }
  }, 1200);
}

/* ═══════════════════════════════════════════════════
   SCHEDULE CONTEXT MENU & RIGHT-CLICK PROFESSOR ASSIGN/REMOVE
   ═══════════════════════════════════════════════════ */
let ctxTargetRoom = null;
let ctxTargetSlot = null;

function openScheduleContextMenu(e, room, slotIdx) {
  if (e) e.preventDefault();
  ctxTargetRoom = room;
  ctxTargetSlot = slotIdx;

  const menu = document.getElementById('scheduleContextMenu');
  if (!menu) return;

  const isAdmin = CURRENT_USER && CURRENT_USER.role === 'admin';
  const slotData = scheduleData[room]?.[slotIdx];
  const roomSlotText = `${room} · ${TIME_SLOTS[slotIdx]}`;
  document.getElementById('ctxMenuRoomSlot').textContent = roomSlotText;

  const btnAdd = document.getElementById('ctxBtnAdd');
  const btnEdit = document.getElementById('ctxBtnEdit');
  const btnRemove = document.getElementById('ctxBtnRemove');
  const detailsEl = document.getElementById('ctxMenuDetails');

  let roNotice = document.getElementById('ctxReadOnlyNotice');

  if (!isAdmin) {
    if (slotData) {
      detailsEl.textContent = `${slotData.faculty} (${slotData.subj} · ${slotData.section})`;
    } else {
      detailsEl.textContent = '(Vacant Slot)';
    }
    btnAdd.style.display = 'none';
    btnEdit.style.display = 'none';
    btnRemove.style.display = 'none';

    if (!roNotice) {
      roNotice = document.createElement('div');
      roNotice.id = 'ctxReadOnlyNotice';
      roNotice.style.cssText = 'padding:9px 14px; font-size:11.5px; color:var(--text-secondary); background:var(--bg-primary); border-top:1px solid var(--border-subtle); display:flex; align-items:center; gap:6px; font-weight:500;';
      roNotice.innerHTML = '<span>🔒</span> Only System Admins can modify schedule';
      menu.appendChild(roNotice);
    } else {
      roNotice.style.display = 'flex';
    }
  } else {
    if (roNotice) roNotice.style.display = 'none';

    if (slotData) {
      detailsEl.textContent = `${slotData.faculty} (${slotData.subj} · ${slotData.section})`;
      btnAdd.style.display = 'none';
      btnEdit.style.display = 'flex';
      btnRemove.style.display = 'flex';
    } else {
      detailsEl.textContent = '(Vacant Slot)';
      btnAdd.style.display = 'flex';
      btnEdit.style.display = 'none';
      btnRemove.style.display = 'none';
    }
  }

  menu.style.display = 'block';
  const menuWidth = 240;
  const menuHeight = 160;
  const posX = Math.min(e.clientX, window.innerWidth - menuWidth - 12);
  const posY = Math.min(e.clientY, window.innerHeight - menuHeight - 12);
  menu.style.left = `${Math.max(10, posX)}px`;
  menu.style.top = `${Math.max(10, posY)}px`;
}

function closeScheduleContextMenu() {
  const menu = document.getElementById('scheduleContextMenu');
  if (menu) menu.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('scheduleContextMenu');
    if (menu && menu.style.display !== 'none' && !menu.contains(e.target)) {
      closeScheduleContextMenu();
    }
  });

  // Baseline & Export buttons in Master Schedule
  document.getElementById('btnGenerate')?.addEventListener('click', () => {
    if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
      alert('Access Denied: Only system administrators are authorized to generate or overwrite the master schedule.');
      return;
    }
    const aiStatus = document.getElementById('aiStatus');
    if (aiStatus) {
      aiStatus.className = 'ai-status processing';
      aiStatus.innerHTML = '<span class="ai-dot"></span> Generating baseline timetable…';
    }

    setTimeout(() => {
      scheduleData = generateScheduleData();
      renderGrid();
      if (aiStatus) {
        aiStatus.className = 'ai-status active';
        aiStatus.innerHTML = '<span class="ai-dot"></span> AI Engine Active';
      }
    }, 1500);
  });

  document.getElementById('btnExport')?.addEventListener('click', () => {
    exportMasterSchedulePDF();
  });
});

function exportMasterSchedulePDF() {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups for this site to export the schedule as PDF.');
    return;
  }

  const now = new Date();
  const dateFormatted = now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const timeFormatted = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const slotsHeaderHtml = TIME_SLOTS.map(s => `<th>${s}</th>`).join('');

  const rowsHtml = ROOMS.map(r => {
    const slotCells = TIME_SLOTS.map((s, si) => {
      const a = scheduleData[r.code]?.[si];
      if (a) {
        return `
          <td>
            <div class="block">
              <div class="block-subj">${a.subj || '—'}</div>
              <div class="block-fac">${a.faculty || ''}</div>
              <div class="block-sec">${a.section || ''}</div>
            </div>
          </td>`;
      }
      return `<td><span class="vacant">—</span></td>`;
    }).join('');

    return `
      <tr>
        <td class="room-col">
          <strong>${r.code}</strong>
          <div class="room-sub">${r.type} · Cap: ${r.cap}</div>
        </td>
        ${slotCells}
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>STI Marikina · Master Classroom Schedule</title>
  <style>
    @page {
      size: landscape;
      margin: 10mm 8mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #2C303A;
      background: #FFFFFF;
      margin: 0;
      padding: 12px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #25447A;
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo {
      background: #25447A;
      color: #FFFFFF;
      font-weight: 800;
      font-size: 16px;
      padding: 6px 12px;
      border-radius: 6px;
      letter-spacing: 1px;
    }
    .title h1 {
      margin: 0;
      font-size: 16px;
      color: #25447A;
      font-weight: 700;
    }
    .title p {
      margin: 2px 0 0;
      font-size: 11px;
      color: #5C6375;
    }
    .meta {
      font-size: 11px;
      text-align: right;
      color: #5C6375;
      line-height: 1.4;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5px;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid #D9DCE2;
      padding: 4px;
      text-align: center;
      vertical-align: middle;
      word-wrap: break-word;
    }
    th {
      background: #F1F4F9;
      color: #25447A;
      font-weight: 700;
      font-size: 9.5px;
      padding: 6px 4px;
    }
    .room-col {
      width: 85px;
      text-align: left;
      padding-left: 6px;
      background: #FAFBFD;
    }
    .room-sub {
      font-size: 8px;
      color: #717A8C;
      margin-top: 2px;
    }
    .block {
      background: #EEF1F7;
      border: 1px solid #25447A;
      border-radius: 4px;
      padding: 3px 2px;
      line-height: 1.25;
    }
    .block-subj {
      font-weight: 700;
      color: #25447A;
      font-size: 9px;
    }
    .block-fac {
      font-size: 8.5px;
      color: #2C303A;
      margin-top: 1px;
    }
    .block-sec {
      font-size: 8px;
      color: #5C6375;
    }
    .vacant {
      color: #B0B5C1;
      font-size: 10px;
    }
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div class="logo">STI</div>
      <div class="title">
        <h1>STI College Marikina · Master Academic Schedule</h1>
        <p>1st Semester AY 2026-2027 · AI-Assisted Classroom Scheduling System</p>
      </div>
    </div>
    <div class="meta">
      <strong>Generated:</strong> ${dateFormatted} at ${timeFormatted}<br />
      <strong>Classrooms:</strong> ${ROOMS.length} Rooms Across 3 Floors
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="room-col">Room</th>
        ${slotsHeaderHtml}
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 350);
    };
  <\/script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

window.triggerCtxRemove = function() {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to modify the master schedule.');
    closeScheduleContextMenu();
    return;
  }
  if (!ctxTargetRoom || ctxTargetSlot === null) return;
  const slotData = scheduleData[ctxTargetRoom]?.[ctxTargetSlot];
  if (slotData) {
    const facName = slotData.faculty;
    delete scheduleData[ctxTargetRoom][ctxTargetSlot];
    renderGrid();

    const toastTitle = document.getElementById('toastTitle');
    const toastMsg = document.getElementById('toastMsg');
    const toast = document.getElementById('conflictToast');
    if (toast && toastTitle && toastMsg) {
      toastTitle.textContent = 'Professor Removed';
      toastMsg.textContent = `Removed ${facName} from ${ctxTargetRoom} at ${TIME_SLOTS[ctxTargetSlot]}. Slot is now vacant.`;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3500);
    }
  }
  closeScheduleContextMenu();
};

window.triggerCtxAdd = function() {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to modify the master schedule.');
    closeScheduleContextMenu();
    return;
  }
  openSlotModal(ctxTargetRoom, ctxTargetSlot, false);
  closeScheduleContextMenu();
};

window.triggerCtxEdit = function() {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to modify the master schedule.');
    closeScheduleContextMenu();
    return;
  }
  openSlotModal(ctxTargetRoom, ctxTargetSlot, true);
  closeScheduleContextMenu();
};

function openSlotModal(room, slotIdx, isEdit) {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to modify the master schedule.');
    return;
  }
  document.getElementById('slotTargetRoom').value = room;
  document.getElementById('slotTargetIdx').value = slotIdx;
  document.getElementById('slotRoomDisplay').value = room;
  document.getElementById('slotTimeDisplay').value = TIME_SLOTS[slotIdx];
  document.getElementById('slotModalTitle').textContent = isEdit ? 'Change Professor / Reassign Slot' : 'Assign Professor to Slot';

  const errEl = document.getElementById('slotModalError');
  if (errEl) errEl.style.display = 'none';

  const facSelect = document.getElementById('slotFacultySelect');
  facSelect.innerHTML = '';

  const currentData = scheduleData[room]?.[slotIdx];

  if (FACULTY.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No faculty registered';
    facSelect.appendChild(opt);
  } else {
    FACULTY.forEach(fac => {
      const opt = document.createElement('option');
      opt.value = fac.name;

      // Check if faculty is already booked in another room at this exact slot
      let isBookedElsewhere = false;
      for (const otherRoom of Object.keys(scheduleData)) {
        if (otherRoom !== room && scheduleData[otherRoom]?.[slotIdx]?.faculty === fac.name) {
          isBookedElsewhere = true;
          break;
        }
      }

      opt.textContent = `${fac.name} (${fac.dept})${isBookedElsewhere ? ' — [Booked at this time]' : ' — Available'}`;
      if (isBookedElsewhere && (!currentData || currentData.faculty !== fac.name)) {
        opt.disabled = true;
      }
      if (currentData && currentData.faculty === fac.name) {
        opt.selected = true;
      }
      facSelect.appendChild(opt);
    });
  }

  if (currentData) {
    document.getElementById('slotSubjectInput').value = currentData.subj || 'ITE 101';
    document.getElementById('slotProgramSelect').value = currentData.program || 'BSIT';
    document.getElementById('slotSectionInput').value = currentData.section || 'BSIT 1A';
  } else {
    const selectedFac = FACULTY.find(f => f.name === facSelect.value);
    document.getElementById('slotSubjectInput').value = selectedFac?.quals?.[0] || 'ITE 101';
    document.getElementById('slotProgramSelect').value = 'BSIT';
    document.getElementById('slotSectionInput').value = 'BSIT 1A';
  }

  document.getElementById('slotModal').style.display = 'flex';
}

window.closeSlotModal = function() {
  const err = document.getElementById('slotModalError');
  if (err) err.style.display = 'none';
  document.getElementById('slotModal').style.display = 'none';
};

window.handleSlotFacultyChange = function(facultyName) {
  const fac = FACULTY.find(f => f.name === facultyName);
  if (fac && fac.quals && fac.quals.length > 0) {
    document.getElementById('slotSubjectInput').value = fac.quals[0];
  }
};

window.submitSlotAssignment = function() {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to modify the master schedule.');
    closeSlotModal();
    return;
  }
  const room = document.getElementById('slotTargetRoom').value;
  const slotIdx = parseInt(document.getElementById('slotTargetIdx').value, 10);
  const faculty = document.getElementById('slotFacultySelect').value;
  const subj = document.getElementById('slotSubjectInput').value.trim() || 'ITE 101';
  const program = document.getElementById('slotProgramSelect').value || 'BSIT';
  const section = document.getElementById('slotSectionInput').value.trim() || 'BSIT 1A';
  const errEl = document.getElementById('slotModalError');

  if (!faculty) {
    if (errEl) {
      errEl.textContent = 'Please select a faculty member.';
      errEl.style.display = 'block';
    }
    return;
  }

  // Check for faculty conflict at target time slot
  for (const otherRoom of Object.keys(scheduleData)) {
    if (otherRoom !== room && scheduleData[otherRoom]?.[slotIdx]?.faculty === faculty) {
      if (errEl) {
        errEl.textContent = `Overlap Conflict: ${faculty} is already teaching in room ${otherRoom} during ${TIME_SLOTS[slotIdx]}.`;
        errEl.style.display = 'block';
      }
      return;
    }
  }

  // Check for subject department / IT-only constraint
  const subjMatch = SUBJECTS.find(s => s.code.toLowerCase() === subj.toLowerCase());
  const facObj = FACULTY.find(f => f.name === faculty);
  if (subjMatch && subjMatch.itOnly) {
    if (facObj && facObj.dept !== 'IT / CS') {
      if (errEl) {
        errEl.textContent = `Department Restriction: ${subjMatch.code} (${subjMatch.title}) is restricted to IT/CS professors only. ${facObj.name} belongs to ${facObj.dept}.`;
        errEl.style.display = 'block';
      }
      return;
    }
  }

  if (!scheduleData[room]) scheduleData[room] = {};
  scheduleData[room][slotIdx] = {
    subj,
    faculty,
    section,
    program,
    year: section.match(/\d/)?.[0] || '1',
    type: 'manual-override',
    id: `${room}-${slotIdx}`
  };

  closeSlotModal();
  renderGrid();
};
