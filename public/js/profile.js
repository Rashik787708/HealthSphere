import { api, showToast } from './api.js';

export async function initProfilePage() {
  await loadUserProfile();

  const form = document.getElementById('profile-form');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;

      try {
        const payload = {
          name: document.getElementById('profile-name').value,
          phone: document.getElementById('profile-phone').value,
          gender: document.getElementById('profile-gender').value,
          date_of_birth: document.getElementById('profile-dob').value,
          blood_group: document.getElementById('profile-blood-group').value,
          location: document.getElementById('profile-location').value,
        };

        const doctorSpec = document.getElementById('doctor-specialization');
        if (doctorSpec) {
          payload.specialization = doctorSpec.value;
          payload.qualification = document.getElementById('doctor-qualification').value;
          payload.hospital_name = document.getElementById('doctor-hospital').value;
          payload.consultation_fee = document.getElementById('doctor-fee').value;
          payload.bio = document.getElementById('doctor-bio').value;
          payload.available = document.getElementById('doctor-available')?.checked;
        }

        const res = await api.put('/auth/me', payload);
        showToast(res.message || 'Profile updated successfully!', 'success');
        await loadUserProfile();
      } catch (err) {
        showToast(err.message, 'danger');
      } finally {
        if (btn) btn.disabled = false;
      }
    };
  }
}

async function loadUserProfile() {
  try {
    const res = await api.get('/auth/me');
    const user = res.data?.user;
    const doc = res.data?.doctorProfile;

    if (!user) return;

    document.getElementById('profile-name').value = user.name || '';
    document.getElementById('profile-email').value = user.email || '';
    document.getElementById('profile-role').value = user.role || '';
    document.getElementById('profile-phone').value = user.phone || '';
    document.getElementById('profile-gender').value = user.gender || '';
    document.getElementById('profile-dob').value = user.date_of_birth || '';
    document.getElementById('profile-blood-group').value = user.blood_group || '';
    document.getElementById('profile-location').value = user.location || '';

    // If doctor, populate and show doctor fields
    const docSection = document.getElementById('doctor-profile-section');
    if (user.role === 'DOCTOR' && docSection) {
      docSection.style.display = 'block';
      if (doc) {
        document.getElementById('doctor-specialization').value = doc.specialization || '';
        document.getElementById('doctor-qualification').value = doc.qualification || '';
        document.getElementById('doctor-hospital').value = doc.hospital_name || '';
        document.getElementById('doctor-fee').value = doc.consultation_fee || '';
        document.getElementById('doctor-bio').value = doc.bio || '';
        document.getElementById('doctor-available').checked = doc.available === 1;
      }
    }
  } catch (err) {
    showToast('Failed to load user profile.', 'danger');
  }
}
