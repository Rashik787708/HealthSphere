import { api, showToast, formatDate, renderLoading, renderEmpty, renderError } from './api.js';

let currentUser = null;

export async function initMedicalRecordsPage(user) {
  currentUser = user;

  const addBtn = document.getElementById('open-add-record-modal-btn');
  if (addBtn && user.role !== 'DOCTOR' && user.role !== 'ADMIN') {
    addBtn.style.display = 'none';
  }

  const urlParams = new URLSearchParams(window.location.search);
  const patientIdParam = urlParams.get('patient_id');

  await loadRecords(patientIdParam);
  await loadLabResults(patientIdParam);

  // Search filter
  const searchInput = document.getElementById('records-search-input');
  searchInput?.addEventListener('input', () => {
    loadRecords(patientIdParam, searchInput.value);
  });

  // Modal handlers
  addBtn?.addEventListener('click', () => openAddRecordModal(patientIdParam));
}

export async function loadRecords(patientId = null, search = '') {
  const container = document.getElementById('records-timeline-container');
  if (!container) return;

  renderLoading(container, 'Loading medical history...');

  try {
    const params = new URLSearchParams();
    if (patientId) params.append('patient_id', patientId);
    if (search) params.append('search', search);

    const res = await api.get(`/medical-records?${params.toString()}`);
    const records = res.data?.records || [];

    if (records.length === 0) {
      renderEmpty(container, 'No medical records documented yet.', '📋');
      return;
    }

    container.innerHTML = `
      <div class="timeline">
        ${records.map(r => `
          <div class="timeline-item">
            <div class="timeline-dot"></div>
            <div class="timeline-content">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.5rem;flex-wrap:wrap;gap:0.5rem;">
                <div>
                  <h4 style="font-size:1.1rem;color:var(--primary);">${r.diagnosis}</h4>
                  <div style="font-size:0.8125rem;color:var(--text-muted);">
                    Documented by <strong>${r.doctor_name ? 'Dr. ' + r.doctor_name : 'Physician'}</strong> (${r.doctor_specialization || 'General'})
                    ${currentUser.role !== 'PATIENT' ? ` • Patient: <strong>${r.patient_name}</strong>` : ''}
                  </div>
                </div>
                <span class="badge badge-primary">${formatDate(r.created_at)}</span>
              </div>
              ${r.symptoms ? `
                <div style="margin:0.5rem 0;font-size:0.875rem;">
                  <strong>Presenting Symptoms:</strong>
                  <p style="margin-top:0.25rem;color:var(--text-main);">${r.symptoms}</p>
                </div>
              ` : ''}
              ${r.notes ? `
                <div style="margin:0.5rem 0;font-size:0.875rem;">
                  <strong>Clinical Assessment & Notes:</strong>
                  <p style="margin-top:0.25rem;color:var(--text-main);">${r.notes}</p>
                </div>
              ` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    renderError(container, 'Failed to load medical records.', () => loadRecords(patientId, search));
  }
}

async function loadLabResults(patientId = null) {
  const container = document.getElementById('lab-results-list-container');
  if (!container) return;

  renderLoading(container, 'Loading lab results...');

  try {
    const params = new URLSearchParams();
    if (patientId) params.append('patient_id', patientId);

    const res = await api.get(`/lab-results?${params.toString()}`);
    const labs = res.data?.labResults || [];

    if (labs.length === 0) {
      renderEmpty(container, 'No lab diagnostic reports on file.', '🧪');
      return;
    }

    container.innerHTML = `
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Report Date</th>
              <th>Test Name</th>
              <th>Result</th>
              <th>Reference Range</th>
              <th>Ordering Doctor</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${labs.map(l => `
              <tr>
                <td><strong>${formatDate(l.report_date)}</strong></td>
                <td><strong>${l.test_name}</strong></td>
                <td><span class="badge badge-info">${l.result} ${l.unit || ''}</span></td>
                <td>${l.reference_range || 'Standard'}</td>
                <td>${l.doctor_name ? 'Dr. ' + l.doctor_name : 'Medical Lab'}</td>
                <td>${l.notes || '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    renderError(container, 'Failed to load lab results.');
  }
}

function openAddRecordModal(preselectedPatientId = null) {
  const modal = document.getElementById('add-record-modal');
  if (!modal) return;

  const patientIdInput = document.getElementById('record-patient-id');
  if (patientIdInput && preselectedPatientId) {
    patientIdInput.value = preselectedPatientId;
  }

  modal.classList.add('active');

  document.getElementById('close-record-modal-btn')?.addEventListener('click', () => {
    modal.classList.remove('active');
  }, { once: true });

  const form = document.getElementById('add-record-form');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const payload = {
          patient_id: document.getElementById('record-patient-id').value,
          diagnosis: document.getElementById('record-diagnosis').value,
          symptoms: document.getElementById('record-symptoms').value,
          notes: document.getElementById('record-notes').value,
        };

        await api.post('/medical-records', payload);
        showToast('Medical record documented successfully!', 'success');
        modal.classList.remove('active');
        form.reset();
        await loadRecords(payload.patient_id);
      } catch (err) {
        showToast(err.message, 'danger');
      }
    };
  }
}
