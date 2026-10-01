import { api, showToast, formatDate, renderLoading, renderEmpty, renderError } from './api.js';

let currentUser = null;

export async function initPrescriptionsPage(user) {
  currentUser = user;

  const createBtn = document.getElementById('open-create-rx-btn');
  if (createBtn && user.role !== 'DOCTOR' && user.role !== 'ADMIN') {
    createBtn.style.display = 'none';
  }

  const urlParams = new URLSearchParams(window.location.search);
  const patientIdParam = urlParams.get('patient_id');
  const appointmentIdParam = urlParams.get('appointment_id');
  const rxIdParam = urlParams.get('id');

  if (rxIdParam) {
    // Directly open printable view
    openPrintablePrescription(rxIdParam);
  }

  await loadPrescriptions(patientIdParam);

  createBtn?.addEventListener('click', () => {
    openCreatePrescriptionModal(patientIdParam, appointmentIdParam);
  });
}

export async function loadPrescriptions(patientId = null) {
  const container = document.getElementById('prescriptions-grid-container');
  if (!container) return;

  renderLoading(container, 'Loading prescriptions...');

  try {
    const params = new URLSearchParams();
    if (patientId) params.append('patient_id', patientId);

    const res = await api.get(`/prescriptions?${params.toString()}`);
    const prescriptions = res.data?.prescriptions || [];

    if (prescriptions.length === 0) {
      renderEmpty(container, 'No prescriptions on file.', '💊');
      return;
    }

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:1.5rem;">
        ${prescriptions.map(rx => `
          <div class="card" style="display:flex;flex-direction:column;justify-content:space-between;">
            <div>
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.75rem;">
                <div>
                  <span style="font-size:1.5rem;font-weight:900;color:var(--primary);font-family:Georgia,serif;">℞</span>
                  <h3 style="font-size:1.2rem;display:inline-block;margin-left:0.35rem;">${rx.medication_name}</h3>
                </div>
                <span class="badge badge-primary">${formatDate(rx.created_at)}</span>
              </div>
              <div style="background:var(--bg-muted);padding:0.75rem;border-radius:var(--radius-md);margin-bottom:0.75rem;">
                <div style="display:flex;justify-content:space-between;margin-bottom:0.25rem;font-size:0.875rem;">
                  <span><strong>Dosage:</strong> ${rx.dosage}</span>
                  <span><strong>Duration:</strong> ${rx.duration}</span>
                </div>
                <div style="font-size:0.875rem;">
                  <strong>Frequency:</strong> ${rx.frequency}
                </div>
              </div>
              ${rx.instructions ? `
                <p style="font-size:0.875rem;color:var(--text-main);margin-bottom:0.75rem;">
                  <strong>Instructions:</strong> ${rx.instructions}
                </p>
              ` : ''}
              <p style="font-size:0.8125rem;color:var(--text-muted);">
                Prescribed by <strong>Dr. ${rx.doctor_name}</strong> (${rx.doctor_hospital || 'Medical Center'})
              </p>
              ${currentUser.role !== 'PATIENT' ? `
                <p style="font-size:0.8125rem;color:var(--text-muted);">Patient: <strong>${rx.patient_name}</strong></p>
              ` : ''}
            </div>
            <div style="border-top:1px solid var(--border-light);padding-top:0.75rem;margin-top:1rem;display:flex;justify-content:flex-end;">
              <button class="btn btn-sm btn-secondary view-rx-btn" data-id="${rx.id}">
                🖨️ View & Print Rx
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    container.querySelectorAll('.view-rx-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        openPrintablePrescription(id);
      });
    });
  } catch (err) {
    renderError(container, 'Failed to load prescriptions.', () => loadPrescriptions(patientId));
  }
}

export async function openPrintablePrescription(id) {
  try {
    const res = await api.get(`/prescriptions?id=${id}`);
    const rx = res.data?.prescription;
    if (!rx) {
      showToast('Prescription details not found.', 'danger');
      return;
    }

    const modal = document.getElementById('printable-rx-modal');
    const area = document.getElementById('rx-print-content');
    if (!modal || !area) return;

    area.innerHTML = `
      <div class="prescription-print-area" style="padding:1.5rem;background:#fff;border-radius:var(--radius-md);">
        <div class="rx-header">
          <div>
            <h2 style="color:var(--primary);margin-bottom:0.25rem;">${rx.doctor_hospital || 'HealthSphere Medical Center'}</h2>
            <p style="font-size:0.875rem;color:var(--text-main);margin:0;"><strong>Dr. ${rx.doctor_name}, ${rx.doctor_qualification || 'MD'}</strong></p>
            <p style="font-size:0.8125rem;color:var(--text-muted);margin:0;">Specialization: ${rx.doctor_specialization || 'Clinical Medicine'} | License: ${rx.doctor_license || 'N/A'}</p>
          </div>
          <div style="text-align:right;">
            <div class="brand-logo" style="justify-content:flex-end;margin-bottom:0.25rem;">
              <div class="brand-icon" style="width:1.75rem;height:1.75rem;font-size:0.9rem;">⚕</div>
              <span>HealthSphere</span>
            </div>
            <p style="font-size:0.8125rem;color:var(--text-muted);margin:0;">Date: ${formatDate(rx.created_at)}</p>
            <p style="font-size:0.8125rem;color:var(--text-muted);margin:0;">Rx ID: ${rx.id}</p>
          </div>
        </div>

        <div style="background:var(--bg-muted);padding:0.75rem 1rem;border-radius:var(--radius-sm);display:flex;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;font-size:0.875rem;margin-bottom:1.5rem;">
          <span><strong>Patient:</strong> ${rx.patient_name}</span>
          <span><strong>Gender:</strong> ${rx.patient_gender || 'Unspecified'}</span>
          <span><strong>Blood Group:</strong> ${rx.patient_blood_group || 'N/A'}</span>
          <span><strong>Location:</strong> ${rx.patient_location || 'N/A'}</span>
        </div>

        <div class="rx-symbol">℞</div>

        <table class="rx-med-table">
          <thead>
            <tr>
              <th>Medication Name</th>
              <th>Dosage</th>
              <th>Frequency</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>${rx.medication_name}</strong></td>
              <td>${rx.dosage}</td>
              <td>${rx.frequency}</td>
              <td>${rx.duration}</td>
            </tr>
          </tbody>
        </table>

        ${rx.instructions ? `
          <div style="margin:1.5rem 0;padding:1rem;border-left:3px solid var(--primary);background:var(--primary-subtle);border-radius:var(--radius-sm);">
            <strong>Patient Directions & Instructions:</strong>
            <p style="margin-top:0.25rem;color:var(--text-main);">${rx.instructions}</p>
          </div>
        ` : ''}

        <div class="rx-footer">
          <div>
            <p style="font-size:0.75rem;color:var(--text-muted);max-width:320px;">
              Digital Prescription verified via HealthSphere Healthcare Network. Take medication strictly as indicated.
            </p>
          </div>
          <div style="text-align:right;">
            <div style="border-bottom:1px solid #000;width:180px;height:40px;margin-bottom:0.25rem;"></div>
            <p style="font-size:0.8125rem;font-weight:700;margin:0;">Dr. ${rx.doctor_name}</p>
            <p style="font-size:0.75rem;color:var(--text-muted);margin:0;">Authorized Digital Signature</p>
          </div>
        </div>
      </div>
    `;

    modal.classList.add('active');

    document.getElementById('close-rx-modal-btn')?.addEventListener('click', () => {
      modal.classList.remove('active');
    }, { once: true });

    document.getElementById('print-rx-btn')?.addEventListener('click', () => {
      window.print();
    });
  } catch (err) {
    showToast('Failed to load printable prescription.', 'danger');
  }
}

function openCreatePrescriptionModal(patientId = null, appointmentId = null) {
  const modal = document.getElementById('create-rx-modal');
  if (!modal) return;

  const patInput = document.getElementById('create-rx-patient-id');
  const aptInput = document.getElementById('create-rx-appointment-id');

  if (patInput && patientId) patInput.value = patientId;
  if (aptInput && appointmentId) aptInput.value = appointmentId;

  modal.classList.add('active');

  document.getElementById('close-create-rx-modal-btn')?.addEventListener('click', () => {
    modal.classList.remove('active');
  }, { once: true });

  const form = document.getElementById('create-rx-form');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const payload = {
          patient_id: document.getElementById('create-rx-patient-id').value,
          appointment_id: document.getElementById('create-rx-appointment-id')?.value || null,
          medication_name: document.getElementById('create-rx-medication').value,
          dosage: document.getElementById('create-rx-dosage').value,
          frequency: document.getElementById('create-rx-frequency').value,
          duration: document.getElementById('create-rx-duration').value,
          instructions: document.getElementById('create-rx-instructions').value,
        };

        await api.post('/prescriptions', payload);
        showToast('Prescription issued successfully!', 'success');
        modal.classList.remove('active');
        form.reset();
        await loadPrescriptions(payload.patient_id);
      } catch (err) {
        showToast(err.message, 'danger');
      }
    };
  }
}
