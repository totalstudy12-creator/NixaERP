# Business OS - Architecture & Design Documentation

This document describes the technical architecture and design patterns used in Business OS.

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    React Frontend (Port 5173)               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Pages: Login, Dashboard, Companies, Customers, etc.  │   │
│  │ State: Token, Current User, Navigation              │   │
│  │ API Client: HTTP requests with JWT Bearer tokens    │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                  HTTP/HTTPS (REST API)
                           │
                    CORS Headers
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│              Laravel Backend (Port 8000)                     │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Middleware: CORS, JWT Authentication                │    │
│  │ Routes: API endpoints for all resources             │    │
│  │ Controllers: Business logic & data manipulation     │    │
│  │ Models: Eloquent ORM with relationships             │    │
│  │ Requests: Form validation                           │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────┬───────────────────────────────────┘
                           │
                    SQL Queries
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│           SQLite Database (database/database.sqlite)        │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Tables: Companies, Branches, Customers, Orders, etc │    │
│  │ Relationships: Foreign keys, Indexes                │    │
│  │ Data: Persistent storage                            │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

### User Login Flow

```
1. User enters credentials in LoginPage
   ├─ Email: test@example.com
   └─ Password: password

2. Frontend sends POST /api/login
   ├─ Header: Content-Type: application/json
   └─ Body: { email, password }

3. Backend AuthController.login()
   ├─ Find user by email
   ├─ Verify password (bcrypt)
   ├─ Create JWT token (60min expiry)
   ├─ Store token in jwt_tokens table
   └─ Return: { access_token, token_type, expires_in }

4. Frontend receives token
   ├─ Store in localStorage
   ├─ Set as Authorization header
   └─ Redirect to Dashboard

5. Dashboard loads
   ├─ Fetch /api/me with token
   ├─ Get current user data
   ├─ Load statistics (companies, customers, etc)
   └─ Display dashboard with data
```

### Create Company Flow

```
1. User clicks "Companies" → CompaniesPage loads
   ├─ Calls getCompanies(token)
   ├─ Displays existing companies in table

2. User fills form and clicks "Create"
   ├─ Form data: { name, code, email, phone }

3. Frontend sends POST /api/companies
   ├─ Header: Authorization: Bearer {token}
   ├─ Header: Content-Type: application/json
   └─ Body: { name, code, email, phone, company_id }

4. Backend Middleware
   ├─ AllowCors adds CORS headers
   ├─ AuthenticateApiToken validates JWT
   │  ├─ Parse Bearer token
   │  ├─ Verify JWT signature
   │  ├─ Check expiry (60 min)
   │  ├─ Check revocation (logout check)
   │  └─ Attach user to request
   └─ Request reaches CompanyController.store()

5. CompanyController.store()
   ├─ Validate request data
   ├─ Create Company model
   ├─ Save to database
   ├─ Return: { id, name, code, email, phone, created_at }

6. Frontend receives response
   ├─ Show success (can add toast notification)
   ├─ Clear form
   ├─ Reload companies list
   └─ New company appears in table
```

## Database Schema

### Core Tables

#### companies
```sql
CREATE TABLE companies (
  id BIGINT PRIMARY KEY,
  name VARCHAR,           -- Company name
  code VARCHAR,          -- Unique company code
  email VARCHAR,         -- Contact email
  phone VARCHAR,         -- Contact phone
  address TEXT,          -- Full address
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP   -- Soft delete
);
```

**Relationships**:
- HasMany: Branches
- HasMany: Warehouses
- HasMany: Customers
- HasMany: Products
- HasMany: Orders

#### branches
```sql
CREATE TABLE branches (
  id BIGINT PRIMARY KEY,
  company_id BIGINT,      -- ForeignKey: companies.id
  name VARCHAR,
  location VARCHAR,
  manager_name VARCHAR,
  phone VARCHAR,
  email VARCHAR,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);
```

#### customers
```sql
CREATE TABLE customers (
  id BIGINT PRIMARY KEY,
  company_id BIGINT,      -- ForeignKey: companies.id
  name VARCHAR,
  email VARCHAR,
  phone VARCHAR,
  gst_number VARCHAR,
  billing_address TEXT,
  shipping_address TEXT,
  credit_limit DECIMAL,
  outstanding_balance DECIMAL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);
```

#### products
```sql
CREATE TABLE products (
  id BIGINT PRIMARY KEY,
  company_id BIGINT,      -- ForeignKey: companies.id
  name VARCHAR,
  sku VARCHAR,            -- Unique SKU
  description TEXT,
  unit_price DECIMAL,     -- Price per unit
  quantity_in_stock INT,
  reorder_level INT,      -- When to reorder
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);
```

### Sales & Invoicing Tables

#### orders
```sql
CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  company_id BIGINT,      -- ForeignKey: companies.id
  customer_id BIGINT,     -- ForeignKey: customers.id
  order_no VARCHAR,       -- Unique order number
  order_date DATE,
  delivery_date DATE,
  total_amount DECIMAL,
  status VARCHAR,         -- pending, confirmed, shipped, delivered
  notes TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);
```

#### order_items
```sql
CREATE TABLE order_items (
  id BIGINT PRIMARY KEY,
  order_id BIGINT,        -- ForeignKey: orders.id
  product_id BIGINT,      -- ForeignKey: products.id
  quantity INT,
  unit_price DECIMAL,
  line_total DECIMAL,     -- quantity * unit_price
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### invoices
```sql
CREATE TABLE invoices (
  id BIGINT PRIMARY KEY,
  company_id BIGINT,      -- ForeignKey: companies.id
  order_id BIGINT,        -- ForeignKey: orders.id (optional)
  customer_id BIGINT,     -- ForeignKey: customers.id
  invoice_no VARCHAR,     -- Unique invoice number
  invoice_date DATE,
  due_date DATE,
  total_amount DECIMAL,
  tax_amount DECIMAL,
  status VARCHAR,         -- draft, sent, paid, overdue, cancelled
  notes TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);
```

#### payments
```sql
CREATE TABLE payments (
  id BIGINT PRIMARY KEY,
  invoice_id BIGINT,      -- ForeignKey: invoices.id
  amount DECIMAL,
  payment_date DATE,
  payment_method VARCHAR, -- cash, check, transfer, card
  reference_no VARCHAR,   -- Check number, transfer ref, etc
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### RBAC Tables

#### roles
```sql
CREATE TABLE roles (
  id BIGINT PRIMARY KEY,
  name VARCHAR UNIQUE,    -- admin, manager, sales, etc
  description TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### permissions
```sql
CREATE TABLE permissions (
  id BIGINT PRIMARY KEY,
  name VARCHAR UNIQUE,    -- create_company, edit_order, view_invoice
  description TEXT,
  resource VARCHAR,       -- company, order, invoice
  action VARCHAR,         -- create, read, update, delete
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### role_permissions (Junction Table)
```sql
CREATE TABLE role_permissions (
  role_id BIGINT,         -- ForeignKey: roles.id
  permission_id BIGINT,   -- ForeignKey: permissions.id
  UNIQUE(role_id, permission_id)
);
```

#### user_roles (Junction Table)
```sql
CREATE TABLE user_roles (
  user_id BIGINT,         -- ForeignKey: users.id
  role_id BIGINT,         -- ForeignKey: roles.id
  UNIQUE(user_id, role_id)
);
```

### Authentication Tables

#### jwt_tokens
```sql
CREATE TABLE jwt_tokens (
  id BIGINT PRIMARY KEY,
  user_id BIGINT,         -- ForeignKey: users.id
  jti VARCHAR UNIQUE,     -- JWT ID (unique per token)
  expires_at TIMESTAMP,   -- 60 minutes from creation
  revoked_at TIMESTAMP,   -- NULL until logout
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

## API Endpoint Structure

### Authentication Endpoints

```
POST   /api/login           → AuthController.login()
POST   /api/logout          → AuthController.logout()
GET    /api/me              → AuthController.me()
GET    /api/status          → StatusController.index()
```

### Resource Endpoints (RESTful)

```
GET    /api/{resource}                 → {Resource}Controller.index()      [List all]
POST   /api/{resource}                 → {Resource}Controller.store()      [Create]
GET    /api/{resource}/{id}            → {Resource}Controller.show()       [View one]
PUT    /api/{resource}/{id}            → {Resource}Controller.update()     [Update]
DELETE /api/{resource}/{id}            → {Resource}Controller.destroy()    [Delete]
```

**Resources**: companies, branches, warehouses, customers, products, orders, invoices

### Response Format

**Success (200/201)**:
```json
{
  "data": { ... },
  "message": "Operation successful"
}
```

**Paginated List (200)**:
```json
{
  "data": [ ... ],
  "pagination": {
    "current_page": 1,
    "per_page": 15,
    "total": 100,
    "last_page": 7
  }
}
```

**Error (4xx/5xx)**:
```json
{
  "message": "Error description",
  "errors": { ... }
}
```

## Request/Response Examples

### Create Order Request

```http
POST /api/orders HTTP/1.1
Host: localhost:8000
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
Content-Type: application/json

{
  "company_id": 1,
  "customer_id": 5,
  "order_no": "ORD-20240101-001",
  "order_date": "2024-01-01",
  "delivery_date": "2024-01-15",
  "items": [
    {
      "product_id": 10,
      "quantity": 5,
      "unit_price": 99.99
    },
    {
      "product_id": 15,
      "quantity": 3,
      "unit_price": 149.99
    }
  ]
}
```

### Response (201 Created)

```json
{
  "data": {
    "id": 42,
    "company_id": 1,
    "customer_id": 5,
    "order_no": "ORD-20240101-001",
    "order_date": "2024-01-01",
    "delivery_date": "2024-01-15",
    "total_amount": "899.85",
    "status": "pending",
    "items": [
      {
        "id": 120,
        "product_id": 10,
        "quantity": 5,
        "unit_price": "99.99",
        "line_total": "499.95"
      },
      {
        "id": 121,
        "product_id": 15,
        "quantity": 3,
        "unit_price": "149.99",
        "line_total": "449.97"
      }
    ],
    "created_at": "2024-01-01T10:30:00Z",
    "updated_at": "2024-01-01T10:30:00Z"
  }
}
```

## Authentication Flow

### JWT Token Structure

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

**Header**:
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

**Payload** (60 minute expiry):
```json
{
  "sub": 1,
  "uid": 1,
  "name": "Test User",
  "email": "test@example.com",
  "iat": 1672531200,
  "exp": 1672534800,
  "jti": "unique-token-id"
}
```

### Token Revocation

When user logs out:
1. `jwt_tokens.revoked_at` is set to current timestamp
2. AuthenticateApiToken middleware checks revocation on each request
3. Tokens after logout are rejected

## Middleware Pipeline

### Request Flow

```
Request
  ↓
AllowCors middleware
  ├─ Adds CORS headers
  ├─ Handles OPTIONS requests (204)
  └─ Passes request forward
  ↓
Route Matching
  ├─ Public routes: /login, /status (no auth)
  └─ Protected routes: require AuthenticateApiToken
  ↓
AuthenticateApiToken middleware
  ├─ Extract Bearer token
  ├─ Validate JWT signature
  ├─ Check expiry
  ├─ Check revocation status
  ├─ Load user
  └─ Attach to $request->user()
  ↓
Controller Action
  ├─ Execute business logic
  └─ Return response
  ↓
Response
```

## Model Relationships

### Company Model

```php
class Company extends Model {
    public function branches() {
        return $this->hasMany(Branch::class);
    }
    
    public function warehouses() {
        return $this->hasMany(Warehouse::class);
    }
    
    public function customers() {
        return $this->hasMany(Customer::class);
    }
    
    public function products() {
        return $this->hasMany(Product::class);
    }
    
    public function orders() {
        return $this->hasMany(Order::class);
    }
}
```

### Order Model

```php
class Order extends Model {
    public function company() {
        return $this->belongsTo(Company::class);
    }
    
    public function customer() {
        return $this->belongsTo(Customer::class);
    }
    
    public function items() {
        return $this->hasMany(OrderItem::class);
    }
    
    public function invoice() {
        return $this->hasOne(Invoice::class);
    }
}
```

### User Model (RBAC)

```php
class User extends Model {
    public function roles() {
        return $this->belongsToMany(Role::class, 'user_roles');
    }
    
    public function permissions() {
        return $this->belongsToMany(Permission::class, 'permissions', 
                                  'role_permissions', 'user_id', 'role_id');
    }
    
    public function hasRole($role) {
        return $this->roles()->where('id', $role)
                           ->orWhere('name', $role)->exists();
    }
    
    public function hasPermission($permission) {
        return $this->permissions()->where('id', $permission)
                                 ->orWhere('name', $permission)->exists();
    }
}
```

## Frontend Architecture

### Component Structure

```
App
├── LoginPage
│   ├─ Email input
│   ├─ Password input
│   └─ Login button
│
└── DashboardPage (after login)
    ├─ Sidebar Navigation
    │  ├─ Dashboard button
    │  ├─ Companies button
    │  ├─ Customers button
    │  ├─ Products button
    │  ├─ Orders button
    │  ├─ Invoices button
    │  └─ Logout button
    │
    └── Main Content Area
       ├─ DashboardPage (displays stats)
       ├─ CompaniesPage (CRUD companies)
       ├─ CustomersPage (CRUD customers)
       ├─ ProductsPage (CRUD products)
       ├─ OrdersPage (view orders)
       └─ InvoicesPage (view invoices)
```

### State Management

**Simple approach** (current):
- Token stored in localStorage
- Current page stored in component state
- User data fetched on demand

**Future scalability**:
- Consider Redux/Zustand for complex state
- Implement caching layer
- Add optimistic updates

### API Client Pattern

```typescript
// Centralized API calls
export const apiClient = {
  async request(method, endpoint, data, token) {
    // Common logic for all requests
    // - Add authorization header
    // - Handle errors
    // - Redirect on 401
  },
  
  async login(email, password) {
    return this.request('POST', '/login', {email, password});
  },
  
  async getCompanies(token) {
    return this.request('GET', '/companies', undefined, token);
  }
  // ... other endpoints
};
```

## Security Architecture

### Authentication Security

- **JWT Signing**: HS256 algorithm with secret key
- **Token Expiry**: 60 minutes
- **Revocation**: Tracked in jwt_tokens table
- **Storage**: LocalStorage (secure for demo, use HttpOnly cookies in production)

### Authorization Security

- **RBAC**: Role-based access control
- **Permission Checks**: Middleware validates before action
- **Soft Deletes**: Data never truly deleted (audit trail)

### Data Protection

- **Password Hashing**: bcrypt with Laravel's default cost
- **SQL Injection**: Eloquent ORM prevents SQL injection
- **CSRF**: CSRF middleware on web routes (not needed for API with JWT)
- **CORS**: Controlled cross-origin requests

## Performance Considerations

### Database Optimization

- Indexed queries on frequently searched columns (email, sku)
- Eager loading relationships (with() method)
- Pagination on list endpoints (15 per page)
- Soft deletes reduce need for data cleanup

### API Optimization

- Response compression (gzip)
- Pagination reduces payload size
- Select only needed fields in response
- Cache static data (roles, permissions)

### Frontend Optimization

- Vite bundles and minifies code
- Code splitting on page components
- Lazy loading for routes
- CSS purging removes unused styles

## Deployment Readiness

### Environment Configuration

```
Development (.env):
APP_ENV=local
APP_DEBUG=true

Production (.env):
APP_ENV=production
APP_DEBUG=false
APP_KEY=base64:...
```

### Database Backup

SQLite database file: `database/database.sqlite`
- Backup regularly
- Version control migrations (not the database file itself)
- Document backup/restore procedures

## Testing Strategy

### Backend Testing

- Unit tests for models
- Feature tests for API endpoints
- Database tests with transactions

### Frontend Testing

- Component tests with React Testing Library
- Integration tests for workflows
- E2E tests with Playwright

## Monitoring & Logging

### Application Logs

`storage/logs/laravel.log` - All application events

### Database Queries

Enable query logging in production to monitor performance issues

## Future Architecture Improvements

1. **Message Queue**: Use Redis for async jobs
2. **Caching**: Redis cache layer for frequently accessed data
3. **WebSockets**: Real-time notifications
4. **Search**: Elasticsearch for advanced search
5. **Event Sourcing**: Track all state changes
6. **CQRS**: Separate read/write models for scalability

---

This architecture provides a solid foundation for an enterprise ERP system while maintaining simplicity and ease of understanding for development teams.
