# RaptorERP — Architecture & System Design Documentation

> **Status:** Production-Ready Architecture Specification  
> **Target Date:** 22 October 2026  
> **Backend Framework:** Laravel 12.x (PHP 8.2+)  
> **Primary Database:** MySQL 8.0+ / MariaDB 10.4+ (`raptore_db`)  
> **Frontend Stack:** React 18.3+ / TypeScript 5.5+ / Vite 8.3+ / Tailwind CSS 4.3+  

---

## 1. High-Level Architecture Overview

RaptorERP is architected as a modern decoupled Single Page Application (SPA) communicating over a secure RESTful API with a multi-tenant-capable Laravel 12 backend.

```
┌────────────────────────────────────────────────────────────────────────┐
│                      Client Tier (Vite 8 SPA)                          │
│  React 18 • TypeScript • Tailwind CSS 4 • Zustand Auth Store           │
│  Modular Chunks: vendor-react, vendor-antd, vendor-charts, vendor-core │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS / REST (JSON)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   API Gateway & Middleware Tier (Laravel 12)           │
│  CORS Headers • Sanctum Auth • ApiTokenMiddleware (SHA-256)            │
│  CheckPermission RBAC • ForceJsonResponse • ThrottleMiddleware        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Application Business Logic Tier                      │
│  Slim Controllers ──► Domain Services ──► Eloquent Models              │
│  ├─ Sales & Invoicing Engine (Invoices, Quotations, POS, QR)           │
│  ├─ Inventory & Stock Tracking (Movements, Transfers, Warehouses)      │
│  ├─ HR & Payroll Automation (Attendance, Shifts, Payslips)             │
│  ├─ Finance & Bank Reconciliation (Transactions, Accounts, Journals)   │
│  └─ AI Intelligence Subsystem (GeminiProvider with 2.5/2.0 Fallback)  │
└──────────────────┬─────────────────┬───────────────────┬───────────────┘
                   │                 │                   │
                   ▼                 ▼                   ▼
┌───────────────────────┐ ┌───────────────────────┐ ┌────────────────────┐
│      Persistence      │ │    Async Jobs Queue   │ │  External Bridges  │
│  MySQL 8.0 / MariaDB  │ │  Database Queue Driver│ │  Twilio SMS/WA     │
│  77+ Versioned Schema │ │  Email, SMS, WebPush  │ │  WhatsApp Web.js   │
│  Idempotent Migration │ │  Background Reporting │ │  Google Gemini API │
└───────────────────────┘ └───────────────────────┘ └────────────────────┘
```

---

## 2. Security & Authentication Architecture

### 2.1 Dual-Token Authentication Engine
RaptorERP supports two primary token ingestion methods:
1. **User Session Tokens (Sanctum)**:
   - Issued on successful `/api/login` authentication.
   - Tied to user ID, company ID, branch ID, and role.
   - Revoked on `/api/logout`.
   - Frontend stores the token in `localStorage` under `raptor_token` (or `token`) and injects it into every Axios request header via `Authorization: Bearer <token>`.
2. **System & Machine API Tokens (`api_tokens`)**:
   - Ingested via `X-Api-Token` or `Authorization: Bearer <token>`.
   - **Storage Security**: Tokens in database are strictly stored as **SHA-256 hashes** (`hash('sha256', $token)`).
   - In-flight tokens are hashed at runtime by `ApiTokenMiddleware` and compared using constant-time hash comparisons (`hash_equals`) to prevent timing attacks.

### 2.2 Role-Based Access Control (RBAC)
- **Hierarchy**: Company Owner / Super Admin $\rightarrow$ Branch Manager $\rightarrow$ Department Staff $\rightarrow$ Viewer.
- **Middleware**: `CheckPermission` verifies specific permission slugs (`customers.view`, `invoices.create`, `inventory.manage`, etc.).
- **Client Gatekeeper**: React component `<RequirePermission permission="...">` ensures UI actions and navigation items are reactively hidden when permissions are lacking, while server-side middleware guarantees API rejection if a client bypass is attempted.

---

## 3. Database Schema & Migration Strategy

- **Database Engine**: InnoDB with foreign key integrity, UTF8mb4 character set.
- **Idempotent Schema Migrations**: All migration files implement `if (!Schema::hasTable('...'))` protection to guarantee zero-failure deployment runs on existing staging or production databases.
- **Multi-Tenancy Isolation**:
  - Most transactional models (`invoices`, `orders`, `customers`, `products`, `warehouses`) include `company_id` and optional `branch_id`.
  - Global query scopes or repository filters ensure queries cannot leak cross-company records (IDOR protection).

---

## 4. AI & Generative Intelligence Subsystem

The AI subsystem (`backend/app/Services/GeminiProvider.php`) interfaces with Google's Generative AI infrastructure:
1. **Model Hierarchy & Resiliency**:
   - Primary: `gemini-2.5-flash` (Optimized for speed and structured JSON output).
   - Secondary Fallback: `gemini-2.0-flash`.
   - Tertiary Fallback: `gemini-1.5-flash`.
2. **TLS Security**: Enforces TLS certificate validation by default (`GEMINI_VERIFY_SSL=true`).
3. **Data Sanitization**: Internal ERP customer passwords, cryptographic salts, and raw DB credentials are scrubbed prior to dispatching prompts to LLM endpoints.

---

## 5. Frontend Architecture & Bundle Optimization

### 5.1 Single Page Application Structure
- **Vite 8 Build Pipeline**: Configured with Rollup `manualChunks` to prevent monolithic browser bundles:
  - `vendor-react`: React, React-DOM.
  - `vendor-antd`: Ant Design UI components and icons.
  - `vendor-charts`: Recharts, D3 visualization libraries.
  - `vendor-maps`: React Simple Maps.
  - `vendor-icons`: Lucide React, React Icons.
  - `vendor-pdf`: jsPDF, html2canvas (heavy export tools isolated).
  - `vendor-core`: React Router, Zustand, Axios.
- **Top-Level Error Boundary**: `ErrorBoundary.tsx` traps unhandled rendering exceptions, logs diagnostics, and displays a graceful reload card rather than crashing to a blank white screen.
- **Resilient Auth Bootstrap**: Session invalidation occurs strictly upon receiving an explicit HTTP 401 Unauthorized code. Transient network offline states or HTTP 500 server errors do not evict the user.
