# AGENTS.md — Autonomous Agent Operating Guide for RaptorERP

> **Target Platform:** Windows / Linux / macOS  
> **Backend:** PHP 8.2+ / Laravel 12 / MySQL 8.0+ / Laravel Sanctum  
> **Frontend:** React 18 / TypeScript 5.5 / Vite 8 / Tailwind CSS 4  
> **Primary Workspace Root:** `c:\xampp\htdocs\RaptorERP`

---

## 1. Core Operating Philosophy & Safety Invariants

As an autonomous or semi-autonomous AI coding agent operating on the RaptorERP codebase, you must adhere strictly to these non-negotiable invariants:

1. **Never Discard Uncommitted User Work**:
   - Check `git status` before making edits.
   - If a rebase or merge is in progress, do **NOT** run destructive recovery commands like `git rebase --abort` or `git reset --hard` unless explicitly authorized. Preserve user edits in active working files (e.g. `AiController.php`, `AiManager.php`, `GeminiProvider.php`, `backend/config/database.php`).
2. **Never Fabricate Data or Mock In Production Paths**:
   - Do not replace real database models or API queries with static dummy arrays, hardcoded prices, or simulated successes in production screens.
   - Always wire UI views to backend API endpoints via `frontend/src/services/api.ts`.
3. **Preserve Line Endings (CRLF vs LF)**:
   - On Windows environments, repository files typically use Windows CRLF (`\r\n`).
   - If targeted file edits fail to match strings due to line ending discrepancies, inspect the file's line endings or use PowerShell/Node.js script-based edits that respect CRLF.
4. **Preserve Database Migration Idempotence**:
   - When writing or repairing migrations in `backend/database/migrations/`, always wrap table creations in `if (!Schema::hasTable('...'))` to prevent fatal crash loops on partial migrations.
5. **No Secret Leaks**:
   - Never log, commit, or print API keys, passwords, database credentials, or auth tokens in logs, artifacts, or code comments.

---

## 2. Architecture & Technology Stack

```
RaptorERP
├── backend/                  # Laravel 12 REST API
│   ├── app/
│   │   ├── Http/Controllers/Api/ # API Controllers (Slim, delegate to Services)
│   │   ├── Http/Middleware/      # ApiTokenMiddleware, CheckPermission, Authenticate
│   │   ├── Models/               # Eloquent Models (User, Customer, Order, etc.)
│   │   └── Services/             # Business Logic & AI (GeminiProvider, AiManager)
│   ├── config/                   # Configuration (cors, database, sanctum, app)
│   ├── database/migrations/      # 77+ Schema Migrations
│   ├── routes/api.php            # Unified API Route definitions
│   └── tests/                    # Feature & Unit PHPUnit test suite
├── frontend/                 # React 18 Single Page Application
│   ├── src/
│   │   ├── components/           # Reusable UI (ModernDataTable, ErrorBoundary, etc.)
│   │   ├── pages/                # Page components (Sales, Inventory, HR, Finance)
│   │   ├── services/             # Axios API Client (api.ts) & modular service files
│   │   ├── store/                # Zustand state stores (authStore, etc.)
│   │   └── types/                # TypeScript interfaces and domain models
│   ├── vite.config.ts            # Vite 8 build config with vendor chunk splitting
│   └── package.json              # NPM dependencies
└── docs/                     # Technical, Security, and Architectural documentation
```

---

## 3. Standard Verification Commands

Before concluding any work, always verify that your changes have not introduced regressions:

### Backend Testing (PHPUnit)
```powershell
cd c:\xampp\htdocs\RaptorERP\backend
php artisan test
```
*Expected baseline:* **89 passed (1326 assertions), 0 failures**.

### Database Migrations
```powershell
cd c:\xampp\htdocs\RaptorERP\backend
php artisan migrate --force
```
*Expected baseline:* 0 pending migrations.

### Canonical Permissions Seeding
```powershell
cd c:\xampp\htdocs\RaptorERP\backend
php artisan db:seed --class=CanonicalPermissionsSeeder
```
*Expected baseline:* All canonical `wms.*`, `users.*`, `roles.*`, and business permissions seeded idempotently.

### Frontend Compilation & Bundle Build
```powershell
cd c:\xampp\htdocs\RaptorERP\frontend
npm run build
```
*Expected baseline:* `tsc` passes with zero errors, Vite outputs split vendor chunks (`vendor-core`, `vendor-charts`, `vendor-maps`, `vendor-icons`, etc.).

---

## 4. Key Security & Architecture Patterns

### Canonical Authorization & RBAC
- **Canonical Schema**: Permissions follow `<module>.<resource>.<action>` format.
- **Bidirectional Alias Resolution**: `App\Services\PermissionCanonicalizer` automatically resolves all legacy permission aliases (e.g. `'view warehouses'` $\rightarrow$ `'wms.warehouses.view'`).
- **Warehouse User Scoping**: Non-admin users are strictly confined to their assigned warehouses (`canAccessWarehouse()`). Operations against unassigned facilities return HTTP 403 Forbidden.

### Nixa WMS (Warehouse Management System)
- Dedicated warehouse endpoints are grouped under `/api/wms/*`.
- Multi-step transfer finite state machine: `pending_approval` $\rightarrow$ `approved` $\rightarrow$ `in_transit` $\rightarrow$ `completed`.
- Immutable audit ledger: All stock transactions record balance before and after in `stock_movements`.
- Formula Injection Defense: CSV reports prepend a single quote (`'`) to cells starting with `=`, `+`, `-`, or `@`.

### Authentication & API Security
- **API Tokens**: API tokens stored in `api_tokens` table must be hashed using SHA-256 (`hash('sha256', $token)`). Never store tokens in plaintext. `ApiTokenMiddleware` supports constant-time comparison.
- **Session Eviction Guard**: In `frontend/src/App.tsx`, `AuthBootstrap` only clears user session on explicit HTTP `401 Unauthorized` responses. Network dropouts or transient 500 errors must never trigger logout.
- **File Upload Protection**: In `UploadController.php`, strictly enforce `ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'csv', 'xlsx', 'docx']`. Never allow executable extensions (`.php`, `.phtml`, `.phar`, `.sh`, `.exe`, `.cgi`). SVGs must be checked for embedded `<script>` or event handlers.
- **Path Traversal Protection**: Upload paths must be strictly confined to `uploads/` and reject traversal sequences (`..`).

### RBAC (Role-Based Access Control)
- All protected endpoints in `backend/routes/api.php` must enforce `auth:sanctum` or `api.token` and check permissions via `permission:permission.name` middleware.
- In the frontend, use `<RequirePermission permission="customers.view">` to guard route transitions and buttons. Always subscribe to `useAuthStore(s => s.user)` inside permission components to ensure immediate reactivity upon login.

### AI Integration (`GeminiProvider.php`)
- Standard model fallback sequence: `gemini-2.5-flash` $\rightarrow$ `gemini-2.0-flash` $\rightarrow$ `gemini-1.5-flash`.
- TLS certificate verification is enabled by default (`verify => env('GEMINI_VERIFY_SSL', true)`).
- Never send raw database credentials or customer passwords in AI prompts.

---

## 5. Frontend Development Conventions

1. **Chunk Splitting & Vendor Isolation**:
   - `frontend/vite.config.ts` defines manual chunks for large dependencies (`vendor-charts`, `vendor-maps`, `vendor-framer-motion`, `vendor-icons`, `vendor-core`).
   - Do not bundle entire massive graphing or mapping suites into the initial entry chunk.
2. **Navigation & Links**:
   - Use React Router `<Link to="...">` or `useNavigate()`. Never use plain `<a href="...">` for internal routes as it causes a full page reload and tears down React state.
3. **Timer & Subscription Cleanup**:
   - Any component with `setInterval` or `addEventListener` (e.g. `AttendancePage.tsx`, `MediaLibraryPage.tsx`) **must** return a cleanup function in `useEffect` and handle unmounted refs safely to prevent memory leaks.
4. **Toast Notifications**:
   - Floating notifications are rendered at `top-5 right-5` to prevent collision with the bottom-right `FloatingVoiceAgent`.

---

## 6. Common Pitfalls & How to Avoid Them

| Pitfall | Consequence | Correct Approach |
| :--- | :--- | :--- |
| Editing files with LF on CRLF repo | String replacement fails silently or replaces wrong offsets | Use PowerShell `[System.IO.File]::ReadAllText` / exact matching |
| Running `php artisan migrate:fresh` | Destroys live database data | Use targeted idempotent migrations with `Schema::hasTable` check |
| Using `<a>` tag for internal routing | Full browser reload, loss of auth state | Use `<Link to="...">` from `react-router-dom` |
| Monolithic page re-export in `pages/index.ts` | Vite bundles all pages into one chunk | Split vendors in `vite.config.ts` or use dynamic `React.lazy()` |
| Passing object `{ per_page }` to `apiClient.getCustomers()` | API client expects `(page?: number)` | Call `apiClient.getCustomers(1)` and inspect signature in `api.ts` |
