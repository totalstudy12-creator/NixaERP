# RaptorERP — Security & Compliance Architecture

> **Last Updated:** 22 October 2026  
> **Security Baseline Version:** 2.0-Hardened  
> **Scope:** Authentication, Authorization (RBAC), Injection Defense, Storage & Upload Protection, AI Security, Audit Trails

---

## 1. Security Principles

RaptorERP adheres to defense-in-depth principles:
1. **Never Trust Client Input**: All API endpoints validate types, formats, lengths, and constraints.
2. **Server-Side Authorization**: Client-side UI gates (e.g. `<RequirePermission>`) provide UX convenience; API routes strictly enforce `auth:sanctum` and `permission:...` middleware at the HTTP boundary.
3. **Cryptographic Integrity**: Passwords use bcrypt; Machine API tokens and hardware credentials use SHA-256 hashes. Plaintext credentials are never persisted.
4. **Tenant Isolation**: Queries and mutations are bounded by `company_id` and `branch_id` scopes to prevent Insecure Direct Object References (IDOR).

---

## 2. Authentication & Credential Storage

### 2.1 User Sessions
- Users authenticate via `/api/login` and receive a Sanctum Personal Access Token.
- Client stores the token securely in local storage.
- In `frontend/src/App.tsx`, the `AuthBootstrap` provider verifies the session. Crucially, session clearance is restricted solely to HTTP `401 Unauthorized` responses. Network timeouts or server 500s do not log the user out.

### 2.2 System API Tokens (`api_tokens`)
- System and third-party integrations authenticate using API tokens via `X-Api-Token` or `Authorization: Bearer <token>`.
- **SHA-256 Hash Enforcement**:
  - Tokens are generated with a high-entropy random string (`Str::random(64)`).
  - The database only stores `hash('sha256', $plainToken)`.
  - The `ApiTokenMiddleware` computes `hash('sha256', $receivedToken)` and uses `hash_equals()` for timing-attack-safe comparison.
  - A dual-mode backward compatibility check seamlessly accommodates any legacy tokens during zero-downtime upgrades.

---

## 3. Storage, File Uploads & Path Traversal Prevention

In `backend/app/Http/Controllers/Api/UploadController.php`:
1. **Extension Whitelisting**: Only vetted non-executable media and document extensions are accepted:
   ```php
   ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'csv', 'xlsx', 'docx'];
   ```
2. **Execution Blockade**: Scripts and dangerous extensions (`.php`, `.phtml`, `.phar`, `.sh`, `.exe`, `.cgi`, `.bat`, `.html`, `.js`) are rejected unconditionally.
3. **SVG Script Check**: SVG images undergo content inspection; files containing `<script>` tags, inline JavaScript handlers (`onload=`, `onerror=`), or external entity references are rejected.
4. **Randomized Filenames**: Files are saved with cryptographically random UUID/hash names (`Str::random(40) . '.' . $extension`) rather than user-supplied filenames.
5. **Path Traversal Defense**: The file deletion endpoint rejects path traversal sequences (`..`, `/`, `\`) and strictly enforces that targets reside within the `uploads/` directory.

---

## 4. Artificial Intelligence & LLM Security

In `backend/app/Services/GeminiProvider.php`:
1. **TLS / SSL Verification**:
   - Certificate validation is enabled by default (`verify => env('GEMINI_VERIFY_SSL', true)`).
   - Man-in-the-middle attacks on AI communication channels are blocked.
2. **Model Fallback Chain**:
   - Dynamic fallbacks across `gemini-2.5-flash` $\rightarrow$ `gemini-2.0-flash` $\rightarrow$ `gemini-1.5-flash` ensure continuity without compromising output structure.
3. **Data Protection**:
   - Financial and employee records passed to AI contextualizers are stripped of sensitive cryptographic salts, unhashed tokens, and payment card data.

---

## 5. Automated Security Regression Testing

The automated security test suite `backend/tests/Feature/SecurityHardeningAuditTest.php` continuously validates:
- [x] File upload extension rejection (`.php`, executable files).
- [x] SVG script injection detection.
- [x] Path traversal prevention during file deletion.
- [x] API Token SHA-256 storage and authentication.
- [x] Public marketing endpoints error handling (zero 500s).

Run tests:
```powershell
cd backend
php artisan test --filter SecurityHardeningAuditTest
```
