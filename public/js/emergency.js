import { api, showToast, formatDate, renderLoading, renderEmpty, renderError } from './api.js';

export async function initEmergencyPage() {
  await loadEmergencyRequests();

  // Instant trigger to create emergency request
  document.getElementById('instant-emergency-request-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('emergency-request-modal');
    if (modal) modal.classList.add('active');
  });

  document.getElementById('close-emergency-modal-btn')?.addEventListener('click', () => {
    document.getElementById('emergency-request-modal')?.classList.remove('active');
  });

  const form = document.getElementById('emergency-request-form');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;

      try {
        const payload = {
          patient_name: document.getElementById('emg-patient-name').value,
          blood_group: document.getElementById('emg-blood-group').value,
          rh_type: document.getElementById('emg-rh-type').value,
          units_required: document.getElementById('emg-units').value,
          location: document.getElementById('emg-location').value,
          urgency: 'EMERGENCY',
          reason: document.getElementById('emg-reason').value,
        };

        const res = await api.post('/blood/requests', payload);
        showToast(res.message || '🚨 Emergency broadcast dispatched to compatible donors!', 'danger');
        document.getElementById('emergency-request-modal')?.classList.remove('active');
        form.reset();
        await loadEmergencyRequests();
      } catch (err) {
        showToast(err.message, 'danger');
      } finally {
        if (btn) btn.disabled = false;
      }
    };
  }
}

async function loadEmergencyRequests() {
  const container = document.getElementById('emergency-requests-container');
  if (!container) return;

  renderLoading(container, 'Checking active emergency requests...');

  try {
    const res = await api.get('/blood/emergency');
    const requests = res.data?.emergencyRequests || [];

    if (requests.length === 0) {
      container.innerHTML = `
        <div class="state-container" style="background:#F0FDF4;border-color:#86EFAC;">
          <div class="state-icon">✅</div>
          <h3 style="color:var(--success);margin-bottom:0.5rem;">No Active Critical Emergency Blood Requests</h3>
          <p style="color:var(--text-muted);">All regional trauma and hospital emergency requirements are currently fulfilled.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = requests.map(req => `
      <div class="card" style="border:2px solid var(--danger);box-shadow:var(--shadow-lg);margin-bottom:1.5rem;background:#FFFBFB;">
        <div style="background:var(--danger);color:#fff;padding:0.625rem 1rem;border-top-left-radius:calc(var(--radius-lg) - 2px);border-top-right-radius:calc(var(--radius-lg) - 2px);display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:800;letter-spacing:0.05em;display:flex;align-items:center;gap:0.5rem;">
            🚨 EMERGENCY BLOOD REQUEST
          </span>
          <span style="font-size:0.8125rem;">Dispatched ${new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div style="padding:1.5rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;margin-bottom:1rem;">
            <div style="display:flex;align-items:center;gap:1.25rem;">
              <div class="blood-type" style="font-size:2.5rem;padding:0.25rem 1rem;background:#FFFFFF;border-radius:var(--radius-md);border:2px solid var(--danger);">
                ${req.blood_group}
              </div>
              <div>
                <h3 style="font-size:1.35rem;margin:0 0 0.25rem 0;">${req.patient_name}</h3>
                <p style="font-size:0.9375rem;color:var(--danger);font-weight:700;margin:0;">
                  ⚡ Requires ${req.units_required} Unit(s) Immediately
                </p>
              </div>
            </div>
            <button class="btn btn-danger respond-emergency-btn" data-req-id="${req.id}" data-bg="${req.blood_group}">
              I Can Donate (${req.blood_group})
            </button>
          </div>

          <div style="background:var(--bg-surface);padding:1rem;border-radius:var(--radius-md);border:1px solid var(--border-light);margin-bottom:1rem;">
            <p style="font-size:0.9375rem;margin-bottom:0.35rem;">
              📍 <strong>Hospital & ER Location:</strong> ${req.location}
            </p>
            <p style="font-size:0.875rem;color:var(--text-muted);margin:0;">
              <strong>Clinical Urgency:</strong> ${req.reason || 'Critical trauma transfusion'}
            </p>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.8125rem;color:var(--text-muted);">
            <span>${req.match_count || 0} registered donor(s) notified in radius</span>
            <span>Requester: ${req.requester_name} (${req.requester_phone || 'Hospital ER Desk'})</span>
          </div>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.respond-emergency-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const bloodGroup = e.currentTarget.getAttribute('data-bg');
        alert(`Thank you for stepping up! Please proceed immediately to the ER reception or call the transfusion desk with your donor ID for patient matching.`);
      });
    });
  } catch (err) {
    renderError(container, 'Failed to load emergency requests.');
  }
}
