import { api, showToast, formatDate, formatTime, renderLoading, renderEmpty, renderError } from './api.js';

let currentUser = null;

export async function initAppointmentsPage(user) {
  currentUser = user;

  // If user is DOCTOR or ADMIN, adjust booking CTA or permissions
  const bookBtn = document.getElementById('open-book-modal-btn');
  if (bookBtn && user.role !== 'PATIENT' && user.role !== 'ADMIN') {
    bookBtn.style.display = 'none';
  }

  // Load appointments list
  await loadAppointments();

  // Attach modal trigger
  bookBtn?.addEventListener('click', openBookingModal);

  // Status filter tabs/select
  const filterSelect = document.getElementById('appointment-status-filter');
  filterSelect?.addEventListener('change', () => {
    loadAppointments(filterSelect.value);
  });
}

export async function loadAppointments(statusFilter = '') {
  const container = document.getElementById('appointments-table-container');
  if (!container) return;

  renderLoading(container, 'Loading appointments...');

  try {
    let endpoint = '/appointments';
    if (statusFilter && statusFilter !== 'ALL') {
      endpoint += `?status=${encodeURIComponent(statusFilter)}`;
    }

    const res = await api.get(endpoint);
    const appointments = res.data?.appointments || [];

    if (appointments.length === 0) {
      renderEmpty(container, 'No appointments found.', '📅');
      return;
    }

    container.innerHTML = `
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>${currentUser.role === 'DOCTOR' ? 'Patient' : 'Doctor'}</th>
              <th>Department / Specialty</th>
              <th>Reason</th>
              <th>Status</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${appointments.map(apt => `
              <tr>
                <td>
                  <strong>${formatDate(apt.appointment_date)}</strong>
                  <div style="font-size:0.8125rem;color:var(--text-muted);">${formatTime(apt.appointment_time)}</div>
                </td>
                <td>
                  <strong>${currentUser.role === 'DOCTOR' ? apt.patient_name : 'Dr. ' + apt.doctor_name}</strong>
                  <div style="font-size:0.8125rem;color:var(--text-muted);">${currentUser.role === 'DOCTOR' ? (apt.patient_phone || apt.patient_email) : (apt.doctor_hospital || 'Clinic')}</div>
                </td>
                <td>
                  <span class="badge badge-info">${apt.doctor_specialization || 'General'}</span>
                </td>
                <td style="max-width:240px;">
                  <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${apt.reason}">
                    ${apt.reason}
                  </div>
                  ${apt.notes ? `<div style="font-size:0.75rem;color:var(--text-muted);">Notes: ${apt.notes}</div>` : ''}
                </td>
                <td>
                  <span class="badge ${getStatusBadge(apt.status)}">${apt.status}</span>
                </td>
                <td style="text-align:right;">
                  <div style="display:inline-flex;gap:0.35rem;justify-content:flex-end;">
                    ${currentUser.role === 'DOCTOR' && apt.status === 'PENDING' ? `
                      <button class="btn btn-sm btn-primary apt-action-btn" data-id="${apt.id}" data-action="CONFIRMED">Confirm</button>
                      <button class="btn btn-sm btn-outline-danger apt-action-btn" data-id="${apt.id}" data-action="REJECTED">Reject</button>
                    ` : ''}
                    ${currentUser.role === 'DOCTOR' && apt.status === 'CONFIRMED' ? `
                      <button class="btn btn-sm btn-primary apt-action-btn" data-id="${apt.id}" data-action="COMPLETED">Complete</button>
                      <a href="/prescriptions.html?patient_id=${apt.patient_id}&appointment_id=${apt.id}" class="btn btn-sm btn-secondary" title="Prescribe">Rx</a>
                    ` : ''}
                    ${currentUser.role === 'PATIENT' && (apt.status === 'PENDING' || apt.status === 'CONFIRMED') ? `
                      <button class="btn btn-sm btn-outline-danger apt-action-btn" data-id="${apt.id}" data-action="CANCELLED">Cancel</button>
                    ` : ''}
                    ${apt.status === 'COMPLETED' ? `
                      <a href="/medical-records.html?patient_id=${apt.patient_id}" class="btn btn-sm btn-secondary">Record</a>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Attach action events
    container.querySelectorAll('.apt-action-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const aptId = e.currentTarget.getAttribute('data-id');
        const action = e.currentTarget.getAttribute('data-action');
        if (confirm(`Confirm changing appointment status to ${action}?`)) {
          try {
            await api.post('/appointments/status', { appointment_id: aptId, status: action });
            showToast(`Appointment status updated to ${action}`, 'success');
            loadAppointments(statusFilter);
          } catch (err) {
            showToast(err.message, 'danger');
          }
        }
      });
    });
  } catch (err) {
    renderError(container, 'Failed to load appointments.', () => loadAppointments(statusFilter));
  }
}

function getStatusBadge(status) {
  switch (status) {
    case 'CONFIRMED': return 'badge-success';
    case 'PENDING': return 'badge-warning';
    case 'COMPLETED': return 'badge-primary';
    case 'CANCELLED':
    case 'REJECTED': return 'badge-danger';
    default: return 'badge-muted';
  }
}

export async function openBookingModal(preselectedDoctorId = null) {
  const modal = document.getElementById('book-appointment-modal');
  if (!modal) return;

  const doctorSelect = document.getElementById('booking-doctor-select');
  const dateInput = document.getElementById('booking-date-input');

  // Set min date to today
  const todayStr = new Date().toISOString().split('T')[0];
  if (dateInput) {
    dateInput.min = todayStr;
    if (!dateInput.value) dateInput.value = todayStr;
  }

  // Populate doctors dropdown
  if (doctorSelect) {
    doctorSelect.innerHTML = '<option value="">Loading verified doctors...</option>';
    try {
      const res = await api.get('/doctors?available=1');
      const docs = res.data?.doctors || [];
      doctorSelect.innerHTML = '<option value="">Select a Doctor</option>' +
        docs.map(d => `
          <option value="${d.id}" ${preselectedDoctorId === d.id ? 'selected' : ''}>
            Dr. ${d.name} (${d.specialization}) - $${d.consultation_fee}
          </option>
        `).join('');
    } catch (e) {
      doctorSelect.innerHTML = '<option value="">Error loading doctors</option>';
    }
  }

  modal.classList.add('active');

  const closeBtn = document.getElementById('close-book-modal-btn');
  const form = document.getElementById('book-appointment-form');

  closeBtn?.addEventListener('click', () => modal.classList.remove('active'), { once: true });

  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const payload = {
          doctor_id: document.getElementById('booking-doctor-select').value,
          appointment_date: document.getElementById('booking-date-input').value,
          appointment_time: document.getElementById('booking-time-select').value,
          reason: document.getElementById('booking-reason-input').value,
          notes: document.getElementById('booking-notes-input')?.value || '',
        };

        const res = await api.post('/appointments', payload);
        showToast(res.message || 'Appointment requested successfully!', 'success');
        modal.classList.remove('active');
        form.reset();
        await loadAppointments();
      } catch (err) {
        showToast(err.message, 'danger');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    };
  }
}
