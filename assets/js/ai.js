/* ==========================================================================
   AI SCHEDULE & SPACE OPTIMIZATION CONTROLLER (Google Gemini API)
   Strictly restricted to STI College classroom scheduling operations
   ========================================================================== */

let isAiLoading = false;

function escapeAiHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function initAiModule() {
  const container = document.getElementById('aiResultsContainer');
  if (!container) return;
  // Module initialized on tab switch
}

async function runAiAnalysis(action = 'full_audit', customQuestion = '') {
  if (isAiLoading) return;

  const resultsCard = document.getElementById('aiResultsCard');
  const resultsContainer = document.getElementById('aiResultsContainer');
  const loadingIndicator = document.getElementById('aiLoadingIndicator');
  const querySummary = document.getElementById('aiQuerySummary');
  const actionBtns = document.querySelectorAll('.ai-action-btn');
  const askBtn = document.getElementById('aiAskBtn');
  const questionInput = document.getElementById('aiQuestionInput');

  const actionLabels = {
    'full_audit': 'Comprehensive Space & Schedule Optimization Audit',
    'underutilized': 'Classroom Underutilization & Vacancy Analysis',
    'peak_hours': 'Peak Congestion & Bottleneck Analysis',
    'conflicts': 'Schedule Conflicts & Phantom Occupancy Audit',
    'custom_query': customQuestion ? `Inquiry: "${customQuestion}"` : 'Custom Schedule Inquiry'
  };

  isAiLoading = true;
  actionBtns.forEach(btn => btn.disabled = true);
  if (askBtn) askBtn.disabled = true;

  if (resultsCard) resultsCard.style.display = 'block';
  if (loadingIndicator) loadingIndicator.style.display = 'flex';
  if (resultsContainer) resultsContainer.style.display = 'none';
  if (querySummary) querySummary.textContent = actionLabels[action] || 'Schedule Analysis';

  try {
    const payload = {
      action: action,
      question: customQuestion
    };

    const res = await fetch('api/gemini_suggestions.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      const errorMsg = data.error || data.message || `Request failed with status ${res.status}`;
      renderAiError(errorMsg);
      return;
    }

    renderAiMarkdown(data.data || 'No insights returned.');
    if (questionInput && action === 'custom_query') {
      questionInput.value = '';
    }
  } catch (err) {
    if (window.location.protocol === 'file:') {
      renderAiError('The AI module requires a running PHP web server with database access and GEMINI_API_KEY configured. It cannot execute directly over the file:// protocol.');
    } else {
      renderAiError('Unable to connect to AI scheduling service. Please ensure the server is running, the database is reachable, and GEMINI_API_KEY is configured in your environment.');
    }
  } finally {
    isAiLoading = false;
    actionBtns.forEach(btn => btn.disabled = false);
    if (askBtn) askBtn.disabled = false;
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    if (resultsContainer) resultsContainer.style.display = 'block';
  }
}

function renderAiMarkdown(text) {
  const container = document.getElementById('aiResultsContainer');
  if (!container) return;

  const rawLines = text.split(/\r?\n/);
  const output = [];
  let inList = false;
  let listType = null; // 'ul' or 'ol'

  function closeList() {
    if (inList) {
      output.push(listType === 'ol' ? '</ol>' : '</ul>');
      inList = false;
      listType = null;
    }
  }

  for (let line of rawLines) {
    let trimmed = line.trim();

    if (!trimmed) {
      closeList();
      continue;
    }

    // Escape special HTML characters
    trimmed = escapeAiHtml(trimmed);

    // Inline formatting: bold, italic, inline code
    trimmed = trimmed.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text-primary); font-weight:600;">$1</strong>');
    trimmed = trimmed.replace(/\*(.*?)\*/g, '<em>$1</em>');
    trimmed = trimmed.replace(/`([^`]+)`/g, '<code style="background:#F1F3F9; padding:2px 6px; border-radius:4px; font-size:12px; font-family:monospace;">$1</code>');

    // Headers
    if (/^###\s+/.test(trimmed)) {
      closeList();
      const content = trimmed.replace(/^###\s+/, '');
      output.push(`<h4 style="margin:16px 0 8px; color:var(--text-primary); font-size:15px; font-weight:700;">${content}</h4>`);
      continue;
    }
    if (/^##\s+/.test(trimmed)) {
      closeList();
      const content = trimmed.replace(/^##\s+/, '');
      output.push(`<h3 style="margin:20px 0 10px; color:var(--sti-blue); font-size:16px; font-weight:800; border-bottom:1px solid var(--border-subtle); padding-bottom:6px;">${content}</h3>`);
      continue;
    }
    if (/^#\s+/.test(trimmed)) {
      closeList();
      const content = trimmed.replace(/^#\s+/, '');
      output.push(`<h3 style="margin:20px 0 10px; color:var(--sti-blue); font-size:17px; font-weight:800;">${content}</h3>`);
      continue;
    }

    // Unordered bullet list (* or -)
    const bulletMatch = trimmed.match(/^[\*\-]\s+(.*)$/);
    if (bulletMatch) {
      if (!inList || listType !== 'ul') {
        closeList();
        output.push('<ul style="padding-left:22px; margin:8px 0 14px; color:var(--text-primary);">');
        inList = true;
        listType = 'ul';
      }
      output.push(`<li style="margin-bottom:6px; line-height:1.55; font-size:13.5px;">${bulletMatch[1]}</li>`);
      continue;
    }

    // Ordered numbered list (1. or 1))
    const numMatch = trimmed.match(/^(\d+)[\.\)]\s+(.*)$/);
    if (numMatch) {
      if (!inList || listType !== 'ol') {
        closeList();
        output.push('<ol style="padding-left:22px; margin:8px 0 14px; color:var(--text-primary);">');
        inList = true;
        listType = 'ol';
      }
      output.push(`<li style="margin-bottom:6px; line-height:1.55; font-size:13.5px;"><strong style="color:var(--text-primary);">${numMatch[1]}.</strong> ${numMatch[2]}</li>`);
      continue;
    }

    // Regular paragraph
    closeList();
    output.push(`<p style="margin:8px 0; line-height:1.6; color:var(--text-secondary); font-size:13.5px;">${trimmed}</p>`);
  }

  closeList();
  container.innerHTML = output.join('\n');
}

function renderAiError(message) {
  const container = document.getElementById('aiResultsContainer');
  if (!container) return;

  container.innerHTML = `
    <div style="background:#FFF5F5; border:1px solid #FEB2B2; border-radius:8px; padding:16px; color:#C53030; display:flex; align-items:flex-start; gap:12px;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px; height:20px; flex-shrink:0; margin-top:2px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div>
        <div style="font-weight:700; font-size:14px; margin-bottom:4px;">AI Request Notice</div>
        <div style="font-size:13px; line-height:1.4;">${escapeAiHtml(message)}</div>
      </div>
    </div>
  `;
}

function copyAiResponse() {
  const container = document.getElementById('aiResultsContainer');
  if (!container) return;
  const text = container.innerText || container.textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('aiCopyBtn');
    if (btn) {
      const originalText = btn.innerHTML;
      btn.innerHTML = '✓ Copied';
      setTimeout(() => { btn.innerHTML = originalText; }, 2000);
    }
  }).catch(() => {
    alert('Unable to copy to clipboard.');
  });
}

function handleAiPromptSubmit(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('aiQuestionInput');
  if (!input) return;
  const query = input.value.trim();
  if (!query) return;
  runAiAnalysis('custom_query', query);
}

// Bind handlers to global window object
window.initAiModule = initAiModule;
window.runAiAnalysis = runAiAnalysis;
window.copyAiResponse = copyAiResponse;
window.handleAiPromptSubmit = handleAiPromptSubmit;

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('aiPromptForm');
  if (form) {
    form.addEventListener('submit', handleAiPromptSubmit);
  }
});
