import { api, setToken, showToast } from './api.js';

let currentUser = null;

export async function getCurrentUser() {
  if (currentUser) return currentUser;
  try {
    const res = await api.get('/auth/me');
    if (res.success && res.data?.user) {
      currentUser = res.data.user;
      return currentUser;
    }
  } catch (err) {
    currentUser = null;
  }
  return null;
}

export async function checkAuth(allowedRoles = []) {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.pathname)}`;
    return null;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    // Redirect to their default dashboard
    if (user.role === 'DOCTOR') window.location.href = '/doctor-dashboard.html';
    else if (user.role === 'ADMIN') window.location.href = '/admin-dashboard.html';
    else window.location.href = '/patient-dashboard.html';
    return null;
  }

  return user;
}

export async function logout() {
  try {
    await api.post('/auth/logout', {});
  } catch (e) {
    // ignore
  }
  setToken(null);
  currentUser = null;
  window.location.href = '/login.html';
}

/**
 * Render Header, Navigation, and Mobile Drawer across pages
 */
export async function setupNavigation(activePage = '') {
  const user = await getCurrentUser();
  const navContainer = document.querySelector('header');
  if (!navContainer) return;

  // 1. Check emergency blood alerts first to display top banner
  await loadEmergencyBanner();

  let navLinksHtml = '';
  let dashboardUrl = '/';

  if (user) {
    if (user.role === 'PATIENT') {
      dashboardUrl = '/patient-dashboard.html';
      navLinksHtml = `
        <li class="nav-item ${activePage === 'dashboard' ? 'active' : ''}"><a href="/patient-dashboard.html">Dashboard</a></li>
        <li class="nav-item ${activePage === 'appointments' ? 'active' : ''}"><a href="/appointments.html">Appointments</a></li>
        <li class="nav-item ${activePage === 'doctors' ? 'active' : ''}"><a href="/doctors.html">Find Doctors</a></li>
        <li class="nav-item ${activePage === 'records' ? 'active' : ''}"><a href="/medical-records.html">Records</a></li>
        <li class="nav-item ${activePage === 'prescriptions' ? 'active' : ''}"><a href="/prescriptions.html">Prescriptions</a></li>
        <li class="nav-item ${activePage === 'wellness' ? 'active' : ''}"><a href="/wellness.html">Wellness</a></li>
        <li class="nav-item ${activePage === 'blood' ? 'active' : ''}"><a href="/blood-network.html">Blood Network</a></li>
      `;
    } else if (user.role === 'DOCTOR') {
      dashboardUrl = '/doctor-dashboard.html';
      navLinksHtml = `
        <li class="nav-item ${activePage === 'dashboard' ? 'active' : ''}"><a href="/doctor-dashboard.html">Dashboard</a></li>
        <li class="nav-item ${activePage === 'appointments' ? 'active' : ''}"><a href="/appointments.html">Appointments</a></li>
        <li class="nav-item ${activePage === 'records' ? 'active' : ''}"><a href="/medical-records.html">Patient Records</a></li>
        <li class="nav-item ${activePage === 'prescriptions' ? 'active' : ''}"><a href="/prescriptions.html">Prescriptions</a></li>
        <li class="nav-item ${activePage === 'blood' ? 'active' : ''}"><a href="/blood-network.html">Blood Network</a></li>
      `;
    } else if (user.role === 'ADMIN') {
      dashboardUrl = '/admin-dashboard.html';
      navLinksHtml = `
        <li class="nav-item ${activePage === 'dashboard' ? 'active' : ''}"><a href="/admin-dashboard.html">Admin Overview</a></li>
        <li class="nav-item ${activePage === 'appointments' ? 'active' : ''}"><a href="/appointments.html">Appointments</a></li>
        <li class="nav-item ${activePage === 'doctors' ? 'active' : ''}"><a href="/doctors.html">Doctors</a></li>
        <li class="nav-item ${activePage === 'blood' ? 'active' : ''}"><a href="/blood-network.html">Blood Requests</a></li>
      `;
    } else if (user.role === 'HOSPITAL') {
      dashboardUrl = '/blood-network.html';
      navLinksHtml = `
        <li class="nav-item ${activePage === 'blood' ? 'active' : ''}"><a href="/blood-network.html">Blood Portal</a></li>
        <li class="nav-item ${activePage === 'emergency' ? 'active' : ''}"><a href="/emergency.html">Emergency</a></li>
      `;
    }
  } else {
    navLinksHtml = `
      <li class="nav-item ${activePage === 'home' ? 'active' : ''}"><a href="/index.html">Home</a></li>
      <li class="nav-item"><a href="/doctors.html">Doctors</a></li>
      <li class="nav-item"><a href="/blood-network.html">Blood Network</a></li>
      <li class="nav-item"><a href="/emergency.html" style="color:var(--danger);font-weight:700;">🚨 Emergency</a></li>
    `;
  }

  // User action buttons or Login/Register
  let userActionsHtml = '';
  if (user) {
    userActionsHtml = `
      <a href="/emergency.html" class="btn btn-sm btn-outline-danger" title="Emergency Blood Portal" style="font-weight:700;">
        🚨 Emergency
      </a>
      <button class="nav-btn-icon" id="notif-bell-btn" title="Notifications" onclick="window.toggleNotificationModal()">
        🔔
        <span class="notif-badge" id="nav-notif-count" style="display:none;">0</span>
      </button>
      <div style="position:relative;">
        <button class="user-menu-btn" id="user-profile-menu-btn">
          <span class="user-avatar-sm">${user.name.charAt(0).toUpperCase()}</span>
          <span>${user.name.split(' ')[0]}</span>
          <span style="font-size:0.75rem;">▼</span>
        </button>
        <div id="user-dropdown-menu" style="display:none;position:absolute;right:0;top:110%;width:180px;background:#fff;border:1px solid var(--border-light);border-radius:var(--radius-md);box-shadow:var(--shadow-lg);padding:0.5rem;z-index:200;">
          <a href="/profile.html" style="display:block;padding:0.5rem 0.75rem;border-radius:var(--radius-sm);color:var(--text-main);font-size:0.875rem;">👤 Profile Settings</a>
          <a href="${dashboardUrl}" style="display:block;padding:0.5rem 0.75rem;border-radius:var(--radius-sm);color:var(--text-main);font-size:0.875rem;">📊 Dashboard</a>
          <hr style="border:none;border-top:1px solid var(--border-light);margin:0.25rem 0;">
          <button id="logout-menu-btn" style="width:100%;text-align:left;background:none;border:none;padding:0.5rem 0.75rem;color:var(--danger);cursor:pointer;font-size:0.875rem;font-weight:600;">🚪 Log Out</button>
        </div>
      </div>
    `;
  } else {
    userActionsHtml = `
      <a href="/login.html" class="btn btn-secondary btn-sm">Log In</a>
      <a href="/register.html" class="btn btn-primary btn-sm">Sign Up</a>
    `;
  }

  navContainer.innerHTML = `
    <nav class="navbar">
      <div class="container nav-container">
        <a href="${dashboardUrl}" class="brand-logo">
          <div class="brand-icon">⚕</div>
          <span>HealthSphere</span>
        </a>
        <ul class="nav-links">
          ${navLinksHtml}
        </ul>
        <div class="nav-actions">
          ${userActionsHtml}
          <button class="hamburger-btn" id="hamburger-toggle-btn" aria-label="Open navigation menu">☰</button>
        </div>
      </div>
    </nav>
    <!-- Mobile Navigation Drawer -->
    <div class="drawer-backdrop" id="mobile-drawer-backdrop"></div>
    <div class="mobile-drawer" id="mobile-drawer">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <a href="${dashboardUrl}" class="brand-logo">
          <div class="brand-icon">⚕</div>
          <span>HealthSphere</span>
        </a>
        <button id="close-drawer-btn" style="background:none;border:none;font-size:1.5rem;cursor:pointer;">&times;</button>
      </div>
      <ul style="list-style:none;display:flex;flex-direction:column;gap:0.75rem;">
        ${navLinksHtml}
        ${user ? `<li class="nav-item"><a href="/profile.html">Profile Settings</a></li>` : ''}
      </ul>
      <div style="margin-top:auto;padding-top:1rem;border-top:1px solid var(--border-light);">
        ${user 
          ? `<button class="btn btn-danger btn-sm" style="width:100%;" id="mobile-logout-btn">Log Out</button>` 
          : `<div style="display:flex;gap:0.5rem;"><a href="/login.html" class="btn btn-secondary btn-sm" style="flex:1;">Log In</a><a href="/register.html" class="btn btn-primary btn-sm" style="flex:1;">Sign Up</a></div>`
        }
      </div>
    </div>
    <!-- In-App Notification Modal -->
    <div class="modal-overlay" id="notifications-modal">
      <div class="modal-dialog" style="max-width: 480px;">
        <div class="modal-header">
          <h3 class="modal-title">🔔 Notifications</h3>
          <div style="display:flex;gap:0.5rem;align-items:center;">
            <button class="btn btn-sm btn-secondary" id="mark-all-read-btn">Mark all read</button>
            <button class="close-modal-btn" onclick="window.toggleNotificationModal()">&times;</button>
          </div>
        </div>
        <div class="modal-body" id="notifications-list" style="max-height: 400px; overflow-y: auto;">
          <p style="text-align:center;color:var(--text-muted);">Loading notifications...</p>
        </div>
      </div>
    </div>
  `;

  // Attach navbar events
  const userMenuBtn = document.getElementById('user-profile-menu-btn');
  const userDropdown = document.getElementById('user-dropdown-menu');
  if (userMenuBtn && userDropdown) {
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.style.display = userDropdown.style.display === 'block' ? 'none' : 'block';
    });
    document.addEventListener('click', () => {
      userDropdown.style.display = 'none';
    });
  }

  document.getElementById('logout-menu-btn')?.addEventListener('click', logout);
  document.getElementById('mobile-logout-btn')?.addEventListener('click', logout);

  // Mobile drawer controls
  const hamburgerBtn = document.getElementById('hamburger-toggle-btn');
  const closeDrawerBtn = document.getElementById('close-drawer-btn');
  const drawer = document.getElementById('mobile-drawer');
  const backdrop = document.getElementById('mobile-drawer-backdrop');

  const toggleDrawer = () => {
    drawer.classList.toggle('open');
    backdrop.classList.toggle('active');
  };

  hamburgerBtn?.addEventListener('click', toggleDrawer);
  closeDrawerBtn?.addEventListener('click', toggleDrawer);
  backdrop?.addEventListener('click', toggleDrawer);

  // Fetch unread notifications count if user logged in
  if (user) {
    updateNotificationBadge();
  }
}

/**
 * Top emergency blood banner loader
 */
export async function loadEmergencyBanner() {
  try {
    const res = await api.get('/blood/emergency');
    if (res.success && res.data?.emergencyRequests?.length > 0) {
      const topReq = res.data.emergencyRequests[0];
      let existingBanner = document.getElementById('healthsphere-emergency-banner');
      if (!existingBanner) {
        existingBanner = document.createElement('div');
        existingBanner.id = 'healthsphere-emergency-banner';
        existingBanner.className = 'emergency-banner';
        document.body.prepend(existingBanner);
      }
      existingBanner.innerHTML = `
        <div style="display:flex;align-items:center;gap:0.75rem;">
          <span style="font-size:1.25rem;">🚨</span>
          <span><strong>ACTIVE EMERGENCY BLOOD REQUEST:</strong> Type <strong>${topReq.blood_group}</strong> needed urgently for ${topReq.patient_name} at ${topReq.location}.</span>
        </div>
        <div>
          <a href="/emergency.html">View Emergency Portal & Matches &rarr;</a>
        </div>
      `;
    }
  } catch (e) {
    // Non-fatal
  }
}

/**
 * Notifications modal toggle and loader
 */
window.toggleNotificationModal = async function() {
  const modal = document.getElementById('notifications-modal');
  if (!modal) return;
  const isActive = modal.classList.toggle('active');
  if (isActive) {
    await loadNotificationsList();
  }
};

async function updateNotificationBadge() {
  try {
    const res = await api.get('/notifications');
    if (res.success) {
      const badge = document.getElementById('nav-notif-count');
      if (badge) {
        if (res.data.unreadCount > 0) {
          badge.textContent = res.data.unreadCount > 9 ? '9+' : res.data.unreadCount;
          badge.style.display = 'flex';
        } else {
          badge.style.display = 'none';
        }
      }
    }
  } catch (e) {}
}

async function loadNotificationsList() {
  const listContainer = document.getElementById('notifications-list');
  if (!listContainer) return;

  try {
    const res = await api.get('/notifications');
    if (res.success && res.data.notifications.length > 0) {
      listContainer.innerHTML = res.data.notifications.map(n => `
        <div style="padding:0.75rem;border-bottom:1px solid var(--border-light);background:${n.is_read ? 'transparent' : 'var(--primary-subtle)'};border-radius:var(--radius-sm);margin-bottom:0.35rem;">
          <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">
            <span class="badge ${n.type.includes('EMERGENCY') ? 'badge-danger' : 'badge-primary'}">${n.type}</span>
            <span>${new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <h5 style="font-size:0.875rem;margin-bottom:0.25rem;">${n.title}</h5>
          <p style="font-size:0.8125rem;color:var(--text-muted);margin:0;">${n.message}</p>
        </div>
      `).join('');

      document.getElementById('mark-all-read-btn')?.addEventListener('click', async () => {
        await api.post('/notifications/read', { all: true });
        showToast('All notifications marked as read', 'success');
        updateNotificationBadge();
        loadNotificationsList();
      });
    } else {
      listContainer.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:1rem;">No notifications right now.</p>`;
    }
  } catch (err) {
    listContainer.innerHTML = `<p style="color:var(--danger);text-align:center;">Failed to load notifications.</p>`;
  }
}
