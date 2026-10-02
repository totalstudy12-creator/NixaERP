# Nexa ERP Permission and Route Security Audit

Audit date: 2026-10-01

## Scope and Baseline

The audit covered the React route table, page component inventory, Laravel's registered API route table, route middleware, the central permission helpers, permission seeder/schema, role/user pivots, and the shared API client. Route totals are from `php artisan route:list --json`; role and permission totals are from the configured database. This is a code and route audit, not a production penetration test.

| Measure | Baseline |
| --- | ---: |
| Frontend page components | 51 |
| Frontend path declarations, including placeholders | 104 |
| Registered API routes | 363 |
| API routes without Sanctum middleware | 19 |
| Authenticated API routes without permission middleware | 18 |
| Permission records | 397 |
| Existing roles | 2 |
| Users assigned to Admin / Manager | 1 / 1 |
| Permissions assigned to Admin / Manager | 397 / 397 |

Permission names are unique in the database schema. The codebase currently uses space, dot, and colon permission spellings; frontend normalization makes some aliases compare alike, but backend middleware checks exact names.

## Page and Permission Matrix

Permission labels below are the names found in the current route table or React route guards. `Auth + RBAC` means the corresponding business API routes use Sanctum and a permission middleware. It does not assert that every controller enforces tenant scope.

| Module | Frontend routes / pages | View permission | Create / edit / delete and special actions | Export / import / reports | Baseline status |
| --- | --- | --- | --- | --- | --- |
| Dashboard | `/dashboard` | `dashboard.view`, `view dashboard`, `view dashboard analytics` | AI actions use `ask dashboard ai`, `view dashboard ai business health`, `view dashboard ai forecast`, `view dashboard ai generic analysis` | Dashboard analytics and profit permissions | Auth + RBAC APIs; page guard present |
| Companies | `/companies` | `view companies` | `create companies`, `edit companies`, `delete companies` | None found | Auth + RBAC APIs; company administration is global by design in current schema |
| Branches | `/branches` | `view branches` | `create branches`, `edit branches`, `delete branches` | None found | Auth + RBAC APIs; no user-branch assignment model found |
| Customers | `/customers`, `/customers-crm`, `/leads`, `/contacts`, `/opportunities` | `view customers` | `create customers`, `edit customers`, `delete customers`; ledger uses `view customers` | `export customers`, `import customers`, template download; customer reports | Auth + RBAC APIs; caller-supplied company/branch filters exist |
| Products | `/products` | `view products` | `create products`, `edit products`, `delete products`; stock-in/out/transfer currently use `edit products` | Inventory export/import/template permissions | Auth + RBAC APIs; per-action stock permissions absent |
| Warehouses | `/warehouses` | `view warehouses` or `warehouses.view` | `create warehouses`, `edit warehouses`, `delete warehouses` | `export warehouses` | Auth + RBAC APIs; tenant scoping requires handler review |
| Inventory | `/inventory`, `/stock-transfers` | `view products` / `view inventory` | Transfers and stock changes use broad product edit permission | `export inventory`, `import inventory` | Auth + RBAC APIs; action-level scope is coarse |
| Suppliers | `/suppliers` | `view suppliers` | `create suppliers`, `edit suppliers`, `delete suppliers` | Colon alias `suppliers:export`; no import route found | Sanctum + per-operation RBAC now enforced; controller tenant authorization remains unresolved |
| Dealers | `/dealers` | `view dealers` | `create dealers`, `edit dealers`, `delete dealers` | `export dealers` | Auth + RBAC APIs; tenant scoping requires handler review |
| Orders | `/orders`, `/manual-orders` | `view orders` | `create orders`, `edit orders`, `delete orders` | None found | Auth + RBAC APIs |
| Invoices | `/invoices`, `/invoices/create`, `/invoices/:id`, `/invoices/:id/edit` | `view invoices` | `create invoices`, `edit invoices`, `delete invoices`, create-from-order, bulk status/delete | `export invoices`, print, duplicate | Auth + RBAC APIs; special actions reuse broad CRUD permissions |
| Sales returns | `/sales-invoice-returns` | `sales.returns.view` | `sales.returns.create`, `.update`, `.delete`, `.confirm` | `.export` | Auth + RBAC APIs; confirm/export route coverage not demonstrated |
| POS | `/pos`, `/sales-pos` | `pos.view` / `view pos` | `pos.create_sale`, hold/resume, discount, receipt email; fallback `create invoices` | History view | Auth + RBAC APIs; broad invoice fallback is present in frontend route guard |
| Quotations / campaigns | `/quotations`, `/campaigns` | `view sales quotations`; marketing dashboard/posts | Sales quotation create; marketing post create/edit/delete | Marketing analytics and calendar views | Auth + RBAC APIs |
| Purchases | `/purchases`, `/purchases/create`, `/purchases/:id/edit` | `view purchase invoices` | `create purchase invoices`, `edit purchase invoices`, `delete purchase invoices`, `add purchase invoice payment` | Purchase reports and summaries | Auth + RBAC APIs |
| Payments | `/payments`, `/income`, `/expenses`, `/qr-payment` | `view payments` | `create payments`, `edit payments`, `delete payments` | No dedicated payment export found | Auth + RBAC APIs; legacy financial entries reuse payment permissions |
| Income & Expenses | `/income-expenses` | `income_expenses.view` | `income_expenses.create`, `.edit`, `.delete`, `.manage_categories`, `.manage_accounts` | `.export`; report routes use `view reports expenses` | Auth + RBAC APIs; no approve/reverse/import route found |
| Accounting | `/bank-cash`, `/budgets` | `view accounting accounts` | accounting account CRUD and journal creation | accounting statements/summary | Auth + RBAC APIs; approval/reversal permissions not found |
| Reports | `/reports`, `/gst-reports` placeholder | `reports.view`, `view reports`, or dashboard/report permissions | No general report mutation | Sales, purchases, GST, ledger, profit, Income, and Expenses; `export reports` exists in seeder | Auth + RBAC APIs; Income and Expense tabs use actual `financial_entries` and share date/company/branch/search filters |
| Employees / recruitment | `/employees`, `/recruitment` | `view employees` | employee CRUD; sensitive compensation/document capabilities | `export employees` | Auth + RBAC APIs |
| Attendance | `/attendance` | `view attendance` | attendance CRUD, bulk update/delete | None found | Auth + RBAC APIs |
| Payroll | `/payroll`, `/hr-payroll` | `view payroll` / `payroll:view` | payroll CRUD, run, approve, payslip and advance/leave/shift/loan actions | Payslip download/print | Auth + RBAC APIs; sensitive company/branch scope not fully validated |
| Biometric | No dedicated page in the route table | `view biometric devices`, scans and queue permissions | Provision/enroll use staff permissions; device heartbeat, attendance, offline sync, pending enrollment, and status use device bearer credentials | Fingerprint template upload/download | Hardware tokens are stored hashed and bound to device ID; firmware rollout is required |
| Files / media | `/files`, `/media-library` | `files.view` / `view uploads` | upload, folder creation, delete, download | No export/import | Auth + RBAC APIs |
| Marketing / inbox | `/marketing`, `/banner-poster` | marketing dashboard/accounts/posts/calendar/analytics/inbox | posts create/edit/delete; inbox send/read | analytics view | Auth + RBAC APIs; public GBP locations route requires review |
| AI | `/ai-assistant` | `view ai assistant insights` | chat/voice; provider create/edit; config changes | Provider/config test | Auth + RBAC APIs; MCP context routes are authenticated without a permission gate |
| Users | `/users` | `view users` | user create/edit/delete and role assignment | None found | Auth + RBAC APIs |
| Roles / permissions | `/user-roles` | `view roles`, `view permissions` | role CRUD; permission updates/deletes currently reuse `create permissions` | None found | Auth + RBAC APIs; management UI exists |
| Settings / security | `/settings`, `/security`, `/automation` | settings/security view permissions | settings create/edit/delete, import, bulk update, token/MCP management | settings export | Auth + RBAC APIs; access token routes share `view settings` for all actions |
| Backups / health | `/backup-restore`, `/health-monitoring` | backup/health view permissions | backup create/restore; health refresh/test/resolve | backup download | Auth + RBAC APIs |
| Audit logs | `/audit-logs` | Authenticated self-view; exact system admins can view all | Authenticated writes; system-admin-only clear | CSV export uses the same server-scoped result set | Central database storage; actor, IP, and user-agent are server-authored; shared across devices |
| General workspace | `/knowledge-base`, `/tickets`, `/project-boards`, `/calendar`, `/profile` | Authenticated only | Page-specific endpoints not located in the primary API route table | None found | Frontend route has no page permission; verify APIs and whether these pages are genuinely user-scoped |
| Placeholder catalogue | 50 informational paths from `salesman` through `busy-import-export` | Authenticated only | No business action should be available on placeholder pages | None | Marked placeholders; should not expose real operational data/actions |

## Backend Route Findings

The baseline route registry had 363 API routes, 19 without Sanctum, including all supplier CRUD and public biometric ingestion. The current registry has 366 API routes; 12 remain without Sanctum: login aliases, 2FA verification, OAuth callback, five device-token endpoints, status, marketing GBP lookup, and WhatsApp webhook. The five device endpoints require a per-device bearer token; the webhook requires a Twilio signature and is throttled. Supplier CRUD now requires Sanctum and per-operation permissions.

Twenty authenticated routes have no route-level permission middleware. They are self-scoped identity/profile/2FA routes, social OAuth actions for the current account, `permissions/me`, MCP status/context, and audit-log writes/clears. Audit writes use Sanctum identity and throttling; clear is separately enforced against exact system-admin roles inside the controller.

The route inventory regression checks all registered API routes for Sanctum, device credential middleware, or an explicit protocol, and checks permission middleware or documented controller/self-scoped guards on authenticated routes. It cannot establish every controller query's company/branch isolation or every table button's behavior.

## Authorization and Error Handling Findings

- Frontend route denial now renders a reusable 403 page with Back and Dashboard actions.
- Frontend admin bypass now comes only from the auth store and exactly matches backend roles `Admin` and `Super Admin`.
- Frontend route/page permission checks fail closed for missing RBAC metadata and wait for fresh `/me` permissions after login.
- API client centrally handles 401 logout, status-specific errors, validation errors, timeouts, and network failures.
- Permission names have multiple spellings; backend permission middleware uses exact names. The permission table has a unique name constraint, and seeding uses `firstOrCreate`.
- No user-company or user-branch assignment relation exists in the users schema/migrations. Several handlers accept caller-provided `company_id` and `branch_id`; user-specific tenant isolation cannot be implemented safely without a defined assignment model.
- Live role audit: only `Admin` and `Manager` exist, each with one assigned user. Before the new module permissions were added, both roles held all 397 existing permissions. The `Manager` role received only the seven newly implemented Income & Expenses capabilities; its other customized grants were preserved.

## Fixes and Follow-up Status

## Final Results

| Measure | Final result |
| --- | ---: |
| Frontend page components audited | 51 |
| Frontend path declarations audited | 104 |
| Backend API routes audited | 366 |
| Unique permission records after migrations | 411 |
| New permission records applied | 14 |
| Roles audited | 2 |
| Roles updated | 1 (`Manager`) |
| Frontend guard implementations fixed | 17 |
| Backend route/action authorization boundaries fixed | 14 route gates, plus 7 system-role safeguards |
| Company-scope fixes | 0 |
| Branch-scope fixes | 0 |
| Error-handling/security response fixes | 3 shared boundaries |
| New authorization/security tests | 17 |
| Full backend tests | 43 passed, 962 assertions |
| Frontend TypeScript/production build | Passed |
| Pending migrations after apply | 0 |

### Permissions Created

The applied migrations added these 14 permission records (the first 12 came from the existing Income & Expenses module migration; the final two were added for this audit):

- `income_expenses.view`
- `income_expenses.create`
- `income_expenses.edit`
- `income_expenses.delete`
- `income_expenses.approve`
- `income_expenses.reject`
- `income_expenses.reverse`
- `income_expenses.export`
- `income_expenses.manage_categories`
- `income_expenses.manage_accounts`
- `income_expenses.manage_recurring`
- `income_expenses.view_reports`
- `edit permissions`
- `delete permissions`

The permissions table has a unique name constraint; the migrations and seeder use idempotent inserts.

### Role Matrix

| Role | Permissions added | Reason |
| --- | --- | --- |
| Admin | None in the role pivot; the existing backend `Admin` bypass still resolves every active permission | Preserve complete system access and recovery path |
| Manager | `income_expenses.view`, `income_expenses.create`, `income_expenses.edit`, `income_expenses.delete`, `income_expenses.export`, `income_expenses.manage_categories`, `income_expenses.manage_accounts`, `income_expenses.view_reports` | This live role already held all 397 pre-existing operational permissions. Grant only implemented transaction and report capabilities; do not grant permission-definition edit/delete or unimplemented approve/reject/reverse/recurring actions |

No user-role assignments were changed. The live role grant totals after migration are Admin: 397 pivoted permissions plus full active-permission bypass; Manager: 405 pivoted permissions. Eight permissions were added to Manager across the implemented Income & Expenses and report capabilities.

### Applied Backend Fixes

- Moved all five supplier CRUD routes behind Sanctum and their existing view/create/edit/delete permissions.
- Added hashed per-device biometric bearer credentials. Staff device provisioning/enrollment is permission-gated; hardware writes are bound to the credential's device identity.
- Required Twilio webhook signatures before message persistence and rate-limited the endpoint.
- Allowed authenticated system admins to edit protected-role grants and provision/assign admin users; blocked non-admin escalation, built-in role rename/deactivation/deletion, and removal of the last system administrator.
- Split permission-definition update/delete from `create permissions` into `edit permissions` and `delete permissions`; returned generic 403 responses and logged denial context server-side.
- Added consistent frontend API fallbacks for 401/403/404/409/422/429/500, timeout, and network errors.
- Added database-backed audit logging for all shared `addAppLog` actions. The API derives the actor from Sanctum, records IP and user-agent, and serves the same records across devices; local storage is retained only as an offline fallback.
- Scoped audit reads to the authenticated actor by default; only exact `Admin` and `Super Admin` roles can read all users' audit rows. Non-admin `user_id` filters are ignored, and offline browser entries use the same actor filter.
- Added separate Income Summary and Expense Summary report tabs backed by real direction-filtered financial entries; fixed the report dashboard so net profit includes other income and recorded expenses.

### Remaining Scope Limitations

- Cross-company and per-user branch isolation remain unverified and are not fixed: the schema has no user-to-company/branch assignments, so a safe allowlist cannot be derived. Several controllers accept caller-provided company/branch filters. A tenant assignment model and handler-level query enforcement are required before this can be certified.
- The audit matrix covers route/page ownership and permission families, but not a manual review of every button in all 51 pages. The automated test covers API route middleware, not every controller's resource scope or every export query.
- The configured Manager role already has a broad legacy grant set (all 397 prior permissions). It was not reduced because its intent is undocumented and the user explicitly required preserving customized grants; only the seven new operational permissions were added.
- Biometric devices must be reprovisioned by an authorized staff user, and firmware must send `Authorization: Bearer <device_token>` to the five device endpoints. The raw token is returned only at provisioning and its hash is never serialized.
- Configure `TWILIO_AUTH_TOKEN`; set `TWILIO_WEBHOOK_URL` to the exact public callback URL when reverse-proxy URL reconstruction differs from Twilio's configured URL. Without the auth token, the webhook fails closed with 503.
- Vite reports existing non-blocking dynamic-import and large-chunk warnings; no frontend lint script is configured.