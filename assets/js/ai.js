/* ==========================================================================
   AI SCHEDULE & SPACE OPTIMIZATION CONTROLLER (Google Gemini API)
   Strictly restricted to STI College classroom scheduling operations
   ========================================================================== */

const GEMINI_STORAGE_KEY = 'sti_gemini_api_key';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const FALLBACK_GEMINI_MODEL = 'gemini-2.0-flash';

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

/* ─── API Key Storage & Status Helpers ─── */
function getStoredGeminiApiKey() {
  return (localStorage.getItem(GEMINI_STORAGE_KEY) || '').trim();
}

function setStoredGeminiApiKey(key) {
  if (key) {
    localStorage.setItem(GEMINI_STORAGE_KEY, key.trim());
  } else {
    localStorage.removeItem(GEMINI_STORAGE_KEY);
  }
  updateAiStatusPill();
}

function updateAiStatusPill() {
  const dot = document.getElementById('aiStatusDot');
  const text = document.getElementById('aiStatusText');
  const btnText = document.getElementById('btnConfigureAiKeyText');
  const key = getStoredGeminiApiKey();

  if (key) {
    if (dot) dot.style.background = '#10B981';
    if (text) text.textContent = 'Connected: Google Gemini API';
    if (btnText) btnText.textContent = 'API Key Configured ✓';
  } else {
    if (dot) dot.style.background = '#F59E0B';
    if (text) text.textContent = 'API Key Required (Click to connect)';
    if (btnText) btnText.textContent = 'Configure API Key';
  }
}

/* ─── API Key Configuration Modal ─── */
function openGeminiKeyModal(initialMessage = '') {
  const modal = document.getElementById('geminiKeyModal');
  const input = document.getElementById('geminiApiKeyInput');
  const alertBox = document.getElementById('geminiKeyAlert');

  if (input) {
    input.value = getStoredGeminiApiKey();
    input.type = 'password';
  }

  if (alertBox) {
    if (initialMessage) {
      alertBox.style.display = 'block';
      alertBox.style.background = '#FFFBEB';
      alertBox.style.border = '1px solid #FCD34D';
      alertBox.style.color = '#B45309';
      alertBox.innerHTML = `<strong>⚠️ Action Required:</strong> ${escapeAiHtml(initialMessage)}`;
    } else {
      alertBox.style.display = 'none';
    }
  }

  if (modal) modal.style.display = 'flex';
}

function closeGeminiKeyModal() {
  const modal = document.getElementById('geminiKeyModal');
  if (modal) modal.style.display = 'none';
}

function toggleGeminiKeyVisibility() {
  const input = document.getElementById('geminiApiKeyInput');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function testGeminiConnectionLive(apiKey) {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    return { ok: false, error: 'Please enter an API key first.' };
  }

  const payload = {
    contents: [{ parts: [{ text: "Respond with 'CONNECTED' only." }] }],
    generationConfig: { maxOutputTokens: 10, temperature: 0 }
  };

  const startTime = Date.now();
  const primaryUrl = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent?key=${encodeURIComponent(cleanKey)}`;

  try {
    const res = await fetch(primaryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    const duration = Date.now() - startTime;

    if (!res.ok || data.error) {
      // Try fallback model if 2.5 is not yet activated on this key
      const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/${FALLBACK_GEMINI_MODEL}:generateContent?key=${encodeURIComponent(cleanKey)}`;
      const resFallback = await fetch(fallbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const dataFallback = await resFallback.json();

      if (resFallback.ok && !dataFallback.error) {
        return { ok: true, model: FALLBACK_GEMINI_MODEL, latency: Date.now() - startTime };
      }

      const errMsg = data.error?.message || dataFallback.error?.message || `HTTP ${res.status}`;
      return { ok: false, error: errMsg };
    }

    return { ok: true, model: DEFAULT_GEMINI_MODEL, latency: duration };
  } catch (err) {
    return { ok: false, error: err.message || 'Unable to connect to Google API servers.' };
  }
}

async function handleTestGeminiKey() {
  const input = document.getElementById('geminiApiKeyInput');
  const btn = document.getElementById('btnTestGeminiKey');
  const alertBox = document.getElementById('geminiKeyAlert');
  const key = input ? input.value.trim() : '';

  if (!key) {
    if (alertBox) {
      alertBox.style.display = 'block';
      alertBox.style.background = '#FFF5F5';
      alertBox.style.border = '1px solid #FEB2B2';
      alertBox.style.color = '#C53030';
      alertBox.innerHTML = '<strong>Error:</strong> Please paste your Google Gemini API key into the field above.';
    }
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = 'Testing Connection...';
  }

  const result = await testGeminiConnectionLive(key);

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '⚡ Test Connection';
  }

  if (alertBox) {
    alertBox.style.display = 'block';
    if (result.ok) {
      alertBox.style.background = '#ECFDF5';
      alertBox.style.border = '1px solid #A7F3D0';
      alertBox.style.color = '#065F46';
      alertBox.innerHTML = `<strong>✓ Connection Successful!</strong> Connected to <code>${result.model}</code> in ${result.latency}ms. Your key is active and ready to use.`;
    } else {
      alertBox.style.background = '#FFF5F5';
      alertBox.style.border = '1px solid #FEB2B2';
      alertBox.style.color = '#C53030';
      alertBox.innerHTML = `<strong>✕ Connection Failed:</strong> ${escapeAiHtml(result.error)}. Please verify your key at <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:#C53030; font-weight:700;">Google AI Studio</a>.`;
    }
  }
}

function handleSaveGeminiKey() {
  const input = document.getElementById('geminiApiKeyInput');
  const key = input ? input.value.trim() : '';

  if (!key) {
    const alertBox = document.getElementById('geminiKeyAlert');
    if (alertBox) {
      alertBox.style.display = 'block';
      alertBox.style.background = '#FFF5F5';
      alertBox.style.border = '1px solid #FEB2B2';
      alertBox.style.color = '#C53030';
      alertBox.innerHTML = 'Please enter an API key or click Cancel.';
    }
    return;
  }

  setStoredGeminiApiKey(key);
  closeGeminiKeyModal();
  alert('Gemini API key saved! The AI Scheduling Assistant is now active and connected.');
}

/* ─── Domain-Grounded System Instruction Builder ─── */
function buildSchedulingContextPrompt() {
  const rooms = (typeof ROOMS !== 'undefined' && Array.isArray(ROOMS)) ? ROOMS : [];
  const sched = (typeof MASTER_SCHEDULE_DATA !== 'undefined' && Array.isArray(MASTER_SCHEDULE_DATA))
    ? MASTER_SCHEDULE_DATA
    : [];

  let roomsText = rooms.map(r =>
    `Room ${r.code} (Floor ${r.floor}, Type: ${r.type}, Capacity: ${r.cap} seats)`
  ).join('\n');

  let schedText = sched.map(s =>
    `Room ${s.room} | Section: ${s.section} | Subject: ${s.subjectCode} (${s.subjectTitle || ''}) | Day: ${s.day} | Time: ${s.startTime}-${s.endTime} | Faculty: ${s.instructor}`
  ).join('\n');

  return `You are the STI College Classroom & Schedule AI Optimization Assistant for STI College Marikina.

CAMPUS ROOM DIRECTORY:
${roomsText || 'No rooms registered.'}

CURRENT WEEKLY MASTER SCHEDULES:
${schedText || 'No class schedules registered.'}

STRICT DOMAIN GUARDRAILS:
1. You are an expert AI dedicated EXCLUSIVELY to STI College classroom scheduling, room space utilization, faculty timetable assignments, and academic scheduling logistics.
2. You MUST REFUSE to answer any queries or topics unrelated to STI scheduling, room usage, timetables, faculty loads, or campus spaces (for example, general chat, coding, recipes, personal advice, weather, sports, general knowledge, etc.).
3. If an inquiry is NOT strictly about STI scheduling or classroom operations, reply ONLY with:
"I am an assistant dedicated solely to STI College classroom scheduling, room allocation, and space optimization. I cannot answer questions on unrelated topics. Please ask a question related to class schedules, room availability, faculty teaching loads, or campus space utilization."
4. When answering on-topic questions, format your response cleanly with bold key points, bullet lists, and clear headers using markdown. Be professional, direct, and actionable.`;
}

/* ─── Direct Browser Google Gemini Execution ─── */
async function callGeminiDirect(apiKey, action, customQuestion) {
  const systemInstruction = buildSchedulingContextPrompt();

  let userPrompt = '';
  if (action === 'underutilized') {
    userPrompt = 'Analyze the current timetable and room inventory to identify classrooms and time slots that are underutilized, empty, or have low seat occupancy. Provide specific room numbers and recommendations to balance room usage across floors.';
  } else if (action === 'peak_hours') {
    userPrompt = 'Analyze the schedule data to identify peak traffic hours across the week, bottleneck facilities (such as computer laboratories), and suggest time-shifting strategies to balance student flow.';
  } else if (action === 'conflicts') {
    userPrompt = 'Audit the master schedule data to detect any potential room collisions, faculty double-bookings, or section overlaps. Provide clear remediation steps for each found issue.';
  } else if (action === 'custom_query' || customQuestion) {
    userPrompt = `User inquiry about the STI schedule system:\n${customQuestion}`;
  } else {
    // Full audit
    userPrompt = 'Perform a comprehensive space & schedule optimization audit. Provide 3 to 5 high-impact, actionable recommendations regarding underutilized rooms, peak bottlenecks, room capacity efficiency, and faculty timetable distribution.';
  }

  const payload = {
    system_instruction: {
      parts: [{ text: systemInstruction }]
    },
    contents: [
      { parts: [{ text: userPrompt }] }
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048
    }
  };

  const primaryUrl = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let response = await fetch(primaryUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  let data = await response.json();

  // Automatic model fallback if 2.5 is not accessible
  if (!response.ok && data.error && (response.status === 404 || data.error.message?.includes('not found'))) {
    const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/${FALLBACK_GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    response = await fetch(fallbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    data = await response.json();
  }

  if (!response.ok || data.error) {
    const errorMsg = data.error?.message || `Google API returned HTTP ${response.status}`;
    throw new Error(errorMsg);
  }

  const candidate = data.candidates?.[0];
  const aiText = candidate?.content?.parts?.[0]?.text;

  if (!aiText) {
    const finishReason = candidate?.finishReason || 'UNKNOWN';
    if (finishReason === 'SAFETY') {
      return 'The response was blocked by safety filters.';
    }
    return data.promptFeedback?.blockReason || 'No insights generated. The API returned an empty response.';
  }

  return aiText;
}

/* ─── Main Controller Execution ─── */
async function runAiAnalysis(action = 'full_audit', customQuestion = '') {
  if (isAiLoading) return;

  const apiKey = getStoredGeminiApiKey();

  // If no API key is stored, prompt user to enter one
  if (!apiKey) {
    openGeminiKeyModal('Please enter your Google Gemini API key to activate AI schedule optimization.');
    return;
  }

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
    'conflicts': 'Schedule Conflicts & Room Collision Audit',
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
    // 1. First attempt: Direct Google Gemini API execution with user key
    let outputText = '';
    try {
      outputText = await callGeminiDirect(apiKey, action, customQuestion);
    } catch (directErr) {
      // 2. If direct browser call encounters an error, try backend proxy if available
      try {
        const payload = {
          action: action,
          question: customQuestion,
          apiKey: apiKey
        };
        const res = await fetch('api/gemini_suggestions.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload)
        });
        const backendData = await res.json();
        if (backendData.success && backendData.data) {
          outputText = backendData.data;
        } else {
          throw new Error(backendData.error || directErr.message);
        }
      } catch (backendErr) {
        throw directErr; // Rethrow original direct API error with specific message
      }
    }

    renderAiMarkdown(outputText || 'No insights returned.');
    if (questionInput && action === 'custom_query') {
      questionInput.value = '';
    }
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid') || msg.includes('key')) {
      renderAiError(`Invalid API Key: ${msg}. Please click "Configure API Key" to update your key.`);
      openGeminiKeyModal(`Invalid API Key. Please update your key from Google AI Studio.`);
    } else if (msg.includes('quota') || msg.includes('ResourceExhausted')) {
      renderAiError('Gemini API quota exceeded for this key. Please wait a moment or try another API key from Google AI Studio.');
    } else {
      renderAiError(`AI Service Notice: ${msg}`);
    }
  } finally {
    isAiLoading = false;
    actionBtns.forEach(btn => btn.disabled = false);
    if (askBtn) askBtn.disabled = false;
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    if (resultsContainer) resultsContainer.style.display = 'block';
  }
}

/* ─── Markdown Parser & Formatter ─── */
function renderAiMarkdown(text) {
  const container = document.getElementById('aiResultsContainer');
  if (!container) return;

  const rawLines = text.split(/\r?\n/);
  const output = [];
  let inList = false;
  let listType = null;

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

    trimmed = escapeAiHtml(trimmed);

    // Inline formatting: bold, italic, code
    trimmed = trimmed.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text-primary); font-weight:700;">$1</strong>');
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
      output.push(`<h3 style="margin:20px 0 10px; color:var(--accent-primary); font-size:16px; font-weight:800; border-bottom:1px solid var(--border-subtle); padding-bottom:6px;">${content}</h3>`);
      continue;
    }
    if (/^#\s+/.test(trimmed)) {
      closeList();
      const content = trimmed.replace(/^#\s+/, '');
      output.push(`<h3 style="margin:20px 0 10px; color:var(--accent-primary); font-size:17px; font-weight:800;">${content}</h3>`);
      continue;
    }

    // Bullet list
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

    // Numbered list
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
      <div style="flex:1;">
        <div style="font-weight:700; font-size:14px; margin-bottom:4px;">AI Request Notice</div>
        <div style="font-size:13px; line-height:1.45;">${escapeAiHtml(message)}</div>
        <div style="margin-top:10px;">
          <button class="btn btn-outline" onclick="openGeminiKeyModal()" style="font-size:11.5px; padding:4px 12px; background:#fff; border-color:#FEB2B2; color:#C53030; font-weight:700;">
            🔑 Configure Gemini API Key
          </button>
        </div>
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

function initAiModule() {
  updateAiStatusPill();
}

// Bind handlers to global window object
window.initAiModule = initAiModule;
window.runAiAnalysis = runAiAnalysis;
window.copyAiResponse = copyAiResponse;
window.handleAiPromptSubmit = handleAiPromptSubmit;
window.openGeminiKeyModal = openGeminiKeyModal;
window.closeGeminiKeyModal = closeGeminiKeyModal;
window.toggleGeminiKeyVisibility = toggleGeminiKeyVisibility;
window.handleTestGeminiKey = handleTestGeminiKey;
window.handleSaveGeminiKey = handleSaveGeminiKey;

document.addEventListener('DOMContentLoaded', () => {
  updateAiStatusPill();
  const form = document.getElementById('aiPromptForm');
  if (form) {
    form.addEventListener('submit', handleAiPromptSubmit);
  }
});
