# NixaERP Google Drive Automated Backup & Disaster Recovery System

> **Standard:** Enterprise Disaster Recovery & Continuous Data Protection  
> **Backend Framework:** Laravel 12 / PHP 8.2+ / MySQL 8.0+  
> **Frontend:** React 18 / TypeScript 5.5 / Tailwind CSS 4  
> **Storage Provider:** Google Drive API v3 (Resumable Chunked Upload Protocol)  
> **Encryption Standard:** OpenSSL AES-256-GCM (Authenticated Encryption with Associated Data - AEAD)

---

## 1. System Architecture Overview

The **NixaERP Automated Backup & Disaster Recovery System** protects the entire ERP against database corruption, accidental deletion, ransomware, server hardware failures, and cloud hosting outages.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        NixaERP Application Layer                       │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
┌──────────────────────┐                           ┌──────────────────────┐
│ DatabaseDumpService  │                           │  FileBackupService   │
│  (mysqldump / PHP)   │                           │ (PharData / tar.gz)  │
└──────────┬───────────┘                           └──────────┬───────────┘
           │                                                   │
           └─────────────────────────┬─────────────────────────┘
                                     ▼
                      ┌─────────────────────────────┐
                      │  BackupEncryptionService    │
                      │  (OpenSSL AES-256-GCM AEAD) │
                      └──────────────┬──────────────┘
                                     ▼
                      ┌─────────────────────────────┐
                      │    GoogleDriveService       │
                      │ (Chunked Resumable Upload)  │
                      └──────────────┬──────────────┘
                                     ▼
                      ┌─────────────────────────────┐
                      │ Google Drive Cloud Storage  │
                      └─────────────────────────────┘
```

### Core Components
1. **`GoogleOAuthService`**: Server-side OAuth 2.0 flow with offline access, random cryptographic state verification, token refresh handler, and encryption at rest using Laravel's native `'encrypted'` model cast.
2. **`GoogleDriveService`**: Google Drive API v3 client implementing the 2 MiB chunked resumable upload protocol, storage quota queries, folder auto-discovery/creation, and file verification.
3. **`BackupEncryptionService`**: Authenticated encryption (AEAD) using OpenSSL `aes-256-gcm`. Every backup artifact is encrypted before transmission, with a unique 96-bit initialization vector (IV) and a 128-bit authentication tag.
4. **`DatabaseBackupService`**: Hybrid database engine utilizing high-performance `mysqldump` CLI with isolated temporary credentials file (`my.cnf`), with an automatic pure PHP streaming SQL dumper fallback.
5. **`FileBackupService`**: Uploaded assets backup engine using PHP `PharData` to produce `.tar` archives, generating a detailed `manifest.json` with file sizes and SHA-256 checksums, and enforcing strict path traversal (`..`) prevention during restoration.
6. **`BackupRetentionService`**: Implements Grandfather-Father-Son (GFS) retention rules (30 daily, 12 weekly, 12 monthly) with an absolute invariant: **the newest or only valid recovery point is never deleted**.
7. **`BackupRestoreService`**: Disaster recovery pipeline featuring mandatory pre-restore safety snapshots, maintenance mode guards, checksum and schema integrity verification, and automatic instant rollback upon failure.

---

## 2. Google Cloud Platform (GCP) Configuration

### Step 1: Create GCP Project & Enable Drive API
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project named **`NixaERP-Backup`**.
3. Under **APIs & Services > Library**, search for and enable:
   - **Google Drive API**

### Step 2: Configure OAuth Consent Screen
1. Go to **APIs & Services > OAuth consent screen**.
2. Select **External** (or **Internal** if using Google Workspace).
3. Fill in application name: `NixaERP Disaster Recovery`.
4. Add the minimum required scopes:
   - `https://www.googleapis.com/auth/drive.file` *(Allows app to view and manage only the files and folders it creates)*
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`

### Step 3: Create OAuth 2.0 Client Credentials
1. Go to **APIs & Services > Credentials > Create Credentials > OAuth client ID**.
2. Application type: **Web application**.
3. Authorized JavaScript origins:
   - `http://localhost:5173` (Frontend dev)
   - `http://localhost:8000` (Backend API)
   - `https://your-production-erp-domain.com`
4. Authorized redirect URIs:
   - `http://localhost:5173/backup-restore` (Frontend OAuth receiver)
   - `https://your-production-erp-domain.com/backup-restore`

### Step 4: Configure Environment Variables
Add these values to your `backend/.env` file:
```env
GOOGLE_DRIVE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_DRIVE_CLIENT_SECRET="your-client-secret"
GOOGLE_DRIVE_REDIRECT_URI="http://localhost:5173/backup-restore"
```

---

## 3. Cryptographic Security Standards

All backups are encrypted with **AES-256-GCM** prior to leaving the server.

- **Algorithm**: `AES-256-GCM` (Galois/Counter Mode).
- **Key Derivation**: HKDF (HMAC Key Derivation Function) with SHA-256 over `APP_KEY` and installation salt.
- **Nonce / IV**: 12-byte (96-bit) cryptographically secure random bytes generated per file (`random_bytes(12)`).
- **Authentication Tag**: 16-byte (128-bit) integrity tag (`OPENSSL_RAW_DATA`).
- **File Format (`.enc`)**:
  ```
  ┌────────────────────────────────────────────────────────────┐
  │ MAGIC (6B) │ VER (2B) │ IV (12B) │ TAG (16B) │ CIPHERTEXT │
  └────────────────────────────────────────────────────────────┘
  ```
- **Tamper Detection**: Any modification to the encrypted ciphertext or authentication tag immediately causes decryption to fail with a `RuntimeException`.

---

## 4. Automated Scheduling & Cron Configuration

### Linux / Production cPanel Setup
Configure the single unified Laravel cron job in your crontab (`crontab -e`):
```bash
* * * * * cd /path/to/RaptorERP/backend && php artisan schedule:run >> /dev/null 2>&1
```

### Registered Backup Schedule (Asia/Kolkata / IST)
| Schedule | Time (IST) | Command | Purpose |
| :--- | :--- | :--- | :--- |
| **Daily** | `02:00 AM` | `backup:run --type=daily` | Full database & uploads encrypted backup to Drive |
| **Weekly** | `Sun 03:00 AM` | `backup:verify` | Deep remote checksum & schema integrity verification |
| **Daily** | `04:00 AM` | `backup:prune` | Enforces retention limits & cleans expired Drive files |

*Note: All scheduled jobs utilize `withoutOverlapping(60)` and `onOneServer()` to prevent race conditions.*

---

## 5. Artisan CLI Commands Reference

### Manual Backup Run
```powershell
# Run full backup (Database + Uploads)
php artisan backup:run --type=manual

# Backup only database
php artisan backup:run --type=daily --without-files

# Dispatch to background queue
php artisan backup:run --type=daily --async
```

### Verify Backup Integrity
```powershell
# Verify recent backups
php artisan backup:verify

# Deep cryptographic verification (downloads and tests decryption)
php artisan backup:verify --deep --run-id=1
```

### Prune Expired Backups
```powershell
php artisan backup:prune
```

---

## 6. Disaster Recovery & Restoration Protocol

### Safety Invariants
1. **Pre-Restore Safety Snapshot**: Before modifying live database tables or asset directories, an automatic snapshot is saved to `storage/app/backup_recovery/safety_YYYYMMDD_HHMMSS`.
2. **Atomic Rollback Guarantee**: If any phase of the restore encounters a corrupted artifact or database failure, the system automatically aborts and restores from the safety snapshot.
3. **OAuth Preservation**: Connection credentials and OAuth refresh tokens are preserved during restoration so the admin is never disconnected from Google Drive.
4. **Maintenance Mode**: The ERP is placed in maintenance mode (`php artisan down`) during restoration to prevent concurrent transactions.

---

## 7. Verification & Automated Test Suite

Run the dedicated test suite:
```powershell
cd c:\xampp\htdocs\RaptorERP\backend
php artisan test --filter GoogleDriveBackupSystemTest
```
*Expected baseline:* **8 passed (27 assertions), 0 failures**.
