# RaptorERP — Production Deployment & Operations Guide

> **Target Environment:** Linux (Ubuntu 22.04 / 24.04 LTS, Debian 12) or Windows Server (IIS / Apache)  
> **Target Date:** 22 October 2026  
> **Prerequisites:** PHP 8.2+ (with pdo_mysql, mbstring, openssl, gd, bcmath, curl), MySQL 8.0+ / MariaDB 10.4+, Node.js 20+ LTS, Composer 2.x

---

## 1. Production Build & Deployment Checklist

### Step 1: Backend Deployment
1. Navigate to backend directory:
   ```bash
   cd /path/to/RaptorERP/backend
   ```
2. Install production dependencies:
   ```bash
   composer install --no-dev --optimize-autoloader
   ```
3. Set appropriate directory permissions:
   ```bash
   chmod -R 775 storage bootstrap/cache
   chown -R www-data:www-data storage bootstrap/cache
   ```
4. Run database migrations:
   ```bash
   php artisan migrate --force
   ```
5. Cache configuration and routes for maximum throughput:
   ```bash
   php artisan config:cache
   php artisan route:cache
   php artisan view:cache
   ```

### Step 2: Frontend Deployment
1. Navigate to frontend directory:
   ```bash
   cd /path/to/RaptorERP/frontend
   ```
2. Install dependencies:
   ```bash
   npm ci
   ```
3. Compile production bundle:
   ```bash
   npm run build
   ```
4. The output in `frontend/dist/` contains the static SPA bundle, ready to be served via Nginx or Apache.

---

## 2. Web Server Configuration (Nginx Example)

```nginx
server {
    listen 80;
    server_name erp.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name erp.example.com;

    ssl_certificate /etc/letsencrypt/live/erp.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/erp.example.com/privkey.pem;

    # Frontend Single Page App
    root /var/www/RaptorERP/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API Gateway
    location /api {
        alias /var/www/RaptorERP/backend/public;
        try_files $uri $uri/ @backend;

        location ~ \.php$ {
            include fastcgi_params;
            fastcgi_param SCRIPT_FILENAME /var/www/RaptorERP/backend/public/index.php;
            fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
        }
    }

    location @backend {
        rewrite /api/(.*)$ /api/index.php?/$1 last;
    }

    # Uploads Storage
    location /storage {
        alias /var/www/RaptorERP/backend/storage/app/public;
        try_files $uri =404;
        # Prevent executing any PHP scripts inside uploads
        location ~ \.php$ {
            deny all;
        }
    }
}
```

---

## 3. Asynchronous Queue Worker (Supervisor)

For notifications (Email, SMS, WhatsApp) and background jobs, configure Supervisor:

```ini
[program:raptorerp-worker]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/RaptorERP/backend/artisan queue:work --sleep=3 --tries=3 --max-time=3600
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
user=www-data
numprocs=2
redirect_stderr=true
stdout_logfile=/var/www/RaptorERP/backend/storage/logs/worker.log
stopwaitsecs=3600
```

---

## 4. Disaster Recovery & Rollback Procedure

### Daily Automated Backups
```bash
# Database Dump
mysqldump -u erp_user -p raptore_db | gzip > /backups/db_$(date +\%F_%T).sql.gz

# Uploads Archive
tar -czf /backups/uploads_$(date +\%F_%T).tar.gz /var/www/RaptorERP/backend/storage/app/public
```

### Rapid Rollback Procedure
If a production issue occurs:
1. Revert to the prior deployment tag:
   ```bash
   git checkout <PREVIOUS_STABLE_TAG>
   ```
2. Re-run Composer and Vite build:
   ```bash
   cd backend && composer install --no-dev && php artisan config:cache
   cd ../frontend && npm ci && npm run build
   ```
3. Restart PHP-FPM and Supervisor:
   ```bash
   systemctl restart php8.2-fpm
   supervisorctl restart raptorerp-worker:*
   ```
