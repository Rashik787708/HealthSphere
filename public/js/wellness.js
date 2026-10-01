import { api, showToast, formatDate, renderLoading, renderEmpty, renderError } from './api.js';

export async function initWellnessPage(user) {
  // Set date input to today
  const dateInput = document.getElementById('wellness-log-date');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  await loadWellnessData();
  setupWellnessForm();
  setupAiAssistant();
}

async function loadWellnessData() {
  const container = document.getElementById('wellness-history-container');
  if (!container) return;

  renderLoading(container, 'Loading wellness logs...');

  try {
    const res = await api.get('/wellness');
    const records = res.data?.records || [];
    const summary = res.data?.summary || {};

    // Populate summary statistics
    document.getElementById('stat-avg-sleep')?.replaceChildren(document.createTextNode(`${summary.avgSleepHours || 0} hrs`));
    document.getElementById('stat-avg-water')?.replaceChildren(document.createTextNode(`${summary.avgWaterIntakeLiters || 0} L`));
    document.getElementById('stat-total-exercise')?.replaceChildren(document.createTextNode(`${summary.totalExerciseMinutes || 0} min`));
    document.getElementById('stat-latest-weight')?.replaceChildren(document.createTextNode(summary.latestWeightKg ? `${summary.latestWeightKg} kg` : 'N/A'));

    if (records.length === 0) {
      renderEmpty(container, 'No daily wellness entries logged yet.', '🌿');
      return;
    }

    container.innerHTML = `
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Sleep</th>
              <th>Water</th>
              <th>Exercise</th>
              <th>Weight</th>
              <th>Mood</th>
              <th>Meals / Diet</th>
            </tr>
          </thead>
          <tbody>
            ${records.map(r => `
              <tr>
                <td><strong>${formatDate(r.record_date)}</strong></td>
                <td>${r.sleep_hours ? `😴 ${r.sleep_hours} hrs` : '—'}</td>
                <td>${r.water_intake ? `💧 ${r.water_intake} L` : '—'}</td>
                <td>${r.exercise_minutes ? `🏃 ${r.exercise_minutes} min` : '—'}</td>
                <td>${r.weight ? `⚖️ ${r.weight} kg` : '—'}</td>
                <td>${r.mood ? `<span class="badge badge-primary">${r.mood}</span>` : '—'}</td>
                <td style="max-width:260px;font-size:0.8125rem;">${r.diet_data || r.notes || '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    renderError(container, 'Failed to load wellness records.');
  }
}

function setupWellnessForm() {
  const form = document.getElementById('wellness-entry-form');
  if (!form) return;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    try {
      const payload = {
        record_date: document.getElementById('wellness-log-date').value,
        sleep_hours: document.getElementById('wellness-log-sleep').value,
        water_intake: document.getElementById('wellness-log-water').value,
        exercise_minutes: document.getElementById('wellness-log-exercise').value,
        weight: document.getElementById('wellness-log-weight').value,
        mood: document.getElementById('wellness-log-mood').value,
        diet_data: document.getElementById('wellness-log-diet').value,
        notes: document.getElementById('wellness-log-notes')?.value || '',
      };

      await api.post('/wellness', payload);
      showToast('Daily wellness logged successfully!', 'success');
      form.reset();
      document.getElementById('wellness-log-date').value = new Date().toISOString().split('T')[0];
      await loadWellnessData();
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      if (btn) btn.disabled = false;
    }
  };
}

function setupAiAssistant() {
  const chatMessages = document.getElementById('ai-chat-messages');
  const chatInput = document.getElementById('ai-chat-input');
  const chatBtn = document.getElementById('ai-chat-send-btn');
  if (!chatMessages || !chatInput || !chatBtn) return;

  const sendMessage = async (userText) => {
    const text = userText || chatInput.value.trim();
    if (!text) return;

    // Render User message
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble user';
    userBubble.textContent = text;
    chatMessages.appendChild(userBubble);
    chatInput.value = '';
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Render AI thinking indicator
    const aiBubble = document.createElement('div');
    aiBubble.className = 'chat-bubble ai';
    aiBubble.innerHTML = `<em>Thinking & preparing evidence-based lifestyle tips...</em>`;
    chatMessages.appendChild(aiBubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
      const res = await api.post('/wellness/ai-assistant', { message: text });
      const reply = res.data?.reply || 'Healthy lifestyle suggestions received.';
      aiBubble.innerHTML = parseMarkdownToHtml(reply);
    } catch (err) {
      aiBubble.innerHTML = `<span style="color:var(--danger);">Unable to fetch suggestions. Please try again.</span>`;
    } finally {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  };

  chatBtn.addEventListener('click', () => sendMessage());
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // Prompt chips
  document.querySelectorAll('.prompt-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      const query = e.currentTarget.textContent.trim();
      sendMessage(query);
    });
  });
}

function parseMarkdownToHtml(md) {
  return md
    .replace(/^### (.*$)/gim, '<h4 style="margin:0.5rem 0;color:var(--primary);">$1</h4>')
    .replace(/^## (.*$)/gim, '<h3 style="margin:0.5rem 0;color:var(--primary);">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^\> (.*$)/gim, '<blockquote style="border-left:3px solid var(--border-focus);padding-left:0.75rem;margin:0.5rem 0;color:var(--text-muted);font-size:0.8125rem;">$1</blockquote>')
    .replace(/^\* (.*$)/gim, '• $1<br>')
    .replace(/\n/g, '<br>');
}
