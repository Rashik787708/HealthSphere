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
- **Backend**: **A single** Vercel Serverless Function (`api/[...route].js`) that routes every `/api/*` request internally through `lib/router.js`. See [Why a single function](#-why-a-single-serverless-function) below.
- **Route modules**: `lib/accounts.js`, `doctors.js`, `appointments.js`, `medical-records.js`, `lab-results.js`, `prescriptions.js`, `wellness.js`, `blood.js`, `notifications.js`, `admin.js` — plain backend modules bundled into that function, never detected by Vercel as separate functions.
- **Database**: Turso libSQL (`@libsql/client`). Supports Turso cloud clusters or local SQLite files (`file:healthsphere.db`) seamlessly.
- **Authentication**: Pure JavaScript `bcryptjs` password hashing, signed JSON Web Tokens (JWT) with HTTP-only cookies and Bearer token fallback.
- **Security**: Parameterized SQL queries (preventing SQL injection), XSS-safe output sanitization, security headers, fixed-window rate limiting, and audit trails.

---

## 💡 Why a Single Serverless Function

The Vercel **Hobby** plan allows a maximum of **12 Serverless Functions per deployment**. The original
architecture placed one file per endpoint under `/api/`, which Vercel compiled into **23 functions**,
and the deployment failed with:

```
No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan.
```

Rather than deleting features or upgrading the plan, the backend was consolidated into **one**
catch-all function. The `api/` directory now contains exactly one file:

```
api/
└── [...route].js      ← the only Vercel Serverless Function
```

The handler inspects `req.url` and `req.method` and dispatches internally, so **the public API
contract is unchanged** — every existing frontend call keeps working untouched.

```js
// lib/router.js — route table
{ method: 'GET',  path: '/doctors',           handler: listDoctors }
{ method: 'GET',  path: '/doctors/:id',       handler: listDoctors }
{ method: 'POST', path: '/appointments',      handler: bookAppointment }
{ method: 'GET',  path: '/prescriptions/:id', handler: listPrescriptions }
```

Static paths always match before parameterized ones, so `/appointments/status` wins over
`/appointments/:id`. Path parameters are merged into the query object, which makes
`/api/prescriptions/rx_1` and `/api/prescriptions?id=rx_1` equivalent.

**Local development imports the exact same handler** — `scripts/dev-server.js` mounts
`api/[...route].js` — so there is no behavioural drift between `npm run dev` and production.

**Verifying the function count locally:**

```bash
# Must print exactly one file
Get-ChildItem -Recurse -File api
```

---

---

## 📁 Project Directory Structure

```text
HealthSphere/
├── api/                             # Vercel Serverless Functions
│   └── [...route].js                # ★ THE ONLY FUNCTION — catch-all /api/* handler
│
├── lib/                             # Backend modules (bundled into the function)
│   ├── router.js                    # Route table + internal dispatcher
│   ├── middleware.js                # Request context, RBAC, rate limiting, security headers
│   ├── db.js                        # Turso / libSQL client connector
│   ├── auth.js                      # Bcrypt, JWT, cookie, and RBAC guards
│   ├── validation.js                # ABO/Rh compatibility rules, Haversine, validators
│   ├── response.js                  # Standardized JSON response helpers
│   ├── audit.js                     # Audit logging & notification dispatcher
│   ├── accounts.js                  # Register, login, logout, profile
│   ├── doctors.js                   # Directory search, detail, availability
│   ├── appointments.js              # Listing, booking, status transitions
│   ├── medical-records.js           # Clinical records timeline
│   ├── lab-results.js               # Diagnostic lab reports
│   ├── prescriptions.js             # Digital prescriptions & printable Rx
│   ├── wellness.js                  # Wellness logs, /diet, /sleep, AI coach
│   ├── blood.js                     # Donors, requests, matches, emergency
│   ├── notifications.js             # Notification feed & read state
│   └── admin.js                     # Stats, users, doctors, hospitals, audit logs
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
│   ├── dev-server.js                # Local dev server (mounts api/[...route].js)
│   ├── test-all.js                  # Unit & medical-logic test suite
│   └── test-api.js                  # Full API integration suite
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

### 4. Run Verification Tests
```bash
npm test          # 24 unit tests + 149 API integration assertions
npm run test:unit # unit tests only
npm run test:api  # API integration suite only
```
*`test-all.js` covers database queries, bcrypt hashing, JWT validation, medical ABO/Rh matrices, and Haversine proximity calculations. `test-api.js` boots a real HTTP server against the catch-all handler and exercises registration, login, cookies, RBAC, double-booking prevention, every clinical endpoint, blood matching, admin governance, error status codes, and security headers.*

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
4. Click **Deploy**. Vercel builds **one** Serverless Function (`api/[...route].js`) and serves the
   static frontend from `public/`.

> **Note:** No build command or Output Directory is required. `vercel.json` contains only security
> headers and the static rewrites that map `/` → `/public/index.html` (the rest of `/api/*` is
> handled natively by the catch-all function). `cleanUrls` is intentionally `false` because the
> frontend links to explicit `.html` files.
>
> If you previously saw a 12-function limit error, it is resolved — verify with
> `Get-ChildItem -Recurse -File api` (or `ls -R api`), which should return a single file.

---

## 📡 REST API Reference

| Endpoint | Method | Role | Description |
| :--- | :--- | :--- | :--- |
| `/api` | `GET` | Public | Route index listing every available endpoint |
| `/api/health` | `GET` | Public | Liveness probe |
| `/api/auth/register` | `POST` | Public | Register new account (Patient, Doctor, Hospital) |
| `/api/auth/login` | `POST` | Public | Log in with email and password |
| `/api/auth/logout` | `POST` | Public | Clear session cookie |
| `/api/auth/me` | `GET`, `PUT`, `PATCH` | Authenticated | Fetch / update authenticated profile & doctor info |
| `/api/doctors` | `GET` | Public | Directory search with specialization/fee/location filters |
| `/api/doctors/:id` | `GET` | Public | Single doctor detail with availability |
| `/api/doctors/availability` | `GET` | Doctor / Admin | View own weekly schedule |
| `/api/doctors/availability` | `POST`, `PUT` | Doctor / Admin | Replace weekly schedule |
| `/api/doctors/:id/availability` | `GET`, `POST`, `PUT` | Doctor / Admin | Schedule for a specific doctor |
| `/api/appointments` | `GET` | Patient / Doctor / Admin | List appointments (role-scoped) |
| `/api/appointments` | `POST` | Patient / Admin | Book slot (prevents double-booking, 409 on conflict) |
| `/api/appointments/:id` | `GET` | Patient / Doctor / Admin | Single appointment detail |
| `/api/appointments/status` | `POST`, `PATCH` | Patient / Doctor / Admin | Confirm, complete, cancel, reject |
| `/api/appointments/:id` | `PATCH` | Patient / Doctor / Admin | Status update via path param |
| `/api/medical-records` | `GET` | Patient / Doctor / Admin | View medical history timeline |
| `/api/medical-records` | `POST` | Doctor / Admin | Record a diagnosis |
| `/api/medical-records/:id` | `GET` | Patient / Doctor / Admin | Single clinical record |
| `/api/prescriptions` | `GET` | Patient / Doctor / Admin | List prescriptions |
| `/api/prescriptions` | `POST` | Doctor / Admin | Issue a digital prescription |
| `/api/prescriptions/:id` | `GET` | Patient / Doctor / Admin | Printable Rx details |
| `/api/lab-results` | `GET` | Patient / Doctor / Admin | Diagnostic lab reports |
| `/api/lab-results` | `POST` | Doctor / Admin | Record a lab result |
| `/api/lab-results/:id` | `GET` | Patient / Doctor / Admin | Single lab report |
| `/api/wellness` | `GET`, `POST` | Patient / Admin | Daily wellness logs & metrics |
| `/api/wellness/diet` | `GET`, `POST` | Patient / Admin | Diet entries only |
| `/api/wellness/sleep` | `GET`, `POST` | Patient / Admin | Sleep entries only |
| `/api/wellness/ai-assistant` | `POST` | Authenticated | AI wellness coaching with clinical disclaimer |
| `/api/blood/donors` | `GET` | Public | Volunteer donor directory |
| `/api/blood/donors` | `POST` | Authenticated | Register / update donor profile |
| `/api/blood/donors/:id` | `GET` | Public | Single donor record |
| `/api/blood/requests` | `GET` | Public | Blood requests with urgency filters |
| `/api/blood/requests` | `POST` | Authenticated | Submit a request with automatic ABO/Rh donor matching |
| `/api/blood/requests/:id` | `GET` | Public | Request detail with matched donors |
| `/api/blood/requests/:id` | `PATCH` | Requester / Admin | Update request status |
| `/api/blood/matches` | `GET`, `POST`, `PATCH` | Donor / Requester | Donor responses (Accept, Donate) |
| `/api/blood/match` | `GET`, `POST`, `PATCH` | Donor / Requester | Alias of `/blood/matches` |
| `/api/blood/emergency` | `GET` | Public | Live feed of critical emergency blood requests |
| `/api/notifications` | `GET` | Authenticated | Notification center with unread count |
| `/api/notifications/read` | `POST`, `PATCH` | Authenticated | Mark notification(s) as read |
| `/api/admin/stats` | `GET` | Admin | Real-time platform statistics & recent activity |
| `/api/admin/users` | `GET`, `PATCH` | Admin | User directory and role modifications |
| `/api/admin/doctors` | `GET` | Admin | Doctor governance directory |
| `/api/admin/hospitals` | `GET` | Admin | Hospital directory with request counts |
| `/api/admin/appointments` | `GET` | Admin | All appointments across the platform |
| `/api/admin/blood-requests` | `GET` | Admin | All blood requests with match counts |
| `/api/admin/audit-logs` | `GET` | Admin | System-wide immutable security audit logs |

---

## 🛡️ Security & Privacy Implementation

- **Password Encryption**: All passwords hashed using `bcryptjs` with 10 salt rounds. Plaintext passwords are never stored, logged, or returned by any endpoint.
- **Role-Based Access Control (RBAC)**: Enforced centrally in `lib/router.js` (per-route `roles`) and re-checked inside each handler for ownership (e.g. a patient may only cancel *their own* appointment).
- **Privilege Escalation Prevention**: `POST /api/auth/register` refuses to self-provision the `ADMIN` role; administrators are only promoted through `PATCH /api/admin/users`.
- **SQL Injection Prevention**: All queries use parameterized statements (`client.execute({ sql, args })`).
- **XSS Mitigation**: Dynamic user-supplied values are escaped or set via `textContent` in the DOM layer.
- **Secure Sessions**: HTTP-only, `SameSite=Lax`, `Secure` in production cookies, with a Bearer-token fallback. Tokens are never written to `localStorage` server-side or exposed in API payloads beyond the login response.
- **Rate Limiting**: Fixed-window per-IP limits on auth (login 30/min, register 20/min) and blood-request creation (60/min), returning `429` with a `Retry-After` header.
- **Error Hygiene**: Database errors are logged server-side and never returned to the client; `details` is only attached outside production.
- **Security Headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and `Cache-Control: no-store` on all `/api/*` responses.
- **Secret Hygiene**: `.env` is git-ignored; Turso credentials are read only from server-side environment variables and are never bundled to the frontend.

---

## 📄 License
This project is open-source and licensed under the [MIT License](LICENSE).
