# Notification Delivery Setup

This is the full local and deployment setup guide for notifications in RaptorERP, including email, SMS, browser push, and WhatsApp delivery.

## 1. Notification pipeline overview

Notifications are processed by Laravel queue jobs. The backend stores all provider credentials in the Laravel environment file, and the frontend only receives readiness/status information.

The queue worker must always be running for delivery to progress from `queued` to `sent` or `failed`:

```bash
cd C:\xampp\htdocs\RaptorERP\backend
php artisan queue:work --tries=3 --backoff=10
```

For local development, this also runs inside:

```bash
composer run dev
```

---

## 2. WhatsApp worker configuration

The ERP project includes a local WhatsApp bridge that communicates with a Web.js worker service. Configure the backend to point at that worker using `WHATSAPP_SERVICE_URL` and `WHATSAPP_SERVICE_TOKEN`.

Add these values in `backend/.env`:

```dotenv
WHATSAPP_WEB_JS_ENABLED=true
WHATSAPP_SERVICE_URL=http://127.0.0.1:3010
WHATSAPP_SERVICE_TOKEN=erp-whatsapp-local-token
WHATSAPP_SERVICE_PORT=3010
WHATSAPP_SERVICE_HOST=127.0.0.1
WWEBJS_AUTH_PATH=/xampp/htdocs/RaptorERP/backend/storage/whatsapp-session
WWEBJS_CLIENT_ID=nexa-erp
```

### What each value does

- `WHATSAPP_WEB_JS_ENABLED` — enables the local WhatsApp integration
- `WHATSAPP_SERVICE_URL` — the base URL of the worker service
- `WHATSAPP_SERVICE_TOKEN` — shared secret used to authenticate the ERP app to the worker
- `WHATSAPP_SERVICE_PORT` — local port used by the service
- `WHATSAPP_SERVICE_HOST` — bind host for the worker
- `WWEBJS_AUTH_PATH` — where Web.js session/auth files are stored
- `WWEBJS_CLIENT_ID` — client identifier used by the ERP when connecting

### Important rule

The token in `WHATSAPP_SERVICE_TOKEN` must exactly match the token expected by the WhatsApp worker. If the worker is down, not listening on the URL, or the token is mismatched, WhatsApp delivery will not complete.

---

## 3. Twilio SMS and WhatsApp

If you are using Twilio for SMS or WhatsApp, configure these values in the backend environment:

```dotenv
TWILIO_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_SMS_FROM=+15551234567
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

Notes:

- The recipient phone number must be valid for the Twilio account.
- WhatsApp recipients must be opted in to receive messages.
- The sender must be approved or be part of the Twilio sandbox used by the account.

---

## 4. Email configuration

For real outbound email, use a working SMTP configuration:

```dotenv
MAIL_MAILER=smtp
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_SCHEME=tls
MAIL_USERNAME=your-smtp-user
MAIL_PASSWORD=your-smtp-password
MAIL_FROM_ADDRESS=notifications@example.com
MAIL_FROM_NAME="RaptorERP"
```

This is required for live email notifications. The `log` mailer can help during debugging, but it is not a production-ready live mail transport.

---

## 5. Web Push configuration

Generate a VAPID key pair once and keep the private key secure.

```bash
cd C:\xampp\htdocs\RaptorERP\backend
php -r "require 'vendor/autoload.php'; print_r(\Minishlink\WebPush\VAPID::createVapidKeys());"
```

Then save the values:

```dotenv
WEBPUSH_SUBJECT=mailto:admin@example.com
WEBPUSH_VAPID_PUBLIC_KEY=...
WEBPUSH_VAPID_PRIVATE_KEY=...
```

Push notifications require HTTPS in production; `localhost` is allowed for local testing.

---

## 6. Full local setup sequence

Use this exact sequence for a fresh local setup:

```bash
cd C:\xampp\htdocs\RaptorERP\backend
composer install
php artisan key:generate
php artisan migrate --force
php artisan db:seed
php artisan queue:work --tries=3 --backoff=10
php artisan serve
```

Then start the frontend:

```bash
cd C:\xampp\htdocs\RaptorERP\frontend
npm install
npm run dev
```

The app should be available at:

- Backend: http://localhost:8000
- Frontend: http://localhost:5173

---

## 7. Verification checklist

Use this checklist after setting up each provider:

1. Confirm `php artisan queue:work` is still running.
2. Verify the backend `.env` contains the correct `WHATSAPP_SERVICE_URL` and `WHATSAPP_SERVICE_TOKEN` values.
3. Confirm the WhatsApp worker is responding on the configured service URL.
4. Validate the service token matches exactly between the ERP and worker.
5. Send a live notifications test from the UI.
6. Confirm the status moves out of `queued` and into either `sent` or `failed`.
7. Check Laravel logs if delivery remains stalled.

---

## 8. Permissions and frontend behavior

The notifications UI provides provider readiness checks, live send tests, and delivery history. Recommended permissions are:

- `notifications.view` — view provider status and history
- `notifications.send` — trigger test sends

All secret values remain in the backend `.env` and must not be embedded in the frontend build.

---

## 9. Troubleshooting

### WhatsApp stays queued or pending

- Check whether the worker is running.
- Verify `WHATSAPP_SERVICE_URL` points to the correct service.
- Confirm `WHATSAPP_SERVICE_TOKEN` matches exactly.
- Check `WWEBJS_AUTH_PATH` permissions and session folder access.

### cPanel Chromium error: missing `libatk-bridge-2.0.so.0`

This is a missing Linux system library, not an npm dependency. `npm install` cannot install it, and changing `CHROME_BIN` will not help unless the alternate browser has all required shared libraries.

- Ask the hosting provider to install the package that supplies `libatk-bridge-2.0.so.0` and the other Puppeteer/Chromium runtime dependencies, and confirm that headless Chromium is supported for Node.js applications.
- Restart the Node.js application after the host installs the libraries. Check the worker's `/health` and `/status` endpoints; its status error should identify the missing dependency.
- If shared hosting does not allow those system packages or a persistent Node.js process, run the WhatsApp worker on a VPS/container with Chromium dependencies and configure Laravel's `WHATSAPP_SERVICE_URL` to reach it over a restricted network connection.
- If neither option is available, set `WHATSAPP_WEB_JS_ENABLED=false` and use another supported messaging provider, such as Twilio.

### Queue jobs are not processing

- Start `php artisan queue:work` in a separate terminal.
- Check database queue status and Laravel logs.
- Confirm the queue connection is set correctly in `.env`.

### SMS or email not sending

- Check Twilio credentials and sender number.
- Validate SMTP host, credentials, and port.
- Confirm the recipient number or email is valid.

### Browser push not working

- Ensure HTTPS is active in production.
- Validate the VAPID public/private keys.
- Check that the browser has subscribed successfully.

---

## 10. Final recommendation

For the current project, treat the WhatsApp worker as a required local service. The most important configuration values are:

```dotenv
WHATSAPP_SERVICE_URL=http://127.0.0.1:3010
WHATSAPP_SERVICE_TOKEN=erp-whatsapp-local-token
```

If these two values are not correct, the ERP cannot authenticate to the worker and WhatsApp notifications will fail even if the rest of the notification stack is configured correctly.
