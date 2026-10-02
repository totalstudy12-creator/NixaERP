# Notification Delivery Setup

External notifications are delivered by Laravel queue jobs. Provider credentials belong in the backend `.env`; they are never sent to the browser.

## Database and queue

Run the migration and keep a queue worker running in production:

```powershell
cd C:\xampp\htdocs\RaptorERP\backend
php artisan migrate --force
php artisan queue:work --tries=3 --backoff=10
```

The database queue is the default. A worker must be running for email, SMS, WhatsApp, and push deliveries to leave the `queued` state. In development, use the existing `composer run dev` process group, which includes a queue listener.

## Email

Configure a real Laravel mail transport. The `log` mailer is useful for local inspection but is intentionally reported as unavailable for live test sends.

```dotenv
MAIL_MAILER=smtp
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_SCHEME=tls
MAIL_USERNAME=your-smtp-user
MAIL_PASSWORD=your-smtp-password
MAIL_FROM_ADDRESS=notifications@example.com
MAIL_FROM_NAME="Nexa ERP"
```

## Twilio SMS and WhatsApp

Set the account SID and auth token, plus the sender for each enabled channel:

```dotenv
TWILIO_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_SMS_FROM=+15551234567
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

The current user's profile phone number is the test recipient. It must be in a format accepted by the Twilio account. WhatsApp recipients must be opted in and the sender must be approved or joined to the applicable Twilio sandbox.

## Web Push

Generate a VAPID key pair once and keep the private key secret. Do not regenerate keys after browsers have subscribed.

```powershell
cd C:\xampp\htdocs\RaptorERP\backend
php -r "require 'vendor/autoload.php'; print_r(\Minishlink\WebPush\VAPID::createVapidKeys());"
```

Copy the printed `publicKey` and `privateKey` into the backend `.env`:

```dotenv
WEBPUSH_SUBJECT=mailto:admin@example.com
WEBPUSH_VAPID_PUBLIC_KEY=...
WEBPUSH_VAPID_PRIVATE_KEY=...
```

Push requires HTTPS in deployed browsers (localhost is permitted for development). After setting keys and clearing cached configuration if enabled, open Notifications and enable push on each browser that should receive alerts.

## Frontend and permissions

The Notifications page provides provider readiness, test sends to the signed-in user's email/phone or current browser, and a user-scoped delivery history with retry count and provider errors. Assign `notifications.view` to view provider/delivery status and `notifications.send` to send test notifications. Provider secrets are only configured in the backend environment.