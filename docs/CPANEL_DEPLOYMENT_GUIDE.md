# RaptorERP v1.2.3 — cPanel Shared Hosting Production Deployment Guide

> **Target Environment:** cPanel Shared Hosting (Apache, MySQL 8 / MariaDB 10.5+, PHP 8.2 or 8.3)  
> **Application Stack:** Laravel 12 API Backend + React 18 / Vite SPA Frontend + Flutter Client Endpoints  
> **Version:** `1.2.3`

---

## 1. Architecture & Deployment Strategy

When deploying RaptorERP to a cPanel shared hosting account, the primary objective is **security and stability**:

```
/home/<cpanel_user>/
├── raptor-backend/                 <-- Laravel Backend (PRIVATE: Stored OUTSIDE public_html)
│   ├── app/
│   ├── bootstrap/
│   ├── config/
│   ├── database/
│   ├── storage/
│   ├── vendor/
│   ├── .env                       <-- Critical secrets completely inaccessible to public HTTP requests
│   └── artisan
└── public_html/                   <-- Public Document Root (Web accessible)
    ├── assets/                    <-- React 18 / Vite compiled CSS, JS, fonts
    ├── index.html                 <-- React SPA entry point
    ├── favicon.ico
    └── .htaccess                  <-- Apache rewrite rules for React Router + API proxy
```

### Recommended Setup: Dual Subdomain Architecture

For maximum performance and clean isolation, use two subdomains in cPanel:

1. **`app.yourdomain.com`** (or `yourdomain.com`) $\rightarrow$ Document Root: `/home/<cpanel_user>/public_html` (Serves the compiled React 18 SPA).
2. **`api.yourdomain.com`** $\rightarrow$ Document Root: `/home/<cpanel_user>/raptor-backend/public` (Serves the Laravel 12 REST API).

*Note: If your host only allows a single domain, Section 6 provides the unified single-domain `.htaccess` configuration.*

---

## 2. Server Prerequisites & cPanel Configuration

Before uploading files, configure your cPanel environment:

### PHP Version & Extensions
1. Open cPanel $\rightarrow$ **MultiPHP Manager** (or **Select PHP Version**).
2. Set PHP version to **PHP 8.2** or **PHP 8.3**.
3. Under **PHP Extensions** (or **PECL modules**), confirm the following are enabled:
   - `bcmath`
   - `ctype`
   - `curl`
   - `fileinfo`
   - `gd`
   - `json`
   - `mbstring`
   - `openssl`
   - `pdo_mysql`
   - `tokenizer`
   - `xml`
   - `zip`
4. Under **MultiPHP INI Editor**, ensure recommended settings:
   - `memory_limit` = `256M` or `512M`
   - `upload_max_filesize` = `64M`
   - `post_max_size` = `64M`
   - `max_execution_time` = `300`

### SSL / HTTPS
1. In cPanel, navigate to **SSL/TLS Status**.
2. Select your domains (`yourdomain.com`, `api.yourdomain.com`, etc.) and click **Run AutoSSL**.
3. Ensure a valid Let's Encrypt or Sectigo certificate is active before connecting Flutter apps.

---

## 3. Step-by-Step Deployment Procedure

### Step 1: Build the Frontend (On Local Machine)

In your local project terminal:

```powershell
cd c:\xampp\htdocs\RaptorERP\frontend
npm run build
```

This compiles your TypeScript and React application into optimized, chunked production assets inside `frontend/dist/`.

### Step 2: Prepare the Backend Package (On Local Machine)

In your local backend folder, install production-only dependencies and optimize the autoloader:

```powershell
cd c:\xampp\htdocs\RaptorERP\backend
composer install --optimize-autoloader --no-dev
```

Create a ZIP archive of `backend/` excluding `storage/logs/*` and test caches:
- Name the archive: `raptor-backend.zip`.

### Step 3: Upload and Extract Files in cPanel

1. Log into your **cPanel File Manager**.
2. Navigate to your user home root: `/home/<cpanel_user>/`.
3. Upload `raptor-backend.zip` to `/home/<cpanel_user>/` (outside `public_html`).
4. Extract it into a directory named `raptor-backend`.
5. Navigate into `/home/<cpanel_user>/public_html/`.
6. Upload the contents of your local `frontend/dist/` directly into `public_html/` (including `index.html` and the `assets/` folder).

### Step 4: Create MySQL Database & User

1. In cPanel, open **MySQL Database Wizard**.
2. **Step 1:** Create a database name (e.g., `<user>_raptorerp`).
3. **Step 2:** Create a user (e.g., `<user>_dbadmin`) and generate a strong password.
4. **Step 3:** Assign **ALL PRIVILEGES** to the user for this database.
5. Note down your Database Name, Username, and Password.

### Step 5: Configure Backend `.env`

In `/home/<cpanel_user>/raptor-backend/`, copy `.env.example` to `.env` (or edit existing `.env`):

```dotenv
APP_NAME=RaptorERP
APP_ENV=production
APP_KEY=base64:YOUR_APP_KEY_HERE
APP_DEBUG=false
APP_URL=https://api.yourdomain.com
APP_VERSION=1.2.3

LOG_CHANNEL=daily
LOG_DEPRECATIONS_CHANNEL=null
LOG_LEVEL=error

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=<user>_raptorerp
DB_USERNAME=<user>_dbadmin
DB_PASSWORD="YourSecurePasswordHere"

SESSION_DRIVER=database
SESSION_LIFETIME=120
SESSION_ENCRYPT=false
SESSION_PATH=/
SESSION_DOMAIN=.yourdomain.com

SANCTUM_STATEFUL_DOMAINS=app.yourdomain.com,yourdomain.com

# AI Assistant Gemini API Configuration
GEMINI_API_KEY=AIzaSy...your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_VERIFY_SSL=true

# Mobile Apps Default Version Rules
WMS_MIN_VERSION=1.0.0
AI_AGENT_MIN_VERSION=1.0.0
BILLING_MIN_VERSION=1.0.0
```

> [!IMPORTANT]
> Keep `APP_DEBUG=false` in production to prevent sensitive database credentials or call stacks from appearing in HTTP responses.

### Step 6: Run Database Migrations & Canonical Seeders

#### Method A: If you have cPanel Terminal / SSH Access
```bash
cd /home/<cpanel_user>/raptor-backend
php artisan migrate --force
php artisan db:seed --class=CanonicalPermissionsSeeder --force
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

#### Method B: If you do NOT have SSH Access (Via Temporary Web Runner)
Create a temporary file `/home/<cpanel_user>/raptor-backend/public/run-setup.php`:

```php
<?php
// Delete immediately after running!
require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);

echo "<pre>";
$kernel->call('migrate', ['--force' => true]);
echo $kernel->output();

$kernel->call('db:seed', ['--class' => 'CanonicalPermissionsSeeder', '--force' => true]);
echo $kernel->output();

$kernel->call('config:cache');
$kernel->call('route:cache');
echo "Setup completed successfully!</pre>";
```
Visit `https://api.yourdomain.com/run-setup.php` in your browser once, then **immediately delete** `run-setup.php` from your server.

---

## 4. File Permissions & Storage Symlink on Shared Hosting

### Setting Permissions
In cPanel File Manager or via SSH:
- Directories: `755`
- Files: `644`
- `raptor-backend/storage/` and all subfolders: `775`
- `raptor-backend/bootstrap/cache/`: `775`

### Creating the Storage Symlink
Since shared hosting rarely allows `php artisan storage:link` via symlink due to shell restrictions, use PHP's native `symlink()` function:

Create `/home/<cpanel_user>/raptor-backend/public/symlink.php`:

```php
<?php
$target = '/home/<cpanel_user>/raptor-backend/storage/app/public';
$shortcut = '/home/<cpanel_user>/raptor-backend/public/storage';

if (file_exists($shortcut)) {
    echo "Symlink already exists!";
} else {
    symlink($target, $shortcut);
    echo "Symlink created successfully from $target to $shortcut";
}
```
Visit `https://api.yourdomain.com/symlink.php` once, then delete `symlink.php`.

---

## 5. Apache `.htaccess` Configurations

### Frontend `.htaccess` (`/home/<cpanel_user>/public_html/.htaccess`)
This file ensures HTTPS enforcement, gzip compression, browser caching, and handles client-side React Router routing:

```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /

    # Force HTTPS
    RewriteCond %{HTTPS} off
    RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

    # Don't rewrite real existing files or directories
    RewriteCond %{REQUEST_FILENAME} -f [OR]
    RewriteCond %{REQUEST_FILENAME} -d
    RewriteRule ^ - [L]

    # Rewrite all other requests to index.html for React Router SPA
    RewriteRule ^ index.html [L]
</IfModule>

# Security Headers
<IfModule mod_headers.c>
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>

# Compression
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/plain text/html text/xml text/css application/xml application/xhtml+xml application/rss+xml application/javascript application/x-javascript application/json
</IfModule>
```

### Backend `.htaccess` (`/home/<cpanel_user>/raptor-backend/public/.htaccess`)
Ensure Authorization headers reach Laravel on cPanel Apache:

```apache
<IfModule mod_rewrite.c>
    <IfModule mod_negotiation.c>
        Options -MultiViews -Indexes
    </IfModule>

    RewriteEngine On

    # Handle Authorization Header (Crucial for Sanctum & Bearer tokens on cPanel)
    RewriteCond %{HTTP:Authorization} .
    RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]

    # Redirect Trailing Slashes If Not A Folder...
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteCond %{REQUEST_URI} (.+)/$
    RewriteRule ^ %1 [L,R=301]

    # Send Requests To Front Controller...
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteRule ^ index.php [L]
</IfModule>
```

---

## 6. Single-Domain Alternative Setup

If your shared hosting plan allows only one domain without subdomains:

1. Move your compiled React frontend into `/public_html/`.
2. Place the Laravel backend in `/home/<cpanel_user>/raptor-backend/`.
3. Create a symlink or subdirectory `/public_html/api` pointing to `/home/<cpanel_user>/raptor-backend/public`.
4. Inside `/public_html/.htaccess`:
```apache
RewriteEngine On

# Route /api/ requests to Laravel backend
RewriteRule ^api/(.*)$ /api/index.php [L]

# Route all other routes to React SPA
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [L]
```

---

## 7. cPanel Scheduled Cron Jobs

RaptorERP executes recurring tasks (attendance summaries, automated backups, health checks, notification digests) via Laravel's task scheduler.

1. In cPanel, search for **Cron Jobs**.
2. Under **Add New Cron Job**:
   - **Common Settings:** Choose *Once Per Minute* (`* * * * *`).
   - **Command:**
     ```bash
     /usr/local/bin/php /home/<cpanel_user>/raptor-backend/artisan schedule:run >> /dev/null 2>&1
     ```
   *(Replace `/usr/local/bin/php` with your host's specific PHP 8.2/8.3 binary path if different, e.g. `/usr/bin/ea-php82`)*.
3. Click **Add New Cron Job**.

---

## 8. Flutter Mobile Applications Integration

RaptorERP v1.2.3 features native Flutter support for three mobile apps:
1. **Nixa WMS** (`nixa_wms`): Barcode scanning, transfers, inventory audits.
2. **Nixa AI Agent** (`nixa_ai_agent`): Mobile AI assistant with hands-free voice studio.
3. **Nixa Billing** (`nixa_billing`): Mobile POS, thermal Bluetooth printing, offline cache.

### Flutter Production App Configuration

In your Flutter app's environment configuration (e.g. `lib/core/constants/api_constants.dart`):

```dart
class ApiConfig {
  // Live cPanel Production API URL:
  static const String baseUrl = 'https://api.yourdomain.com/api';
  
  // App Identifiers:
  static const String wmsAppId = 'nixa_wms';
  static const String aiAgentAppId = 'nixa_ai_agent';
  static const String billingAppId = 'nixa_billing';

  // Handshake endpoint:
  static String handshakeUrl(String appId) => '$baseUrl/v1/apps/$appId/handshake';
}
```

### Handshake & Version Verification Flow

On Flutter app startup:
1. App calls `GET https://api.yourdomain.com/api/v1/apps/{identifier}/handshake?version=1.2.3`.
2. Backend responds:
   ```json
   {
     "status": "success",
     "app": {
       "name": "Nixa Billing",
       "identifier": "nixa_billing",
       "current_version": "1.2.3",
       "min_version": "1.0.0",
       "force_update": false,
       "maintenance_mode": false,
       "download_url": "https://yourdomain.com/downloads/nixa-billing.apk"
     },
     "access": {
       "status": "active",
       "allowed_roles": ["admin", "cashier", "manager"]
     }
   }
   ```
3. If `maintenance_mode: true` or `force_update: true`, the Flutter app displays the appropriate banner and blocks access until updated.

---

## 9. Thermal Printer & POS Persistence Verification

1. When accessing RaptorERP in Chrome/Edge, configure your POS printer under **Settings $\rightarrow$ Printer Settings**.
2. Settings are persisted automatically in `localStorage` under `nixa_connected_printer_config` and synchronized with the backend.
3. Turning on **One-Click Direct Printout** enables background printing for receipts and invoices without prompt dialogs.
4. Test receipt printing can be confirmed by clicking **Test Print Receipt** in the Settings panel.

---

## 10. Post-Deployment Verification Checklist

| Step | Check | Expected Result |
| :--- | :--- | :--- |
| 1 | Visit `https://yourdomain.com` | React SPA loads, title displays RaptorERP v1.2.3 |
| 2 | Visit `https://yourdomain.com/ai-assistant` directly | Page renders without 404 (confirms `.htaccess` SPA routing) |
| 3 | Visit `https://api.yourdomain.com/api/v1/apps/nixa_wms/handshake` | Returns HTTP 200 with JSON app metadata |
| 4 | Log into Admin Dashboard | Real database data populates; no mock data or network errors |
| 5 | Test AI Assistant Voice Studio & Executive Chat | Speech recognition and vocal playback function seamlessly |
| 6 | Check cPanel Cron Logs | `schedule:run` triggers once every minute without error |
| 7 | Check Security Permissions | Storage directory is not browsable; `.env` returns HTTP 403/404 |
