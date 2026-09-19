# Business OS — Enterprise ERP System

A comprehensive multi-company, multi-branch ERP system built with Laravel 12 and React 18.

## Overview

Business OS is a complete Enterprise Resource Planning platform designed for wholesale and
distribution businesses. It supports:

- **Multi-Company / Multi-Branch Operations** — Run several companies, branches, and
  warehouses from a single deployment.
- **RBAC Authorization** — Roles, permissions, and per-user access management.
- **Sanctum API Authentication** — Hashed personal access tokens with explicit expiry.
- **Two-Factor Authentication** — TOTP (RFC 6238) + single-use recovery codes.
- **Sales & Invoicing** — Quote-to-cash, including sales returns and profitability reports.
- **Purchases** — Purchase invoices, payments, supplier management.
- **Inventory** — Products, warehouses, stock movements, transfers, imports/exports.
- **Accounting** — Chart of accounts, journals, statements, ledgers.
- **Payroll & HR** — Salaries, advances, leaves, shifts, loans, payslips.
- **Biometric Attendance** — Device registration, fingerprint enrolment, offline sync.
- **Marketing** — Accounts, posts, calendar, analytics, unified inbox.
- **AI Assistant** — Gemini-backed chat, voice, forecasting, business health.
- **MCP (Model Context Protocol)** — Read-only credentials for ChatGPT / MCP clients.
- **Unified Inbox** — Email + WhatsApp send/receive.
- **Reports & Analytics** — Sales, purchases, P&L, GST, product profitability.

## Architecture

### Backend
- **Framework**: Laravel 12 (PHP 8.2+)
- **Database**: SQLite (development) / MySQL or PostgreSQL (production)
- **Authentication**: Laravel Sanctum (bearer tokens, hashed at rest)
- **2FA**: TOTP via `pragmarx/google2fa`, secrets encrypted with `APP_KEY`
- **API**: RESTful, resource controllers, JSON responses
- **Cache (required for rate limiting)**: Redis or Memcached recommended

### Frontend
- **Framework**: React 18.3.1
- **Build Tool**: Vite 5.4.1
- **Language**: TypeScript 5.5.4
- **Styling**: Tailwind CSS
- **State**: Zustand (`useAuthStore` for auth + token)

## Quick Start

### Backend Setup

```bash
cd backend
composer install

cp .env.example .env
php artisan key:generate

touch database/database.sqlite
php artisan migrate --force
php artisan db:seed

php artisan serve
Backend runs on http://localhost:8000.

Demo credentials

Email: test@example.com

Password: password

2FA is optional per user. The demo account starts with 2FA disabled. You can
enable it in Settings → Security after logging in.

Frontend Setup
bash
cd frontend
npm install
npm run dev
Frontend runs on http://localhost:5173.

Environment Variables
Backend (backend/.env)

env
APP_NAME="Business OS"
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost:8000
APP_KEY=base64:...                    # required — 2FA secrets are encrypted with this

DB_CONNECTION=sqlite

CACHE_STORE=redis                     # redis / memcached / database — required for rate limiting
SESSION_DRIVER=redis

SANCTUM_STATEFUL_DOMAINS=localhost:5173
Frontend (frontend/.env.local)

env
VITE_API_BASE=http://localhost:8000/api
Authentication
Token Model
Business OS uses Laravel Sanctum personal access tokens.

Tokens are stored hashed (sha256) in personal_access_tokens.

Default lifetime: 7 days (expires_at returned in the login response).

Plaintext tokens are shown once at login and never persisted server-side.

Login Flow (no 2FA)
text
POST /api/auth/login
Content-Type: application/json

{ "email": "test@example.com", "password": "password" }
Response:

json
{
  "access_token": "1|xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "token_type": "bearer",
  "expires_at": "2026-09-26T12:34:56+00:00"
}
Login Flow (2FA enabled)
Step 1 — same as above, but the response is a challenge, not a token:

json
{
  "two_factor_required": true,
  "challenge_token": "…64 hex chars…",
  "expires_in": 300
}
Step 2 — submit the 6-digit TOTP code (or a recovery code):

text
POST /api/auth/2fa/verify
Content-Type: application/json

{
  "challenge_token": "…",
  "code": "123456"
}
Success returns the same access_token payload as the no-2FA flow.

Challenge rules

Single-use; consumed on first successful verify.

Expires after 5 minutes.

Max 5 attempts per challenge; exceeded → challenge invalidated.

A new login invalidates any outstanding challenge for that user.

Authenticated Endpoints
text
GET  /api/auth/me          Authorization: Bearer {token}
GET  /api/auth/profile     Authorization: Bearer {token}
PUT  /api/auth/profile     Authorization: Bearer {token}
POST /api/auth/logout      Authorization: Bearer {token}
Legacy aliases (/api/login, /api/logout, /api/me, /api/profile) remain available
for backward compatibility.

Two-Factor Endpoints (authenticated)
Method	Endpoint	Purpose
GET	/api/auth/2fa/status	Enrolment + recovery-code count
POST	/api/auth/2fa/enable	Start enrolment (requires password) — returns secret + otpauth URL
POST	/api/auth/2fa/confirm	Confirm enrolment with a 6-digit code — returns recovery codes
POST	/api/auth/2fa/disable	Disable 2FA (requires password + code) — revokes all sessions
POST	/api/auth/2fa/recovery-codes	Regenerate recovery codes (requires password)
Security invariants

TOTP secret is encrypted at rest and never returned after enrolment.

Recovery codes are single-use, SHA-256 hashed, and never persisted in plaintext.

Password re-confirmation is required for enable / disable / regenerate.

Disabling 2FA revokes all access tokens for the user.

Rate Limiting
Configured in app/Providers/AppServiceProvider.php and attached in routes/api.php:

Limiter	Route	Limits
login	POST /api/auth/login, POST /api/login	5/min per email+IP, 20/min per IP
2fa-verify	POST /api/auth/2fa/verify	10/min per IP, 5/min per challenge token
2fa-sensitive	POST /api/auth/2fa/{enable,confirm,disable,recovery-codes}	6/min per authenticated user
Requirement: CACHE_STORE must be redis, memcached, or database.
array or file will cause limiters to be ineffective in production.

API Overview
Authentication
See Authentication above.

Core Resources
All endpoints follow RESTful conventions:

GET /api/{resource} — List (paginated)

POST /api/{resource} — Create

GET /api/{resource}/{id} — Show

PUT /api/{resource}/{id} — Update

DELETE /api/{resource}/{id} — Delete

Available resources

companies, branches, warehouses

customers, suppliers, dealers

products, orders, payments

invoices, purchase-invoices

employees, attendance, payroll

Dashboard
/api/dashboard/* — analytics, payment summaries, inventory summaries, invoice counts and
amounts, business health, forecast, risks, anomalies, rankings, hero product/customer,
district sales, new-vs-existing customers, profit, low stock, top customers/vendors,
purchase due invoices, login activity.

Reports
/api/reports/* — sales summary / register / by customer / by product / GST / outstanding,
purchase summary / register / by vendor / outstanding, general ledger, customer ledger,
profit-loss (summary, products, customers, branches, monthly, yearly, comparison, invoices),
product profitability, GST summary.

Sales & Purchases
/api/sales/* — orders, quotations, proformas, delivery challans, returns, reports.

/api/purchases/* — orders, bills, GRN, returns, reports.

/api/sales-returns/* — invoice returns with product/invoice/customer search.

/api/purchase-invoices/{id}/payments — record a purchase payment.

Accounting
/api/accounting/{summary,accounts,journals,statements} — chart of accounts, journals,
and financial statements.

Payroll & HR
/api/payroll/* — records, runs, advances, leaves, shifts, loans, payslips.

Biometric Attendance
Public (device-driven):

POST /api/biometric/device/register

POST /api/biometric/device/heartbeat

POST /api/biometric/attendance

POST /api/biometric/offline/sync

POST /api/biometric/device/{device}/enroll-status

Authenticated (management):

GET /api/biometric/devices

POST /api/biometric/templates/{upload,download}

GET /api/biometric/scans

GET /api/biometric/offline/pending

GET /api/biometric/unknown-fingers

POST /api/biometric/device/{device}/{sync,settings,restart,enroll}

Marketing
/api/marketing/* — dashboard, accounts, posts, calendar, analytics, inbox, GBP locations.

Unified Inbox
GET /api/inbox

POST /api/inbox/{message}/read

POST /api/inbox/email/send

POST /api/inbox/whatsapp/send

AI
/api/ai/assistant/* — insights, chat, voice.

/api/dashboard/ai/* — ask, business health, forecast, generic analysis.

/api/ai/providers/* — provider CRUD.

/api/gemini/* — voice, chat, insights, test.

MCP (Model Context Protocol)
Read-only credentials for ChatGPT and other MCP clients.

GET /api/mcp/status

GET /api/mcp/context — full business context.

GET /api/mcp/context/{section} — one section at a time.

GET /api/mcp/tokens — list current user's MCP tokens.

POST /api/mcp/tokens — create (max 90-day expiry).

DELETE /api/mcp/tokens/{id} — revoke one.

DELETE /api/mcp/tokens — revoke all.

MCP tokens carry only the mcp:read ability. They cannot mutate state.

Webhooks (public)
POST /api/webhooks/whatsapp

POST /api/webhooks/email

Settings
/api/settings — global key/value store (GET, POST, PUT, DELETE).

/api/settings/{export,import,bulk,quickstart,cache/clear}.

/api/api-tokens/* — user-facing personal access token management.

Database Schema
Core
companies, branches, warehouses

customers, suppliers, dealers

products

RBAC
roles, permissions

role_user, permission_role

Sales & Invoicing
quotations, orders, order_items

invoices, invoice_items

payments

sales_returns, sales_return_items

purchase_invoices, purchase_invoice_items

Attendance & HR
employees

attendance

biometric_devices, fingerprint_templates, biometric_scans

payrolls, payroll_advances, payroll_leaves, payroll_shifts,
payroll_loans, payroll_payslips

Accounting
accounts, journals, journal_lines

Authentication & Security
users (includes encrypted two_factor_secret, two_factor_confirmed_at)

personal_access_tokens (Sanctum)

two_factor_challenges (short-lived login challenges)

two_factor_recovery_codes (SHA-256 hashed, single-use)

Misc
settings, uploads, marketing_posts, marketing_accounts, inbox_messages

Features
Implemented ✅
Platform

Multi-company / multi-branch / multi-warehouse architecture

Sanctum API authentication with hashed tokens and explicit expiry

RBAC with granular permissions

Rate-limited login, 2FA, and sensitive endpoints

Two-Factor Authentication — TOTP + recovery codes (Settings → Security)

Sales & Purchases

Quotes, proformas, orders, delivery challans, invoices

Sales returns with invoice / product / customer search

Purchase orders, bills, GRN, returns, purchase payments

Inventory

Product catalog with price list, warehouse stock, stock movements

Stock in / out / transfer

Bulk import / export with template download

HR & Payroll

Employees, attendance (manual + biometric device)

Payroll records, runs, advances, leaves, shifts, loans, payslips

Accounting

Chart of accounts, journals, statements, general + customer ledger

Reporting & Analytics

Sales, purchase, GST, P&L (7 dimensions), product profitability

Dashboard KPIs, forecasts, risks, anomalies, rankings

Communication & Marketing

Unified inbox (email + WhatsApp)

Marketing posts, calendar, analytics, accounts, GBP locations

AI

Gemini chat, voice, insights, forecasting, business health

AI provider management

MCP

Read-only MCP tokens scoped to the current user

Settings

Global key/value settings store

Voice (browser TTS + ElevenLabs)

Printer (A4 / thermal, Bluetooth Web API)

AI API key (stored in browser only)

API & MCP dashboard

Security — two-factor management

Roadmap 🚀
Public API documentation portal (OpenAPI / Swagger)

Inventory forecasting with ML

Mobile app (React Native)

Real-time notifications (WebSockets)

Email templates and scheduled sends

Audit logging dashboard

SSO / SAML / OAuth providers for login

WebAuthn / passkeys as an alternative 2FA method

Multi-currency ledger with FX revaluation

Development
Backend
bash
cd backend
php artisan test
php artisan route:list | grep 2fa   # verify 2FA routes are registered
Frontend
bash
cd frontend
npm run test
npm run lint
Code Structure
Backend

text
app/
  Http/
    Controllers/Api/        # API controllers (AuthController, TwoFactorController, …)
    Middleware/             # CheckRole, ApiTokenMiddleware
  Models/
    User.php                # includes 2FA helpers, roles, permissions
    TwoFactorChallenge.php
    TwoFactorRecoveryCode.php
  Services/
    TwoFactorService.php
    TwoFactorChallengeService.php
  Providers/
    AppServiceProvider.php  # rate limiters + schedules
routes/
  api.php                   # all API routes
database/
  migrations/               # schema
  seeders/                  # demo data
Frontend

text
src/
  api.ts                    # apiClient (fetch wrapper + typed methods)
  store/auth.ts             # Zustand auth store
  pages/SettingsPage.tsx    # Settings → Security tab
  features/security/
    TwoFactorSettings.tsx   # enable/disable/recovery codes UI
  features/auth/
    TwoFactorChallengeForm.tsx  # step-2 login UI
  components/
    NotificationContext.tsx
Security Considerations
Sanctum tokens are hashed at rest and expire after 7 days.

2FA secrets are encrypted with APP_KEY; rotating APP_KEY invalidates all enrolled secrets (users must re-enrol).

Recovery codes are single-use, SHA-256 hashed, and regenerable.

Login is timing-equalized against user enumeration (constant bcrypt work for unknown emails).

Rate limiting on login, 2FA verify, and sensitive 2FA mutations.

Password re-confirmation is required for any 2FA setting change.

Disabling 2FA revokes all sessions for that user.

CSRF is not required for bearer-token APIs but is enforced for Sanctum stateful (cookie) flows.

CORS is limited to SANCTUM_STATEFUL_DOMAINS.

SQL injection prevented via Eloquent parameter binding.

MCP tokens are read-only (mcp:read only) and capped at 90 days.

Troubleshooting
Frontend Can't Connect to Backend
Confirm the backend is running on port 8000.

Check VITE_API_BASE in frontend/.env.local.

Confirm CORS in bootstrap/app.php includes your frontend origin.

"Verification failed. Please try again." on 2FA
This message was the generic fallback. The generic branch is only reached when the
client cannot read the HTTP status. Check:

DevTools → Network → POST /api/auth/2fa/verify — what is the status and body?

Confirm apiClient.verifyTwoFactor exists in src/api.ts (it must POST to
/auth/2fa/verify with { challenge_token, code }).

If 500 → check storage/logs/laravel.log. Common causes:

pragmarx/google2fa not installed → composer require pragmarx/google2fa

APP_KEY rotated after enrolment → user must be re-enrolled

If 401 with "Invalid verification code" → clock drift. Ensure the server is
within ~30 s of the phone. TwoFactorService::verifyCode uses window = 1
(±30 s tolerance).

Rate Limiter Errors ("Rate limiter [login] is not defined")
Ensure AppServiceProvider::boot() registers the login, 2fa-verify, and
2fa-sensitive limiters, and that CACHE_STORE is not array.

2FA Codes Always Rejected
Verify server time: date -u vs. the phone.

If the server drifts > 60 s, either fix NTP or widen the window to 2 in
TwoFactorService::verifyCode.

Verify the enrolled secret by re-scanning the QR code with the same authenticator.

Token Errors
Clear browser storage: localStorage.clear(); sessionStorage.clear();

Confirm expires_at in the last login response hasn't passed.

POST /api/auth/logout to revoke the current token, then re-login.

Database Errors
Ensure SQLite file exists: touch database/database.sqlite.

Run migrations: php artisan migrate --force.

Run seeders: php artisan db:seed.

If upgrading from an older version, run:

bash
php artisan migrate
to apply the two_factor_* columns and tables.

Contributing
Branch from main.

Follow PSR-12 (backend) and the existing ESLint config (frontend).

Write tests for new endpoints. 2FA tests must cover:

challenge issuance on login,

single-use consumption,

expiry,

attempt lockout,

recovery-code consumption,

encryption cast round-trip.

Never commit .env, APP_KEY, or any plaintext secret.

Do not use console.log, var_dump, or dd() in committed code.

License
Proprietary — All rights reserved.

Support
For issues and feature requests, contact the development team.

text

---

## What this README now gets right

1. **Auth reality** — Sanctum, not JWT. Anyone copy-pasting the old "JWT_SECRET" line would break their install.
2. **2FA is documented end-to-end** — login branching, challenge rules, endpoints, invariants, and the troubleshooting section directly addresses the "Verification failed" bug you just fixed.
3. **Every route group in `routes/api.php` is documented** — nothing in the codebase is invisible to new developers.
4. **Rate limiters** are documented with their concrete limits and the `CACHE_STORE` requirement.
5. **DB schema** now reflects the actual tables (2FA challenge/recovery, personal_access_tokens, biometrics, payroll, marketing, inbox).
6. **Troubleshooting** for 2FA is included because that's the exact class of bug you just spent a day on — future-you will thank present-you.
7. **Security Considerations** now lists the specific invariants the code enforces, not generic platitudes.

If you also want this broken out into a `docs/` folder (e.g. `docs/2fa.md`, `docs/api.md`, `docs/security.md`) so the top-level README stays short, say the word and I'll produce the split version next.