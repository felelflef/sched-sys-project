/* ══════════════════════════════════════════════════════════════════════════
   EXPORTS (PDF AND PNG, SINGLE AND BATCH)
   Part of the Master Schedule; the schedule_*.js files load in order (see the page's script tags).
   ══════════════════════════════════════════════════════════════════════════ */

function toggleExportMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('exportDropdownMenu');
  if (menu) {
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
  }
}

// Printing shows only the timetable sheet on screen, so headings, stats and warnings stay off the paper
const printHiddenElements = [];
window.addEventListener('beforeprint', () => {
  const sheet = [...document.querySelectorAll('.module-page.active .timetable-sheet-card')].find(el => el.offsetParent !== null);
  if (!sheet) return;
  for (let el = sheet; el.parentElement && el !== document.body; el = el.parentElement) {
    [...el.parentElement.children].forEach(sibling => {
      if (sibling !== el && !sibling.classList.contains('print-hide')) {
        sibling.classList.add('print-hide');
        printHiddenElements.push(sibling);
      }
    });
  }
});
window.addEventListener('afterprint', () => {
  printHiddenElements.splice(0).forEach(el => el.classList.remove('print-hide'));
});

const PDF_TOOLS_MISSING = "The PDF tool couldn't load. Check your internet connection and reload the page.";
let pdfExportBusy = false;

function pdfToolsReady() {
  return !!(window.jspdf && window.jspdf.jsPDF);
}

function exportFileName(label, extension) {
  const { activeSy, activeTerm } = getActiveAcademicContext();
  return `${label} ${activeTerm.termName} ${activeSy.yearCode}.${extension}`.replace(/[\\/:*?"<>|]/g, '-');
}

// Draws a timetable sheet as an image at desktop width, so phones get the same full page, without its edit buttons
async function captureTimetableSheet(card) {
  card.setAttribute('data-capture', 'true');
  try {
    return await html2canvas(card, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#FFFFFF',
      logging: false,
      windowWidth: 1400,
      onclone: doc => {
        const copy = doc.querySelector('[data-capture]');
        if (!copy) return;
        copy.style.width = '1240px';
        copy.style.maxWidth = 'none';
        copy.querySelectorAll('.timetable-table-container').forEach(el => { el.style.overflow = 'visible'; });
        copy.querySelectorAll('button').forEach(el => el.remove());
      }
    });
  } finally {
    card.removeAttribute('data-capture');
  }
}

function newTimetablePdf() {
  return new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
}

// One timetable per landscape A4 page, scaled to fit and centred
function addSheetToPdf(pdf, canvas, isFirstPage) {
  if (!isFirstPage) pdf.addPage('a4', 'landscape');
  const margin = 8;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const scale = Math.min((pageWidth - margin * 2) / canvas.width, (pageHeight - margin * 2) / canvas.height);
  const width = canvas.width * scale;
  const height = canvas.height * scale;
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (pageWidth - width) / 2, margin, width, height);
}

/* ─── Real (text) PDF timetables ───
   Each page is drawn with text and lines, so it can be searched, copied and printed sharply.
   The title and stats come from the sheet on screen; the classes come from the schedule data. */
const PDF_TYPE_COLORS = {
  lecture: [[235, 243, 252], [37, 99, 235]],
  lab: [[236, 253, 245], [5, 150, 105]],
  pe: [[254, 243, 199], [217, 119, 6]],
  special: [[254, 243, 199], [217, 119, 6]]
};
const PDF_NAVY = [28, 54, 100];
const PDF_GREY = [92, 99, 117];

// The built-in PDF fonts only cover Western European letters, so a few typographic marks are swapped for plain ones
function pdfText(value) {
  return String(value ?? '').trim()
    .replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u2022/g, '\u00B7');
}

function sheetHeaderFor(card) {
  const read = selector => pdfText(card.querySelector(selector)?.textContent);
  return {
    title: read('.section-title-large'),
    subtitle: read('.section-badge-program'),
    stats: [...card.querySelectorAll('.sheet-stat-pill')]
      .map(pill => [pdfText(pill.querySelector('.sheet-stat-label')?.textContent), pdfText(pill.querySelector('.sheet-stat-value')?.textContent)])
      .filter(([label, value]) => label || value)
  };
}

// The second line of a class box names what the page's title doesn't
function pdfClassDetail(c, mode) {
  if (mode === 'teacher') return `${c.section} \u00B7 ${c.room}`;
  if (mode === 'room') return `${c.section} \u00B7 ${c.instructor}`;
  return `${c.room} \u00B7 ${c.instructor}`;
}

// Draws one landscape A4 timetable page: title and stats, the Mon-Sat grid, hours per day, and a legend
function drawTimetablePage(pdf, card, classes, mode, isFirstPage) {
  if (!isFirstPage) pdf.addPage('a4', 'landscape');
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const head = sheetHeaderFor(card);

  // Title, with the stats in boxes on the right
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(...PDF_GREY);
  pdf.text(head.subtitle.toUpperCase(), margin, margin + 4);
  pdf.setFontSize(18);
  pdf.setTextColor(...PDF_NAVY);
  pdf.text(head.title, margin, margin + 12);
  let boxRight = pageW - margin;
  head.stats.slice().reverse().forEach(([label, value]) => {
    pdf.setFontSize(6.5);
    const labelW = pdf.getTextWidth(label.toUpperCase());
    pdf.setFontSize(11);
    const valueW = pdf.getTextWidth(value);
    const boxW = Math.max(labelW, valueW) + 8;
    const boxX = boxRight - boxW;
    pdf.setDrawColor(214, 221, 232);
    pdf.setFillColor(248, 250, 253);
    pdf.roundedRect(boxX, margin, boxW, 13, 1.5, 1.5, 'FD');
    pdf.setFontSize(6.5);
    pdf.setTextColor(...PDF_GREY);
    pdf.text(label.toUpperCase(), boxX + boxW / 2, margin + 4.6, { align: 'center' });
    pdf.setFontSize(11);
    pdf.setTextColor(...PDF_NAVY);
    pdf.text(value, boxX + boxW / 2, margin + 10.6, { align: 'center' });
    boxRight = boxX - 3;
  });

  // Rows every 30 minutes, from 7:00 AM to the last class (at least until noon)
  const times = classes.flatMap(c => [timeToMinutes(c.startTime), timeToMinutes(c.endTime)]);
  const dayStart = Math.min(CLASS_DAY_START, times.length ? Math.floor(Math.min(...times) / 30) * 30 : CLASS_DAY_START);
  const dayEnd = Math.max(12 * 60, times.length ? Math.ceil(Math.max(...times) / 30) * 30 : 12 * 60);
  const slots = Math.max(1, (dayEnd - dayStart) / 30);
  const top = margin + 18;
  const timeW = 22;
  const colW = (pageW - margin * 2 - timeW) / DAYS.length;
  const headH = 7;
  const footH = 7;
  // Rows grow to fill the page when the day is short, up to 12 mm each
  const rowH = Math.min(12, (pageH - top - headH - footH - 16) / slots);
  const gridTop = top + headH;
  const gridBottom = gridTop + slots * rowH;
  const gridW = pageW - margin * 2;

  pdf.setFillColor(...PDF_NAVY);
  pdf.rect(margin, top, gridW, headH, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(255, 255, 255);
  pdf.text('TIME', margin + timeW / 2, top + 4.8, { align: 'center' });
  DAYS.forEach((day, i) => pdf.text(day.toUpperCase(), margin + timeW + colW * i + colW / 2, top + 4.8, { align: 'center' }));

  pdf.setFillColor(241, 243, 247);
  pdf.rect(margin, gridTop, timeW, slots * rowH, 'F');
  pdf.setDrawColor(214, 221, 232);
  pdf.setLineWidth(0.2);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(...PDF_GREY);
  for (let i = 0; i < slots; i++) {
    const y = gridTop + i * rowH;
    pdf.line(margin, y, margin + gridW, y);
    pdf.text(formatTime12(minutesToTime(dayStart + i * 30)), margin + timeW / 2, y + Math.min(4, rowH - 1.5), { align: 'center' });
  }
  for (let i = 0; i <= DAYS.length; i++) {
    const x = margin + timeW + colW * i;
    pdf.line(x, gridTop, x, gridBottom + footH);
  }

  // Each class fills its day and hours, coloured by type
  const lineGap = size => size * 0.42;
  classes.forEach(c => {
    const col = DAYS.indexOf(c.day);
    if (col < 0) return;
    const y1 = gridTop + ((timeToMinutes(c.startTime) - dayStart) / 30) * rowH;
    const y2 = gridTop + ((timeToMinutes(c.endTime) - dayStart) / 30) * rowH;
    const x1 = margin + timeW + colW * col;
    const [fill, stripe] = PDF_TYPE_COLORS[c.type] || PDF_TYPE_COLORS.lecture;
    pdf.setFillColor(...fill);
    pdf.rect(x1 + 0.4, y1 + 0.4, colW - 0.8, y2 - y1 - 0.8, 'F');
    pdf.setFillColor(...stripe);
    pdf.rect(x1 + 0.4, y1 + 0.4, 1.1, y2 - y1 - 0.8, 'F');

    const lines = [
      [pdfText(c.subjectCode), 'bold', 8, PDF_NAVY],
      [pdfText(c.subjectTitle), 'normal', 6.8, [31, 41, 55]],
      [pdfText(pdfClassDetail(c, mode)), 'normal', 6.3, PDF_GREY],
      [`${formatTime12(c.startTime)} - ${formatTime12(c.endTime)}`, 'normal', 6.3, PDF_GREY]
    ];
    let textY = y1 + 3.6;
    const textX = x1 + 2.6;
    const textW = colW - 4;
    for (const [text, weight, size, color] of lines) {
      pdf.setFont('helvetica', weight);
      pdf.setFontSize(size);
      pdf.setTextColor(...color);
      for (const part of pdf.splitTextToSize(text, textW)) {
        if (textY > y2 - 1.2) return;
        pdf.text(part, textX, textY);
        textY += lineGap(size) + 0.6;
      }
    }
  });

  // Hours per day, then the weekly total and the legend
  pdf.setFillColor(241, 243, 247);
  pdf.rect(margin, gridBottom, gridW, footH, 'F');
  pdf.setDrawColor(214, 221, 232);
  for (let i = 0; i <= DAYS.length; i++) pdf.line(margin + timeW + colW * i, gridBottom, margin + timeW + colW * i, gridBottom + footH);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(...PDF_NAVY);
  pdf.text('# of Hrs', margin + timeW / 2, gridBottom + 4.7, { align: 'center' });
  let weekMinutes = 0;
  DAYS.forEach((day, i) => {
    const minutes = classes.filter(c => c.day === day).reduce((sum, c) => sum + timeToMinutes(c.endTime) - timeToMinutes(c.startTime), 0);
    weekMinutes += minutes;
    pdf.text(`${(minutes / 60).toFixed(1)} hrs`, margin + timeW + colW * i + colW / 2, gridBottom + 4.7, { align: 'center' });
  });
  pdf.setDrawColor(150, 160, 178);
  pdf.setLineWidth(0.3);
  pdf.rect(margin, top, gridW, gridBottom + footH - top);

  const legendY = gridBottom + footH + 6;
  pdf.setFontSize(9);
  pdf.text(`Weekly Schedule Total: ${(weekMinutes / 60).toFixed(1)} hrs / week`, pageW - margin, legendY, { align: 'right' });
  let legendX = margin;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  [['Lecture', PDF_TYPE_COLORS.lecture], ['Laboratory', PDF_TYPE_COLORS.lab], ['PE / Special / NSTP', PDF_TYPE_COLORS.pe]].forEach(([name, [fill, stripe]]) => {
    pdf.setFillColor(...fill);
    pdf.rect(legendX, legendY - 3, 4, 4, 'F');
    pdf.setFillColor(...stripe);
    pdf.rect(legendX, legendY - 3, 1, 4, 'F');
    pdf.setTextColor(...PDF_GREY);
    pdf.text(name, legendX + 5.5, legendY);
    legendX += pdf.getTextWidth(name) + 12;
  });
  pdf.setFontSize(6.5);
  pdf.text(`STI College Marikina \u00B7 Generated ${new Date().toLocaleDateString('en-PH', { dateStyle: 'medium' })}`, margin, pageH - 5);
}

// The active term's classes shown on the Master Schedule sheet
// The classes the Step 7 timetable is showing: a section, a room or a teacher
function masterSheetClasses() {
  return gridModeClasses();
}

// A real PDF of one timetable. If drawing fails, a picture of the sheet is used instead.
async function saveTimetableSheetPdf(card, label, classes, mode) {
  if (!pdfToolsReady()) {
    alert(PDF_TOOLS_MISSING);
    return;
  }
  if (!card || pdfExportBusy) return;
  pdfExportBusy = true;
  try {
    let pdf = newTimetablePdf();
    try {
      drawTimetablePage(pdf, card, classes, mode, true);
    } catch (drawError) {
      if (typeof html2canvas === 'undefined') throw drawError;
      console.warn('Text PDF failed, saving a picture of the timetable instead:', drawError);
      pdf = newTimetablePdf();
      addSheetToPdf(pdf, await captureTimetableSheet(card), true);
    }
    pdf.save(exportFileName(`${label} Timetable`, 'pdf'));
  } catch (e) {
    alert('Could not create the PDF. Please try again.');
  } finally {
    pdfExportBusy = false;
  }
}

function exportTimetablePDF() {
  const menu = document.getElementById('exportDropdownMenu');
  if (menu) menu.style.display = 'none';

  saveTimetableSheetPdf(document.getElementById('sectionTimetableCard'), gridMode === 'section' ? currentSelectedSection : gridSelection[gridMode], masterSheetClasses(), gridMode);
}

async function exportTimetablePNG() {
  const menu = document.getElementById('exportDropdownMenu');
  if (menu) menu.style.display = 'none';

  const card = document.getElementById('sectionTimetableCard');
  if (!card) {
    alert('Timetable sheet not found.');
    return;
  }

  if (typeof html2canvas === 'undefined') {
    alert('The image tool is still loading. Please try again in a moment.');
    return;
  }

  try {
    const canvas = await html2canvas(card, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#FFFFFF',
      logging: false
    });

    const link = document.createElement('a');
    link.download = `${currentSelectedSection}_Timetable.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    alert('Unable to generate the PNG image. Please use Download PDF instead.');
  }
}

// One PDF with a page for every section of the active term, each drawn as real text
async function exportAllSectionsBatchPDF() {
  const menu = document.getElementById('exportDropdownMenu');
  if (menu) menu.style.display = 'none';
  if (!pdfToolsReady()) {
    alert(PDF_TOOLS_MISSING);
    return;
  }
  if (pdfExportBusy) return;

  const { activeSy, activeTerm } = getActiveAcademicContext();
  const sections = ACADEMIC_SECTIONS.filter(s => s.termId === activeTerm.id).sort((a, b) => a.code.localeCompare(b.code));
  if (sections.length === 0) {
    alert(`No sections found for ${activeTerm.termName} (${activeSy.yearCode}) to export.`);
    return;
  }

  const card = document.getElementById('sectionTimetableCard');
  const previousSection = currentSelectedSection;
  pdfExportBusy = true;
  alert(`Preparing a PDF of ${sections.length} section timetables. It downloads when ready.`);
  try {
    const pdf = newTimetablePdf();
    for (let i = 0; i < sections.length; i++) {
      currentSelectedSection = sections[i].code;
      renderGrid();
      drawTimetablePage(pdf, card, masterSheetClasses(), 'section', i === 0);
    }
    pdf.save(exportFileName('All Section Timetables', 'pdf'));
  } catch (e) {
    alert('Could not create the PDF. Please try again.');
  } finally {
    currentSelectedSection = previousSection;
    renderGrid();
    pdfExportBusy = false;
  }
}
