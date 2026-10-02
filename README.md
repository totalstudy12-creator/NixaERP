# RaptorERP

RaptorERP is a Laravel 12 + React ERP platform for multi-company, multi-branch operations with role-based access, sales workflows, notifications, and WhatsApp integrations.

## Overview

The current system includes:

- Multi-company and multi-branch business structure
- Laravel API backend with permission-based access control
- React + Vite frontend for a dashboard-driven ERP workflow
- Sales, invoicing, products, customers, and reporting modules
- Notification delivery via queue jobs for email, SMS, WhatsApp, and browser push
- Local WhatsApp service support using the Web.js worker pattern

## Stack

### Backend
- PHP 8.2+
- Laravel 12
- MySQL support with local development defaults
- Sanctum + custom RBAC patterns
- Queue workers for notifications
- Twilio, Web Push, IMAP, Gemini, Google, and social login integrations

### Frontend
- React 18
- TypeScript
- Vite
- Ant Design + Tailwind-inspired UI tooling

## Project structure

```text
RaptorERP/
├── backend/          # Laravel API and queue workers
├── frontend/         # React frontend
├── docs/             # Additional technical docs
├── data/             # Seed/reference data files
├── README.md         # Project overview
├── INSTALLATION.md   # Local setup
├── NOTIFICATION_DELIVERY_SETUP.md
├── API_DOCUMENTATION.md
├── QUICK_REFERENCE.md
└── INDEX.html / index.php
```

## Quick start

### 1) Backend setup

```bash
cd backend
composer install
```

Make sure the backend `.env` is configured with your database and app settings before bootstrapping:

```dotenv
APP_NAME="RaptorERP"
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost:8000

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=raptore_db
DB_USERNAME=root
DB_PASSWORD=
```

Then run:

```bash
php artisan key:generate
php artisan migrate --force
php artisan db:seed
php artisan serve
```

The API will be available at `http://localhost:8000`.

### 2) Frontend setup

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:5173`.

### 3) Notifications / queue worker

For email, SMS, WhatsApp, and push delivery, run the queue worker in a separate terminal:

```bash
cd backend
php artisan queue:work --tries=3 --backoff=10
```

The project also supports a local WhatsApp bridge:

```dotenv
WHATSAPP_WEB_JS_ENABLED=true
WHATSAPP_SERVICE_URL=http://127.0.0.1:3010
WHATSAPP_SERVICE_TOKEN=erp-whatsapp-local-token
WHATSAPP_SERVICE_PORT=3010
WHATSAPP_SERVICE_HOST=127.0.0.1
WWEBJS_AUTH_PATH=/xampp/htdocs/RaptorERP/backend/storage/whatsapp-session
WWEBJS_CLIENT_ID=nexa-erp
```

## Default login

If the seeders are enabled, the demo login is typically:

- Email: `test@example.com`
- Password: `password`

## Key environment values

The current project relies on these environment groups in `backend/.env`:

```dotenv
TWILIO_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_SMS_FROM=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

WEBPUSH_SUBJECT=mailto:admin@example.com
WEBPUSH_VAPID_PUBLIC_KEY=...
WEBPUSH_VAPID_PRIVATE_KEY=...

WHATSAPP_SERVICE_URL=http://127.0.0.1:3010
WHATSAPP_SERVICE_TOKEN=erp-whatsapp-local-token
```

Keep provider secrets in the backend only. Do not expose them in the browser build.

## Useful commands

```bash
cd backend
php artisan test
php artisan route:list
php artisan queue:work --tries=3 --backoff=10

cd frontend
npm run build
npm run dev
```

## Documentation

- [INSTALLATION.md](INSTALLATION.md) — local setup and environment configuration
- [NOTIFICATION_DELIVERY_SETUP.md](NOTIFICATION_DELIVERY_SETUP.md) — email, SMS, WhatsApp, and push setup
- [API_DOCUMENTATION.md](API_DOCUMENTATION.md) — API reference
- [QUICK_REFERENCE.md](QUICK_REFERENCE.md) — quick developer notes

## Notes

- The project keeps sensitive tokens in `backend/.env`.
- The WhatsApp worker must be reachable on the configured local service URL.
- Notification delivery depends on the Laravel queue worker running in the background.
