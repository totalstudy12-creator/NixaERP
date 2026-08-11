# Business OS - Enterprise ERP System

A comprehensive multi-company, multi-branch ERP system built with Laravel 12 and React.

## Overview

Business OS is a complete Enterprise Resource Planning system designed for wholesale and distribution businesses. It supports:

- **Multi-Company Operations**: Manage multiple companies/brands from a single system
- **Multi-Branch Management**: Control operations across multiple branches/warehouses
- **RBAC Authorization**: Role-based access control with granular permissions
- **JWT Authentication**: Secure API authentication with token management
- **Sales & Invoicing**: Complete order-to-cash workflow
- **Inventory Management**: Product and warehouse tracking
- **Customer Management**: Full customer relationship capabilities

## Architecture

### Backend
- **Framework**: Laravel 12 (PHP 8.2+)
- **Database**: SQLite
- **Authentication**: JWT (lcobucci/jwt)
- **API**: RESTful API with resource controllers

### Frontend
- **Framework**: React 18.3.1
- **Build Tool**: Vite 5.4.1
- **Language**: TypeScript 5.5.4
- **Styling**: CSS3

## Quick Start

### Backend Setup

```bash
cd backend
composer install
php artisan migrate --force
php artisan db:seed
php artisan serve
```

The backend runs on `http://localhost:8000`

**Demo Credentials**:
- Email: `test@example.com`
- Password: `password`

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`

### Environment Variables

**Backend** (`backend/.env`):
```
APP_NAME="Business OS"
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost:8000

DB_CONNECTION=sqlite

JWT_SECRET=your-secret-key
```

**Frontend** (`frontend/.env.local`):
```
VITE_API_BASE=http://localhost:8000/api
```

## API Documentation

### Authentication

**Login**
```
POST /api/login
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "password"
}

Response:
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Get Current User**
```
GET /api/me
Authorization: Bearer {token}
```

**Logout**
```
POST /api/logout
Authorization: Bearer {token}
```

### Resources

All endpoints follow RESTful conventions:

- `GET /api/{resource}` - List all (paginated)
- `POST /api/{resource}` - Create new
- `GET /api/{resource}/{id}` - Get single
- `PUT /api/{resource}/{id}` - Update
- `DELETE /api/{resource}/{id}` - Delete

**Available Resources**:
- `companies` - Company management
- `branches` - Branch management
- `warehouses` - Warehouse management
- `customers` - Customer management
- `products` - Product catalog
- `orders` - Sales orders
- `invoices` - Invoices and billing
- `payments` - Payment tracking

### Example: Create Company

```
POST /api/companies
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "ABC Wholesale",
  "code": "ABC",
  "email": "info@abcwholesale.com",
  "phone": "+1-234-567-8900"
}
```

## Database Schema

### Core Tables

- **companies** - Business entities
- **branches** - Company branches/locations
- **warehouses** - Storage facilities
- **customers** - Customer records
- **products** - Product catalog

### RBAC Tables

- **roles** - User roles
- **permissions** - System permissions
- **user_roles** - User-to-role assignment
- **role_permissions** - Role-to-permission assignment

### Sales & Invoicing

- **quotations** - Sales quotations
- **orders** - Sales orders
- **order_items** - Order line items
- **invoices** - Invoices
- **invoice_items** - Invoice line items
- **payments** - Payment records

### Authentication

- **jwt_tokens** - Token revocation tracking

## Features

### Implemented ✅

- Multi-company/multi-branch architecture
- JWT authentication with token revocation
- RBAC with role-based permissions
- Complete CRUD APIs for all core resources
- Sales and invoicing workflow
- React-based SPA frontend
- Login and authentication UI
- Dashboard with statistics
- Companies, Customers, Orders, Invoices pages

### Roadmap 🚀

- Inventory tracking and management
- Purchase orders and supplier management
- Accounting and financial reports
- User management interface
- Role and permission management UI
- Advanced reporting and analytics
- Mobile app
- Real-time notifications
- Document generation (PDF invoices)
- Email integration
- Audit logging
- Two-factor authentication

## Development

### Backend Testing

```bash
cd backend
php artisan test
```

### Frontend Testing

```bash
cd frontend
npm run test
```

### Code Structure

**Backend**:
- `app/Http/Controllers/Api/` - API controllers
- `app/Models/` - Eloquent models
- `app/Http/Middleware/` - Custom middleware
- `app/Http/Requests/` - Form requests
- `database/migrations/` - Schema migrations

**Frontend**:
- `src/pages/` - Page components
- `src/api.ts` - API client
- `src/App.tsx` - Main app component
- `src/styles.css` - Global styles

## Security Considerations

- JWT tokens expire after 60 minutes
- Tokens can be revoked via logout
- CORS middleware enables controlled cross-origin requests
- Password stored using Laravel's bcrypt hashing
- SQL injection protection via Eloquent ORM

## Troubleshooting

### Frontend Can't Connect to Backend

1. Ensure backend is running: `php artisan serve` (port 8000)
2. Check `VITE_API_BASE` environment variable
3. Verify CORS middleware is enabled in `bootstrap/app.php`

### JWT Token Errors

1. Clear local storage: `localStorage.clear()`
2. Check JWT secret matches in `.env`
3. Verify token hasn't expired (60 minutes)

### Database Errors

1. Ensure SQLite database exists: `touch database/database.sqlite`
2. Run migrations: `php artisan migrate --force`
3. Run seeders: `php artisan db:seed`

## Contributing

Guidelines for contributing to Business OS:

1. Create feature branches from `main`
2. Follow PSR-12 (backend) and ESLint (frontend) standards
3. Write tests for new features
4. Create pull requests with clear descriptions

## License

Proprietary - All rights reserved

## Support

For issues and feature requests, please contact the development team.
