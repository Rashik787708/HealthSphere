import { randomUUID } from 'crypto';

export function generateId(prefix = '') {
  const uuid = randomUUID();
  return prefix ? `${prefix}_${uuid.replace(/-/g, '').slice(0, 16)}` : uuid;
}

export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

export function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6;
}

export function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.trim();
}

/**
 * Parses request body for Node / Vercel Serverless
 */
export async function parseBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return {};
    }
  }

  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

/**
 * Medically established ABO/Rh Red Blood Cell compatibility rules.
 * Keys: Recipient blood group (full format e.g. 'A+', 'O-')
 * Values: Array of donor blood groups compatible with the recipient.
 */
export const BLOOD_COMPATIBILITY = {
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'A-': ['A-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  'AB-': ['A-', 'B-', 'AB-', 'O-'],
  'O+': ['O+', 'O-'],
  'O-': ['O-'],
};

/**
 * Check if a donor blood group is compatible with a recipient blood group
 */
export function isBloodCompatible(donorGroup, recipientGroup) {
  const normRecipient = (recipientGroup || '').trim().toUpperCase();
  const normDonor = (donorGroup || '').trim().toUpperCase();
  const compatibleDonors = BLOOD_COMPATIBILITY[normRecipient];
  if (!compatibleDonors) return false;
  return compatibleDonors.includes(normDonor);
}

/**
 * Calculate distance in km between two lat/lng points using Haversine formula
 */
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
    return 5.0; // default estimated distance
  }
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return Math.round(d * 10) / 10;
}
