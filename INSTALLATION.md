# RaptorERP Installation Guide

This guide covers the local installation and startup flow for the current RaptorERP project.

## Requirements

- PHP 8.2+
- Composer
- Node.js 18+
- MySQL or SQLite-ready local environment
- A working browser for the React frontend

## Project layout

```text
RaptorERP/
├── backend/             # Laravel API and workers
├── frontend/            # React + Vite app
├── docs/                # Technical documentation
├── data/                # Reference and seed data
├── README.md            # Project summary
├── INSTALLATION.md      # This file
├── NOTIFICATION_DELIVERY_SETUP.md
├── API_DOCUMENTATION.md
└── QUICK_REFERENCE.md
```

## 1) Backend installation

Open a terminal in the backend folder:

```bash
cd c:\xampp\htdocs\RaptorERP\backend
composer install
```

If the project does not already include a `.env` file, create one from your working environment or copy a known-good value into place. The important Laravel settings are:

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

Then generate the app key and bootstrap the database:

```bash
php artisan key:generate
php artisan migrate --force
php artisan db:seed
```

If you want to run the app with the full local worker stack, use:

```bash
composer run dev
```

That command starts the Laravel server, queue worker, Vite frontend, and logs in one terminal group.

## 2) Start the API

```bash
cd c:\xampp\htdocs\RaptorERP\backend
php artisan serve
```

The API should be available at:

```text
http://localhost:8000
```

## 3) Frontend installation

Open a second terminal:

```bash
cd c:\xampp\htdocs\RaptorERP\frontend
npm install
npm run dev
```

The frontend should be available at:

```text
http://localhost:5173
```

## 4) Required notification config

The notification system uses Laravel queue jobs and a local WhatsApp bridge. These values should exist in `backend/.env`:

```dotenv
WHATSAPP_WEB_JS_ENABLED=true
WHATSAPP_SERVICE_URL=http://127.0.0.1:3010
WHATSAPP_SERVICE_TOKEN=erp-whatsapp-local-token
WHATSAPP_SERVICE_PORT=3010
WHATSAPP_SERVICE_HOST=127.0.0.1
WWEBJS_AUTH_PATH=/xampp/htdocs/RaptorERP/backend/storage/whatsapp-session
WWEBJS_CLIENT_ID=nexa-erp
```

For queue processing, keep this running:

```bash
cd c:\xampp\htdocs\RaptorERP\backend
php artisan queue:work --tries=3 --backoff=10
```

## 5) Demo access

After seeding, the default login is normally:

- Email: `test@example.com`
- Password: `password`

## 6) Common troubleshooting

### PHP or Composer not found
- Install PHP 8.2+ and Composer.
- Make sure both are added to the system `PATH`.

### Database connection errors
- Confirm MySQL is running.
- Check `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD` in `backend/.env`.
- Re-run:

```bash
php artisan migrate --force
```

### Frontend cannot reach the backend
- Ensure the backend is running on port 8000.
- Verify the frontend uses the correct API base URL.
- Ensure CORS and app URL settings match your local environment.

### Notification jobs stay queued
- Start the queue worker.
- Confirm the WhatsApp service is reachable at `WHATSAPP_SERVICE_URL`.
- Check the token and auth path values in `.env`.

## 7) Recommended dev flow

For a normal local setup:

```bash
cd c:\xampp\htdocs\RaptorERP\backend
composer run dev
```

Then leave the terminal open while you operate the frontend in the browser. Use a second terminal only when you specifically need to inspect logs or run a separate queue command.
