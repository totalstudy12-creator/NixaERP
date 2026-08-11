# Business OS - API Reference Guide

Complete REST API documentation for Business OS backend.

## Base URL

```
http://localhost:8000/api
```

## Authentication

All endpoints except login and status require JWT authentication via Bearer token.

### Authorization Header

```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

## Response Format

### Success Response

```json
{
  "data": { /* resource data */ },
  "message": "Operation successful"
}
```

### List Response (Paginated)

```json
{
  "data": [
    { /* resource 1 */ },
    { /* resource 2 */ }
  ],
  "meta": {
    "current_page": 1,
    "from": 1,
    "last_page": 5,
    "per_page": 15,
    "to": 15,
    "total": 75
  }
}
```

### Error Response

```json
{
  "message": "Error description",
  "errors": {
    "field": ["validation error message"]
  }
}
```

## Endpoints

### Authentication

#### Login
```
POST /login
Content-Type: application/json

Request:
{
  "email": "test@example.com",
  "password": "password"
}

Response: 200 OK
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Error Cases**:
- 401 Unauthorized - Invalid credentials
- 422 Unprocessable Entity - Missing fields

#### Logout
```
POST /logout
Authorization: Bearer {token}

Response: 200 OK
{
  "message": "Logged out successfully"
}
```

#### Get Current User
```
GET /me
Authorization: Bearer {token}

Response: 200 OK
{
  "data": {
    "id": 1,
    "name": "Test User",
    "email": "test@example.com",
    "roles": [
      {
        "id": 1,
        "name": "admin",
        "description": "Administrator"
      }
    ]
  }
}
```

#### API Status
```
GET /status
[No authentication required]

Response: 200 OK
{
  "service": "Business OS API",
  "status": "operational",
  "version": "1.0.0"
}
```

---

### Companies

#### List Companies
```
GET /companies
Authorization: Bearer {token}

Query Parameters:
  page=1              [optional] Default: 1
  per_page=15         [optional] Default: 15

Response: 200 OK
{
  "data": [
    {
      "id": 1,
      "name": "ABC Wholesale",
      "code": "ABC",
      "email": "info@abc.com",
      "phone": "+1-234-567-8900",
      "address": "123 Main St, City, State",
      "created_at": "2024-01-01T10:00:00Z",
      "updated_at": "2024-01-01T10:00:00Z"
    }
  ],
  "meta": { /* pagination */ }
}
```

#### Create Company
```
POST /companies
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "name": "New Company",
  "code": "NEW",
  "email": "contact@new.com",
  "phone": "+1-234-567-8900",
  "address": "Address line"
}

Response: 201 Created
{
  "data": {
    "id": 10,
    "name": "New Company",
    "code": "NEW",
    "email": "contact@new.com",
    "phone": "+1-234-567-8900",
    "address": "Address line",
    "created_at": "2024-01-01T10:30:00Z",
    "updated_at": "2024-01-01T10:30:00Z"
  }
}
```

#### Get Company
```
GET /companies/{id}
Authorization: Bearer {token}

Response: 200 OK
{
  "data": {
    "id": 1,
    "name": "ABC Wholesale",
    "code": "ABC",
    "email": "info@abc.com",
    "phone": "+1-234-567-8900",
    "address": "123 Main St",
    "branches": [ /* related branches */ ],
    "customers": [ /* related customers */ ],
    "created_at": "2024-01-01T10:00:00Z",
    "updated_at": "2024-01-01T10:00:00Z"
  }
}
```

#### Update Company
```
PUT /companies/{id}
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "name": "Updated Name",
  "email": "newemail@abc.com",
  "phone": "+1-987-654-3210"
}

Response: 200 OK
{
  "data": { /* updated company */ }
}
```

#### Delete Company
```
DELETE /companies/{id}
Authorization: Bearer {token}

Response: 204 No Content
```

---

### Customers

#### List Customers
```
GET /customers
Authorization: Bearer {token}

Query Parameters:
  page=1              [optional]
  per_page=15         [optional]
  company_id=1        [optional] Filter by company

Response: 200 OK
{
  "data": [
    {
      "id": 1,
      "company_id": 1,
      "name": "John's Store",
      "email": "john@store.com",
      "phone": "+1-555-0123",
      "gst_number": "18AABCT1234H2Z0",
      "billing_address": "123 Billing St",
      "shipping_address": "456 Shipping St",
      "credit_limit": "50000.00",
      "outstanding_balance": "12500.00",
      "created_at": "2024-01-01T10:00:00Z",
      "updated_at": "2024-01-01T10:00:00Z"
    }
  ]
}
```

#### Create Customer
```
POST /customers
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "company_id": 1,
  "name": "New Store",
  "email": "store@example.com",
  "phone": "+1-555-0000",
  "gst_number": "18AABCU5678H1Z0",
  "billing_address": "123 Billing St",
  "shipping_address": "456 Shipping St",
  "credit_limit": "50000"
}

Response: 201 Created
{
  "data": { /* created customer */ }
}
```

#### Get Customer
```
GET /customers/{id}
Authorization: Bearer {token}

Response: 200 OK
{
  "data": {
    "id": 1,
    "company_id": 1,
    "name": "John's Store",
    "email": "john@store.com",
    /* ... other fields ... */
    "orders": [ /* customer's orders */ ],
    "invoices": [ /* customer's invoices */ ]
  }
}
```

#### Update Customer
```
PUT /customers/{id}
Authorization: Bearer {token}
Content-Type: application/json

Request: { /* fields to update */ }

Response: 200 OK
{
  "data": { /* updated customer */ }
}
```

#### Delete Customer
```
DELETE /customers/{id}
Authorization: Bearer {token}

Response: 204 No Content
```

---

### Flutter API Integration

Use the backend REST API from Flutter with the standard `http` package and Bearer token authentication.

#### Example: Login and Save Token
```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

const apiBase = 'http://localhost:8000/api';

Future<String> login(String email, String password) async {
  final response = await http.post(
    Uri.parse('
$apiBase/login'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'email': email, 'password': password}),
  );

  if (response.statusCode != 200) {
    throw Exception('Login failed: ${response.body}');
  }

  final json = jsonDecode(response.body);
  return json['access_token'] as String;
}
```

#### Example: Fetch Current User
```dart
Future<Map<String, dynamic>> fetchCurrentUser(String token) async {
  final response = await http.get(
    Uri.parse('
$apiBase/me'),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    },
  );

  if (response.statusCode != 200) {
    throw Exception('Failed to fetch user: ${response.body}');
  }

  return jsonDecode(response.body)['data'] as Map<String, dynamic>;
}
```

#### Example: Fetch Employees
```dart
Future<List<dynamic>> fetchEmployees(String token, {int page = 1}) async {
  final response = await http.get(
    Uri.parse('
$apiBase/employees?page=$page'),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    },
  );

  if (response.statusCode != 200) {
    throw Exception('Failed to fetch employees: ${response.body}');
  }

  return jsonDecode(response.body)['data'] as List<dynamic>;
}
```

#### Example: Create Employee
```dart
Future<Map<String, dynamic>> createEmployee(String token, Map<String, dynamic> payload) async {
  final response = await http.post(
    Uri.parse('
$apiBase/employees'),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    },
    body: jsonEncode(payload),
  );

  if (response.statusCode != 201) {
    throw Exception('Failed to create employee: ${response.body}');
  }

  return jsonDecode(response.body)['data'] as Map<String, dynamic>;
}
```

---

### Products

#### List Products
```
GET /products
Authorization: Bearer {token}

Query Parameters:
  page=1              [optional]
  per_page=15         [optional]
  company_id=1        [optional]

Response: 200 OK
{
  "data": [
    {
      "id": 1,
      "company_id": 1,
      "name": "Widget A",
      "sku": "WGT-A-001",
      "description": "Product description",
      "unit_price": "99.99",
      "quantity_in_stock": 150,
      "reorder_level": 50,
      "created_at": "2024-01-01T10:00:00Z",
      "updated_at": "2024-01-01T10:00:00Z"
    }
  ]
}
```

#### Create Product
```
POST /products
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "company_id": 1,
  "name": "New Widget",
  "sku": "WGT-NEW-001",
  "description": "A new widget",
  "unit_price": "149.99",
  "quantity_in_stock": 100,
  "reorder_level": 25
}

Response: 201 Created
{
  "data": { /* created product */ }
}
```

#### Get Product
```
GET /products/{id}
Authorization: Bearer {token}

Response: 200 OK
{
  "data": { /* product details */ }
}
```

#### Update Product
```
PUT /products/{id}
Authorization: Bearer {token}
Content-Type: application/json

Request: { /* fields to update */ }

Response: 200 OK
{
  "data": { /* updated product */ }
}
```

#### Delete Product
```
DELETE /products/{id}
Authorization: Bearer {token}

Response: 204 No Content
```

---

### Orders

#### List Orders
```
GET /orders
Authorization: Bearer {token}

Query Parameters:
  page=1              [optional]
  per_page=15         [optional]
  status=pending      [optional] Filter by status
  company_id=1        [optional]

Response: 200 OK
{
  "data": [
    {
      "id": 1,
      "company_id": 1,
      "customer_id": 5,
      "order_no": "ORD-20240101-001",
      "order_date": "2024-01-01",
      "delivery_date": "2024-01-15",
      "total_amount": "999.99",
      "status": "pending",
      "notes": "Special instructions",
      "customer": {
        "id": 5,
        "name": "John's Store"
      },
      "items": [
        {
          "id": 1,
          "product_id": 10,
          "quantity": 5,
          "unit_price": "99.99",
          "line_total": "499.95"
        }
      ],
      "created_at": "2024-01-01T10:00:00Z",
      "updated_at": "2024-01-01T10:00:00Z"
    }
  ]
}
```

#### Create Order
```
POST /orders
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "company_id": 1,
  "customer_id": 5,
  "order_no": "ORD-20240102-001",
  "order_date": "2024-01-02",
  "delivery_date": "2024-01-16",
  "total_amount": "599.99",
  "status": "pending",
  "notes": "Deliver to warehouse",
  "items": [
    {
      "product_id": 10,
      "quantity": 5,
      "unit_price": "99.99"
    }
  ]
}

Response: 201 Created
{
  "data": { /* created order */ }
}
```

#### Get Order
```
GET /orders/{id}
Authorization: Bearer {token}

Response: 200 OK
{
  "data": {
    "id": 1,
    "company_id": 1,
    "customer_id": 5,
    "order_no": "ORD-20240101-001",
    /* ... order details and items ... */
    "invoice": [ /* related invoice if exists */ ]
  }
}
```

#### Update Order
```
PUT /orders/{id}
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "status": "confirmed",
  "delivery_date": "2024-01-20"
}

Response: 200 OK
{
  "data": { /* updated order */ }
}
```

#### Delete Order
```
DELETE /orders/{id}
Authorization: Bearer {token}

Response: 204 No Content
```

---

### Invoices

#### List Invoices
```
GET /invoices
Authorization: Bearer {token}

Query Parameters:
  page=1              [optional]
  per_page=15         [optional]
  status=draft        [optional]
  company_id=1        [optional]

Response: 200 OK
{
  "data": [
    {
      "id": 1,
      "company_id": 1,
      "order_id": 1,
      "customer_id": 5,
      "invoice_no": "INV-20240101-001",
      "invoice_date": "2024-01-01",
      "due_date": "2024-02-01",
      "total_amount": "999.99",
      "tax_amount": "180.00",
      "status": "sent",
      "notes": "Payment terms: Net 30",
      "customer": { /* customer data */ },
      "items": [ /* invoice items */ ],
      "payments": [ /* related payments */ ],
      "created_at": "2024-01-01T10:00:00Z",
      "updated_at": "2024-01-01T10:00:00Z"
    }
  ]
}
```

#### Create Invoice
```
POST /invoices
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "company_id": 1,
  "customer_id": 5,
  "order_id": 1,
  "invoice_no": "INV-20240102-001",
  "invoice_date": "2024-01-02",
  "due_date": "2024-02-02",
  "total_amount": "599.99",
  "tax_amount": "108.00",
  "status": "draft",
  "items": [
    {
      "product_id": 10,
      "description": "Widget A",
      "quantity": 5,
      "unit_price": "99.99",
      "line_total": "499.95"
    }
  ]
}

Response: 201 Created
{
  "data": { /* created invoice */ }
}
```

#### Get Invoice
```
GET /invoices/{id}
Authorization: Bearer {token}

Response: 200 OK
{
  "data": {
    "id": 1,
    /* ... invoice details ... */
    "items": [ /* line items */ ],
    "payments": [ /* payment records */ ]
  }
}
```

#### Update Invoice
```
PUT /invoices/{id}
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "status": "sent",
  "due_date": "2024-02-15"
}

Response: 200 OK
{
  "data": { /* updated invoice */ }
}
```

#### Delete Invoice
```
DELETE /invoices/{id}
Authorization: Bearer {token}

Response: 204 No Content
```

---

### Branches

#### List Branches
```
GET /branches
Authorization: Bearer {token}

Query Parameters:
  company_id=1        [required or optional filter]

Response: 200 OK
{
  "data": [
    {
      "id": 1,
      "company_id": 1,
      "name": "Main Branch",
      "location": "New York, NY",
      "manager_name": "John Smith",
      "phone": "+1-555-0001",
      "email": "ny@abc.com",
      "created_at": "2024-01-01T10:00:00Z",
      "updated_at": "2024-01-01T10:00:00Z"
    }
  ]
}
```

#### Create Branch
```
POST /branches
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "company_id": 1,
  "name": "New Branch",
  "location": "Los Angeles, CA",
  "manager_name": "Jane Doe",
  "phone": "+1-555-0002",
  "email": "la@abc.com"
}

Response: 201 Created
{
  "data": { /* created branch */ }
}
```

[Similar GET, UPDATE, DELETE endpoints for branches]

---

### Warehouses

Similar structure to Branches:

```
GET    /warehouses
POST   /warehouses
GET    /warehouses/{id}
PUT    /warehouses/{id}
DELETE /warehouses/{id}
```

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200  | OK - Request successful |
| 201  | Created - Resource created successfully |
| 204  | No Content - Success, no response body |
| 400  | Bad Request - Invalid parameters |
| 401  | Unauthorized - Missing/invalid token |
| 403  | Forbidden - Insufficient permissions |
| 404  | Not Found - Resource not found |
| 422  | Unprocessable Entity - Validation failed |
| 500  | Internal Server Error - Server error |

## Validation Rules

### Companies
```
name        required|string|max:255
code        required|string|max:50|unique:companies
email       required|email|max:255
phone       nullable|string|max:20
address     nullable|string|max:500
```

### Customers
```
company_id          required|exists:companies,id
name                required|string|max:255
email               required|email|max:255
phone               required|string|max:20
gst_number          nullable|string|max:50
billing_address     nullable|string|max:500
shipping_address    nullable|string|max:500
credit_limit        nullable|numeric|min:0
```

### Products
```
company_id          required|exists:companies,id
name                required|string|max:255
sku                 required|string|max:100|unique:products
description         nullable|string|max:1000
unit_price          required|numeric|min:0
quantity_in_stock   required|integer|min:0
reorder_level       nullable|integer|min:0
```

### Orders
```
company_id      required|exists:companies,id
customer_id     required|exists:customers,id
order_no        required|string|max:100|unique:orders
order_date      required|date
delivery_date   required|date|after:order_date
total_amount    required|numeric|min:0
status          required|in:pending,confirmed,shipped,delivered,cancelled
items           required|array|min:1
items.*.product_id      required|exists:products,id
items.*.quantity        required|integer|min:1
items.*.unit_price      required|numeric|min:0
```

### Invoices
```
company_id      required|exists:companies,id
customer_id     required|exists:customers,id
invoice_no      required|string|max:100|unique:invoices
invoice_date    required|date
due_date        required|date|after:invoice_date
total_amount    required|numeric|min:0
tax_amount      nullable|numeric|min:0
status          required|in:draft,sent,paid,overdue,cancelled
```

## Rate Limiting

Currently no rate limiting. Consider implementing:
- 100 requests per minute per IP
- 1000 requests per hour per authenticated user

## Error Examples

### Validation Error (422)
```json
{
  "message": "The given data was invalid.",
  "errors": {
    "email": ["The email field is required."],
    "name": ["The name must be a string."]
  }
}
```

### Unauthorized (401)
```json
{
  "message": "Token expired or revoked"
}
```

### Not Found (404)
```json
{
  "message": "Company not found"
}
```

## Testing Endpoints

Use these tools to test the API:

- **Postman**: https://www.postman.com/
- **Insomnia**: https://insomnia.rest/
- **Thunder Client** (VS Code Extension)
- **curl**: Command line tool

### Example curl Request

```bash
curl -X GET "http://localhost:8000/api/companies" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

## Pagination

List endpoints support pagination:

```
GET /api/companies?page=2&per_page=20
```

Response includes:
```json
{
  "data": [ ... ],
  "meta": {
    "current_page": 2,
    "from": 21,
    "last_page": 5,
    "per_page": 20,
    "to": 40,
    "total": 100
  }
}
```

---

## Version History

- **v1.0.0** (2024-01-01) - Initial release
  - Authentication (login, logout, me)
  - Companies CRUD
  - Customers CRUD
  - Products CRUD
  - Orders CRUD
  - Invoices CRUD
  - Branches CRUD
  - Warehouses CRUD

---

Last Updated: 2024-01-01
