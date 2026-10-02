# RaptorERP Backend

This is the Laravel backend for the RaptorERP application. It exposes the ERP API, queue-based notification services, and the WhatsApp/Web Push integrations used by the frontend.

## Stack

- PHP 8.2+
- Laravel 12
- MySQL-ready configuration
- Sanctum / RBAC patterns
- Queue workers for notifications
- Twilio, email, Web Push, social login, and WhatsApp support

## Common setup

```bash
cd c:\xampp\htdocs\RaptorERP\backend
composer install
php artisan key:generate
php artisan migrate --force
php artisan db:seed
```

## Local development

Use the bundled dev command to start the application services together:

```bash
composer run dev
```

This starts the Laravel server, queue listener, log viewer, and Vite frontend process group.

## Important environment values

```dotenv
APP_URL=http://localhost:8000
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=raptore_db
DB_USERNAME=root
DB_PASSWORD=

WHATSAPP_WEB_JS_ENABLED=true
WHATSAPP_SERVICE_URL=http://127.0.0.1:3010
WHATSAPP_SERVICE_TOKEN=erp-whatsapp-local-token
WHATSAPP_SERVICE_PORT=3010
WHATSAPP_SERVICE_HOST=127.0.0.1
WWEBJS_AUTH_PATH=/xampp/htdocs/RaptorERP/backend/storage/whatsapp-session
WWEBJS_CLIENT_ID=nexa-erp
```

## Queue worker

```bash
php artisan queue:work --tries=3 --backoff=10
```

This is required for email, SMS, WhatsApp, and browser push delivery.

## Useful commands

```bash
php artisan test
php artisan route:list
php artisan config:clear
php artisan cache:clear
php artisan storage:link
```

## Notes

- Keep all real secrets in `backend/.env`.
- Do not expose API tokens or keys in the browser frontend.
- The notification worker and WhatsApp bridge must be running for sends to complete.
