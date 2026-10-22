# RaptorERP — Testing & Quality Assurance Guide

> **Current Baseline:** 79 Tests Passing, 1214 Assertions, 0 Failures  
> **Frontend:** TypeScript 5.5 Strict Mode + Vite Production Bundling  
> **Backend Framework:** PHPUnit 11 / Laravel 12 Testing Harness  

---

## 1. Backend PHPUnit Suite

### Running the Full Suite
```powershell
cd c:\xampp\htdocs\RaptorERP\backend
php artisan test
```

### Running Specific Test Suites

#### Security Hardening Audit Suite
Tests upload safety, SVG script blocking, path traversal prevention, API token SHA-256 validation, and public route stability:
```powershell
php artisan test --filter SecurityHardeningAuditTest
```

#### Invoicing & Financial Workflows
Tests invoice generation, tax calculations, payment status transitions, and credit notes:
```powershell
php artisan test --filter InvoiceAuditTest
```

#### Inventory & Stock Transfers
Tests warehouse stock levels, stock movement audits, and cross-branch transfers:
```powershell
php artisan test --filter StockTransferAuditTest
```

#### Multi-Tenant Data Isolation
Tests company and branch data segregation against IDOR attacks:
```powershell
php artisan test --filter TenantScopingAuditTest
```

---

## 2. Frontend QA & Static Analysis

### TypeScript Compilation & Build Verification
```powershell
cd c:\xampp\htdocs\RaptorERP\frontend
npm run build
```
This triggers:
1. `tsc` — Static type verification across all pages, components, services, and state stores.
2. `vite build` — Asset bundling, Rollup chunk splitting, and production optimization.

### Live Development Preview
```powershell
npm run dev
```
Runs the Vite development server with Hot Module Replacement (HMR) at `http://localhost:5173`.

---

## 3. Writing New Regression Tests

When fixing a bug or adding an ERP feature:
1. Create or open the appropriate test class in `backend/tests/Feature/`.
2. Use database transactions or the `RefreshDatabase` trait where appropriate.
3. Assert both HTTP status codes and response JSON structures:
   ```php
   $response = $this->withHeaders(['Authorization' => "Bearer $token"])
                    ->postJson('/api/resource', $payload);
   $response->assertStatus(200)
            ->assertJsonPath('success', true);
   ```
4. Verify non-destructive local execution before committing.
