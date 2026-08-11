# Business OS - Installation & Setup Guide

This guide will walk you through setting up and running the Business OS ERP system.

## Prerequisites

Before starting, ensure you have the following installed:

- **PHP 8.2+** - Download from https://www.php.net/downloads
- **Node.js 18+** - Download from https://nodejs.org/
- **Composer** - Download from https://getcomposer.org/
- **SQLite3** - Usually pre-installed on Windows/Mac/Linux

## Project Structure

```
RaptorERP/
├── backend/              # Laravel 12 API
├── frontend/             # React + Vite SPA
├── docs/                 # Documentation
├── database/             # Shared database files
└── README.md
```

## Step 1: Backend Setup

### 1.1 Navigate to Backend Directory

```bash
cd c:\xampp\htdocs\RaptorERP\backend
```

### 1.2 Install PHP Dependencies

```bash
composer install
```

This will install:
- Laravel 12 framework
- JWT authentication library (lcobucci/jwt)
- Testing libraries
- And other dependencies

**Time to complete**: 2-5 minutes depending on internet speed

### 1.3 Create Environment File

The `.env` file should already exist from the initial setup. If not, copy from example:

```bash
copy .env.example .env
```

Key settings in `.env`:
```
APP_NAME="Business OS"
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost:8000
DB_CONNECTION=sqlite
```

### 1.4 Generate Application Key

```bash
php artisan key:generate
```

### 1.5 Create Database

Ensure the SQLite database exists:

```bash
touch database/database.sqlite
```

Or on Windows:
```bash
echo.>database\database.sqlite
```

### 1.6 Run Migrations

This creates all the database tables:

```bash
php artisan migrate --force
```

You should see output like:
```
   INFO  Running migrations.

  0001_01_01_000000_create_users_table ............... 45.23ms DONE
  0001_01_01_000001_create_cache_table .............. 12.45ms DONE
  0001_01_01_000002_create_jobs_table ............... 18.67ms DONE
  0001_01_01_000003_create_business_core_tables ..... 52.34ms DONE
  0001_01_01_000004_create_rbac_and_jwt_tables ...... 34.12ms DONE
  0001_01_01_000005_create_sales_invoicing_tables ... 76.03ms DONE
```

### 1.7 Seed Demo Data

Populate with demo data:

```bash
php artisan db:seed
```

This creates:
- Demo test user (test@example.com / password)
- Admin role with all permissions
- Admin user role assignment
- Sample company, customers, products

### 1.8 Start Backend Server

```bash
php artisan serve
```

You should see:
```
   INFO  Server running on [http://127.0.0.1:8000].
```

**Backend is now running on http://localhost:8000**

Leave this terminal running while you set up the frontend.

## Step 2: Frontend Setup

### 2.1 Open New Terminal/PowerShell

Open a new terminal window. Keep the backend running in the first terminal.

### 2.2 Navigate to Frontend Directory

```bash
cd c:\xampp\htdocs\RaptorERP\frontend
```

### 2.3 Install Node Dependencies

```bash
npm install
```

This installs:
- React 18.3.1
- Vite 5.4.1
- TypeScript 5.5.4
- And development tools

**Time to complete**: 3-8 minutes

### 2.4 Create Environment File

Create `.env.local` in the frontend directory:

```bash
echo VITE_API_BASE=http://localhost:8000/api > .env.local
```

Or create manually with content:
```
VITE_API_BASE=http://localhost:8000/api
```

### 2.5 Start Development Server

```bash
npm run dev
```

You should see:
```
  VITE v5.4.1  ready in 245 ms

  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

**Frontend is now running on http://localhost:5173**

## Step 3: Access the Application

Open your web browser and navigate to:

```
http://localhost:5173
```

You should see the Business OS login page.

### Login Credentials

**Demo Account:**
- Email: `test@example.com`
- Password: `password`

## Step 4: Verify Everything Works

### 4.1 Login

1. Enter demo credentials
2. Click "Login"
3. You should be redirected to the Dashboard

### 4.2 Test Dashboard

The Dashboard page should show:
- Welcome message with your name
- Statistics cards showing:
  - Number of companies
  - Number of customers
  - Number of products
  - Number of orders
  - Number of invoices

### 4.3 Test Navigation

Navigate through each section using the sidebar:
- **Companies** - View and create companies
- **Customers** - View and create customers
- **Products** - View and create products
- **Orders** - View sales orders
- **Invoices** - View invoices

### 4.4 Test Create Operations

Try creating a new company:
1. Click "Companies" in sidebar
2. Fill in the "Create Company" form
3. Click "Create"
4. New company should appear in the list

## Troubleshooting

### Backend Issues

**Problem: "PHP is not recognized"**
- Install PHP from https://www.php.net/downloads
- Add PHP to your system PATH
- Restart terminal/PowerShell

**Problem: "Composer not found"**
- Install Composer from https://getcomposer.org/
- Add Composer to your system PATH

**Problem: "Cannot connect to database"**
```bash
# Ensure database file exists
touch database/database.sqlite

# Re-run migrations
php artisan migrate --force
```

**Problem: JWT errors in login**
- Clear any existing JWT tokens
- Run migrations again: `php artisan migrate --force`
- Restart backend server

### Frontend Issues

**Problem: "Node not found" or "npm not found"**
- Install Node.js from https://nodejs.org/
- Restart terminal/PowerShell

**Problem: "Cannot find module" errors**
```bash
# Clear node_modules and reinstall
rm -r node_modules package-lock.json
npm install
```

**Problem: "Cannot connect to API"**
- Verify backend is running on http://localhost:8000
- Check `.env.local` has correct `VITE_API_BASE`
- Clear browser cache and local storage
- Restart frontend dev server

**Problem: CORS errors in browser**
- Backend CORS middleware should be enabled in `bootstrap/app.php`
- Restart backend server if recently changed

### Database Issues

**Problem: "Database is locked"**
```bash
# Delete the locked database and recreate
rm database/database.sqlite
touch database/database.sqlite
php artisan migrate --force
php artisan db:seed
```

**Problem: "No such table" errors**
```bash
# Run migrations again
php artisan migrate --force
```

## Development Workflow

### Making Code Changes

**Backend Changes:**
1. Edit PHP files in `backend/app/` or routes
2. Changes auto-reload on next API call
3. No server restart needed for most changes

**Frontend Changes:**
1. Edit React files in `frontend/src/`
2. Vite automatically hot-reloads in browser
3. No manual refresh needed

### Building for Production

**Backend:**
No build step required. Set `APP_ENV=production` in `.env`

**Frontend:**
```bash
cd frontend
npm run build
```

This creates optimized build in `dist/` folder.

## Next Steps

1. **Explore the codebase**:
   - Backend: `backend/app/Http/Controllers/Api/`
   - Frontend: `frontend/src/pages/`

2. **Customize for your needs**:
   - Add more roles/permissions
   - Create additional models
   - Build custom features

3. **Deploy to production** (later):
   - Push to Git repository
   - Deploy Laravel backend to server
   - Deploy React frontend to CDN/hosting

## Support & Resources

- Laravel Documentation: https://laravel.com/docs
- React Documentation: https://react.dev
- Vite Documentation: https://vitejs.dev
- JWT Guide: https://jwt.io/introduction

## Quick Commands Reference

```bash
# Backend
php artisan serve                    # Start backend server
php artisan migrate --force         # Run migrations
php artisan db:seed                 # Seed demo data
php artisan tinker                  # Interactive shell

# Frontend
npm run dev                          # Start dev server
npm run build                        # Build for production
npm run test                         # Run tests
npm run lint                         # Lint code
```

That's it! You're ready to start building with Business OS.
