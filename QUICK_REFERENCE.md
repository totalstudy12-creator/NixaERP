# Business OS - Developer Quick Reference

## Start Commands

```bash
# Terminal 1: Backend
cd backend
php artisan serve

# Terminal 2: Frontend
cd frontend
npm run dev
```

**URLs**:
- Backend API: http://localhost:8000
- Frontend: http://localhost:5173
- Demo: test@example.com / password

---

## Key Files

### Backend

| Path | What |
|------|------|
| `app/Models/` | Database models & relationships |
| `app/Http/Controllers/Api/` | API endpoint handlers |
| `app/Http/Middleware/` | Request interceptors |
| `routes/api.php` | API endpoint definitions |
| `database/migrations/` | Database schema |
| `database/seeders/` | Demo data |

### Frontend

| Path | What |
|------|------|
| `src/pages/` | Page components |
| `src/api.ts` | HTTP API client |
| `src/App.tsx` | Main routing component |
| `src/styles.css` | Global CSS |
| `vite.config.ts` | Build config |
| `.env.local` | Environment variables |

---

## Database Quick Reference

### Core Tables

```
companies
  ├─ id, name, code, email, phone, address
  └─ Relations: branches, customers, products, orders

customers
  ├─ id, company_id, name, email, phone, gst_number
  ├─ billing_address, shipping_address
  ├─ credit_limit, outstanding_balance
  └─ Relations: company, orders, invoices

products
  ├─ id, company_id, name, sku, description
  ├─ unit_price, quantity_in_stock, reorder_level
  └─ Relations: company, order_items

orders
  ├─ id, company_id, customer_id, order_no
  ├─ order_date, delivery_date, total_amount, status
  └─ Relations: company, customer, items, invoice

invoices
  ├─ id, company_id, order_id, customer_id, invoice_no
  ├─ invoice_date, due_date, total_amount, status
  └─ Relations: company, order, customer, items, payments

users
  ├─ id, name, email, password
  └─ Relations: roles, permissions
```

---

## API Endpoints

### Auth
```
POST   /api/login                → login
POST   /api/logout               → logout
GET    /api/me                   → current user
GET    /api/status               → health check
```

### Resources
```
GET    /api/{resource}           → list (paginated)
POST   /api/{resource}           → create
GET    /api/{resource}/{id}      → get one
PUT    /api/{resource}/{id}      → update
DELETE /api/{resource}/{id}      → delete
```

**Resources**: companies, customers, products, orders, invoices, branches, warehouses

---

## Model Methods

### User
```php
$user->roles()              // Get user roles
$user->permissions()        // Get user permissions
$user->hasRole('admin')     // Check role
$user->hasPermission('create_company')  // Check permission
```

### Company
```php
$company->branches()        // Get branches
$company->customers()       // Get customers
$company->products()        // Get products
$company->orders()          // Get orders
```

### Order
```php
$order->items()             // Get line items
$order->customer()          // Get customer
$order->company()           // Get company
$order->invoice()           // Get invoice
```

---

## Frontend Components

### Pages
```
LoginPage           → /login route
DashboardPage       → /dashboard route
CompaniesPage       → /companies route
CustomersPage       → /customers route
ProductsPage        → /products route
OrdersPage          → /orders route
InvoicesPage        → /invoices route
```

### API Client
```typescript
apiClient.login(email, password)
apiClient.getMe(token)
apiClient.getCompanies(token)
apiClient.createCompany(data, token)
apiClient.getCustomers(token)
// ... similar for other resources
```

---

## Common Tasks

### Add a New Endpoint

1. **Create Controller Method** (`app/Http/Controllers/Api/XxxController.php`)
```php
public function store(Request $request)
{
    $validated = $request->validate([...]);
    $model = Model::create($validated);
    return response()->json(['data' => $model], 201);
}
```

2. **Add Route** (`routes/api.php`)
```php
Route::apiResource('xxx', XxxController::class)
    ->middleware('auth:api');
```

3. **Add API Client** (`frontend/src/api.ts`)
```typescript
async getXxx(token: string) {
    return this.request('GET', '/xxx', undefined, token);
}
```

4. **Add Page Component** (`frontend/src/pages/XxxPage.tsx`)

### Add a New Model

1. **Create Model**
```bash
php artisan make:model Xxx
```

2. **Create Migration**
```bash
php artisan make:migration create_xxx_table
```

3. **Define Relationships** in Model
```php
public function relation() {
    return $this->hasMany(Other::class);
}
```

### Add a New Role

```php
// In DatabaseSeeder.php
$role = Role::create(['name' => 'manager']);
$role->permissions()->attach([1, 2, 3]);
```

---

## Debug Commands

```bash
# Backend
php artisan tinker                      # Interactive shell
php artisan migrate --fresh --seed      # Reset database
php artisan route:list                  # List all routes
php artisan make:model Model --migration  # Generate model+migration

# Frontend
npm run build                           # Production build
npm run preview                         # Preview build output
```

---

## Common Errors & Fixes

### Backend

**"Class not found"**
```bash
composer dump-autoload
```

**"Migration not found"**
```bash
php artisan migrate --force
```

**"JWT Token Expired"**
- Token lasts 60 minutes
- Need to login again or implement refresh tokens

### Frontend

**"Cannot find module"**
```bash
npm install
```

**"CORS errors"**
- Check backend CORS middleware is enabled
- Restart backend server

**"API connection refused"**
- Ensure backend running on :8000
- Check VITE_API_BASE in .env.local

---

## Testing Endpoints

### With curl

```bash
# Login
curl -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# Get companies
curl -X GET http://localhost:8000/api/companies \
  -H "Authorization: Bearer TOKEN_HERE"

# Create company
curl -X POST http://localhost:8000/api/companies \
  -H "Authorization: Bearer TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","code":"TST"}'
```

### With Postman
1. Set Base URL: `http://localhost:8000/api`
2. POST /login - Get token
3. Set Auth header: `Bearer TOKEN`
4. Test other endpoints

---

## Environment Variables

### Backend `.env`
```
APP_NAME="Business OS"
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost:8000
DB_CONNECTION=sqlite
JWT_SECRET=auto-generated
```

### Frontend `.env.local`
```
VITE_API_BASE=http://localhost:8000/api
```

---

## Git Workflow

```bash
git status                              # Check changes
git add .                               # Stage changes
git commit -m "Feature: description"    # Commit
git push origin branch-name             # Push to remote
```

---

## Performance Tips

**Backend**
- Use eager loading: `with(['relation'])`
- Index database columns
- Cache database queries
- Use pagination on lists

**Frontend**
- Code splitting on routes
- Lazy load components
- Minimize API calls
- Cache API responses

---

## Security Reminders

- ✅ Always validate input
- ✅ Use prepared statements (Eloquent)
- ✅ Hash passwords (Laravel)
- ✅ Validate JWT tokens
- ✅ Use HTTPS in production
- ✅ Never commit secrets
- ❌ Don't log sensitive data
- ❌ Don't expose error details to users

---

## Useful Resources

- Laravel Docs: https://laravel.com/docs/
- React Docs: https://react.dev
- Eloquent ORM: https://laravel.com/docs/eloquent
- JWT: https://jwt.io/
- REST API Best Practices: https://restfulapi.net/

---

## Quick Stats

| Metric | Value |
|--------|-------|
| Backend Models | 10 |
| API Endpoints | 33 |
| Database Tables | 16 |
| Frontend Pages | 7 |
| Total Routes | 35+ |
| Average Response Time | <50ms |
| Database Size | ~2MB |

---

## Support

**For issues:**
1. Check error message
2. Search documentation
3. Check browser console/network tab
4. Check Laravel logs: `storage/logs/`
5. Run `php artisan migrate --fresh --seed` if database issue

**Contact**: Development team

---

**Last Updated**: 2024-01-01
**Version**: 1.0.0
