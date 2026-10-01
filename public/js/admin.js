import { api, showToast, formatDate, renderLoading, renderEmpty, renderError } from './api.js';

export async function initAdminDashboard() {
  await loadAdminStats();
  await loadAdminUsers();
  await loadAdminAudits();

  // Role filter & search
  document.getElementById('admin-role-filter')?.addEventListener('change', (e) => {
    loadAdminUsers(e.target.value, document.getElementById('admin-user-search')?.value);
  });

  document.getElementById('admin-user-search')?.addEventListener('input', (e) => {
    loadAdminUsers(document.getElementById('admin-role-filter')?.value, e.target.value);
  });
}

async function loadAdminStats() {
  try {
    const res = await api.get('/admin/stats');
    const stats = res.data?.stats;
    if (!stats) return;

    document.getElementById('stat-total-users')?.replaceChildren(document.createTextNode(stats.totalUsers));
    document.getElementById('stat-total-patients')?.replaceChildren(document.createTextNode(stats.patients));
    document.getElementById('stat-total-doctors')?.replaceChildren(document.createTextNode(stats.doctors));
    document.getElementById('stat-total-hospitals')?.replaceChildren(document.createTextNode(stats.hospitals));

    document.getElementById('stat-apts-total')?.replaceChildren(document.createTextNode(stats.appointments.total));
    document.getElementById('stat-apts-pending')?.replaceChildren(document.createTextNode(stats.appointments.pending));
    document.getElementById('stat-apts-confirmed')?.replaceChildren(document.createTextNode(stats.appointments.confirmed));
    document.getElementById('stat-apts-completed')?.replaceChildren(document.createTextNode(stats.appointments.completed));

    document.getElementById('stat-blood-total')?.replaceChildren(document.createTextNode(stats.bloodRequests.total));
    document.getElementById('stat-blood-emg')?.replaceChildren(document.createTextNode(stats.bloodRequests.emergency));
    document.getElementById('stat-active-donors')?.replaceChildren(document.createTextNode(stats.activeDonors));
  } catch (err) {
    showToast('Failed to load system statistics.', 'danger');
  }
}

async function loadAdminUsers(role = '', search = '') {
  const container = document.getElementById('admin-users-table-container');
  if (!container) return;

  renderLoading(container, 'Loading user directory...');

  try {
    const params = new URLSearchParams();
    if (role && role !== 'ALL') params.append('role', role);
    if (search) params.append('search', search);

    const res = await api.get(`/admin/users?${params.toString()}`);
    const users = res.data?.users || [];

    if (users.length === 0) {
      renderEmpty(container, 'No registered accounts found.', '👥');
      return;
    }

    container.innerHTML = `
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Blood Group</th>
              <th>Location</th>
              <th>Registered</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td><strong>${u.name}</strong></td>
                <td>${u.email}</td>
                <td><span class="badge ${getUserRoleBadge(u.role)}">${u.role}</span></td>
                <td>${u.blood_group || '—'}</td>
                <td>${u.location || '—'}</td>
                <td>${formatDate(u.created_at)}</td>
                <td style="text-align:right;">
                  <button class="btn btn-sm btn-secondary change-role-btn" data-id="${u.id}" data-role="${u.role}" data-name="${u.name}">
                    Edit Role
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    container.querySelectorAll('.change-role-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const currentRole = e.currentTarget.getAttribute('data-role');
        const name = e.currentTarget.getAttribute('data-name');
        const newRole = prompt(`Change role for ${name} (PATIENT, DOCTOR, HOSPITAL, ADMIN):`, currentRole);
        if (newRole && newRole.toUpperCase() !== currentRole) {
          try {
            await api.patch('/admin/users', { user_id: id, role: newRole.toUpperCase() });
            showToast(`Role updated to ${newRole.toUpperCase()}`, 'success');
            await loadAdminUsers(role, search);
            await loadAdminStats();
          } catch (err) {
            showToast(err.message, 'danger');
          }
        }
      });
    });
  } catch (err) {
    renderError(container, 'Failed to load users list.');
  }
}

async function loadAdminAudits() {
  const container = document.getElementById('admin-audit-logs-container');
  if (!container) return;

  renderLoading(container, 'Loading audit logs...');

  try {
    const res = await api.get('/admin/audit-logs');
    const logs = res.data?.logs || [];

    if (logs.length === 0) {
      renderEmpty(container, 'No audit entries on record.', '📝');
      return;
    }

    container.innerHTML = `
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>User</th>
              <th>Target Entity</th>
              <th>IP Address</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(l => `
              <tr>
                <td>${new Date(l.created_at).toLocaleString()}</td>
                <td><code>${l.action}</code></td>
                <td>${l.user_name || 'System / Guest'} ${l.user_role ? `(${l.user_role})` : ''}</td>
                <td>${l.entity} (${l.entity_id || '—'})</td>
                <td>${l.ip_address || '127.0.0.1'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    renderError(container, 'Failed to load audit logs.');
  }
}

function getUserRoleBadge(role) {
  switch (role) {
    case 'ADMIN': return 'badge-danger';
    case 'DOCTOR': return 'badge-primary';
    case 'HOSPITAL': return 'badge-warning';
    default: return 'badge-info';
  }
}
