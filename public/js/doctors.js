import { api, showToast, renderLoading, renderEmpty, renderError } from './api.js';
import { openBookingModal } from './appointments.js';

export async function initDoctorsPage() {
  await loadSpecializationsFilter();
  await loadDoctors();

  const searchInput = document.getElementById('doctors-search-input');
  const specSelect = document.getElementById('doctors-spec-select');
  const maxFeeInput = document.getElementById('doctors-fee-input');
  const availCheck = document.getElementById('doctors-avail-check');

  const filterHandler = () => {
    loadDoctors({
      search: searchInput?.value || '',
      specialization: specSelect?.value || '',
      max_fee: maxFeeInput?.value || '',
      available: availCheck?.checked ? '1' : '',
    });
  };

  searchInput?.addEventListener('input', debounce(filterHandler, 300));
  specSelect?.addEventListener('change', filterHandler);
  maxFeeInput?.addEventListener('input', debounce(filterHandler, 300));
  availCheck?.addEventListener('change', filterHandler);
}

async function loadSpecializationsFilter() {
  const select = document.getElementById('doctors-spec-select');
  if (!select) return;

  try {
    const res = await api.get('/doctors');
    const specs = res.data?.specializations || [];
    select.innerHTML = '<option value="">All Specializations</option>' +
      specs.map(s => `<option value="${s}">${s}</option>`).join('');
  } catch (e) {}
}

export async function loadDoctors(filters = {}) {
  const container = document.getElementById('doctors-list-container');
  if (!container) return;

  renderLoading(container, 'Searching doctors...');

  try {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.specialization) params.append('specialization', filters.specialization);
    if (filters.max_fee) params.append('max_fee', filters.max_fee);
    if (filters.available) params.append('available', filters.available);

    const res = await api.get(`/doctors?${params.toString()}`);
    const doctors = res.data?.doctors || [];

    if (doctors.length === 0) {
      renderEmpty(container, 'No doctors match your criteria.', '👨‍⚕️');
      return;
    }

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:1.5rem;">
        ${doctors.map(doc => `
          <div class="card" style="display:flex;flex-direction:column;justify-content:space-between;">
            <div>
              <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:0.75rem;">
                <div>
                  <h3 style="font-size:1.15rem;margin-bottom:0.25rem;">Dr. ${doc.name}</h3>
                  <span class="badge badge-primary">${doc.specialization}</span>
                </div>
                <span class="badge ${doc.available ? 'badge-success' : 'badge-danger'}">
                  ${doc.available ? 'Available' : 'Unavailable'}
                </span>
              </div>
              <p style="font-size:0.875rem;color:var(--text-muted);margin-bottom:0.5rem;">
                🎓 <strong>${doc.qualification}</strong> (${doc.experience_years} years exp.)
              </p>
              <p style="font-size:0.875rem;color:var(--text-muted);margin-bottom:0.5rem;">
                🏥 ${doc.hospital_name || 'Associated Medical Center'}
              </p>
              <p style="font-size:0.875rem;color:var(--text-muted);margin-bottom:0.75rem;">
                📍 ${doc.location || 'Consultation Office'}
              </p>
              <p style="font-size:0.875rem;color:var(--text-main);line-height:1.4;margin-bottom:1rem;font-style:italic;">
                "${doc.bio || 'Dedicated medical practitioner.'}"
              </p>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border-light);padding-top:0.875rem;margin-top:auto;">
              <div>
                <span style="font-size:0.75rem;color:var(--text-muted);display:block;">Consultation Fee</span>
                <span style="font-size:1.25rem;font-weight:800;color:var(--primary);">$${doc.consultation_fee}</span>
              </div>
              <button class="btn btn-sm btn-primary book-doctor-btn" data-doc-id="${doc.id}">
                Book Appointment
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Attach booking triggers
    container.querySelectorAll('.book-doctor-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const docId = e.currentTarget.getAttribute('data-doc-id');
        openBookingModal(docId);
      });
    });
  } catch (err) {
    renderError(container, 'Failed to load doctors list.', () => loadDoctors(filters));
  }
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
