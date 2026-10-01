import { api, showToast, formatDate, renderLoading, renderEmpty, renderError } from './api.js';

let currentUser = null;

export async function initBloodNetworkPage(user) {
  currentUser = user;

  // Load donor profile if exists
  await loadDonorStatus();

  // Load blood requests
  await loadBloodRequests();

  // Load registered donors directory
  await loadDonorsDirectory();

  // Attach modal triggers
  document.getElementById('open-donor-modal-btn')?.addEventListener('click', openDonorModal);
  document.getElementById('open-blood-request-btn')?.addEventListener('click', openBloodRequestModal);

  // Status and urgency filters
  document.getElementById('request-urgency-filter')?.addEventListener('change', (e) => {
    loadBloodRequests(e.target.value);
  });
}

async function loadDonorStatus() {
  try {
    const res = await api.get('/auth/me');
    const donor = res.data?.donorProfile;
    const user = res.data?.user;

    const groupEl = document.getElementById('my-blood-group-val');
    const statusEl = document.getElementById('my-donor-status-val');
    const lastEl = document.getElementById('my-last-donation-val');

    if (groupEl) groupEl.textContent = user?.blood_group || 'Not specified';

    if (donor) {
      if (statusEl) {
        statusEl.innerHTML = donor.available && donor.eligible
          ? '<span class="badge badge-success">Active & Eligible</span>'
          : '<span class="badge badge-warning">Inactive / Resting</span>';
      }
      if (lastEl) lastEl.textContent = donor.last_donation_date ? formatDate(donor.last_donation_date) : 'No recorded donations';
    } else {
      if (statusEl) statusEl.innerHTML = '<span class="badge badge-muted">Not Registered</span>';
      if (lastEl) lastEl.textContent = '—';
    }
  } catch (e) {}
}

export async function loadBloodRequests(urgencyFilter = '') {
  const container = document.getElementById('blood-requests-container');
  if (!container) return;

  renderLoading(container, 'Loading blood requests...');

  try {
    let url = '/blood/requests';
    if (urgencyFilter && urgencyFilter !== 'ALL') {
      url += `?urgency=${encodeURIComponent(urgencyFilter)}`;
    }

    const res = await api.get(url);
    const requests = res.data?.requests || [];

    if (requests.length === 0) {
      renderEmpty(container, 'No active blood requests currently needed.', '🩸');
      return;
    }

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:1.5rem;">
        ${requests.map(req => {
          const isEmergency = req.urgency === 'EMERGENCY';
          return `
            <div class="card" style="${isEmergency ? 'border: 2px solid var(--danger); background: #FFF5F5;' : ''}">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.75rem;">
                <div style="display:flex;align-items:center;gap:0.75rem;">
                  <span class="blood-type" style="font-size:1.75rem;padding:0.25rem 0.5rem;background:#FFFFFF;border-radius:var(--radius-md);border:1px solid ${isEmergency ? 'var(--danger)' : 'var(--border-light)'};">
                    ${req.blood_group}
                  </span>
                  <div>
                    <h4 style="font-size:1.05rem;margin:0;">${req.patient_name}</h4>
                    <span style="font-size:0.8125rem;color:var(--text-muted);">${req.units_required} Unit(s) Needed</span>
                  </div>
                </div>
                <span class="badge ${isEmergency ? 'badge-danger' : req.urgency === 'URGENT' ? 'badge-warning' : 'badge-primary'}">
                  ${req.urgency}
                </span>
              </div>
              <p style="font-size:0.875rem;color:var(--text-main);margin-bottom:0.35rem;">
                🏥 <strong>Location:</strong> ${req.location}
              </p>
              ${req.reason ? `
                <p style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:0.75rem;">
                  <strong>Reason:</strong> ${req.reason}
                </p>
              ` : ''}
              <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border-light);padding-top:0.75rem;margin-top:0.5rem;font-size:0.8125rem;">
                <span>Status: <strong class="badge ${req.status === 'FULFILLED' ? 'badge-success' : 'badge-warning'}">${req.status}</strong></span>
                <span style="color:var(--text-muted);">${req.match_count || 0} Donor(s) Alerted</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } catch (err) {
    renderError(container, 'Failed to load blood requests.');
  }
}

async function loadDonorsDirectory() {
  const container = document.getElementById('donors-directory-container');
  if (!container) return;

  renderLoading(container, 'Loading donor network...');

  try {
    const res = await api.get('/blood/donors?available=1');
    const donors = res.data?.donors || [];

    if (donors.length === 0) {
      renderEmpty(container, 'No registered donors found.', '🩸');
      return;
    }

    container.innerHTML = `
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Blood Group</th>
              <th>Donor Name</th>
              <th>Location</th>
              <th>Status</th>
              <th>Last Donated</th>
            </tr>
          </thead>
          <tbody>
            ${donors.map(d => `
              <tr>
                <td><strong class="blood-type" style="font-size:1.1rem;">${d.blood_group}</strong></td>
                <td><strong>${d.donor_name}</strong></td>
                <td>📍 ${d.location}</td>
                <td><span class="badge ${d.available && d.eligible ? 'badge-success' : 'badge-warning'}">${d.available ? 'Ready' : 'Resting'}</span></td>
                <td>${d.last_donation_date ? formatDate(d.last_donation_date) : 'Eligible'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    renderError(container, 'Failed to load donors directory.');
  }
}

function openDonorModal() {
  const modal = document.getElementById('register-donor-modal');
  if (!modal) return;

  modal.classList.add('active');
  document.getElementById('close-donor-modal-btn')?.addEventListener('click', () => {
    modal.classList.remove('active');
  }, { once: true });

  const form = document.getElementById('register-donor-form');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const payload = {
          blood_group: document.getElementById('donor-blood-group-select').value,
          location: document.getElementById('donor-location-input').value,
          last_donation_date: document.getElementById('donor-last-date-input')?.value || null,
          available: document.getElementById('donor-available-check')?.checked ? 1 : 0,
        };

        await api.post('/blood/donors', payload);
        showToast('Registered as blood donor successfully!', 'success');
        modal.classList.remove('active');
        await loadDonorStatus();
        await loadDonorsDirectory();
      } catch (err) {
        showToast(err.message, 'danger');
      }
    };
  }
}

function openBloodRequestModal() {
  const modal = document.getElementById('create-blood-request-modal');
  if (!modal) return;

  modal.classList.add('active');
  document.getElementById('close-request-modal-btn')?.addEventListener('click', () => {
    modal.classList.remove('active');
  }, { once: true });

  const form = document.getElementById('create-blood-request-form');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;

      try {
        const payload = {
          patient_name: document.getElementById('request-patient-name').value,
          blood_group: document.getElementById('request-blood-group-select').value,
          rh_type: document.getElementById('request-rh-type-select').value,
          units_required: document.getElementById('request-units-input').value,
          location: document.getElementById('request-location-input').value,
          urgency: document.getElementById('request-urgency-select').value,
          reason: document.getElementById('request-reason-input').value,
        };

        const res = await api.post('/blood/requests', payload);
        showToast(res.message || 'Blood request created and compatible donors alerted!', 'success');
        modal.classList.remove('active');
        form.reset();
        await loadBloodRequests();
      } catch (err) {
        showToast(err.message, 'danger');
      } finally {
        if (btn) btn.disabled = false;
      }
    };
  }
}
