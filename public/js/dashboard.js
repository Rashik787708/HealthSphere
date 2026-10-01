import { api, showToast, formatDate, formatTime, renderLoading, renderEmpty, renderError } from './api.js';

export async function initPatientDashboard(user) {
  // Set welcome message
  const welcomeEl = document.getElementById('patient-welcome-name');
  if (welcomeEl) welcomeEl.textContent = user.name;

  const bloodGroupEl = document.getElementById('overview-blood-group');
  if (bloodGroupEl) bloodGroupEl.textContent = user.blood_group || 'Not Set';

  // Load upcoming appointments
  await loadPatientAppointments();

  // Load wellness & prescriptions summary
  await loadPatientOverviewMetrics();
}

async function loadPatientAppointments() {
  const container = document.getElementById('upcoming-appointments-list');
  if (!container) return;

  renderLoading(container, 'Loading upcoming visits...');

  try {
    const res = await api.get('/appointments');
    const appointments = res.data?.appointments || [];

    if (appointments.length === 0) {
      renderEmpty(container, 'No upcoming appointments scheduled.', '📅');
      return;
    }

    // Display the next appointments
    const upcoming = appointments.filter(a => a.status === 'CONFIRMED' || a.status === 'PENDING').slice(0, 3);

    if (upcoming.length === 0) {
      renderEmpty(container, 'No upcoming appointments scheduled.', '📅');
      return;
    }

    container.innerHTML = upcoming.map(apt => `
      <div class="appointment-item">
        <div class="appointment-info">
          <h4>Dr. ${apt.doctor_name} <span class="badge ${apt.status === 'CONFIRMED' ? 'badge-success' : 'badge-warning'}">${apt.status}</span></h4>
          <div class="appointment-meta">
            <span>📅 ${formatDate(apt.appointment_date)}</span>
            <span>⏰ ${formatTime(apt.appointment_time)}</span>
            <span>🏥 ${apt.doctor_hospital || 'Clinic'}</span>
          </div>
          <p style="font-size:0.8125rem;margin-top:0.35rem;color:var(--text-main);"><strong>Reason:</strong> ${apt.reason}</p>
        </div>
        <div>
          ${apt.status === 'PENDING' || apt.status === 'CONFIRMED' ? `
            <button class="btn btn-sm btn-outline-danger cancel-apt-btn" data-id="${apt.id}">Cancel</button>
          ` : ''}
        </div>
      </div>
    `).join('');

    // Attach cancel handler
    container.querySelectorAll('.cancel-apt-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const aptId = e.currentTarget.getAttribute('data-id');
        if (confirm('Are you sure you want to cancel this appointment?')) {
          try {
            await api.post('/appointments/status', { appointment_id: aptId, status: 'CANCELLED' });
            showToast('Appointment cancelled successfully', 'info');
            loadPatientAppointments();
          } catch (err) {
            showToast(err.message, 'danger');
          }
        }
      });
    });
  } catch (err) {
    renderError(container, 'Unable to load appointments.', loadPatientAppointments);
  }
}

async function loadPatientOverviewMetrics() {
  try {
    // 1. Prescriptions
    const rxRes = await api.get('/prescriptions');
    const rxCountEl = document.getElementById('overview-prescriptions-count');
    if (rxCountEl) rxCountEl.textContent = rxRes.data?.prescriptions?.length || 0;

    // 2. Wellness summary
    const wellRes = await api.get('/wellness');
    const summary = wellRes.data?.summary;
    if (summary) {
      const sleepEl = document.getElementById('overview-sleep-hours');
      const waterEl = document.getElementById('overview-water-intake');
      const exerciseEl = document.getElementById('overview-exercise-mins');

      if (sleepEl) sleepEl.textContent = `${summary.avgSleepHours} hrs`;
      if (waterEl) waterEl.textContent = `${summary.avgWaterIntakeLiters} L`;
      if (exerciseEl) exerciseEl.textContent = `${summary.totalExerciseMinutes} mins`;
    }
  } catch (e) {
    // Non-fatal
  }
}

export async function initDoctorDashboard(user) {
  const welcomeEl = document.getElementById('doctor-welcome-name');
  if (welcomeEl) welcomeEl.textContent = user.name;

  await loadDoctorMetrics();
  await loadDoctorAppointments();
}

async function loadDoctorMetrics() {
  try {
    const res = await api.get('/appointments');
    const appointments = res.data?.appointments || [];

    const todayStr = new Date().toISOString().split('T')[0];
    const todayApts = appointments.filter(a => a.appointment_date === todayStr);
    const pendingApts = appointments.filter(a => a.status === 'PENDING');
    const completedApts = appointments.filter(a => a.status === 'COMPLETED');

    // Unique patients
    const patientIds = new Set(appointments.map(a => a.patient_id));

    document.getElementById('doc-metric-today')?.replaceChildren(document.createTextNode(todayApts.length));
    document.getElementById('doc-metric-pending')?.replaceChildren(document.createTextNode(pendingApts.length));
    document.getElementById('doc-metric-completed')?.replaceChildren(document.createTextNode(completedApts.length));
    document.getElementById('doc-metric-patients')?.replaceChildren(document.createTextNode(patientIds.size));
  } catch (e) {}
}

async function loadDoctorAppointments() {
  const container = document.getElementById('doctor-appointments-list');
  if (!container) return;

  renderLoading(container, 'Loading appointments...');

  try {
    const res = await api.get('/appointments');
    const appointments = res.data?.appointments || [];

    if (appointments.length === 0) {
      renderEmpty(container, 'No appointments booked yet.', '🩺');
      return;
    }

    container.innerHTML = appointments.slice(0, 10).map(apt => `
      <div class="appointment-item">
        <div class="appointment-info">
          <h4>${apt.patient_name} <span class="badge ${apt.status === 'CONFIRMED' ? 'badge-success' : apt.status === 'PENDING' ? 'badge-warning' : apt.status === 'COMPLETED' ? 'badge-primary' : 'badge-danger'}">${apt.status}</span></h4>
          <div class="appointment-meta">
            <span>📅 ${formatDate(apt.appointment_date)}</span>
            <span>⏰ ${formatTime(apt.appointment_time)}</span>
            <span>🩸 Blood: ${apt.patient_blood_group || 'N/A'}</span>
            <span>📞 ${apt.patient_phone || 'N/A'}</span>
          </div>
          <p style="font-size:0.8125rem;margin-top:0.35rem;color:var(--text-main);"><strong>Reason:</strong> ${apt.reason}</p>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          ${apt.status === 'PENDING' ? `
            <button class="btn btn-sm btn-primary action-status-btn" data-id="${apt.id}" data-status="CONFIRMED">Confirm</button>
            <button class="btn btn-sm btn-outline-danger action-status-btn" data-id="${apt.id}" data-status="REJECTED">Reject</button>
          ` : ''}
          ${apt.status === 'CONFIRMED' ? `
            <button class="btn btn-sm btn-primary action-status-btn" data-id="${apt.id}" data-status="COMPLETED">Complete Visit</button>
            <a href="/prescriptions.html?patient_id=${apt.patient_id}&appointment_id=${apt.id}" class="btn btn-sm btn-secondary">Prescribe</a>
          ` : ''}
          ${apt.status === 'COMPLETED' ? `
            <a href="/medical-records.html?patient_id=${apt.patient_id}" class="btn btn-sm btn-secondary">View Records</a>
          ` : ''}
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.action-status-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const aptId = e.currentTarget.getAttribute('data-id');
        const status = e.currentTarget.getAttribute('data-status');
        try {
          await api.post('/appointments/status', { appointment_id: aptId, status });
          showToast(`Appointment status updated to ${status}`, 'success');
          loadDoctorMetrics();
          loadDoctorAppointments();
        } catch (err) {
          showToast(err.message, 'danger');
        }
      });
    });
  } catch (err) {
    renderError(container, 'Failed to load appointments.', loadDoctorAppointments);
  }
}
