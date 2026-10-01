# ⚕ HealthSphere — Production-Ready Healthcare Platform

[![Vercel Deployment Ready](https://img.shields.io/badge/Vercel-Serverless%20Ready-black?style=flat&logo=vercel)](https://vercel.com)
[![Database](https://img.shields.io/badge/Database-Turso%20%2F%20libSQL-00eb84?style=flat)](https://turso.tech)
[![Frontend](https://img.shields.io/badge/Frontend-Vanilla%20HTML5%20%2F%20CSS3%20%2F%20ES%20Modules-E34F26?style=flat&logo=javascript)](https://developer.mozilla.org)
[![Security](https://img.shields.io/badge/Security-Bcrypt%20%26%20JWT%20RBAC-0F766E?style=flat)](https://jwt.io)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

HealthSphere is an end-to-end, production-grade digital healthcare platform connecting **Patients**, **Doctors**, **Hospitals**, and **Administrators** into a unified, secure digital healthcare ecosystem.

Designed from the ground up for **Vercel Serverless Function architecture** with **Turso SQLite / libSQL** at the edge, HealthSphere operates with zero permanent server dependencies while providing sub-millisecond data persistence, medically accurate ABO/Rh blood matching, digital e-prescriptions, and AI-assisted wellness tracking.

---

## 🌟 Key Features

### 👤 Patient Experience
- **Interactive Doctor Discovery**: Filter certified doctors by clinical specialization, consultation fee, hospital affiliation, and availability.
- **Smart Appointment Booking**: Real-time slot selection with server-side double-booking prevention and automatic practitioner notifications.
- **Lifelong Medical Timeline**: Chronological clinical history of diagnoses, symptoms, and physician notes.
- **Digital Prescriptions (Rx)**: Structured medicine cards (dosage, frequency, duration, instructions) with clean **Print-to-PDF** functionality.
- **Diagnostic Lab Reports**: View standardized lab values with standard reference ranges.
- **Daily Wellness Tracker**: Track sleep duration, water volume, physical activity, weight, and mood.
- **AI Wellness Assistant**: Evidence-based nutrition, hydration, and sleep hygiene recommendations with strict non-diagnostic clinical boundaries.

### 🩺 Doctor & Clinical Practice
- **Practice Dashboard**: Real-time queue of today's consultations, pending bookings, and patient roster.
- **Schedule & Availability Management**: Set weekly working windows (day of week, start time, end time) and active status.
- **One-Click Triage**: Confirm, complete, or reject consultation requests with patient alerts.
- **Clinical EHR Documentation**: Record formal clinical diagnoses and link treatments to specific consultations.
- **Digital Rx Generator**: Issue verified e-prescriptions with authorized digital signatures.

### 🏥 Hospital & Emergency Blood Network
- **Medically Validated ABO/Rh Blood Matching**: Follows established red blood cell transfusion compatibility rules (separating universal donor $O^-$ and universal recipient $AB^+$).
- **Proximity Donor Matching**: Calculates distance using the Haversine formula and dispatches high-priority in-app alerts to matching donors.
- **🚨 Emergency Blood Response Mode**: Visually prominent trauma broadcast portal for critical surgical hemorrhages and emergency triage.
- **Volunteer Donor Registry**: Patients and volunteers can register blood group, location, and track donation intervals.

### 👑 System Administration & Compliance
- **Platform Analytics**: Total users, patients, doctors, hospitals, completed consultations, and active blood requests.
- **User Governance**: Role assignment, verification flags, and profile management.
- **Immutable Security Audit Trail**: Logs every clinical, authentication, and status update with actor ID, target entity, timestamp, and IP address.

---

## 🏗️ Architecture & Technology Stack

```
                              ┌──────────────────────────────────┐
                              │  HealthSphere Frontend (Vanilla) │
                              │   HTML5 • CSS3 • Modular JS     │
                              │   Responsive • Accessible • PWA  │
                              └─────────────────┬────────────────┘
                                                │ REST JSON / Cookies
                                                ▼
                              ┌──────────────────────────────────┐
                              │    Vercel Serverless Functions   │
                              │   /api/auth/*   /api/doctors/*   │
                              │   /api/blood/*  /api/wellness/*  │
                              │   JWT Auth • Pure Bcrypt • RBAC  │
                              └─────────────────┬────────────────┘
                                                │ libSQL Wire Protocol
                                                ▼
                              ┌──────────────────────────────────┐
                              │    Turso SQLite / libSQL Cloud   │
                              │  Edge Distributed • WAL Mode     │
                              │ (or file:healthsphere.db local)  │
                              └──────────────────────────────────┘
```

- **Frontend**: Pure HTML5, modern CSS3 (Custom Properties, Grid, Flexbox), and modular Vanilla JavaScript ES Modules. No heavy frontend framework runtime overhead.
- **Backend**: Node.js Vercel Serverless Functions (`/api/*`) exporting stateless handlers (`export default async function handler(req, res)`).
- **Database**: Turso libSQL (`@libsql/client`). Supports Turso cloud clusters or local SQLite files (`file:healthsphere.db`) seamlessly.
- **Authentication**: Pure JavaScript `bcryptjs` password hashing, signed JSON Web Tokens (JWT) with HTTP-only cookies and Bearer token fallback.
- **Security**: Parameterized SQL queries (preventing SQL injection), XSS-safe output sanitization, strict CORS headers, and audit trails.

---

## 📁 Project Directory Structure

```text
HealthSphere/
├── api/                             # Vercel Serverless Functions
│   ├── auth/
│   │   ├── login.js                 # Authentication login
│   │   ├── register.js              # User registration
│   │   ├── logout.js                # Session logout
│   │   └── me.js                    # Profile retrieval & updates
│   ├── doctors/
│   │   ├── index.js                 # Directory search & doctor details
│   │   └── availability.js          # Practitioner schedule slots
│   ├── appointments/
│   │   ├── index.js                 # List & book appointments (no double booking)
│   │   └── status.js                # Confirm, complete, cancel, reject
│   ├── medical-records/
│   │   └── index.js                 # Clinical records timeline
│   ├── prescriptions/
│   │   └── index.js                 # Digital prescriptions & printable Rx
│   ├── lab-results/
│   │   └── index.js                 # Diagnostic lab reports
│   ├── wellness/
│   │   ├── index.js                 # Daily wellness logs & metrics
│   │   └── ai-assistant.js          # AI wellness coaching & safe fallback
│   ├── blood/
│   │   ├── donors.js                # Donor registry & directory
│   │   ├── requests.js              # Blood requests & ABO/Rh matching
│   │   ├── matches.js               # Donor responses & match status
│   │   └── emergency.js             # Active emergency broadcasts
│   ├── notifications/
│   │   ├── index.js                 # User notification feed & unread count
│   │   └── read.js                  # Mark notification as read
│   └── admin/
│       ├── stats.js                 # Platform overview metrics
│       ├── users.js                 # User management & role updates
│       └── audit-logs.js            # Security audit trail
│
├── database/
│   ├── schema.sql                   # 13 normalized SQLite/libSQL tables
│   ├── migrate.js                   # Table & index initialization runner
│   └── seed.js                      # Realistic healthcare demo dataset
│
├── lib/
│   ├── db.js                        # Turso / libSQL client connector
│   ├── auth.js                      # Bcrypt, JWT, cookie, and RBAC guards
│   ├── validation.js                # ABO/Rh compatibility rules, Haversine, validators
│   ├── response.js                  # Standardized JSON response helpers
│   └── audit.js                     # Audit logging & notification dispatcher
│
├── public/                          # Static Frontend Files (Served by Vercel)
│   ├── index.html                   # Landing page
│   ├── login.html                   # Sign in with 1-click demo logins
│   ├── register.html                # Account registration
│   ├── patient-dashboard.html       # Patient overview & quick actions
│   ├── doctor-dashboard.html        # Doctor consultation queues
│   ├── admin-dashboard.html         # Admin platform command center
│   ├── appointments.html            # Telehealth appointments manager
│   ├── doctors.html                 # Doctor discovery directory
│   ├── medical-records.html         # EHR medical timeline & lab results
│   ├── prescriptions.html           # Digital prescriptions & print preview
│   ├── wellness.html                # Daily wellness tracker & AI chat
│   ├── blood-network.html           # Blood donation network & donor registry
│   ├── emergency.html               # Rapid emergency blood response portal
│   ├── profile.html                 # User profile & doctor credentials
│   ├── css/
│   │   ├── global.css               # Healthcare palette, buttons, typography
│   │   ├── components.css           # Navbar, cards, modals, toast, print
│   │   ├── dashboard.css            # Hero widgets, action cards, chat UI
│   │   └── responsive.css           # 320px - 1440px media query breakpoints
│   └── js/
│       ├── api.js                   # Central HTTP client & state renderers
│       ├── auth.js                  # Navigation setup & session guards
│       ├── dashboard.js             # Patient & doctor dashboard logic
│       ├── appointments.js          # Booking modal & status actions
│       ├── doctors.js               # Practitioner directory search
│       ├── medical-records.js       # EHR timeline & lab results
│       ├── prescriptions.js         # Digital Rx & browser print
│       ├── wellness.js              # Wellness logging & AI coaching
│       ├── blood-network.js         # Donor registry & ABO/Rh matching
│       ├── emergency.js             # Emergency blood triage
│       ├── profile.js               # Demographic & credential updates
│       └── admin.js                 # Platform metrics & user governance
│
├── scripts/
│   ├── dev-server.js                # Lightweight local development server
│   └── test-all.js                  # End-to-end test suite
│
├── vercel.json                      # Vercel deployment configuration
├── package.json                     # Node dependencies & run scripts
├── .env.example                     # Environment template
└── .gitignore                       # Git ignore file
```

---

## 🔐 Demo Accounts

The database comes pre-seeded with realistic healthcare demo accounts across all 4 roles:

| Role | Email | Password | Details |
| :--- | :--- | :--- | :--- |
| **👑 Admin** | `admin@healthsphere.local` | `DemoPassword123!` | Platform-wide administrator |
| **🩺 Doctor** | `dr.sarah@healthsphere.local` | `DemoPassword123!` | Dr. Sarah Jenkins (Cardiology, 14 yrs) |
| **🧠 Doctor** | `dr.marcus@healthsphere.local` | `DemoPassword123!` | Dr. Marcus Vance (Neurology, 9 yrs) |
| **🏥 Hospital** | `hospital@stjude.local` | `DemoPassword123!` | St. Jude Regional Hospital |
| **👤 Patient** | `patient.alex@healthsphere.local` | `DemoPassword123!` | Alex Rivera ($O^-$ Universal Donor) |
| **👤 Patient** | `patient.samantha@healthsphere.local` | `DemoPassword123!` | Samantha Hayes ($A^+$ Donor) |

> **Tip**: On the `/login.html` page, click any of the **Instant 1-Click Demo Login** buttons to automatically fill credentials.

---

## 🩸 Medically Established ABO/Rh Compatibility Engine

HealthSphere enforces established red blood cell transfusion rules:

| Recipient | Compatible Red Blood Cell Donors | Note |
| :--- | :--- | :--- |
| **$O^-$** | **$O^-$ only** | Universal Red Blood Cell Donor |
| **$O^+$** | $O^+$, $O^-$ | Can donate to $O^+$, $A^+$, $B^+$, $AB^+$ |
| **$A^-$** | $A^-$, $O^-$ | Can donate to $A^-$, $A^+$, $AB^-$, $AB^+$ |
| **$A^+$** | $A^+$, $A^-$, $O^+$, $O^-$ | Can donate to $A^+$, $AB^+$ |
| **$B^-$** | $B^-$, $O^-$ | Can donate to $B^-$, $B^+$, $AB^-$, $AB^+$ |
| **$B^+$** | $B^+$, $B^-$, $O^+$, $O^-$ | Can donate to $B^+$, $AB^+$ |
| **$AB^-$**| $AB^-$, $A^-$, $B^-$, $O^-$ | Can donate to $AB^-$, $AB^+$ |
| **$AB^+$**| **All groups ($A^\pm, B^\pm, AB^\pm, O^\pm$)** | Universal Red Blood Cell Recipient |

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js version 18 or higher (v20+ recommended)
- Git

### 2. Clone and Install Dependencies
```bash
git clone https://github.com/your-username/healthsphere.git
cd healthsphere
npm install
```

### 3. Initialize & Seed Database
HealthSphere defaults to local SQLite persistence (`file:healthsphere.db`) if Turso credentials are not yet specified.

```bash
# Initialize all 13 database tables and indexes
npm run db:init

# Populate realistic demo users, appointments, prescriptions, and blood requests
npm run db:seed
```

### 4. Run Comprehensive Verification Tests
```bash
npm test
```
*Executes all 24 automated unit and integration tests covering database queries, bcrypt hashing, JWT validation, medical ABO/Rh matrices, and Haversine proximity calculations.*

### 5. Start Development Server
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🌐 Deploying to Vercel with Turso

HealthSphere is designed natively for deployment on **Vercel** with a **Turso Database**.

### Step 1: Create a Turso Database
1. Install Turso CLI or log in at [https://turso.tech](https://turso.tech):
   ```bash
   turso db create healthsphere-prod
   ```
2. Retrieve your Database URL:
   ```bash
   turso db show healthsphere-prod --url
   # Example: libsql://healthsphere-prod-yourname.turso.io
   ```
3. Generate a database authentication token:
   ```bash
   turso db tokens create healthsphere-prod
   ```

### Step 2: Initialize Turso Schema
Export your credentials and run the migration against your Turso cluster:
```bash
# Linux/macOS
export TURSO_DATABASE_URL="libsql://healthsphere-prod-yourname.turso.io"
export TURSO_AUTH_TOKEN="your-turso-auth-token"
npm run db:init
npm run db:seed

# Windows PowerShell
$env:TURSO_DATABASE_URL="libsql://healthsphere-prod-yourname.turso.io"
$env:TURSO_AUTH_TOKEN="your-turso-auth-token"
npm run db:init
npm run db:seed
```

### Step 3: Deploy to Vercel
1. Push your repository to GitHub:
   ```bash
   git init
   git add .
   git commit -m "feat: complete production-ready HealthSphere platform"
   git remote add origin https://github.com/your-username/healthsphere.git
   git push -u origin main
   ```
2. In the [Vercel Dashboard](https://vercel.com):
   - Import your GitHub repository.
   - Framework Preset: **Other**.
   - Output Directory: **public** (or leave default as configured in `vercel.json`).
3. Under **Environment Variables**, add:
   ```env
   TURSO_DATABASE_URL = libsql://healthsphere-prod-yourname.turso.io
   TURSO_AUTH_TOKEN    = your-turso-auth-token
   SESSION_SECRET      = your-production-random-32-byte-secret-key
   AI_API_KEY          = (optional)
   ```
4. Click **Deploy**. Vercel will immediately deploy the static frontend assets and the serverless `/api/*` endpoints!

---

## 📡 REST API Reference

| Endpoint | Method | Role | Description |
| :--- | :--- | :--- | :--- |
| `/api/auth/register` | `POST` | Public | Register new account (Patient, Doctor, Hospital) |
| `/api/auth/login` | `POST` | Public | Log in with email and password |
| `/api/auth/logout` | `POST` | Public | Clear session cookie |
| `/api/auth/me` | `GET`, `PUT` | Authenticated | Fetch / update authenticated profile & doctor info |
| `/api/doctors` | `GET` | Public | Directory search with specialization/fee/location filters |
| `/api/doctors/availability` | `GET`, `POST` | Doctor / Admin | View and update doctor weekly schedule |
| `/api/appointments` | `GET`, `POST` | Patient / Doctor | List appointments or book slot (prevents double-booking) |
| `/api/appointments/status`| `POST` | Patient / Doctor | Update appointment status (Confirm, Complete, Cancel, Reject) |
| `/api/medical-records` | `GET`, `POST` | Doctor / Patient | View medical history timeline; doctors record diagnoses |
| `/api/prescriptions` | `GET`, `POST` | Doctor / Patient | View or issue digital prescriptions; printable Rx details |
| `/api/lab-results` | `GET`, `POST` | Doctor / Admin | Diagnostic lab reports |
| `/api/wellness` | `GET`, `POST` | Patient | Record & view sleep, water, exercise, weight, mood |
| `/api/wellness/ai-assistant`| `POST` | Patient | AI wellness assistant with clinical safety disclaimer |
| `/api/blood/donors` | `GET`, `POST` | Authenticated | Volunteer blood donor directory & registration |
| `/api/blood/requests` | `GET`, `POST` | Patient / Hospital| Submit blood requests with automatic ABO/Rh donor matching |
| `/api/blood/matches` | `GET`, `POST` | Donor / Requester | Donor response to compatibility matches (Accept, Donate) |
| `/api/blood/emergency` | `GET` | Public | Live feed of critical emergency blood requests |
| `/api/notifications` | `GET` | Authenticated | User notification center with unread count |
| `/api/notifications/read` | `POST` | Authenticated | Mark notification(s) as read |
| `/api/admin/stats` | `GET` | Admin | Real-time platform statistics & recent activity |
| `/api/admin/users` | `GET`, `PATCH`| Admin | User directory and role modifications |
| `/api/admin/audit-logs` | `GET` | Admin | System-wide immutable security audit logs |

---

## 🛡️ Security & Privacy Implementation

- **Password Encryption**: All passwords hashed using `bcryptjs` with 10 salt rounds. Plaintext passwords are never stored or logged.
- **Role-Based Access Control (RBAC)**: Enforced both at the serverless API gateway (`requireAuth(req, res, allowedRoles)`) and within UI route controllers.
- **SQL Injection Prevention**: All queries use parameterized statements (`client.execute({ sql, args })`).
- **XSS Mitigation**: Dynamic user-supplied values are escaped or set via `textContent` in the DOM layer.
- **Security Headers**: Standard `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, and `Referrer-Policy: strict-origin-when-cross-origin` pre-configured in `vercel.json`.

---

## 📄 License
This project is open-source and licensed under the [MIT License](LICENSE).
