markdown
# NixaERP API Documentation

## Base URL
http://localhost:8000/api

text

## Authentication

### Login
```http
POST /api/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "password"
}
Response
json
{
  "success": true,
  "token": "YOUR_SANCTUM_TOKEN",
  "user": {
    "id": 1,
    "name": "Admin",
    "email": "admin@example.com"
  }
}
Authenticated Requests
Add the token to all protected routes:

http
Authorization: Bearer YOUR_SANCTUM_TOKEN
API Token Management
List API Tokens
http
GET /api/api-tokens
Authorization: Bearer YOUR_SANCTUM_TOKEN
Generate API Token
http
POST /api/api-tokens/generate
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "name": "Mobile App",
  "abilities": ["*"],
  "expires_at": "2025-12-31"
}
Revoke API Token
http
DELETE /api/api-tokens/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Revoke All API Tokens
http
DELETE /api/api-tokens
Authorization: Bearer YOUR_SANCTUM_TOKEN
Settings
List Settings
http
GET /api/settings
Authorization: Bearer YOUR_SANCTUM_TOKEN
Get Setting by Key
http
GET /api/settings/{key}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Setting
http
POST /api/settings
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "key": "maintenance_mode",
  "value": "false",
  "group": "general",
  "description": "Enable maintenance mode",
  "is_public": true
}
Update Setting
http
PUT /api/settings/{key}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "value": "true",
  "group": "general",
  "description": "Enable maintenance mode",
  "is_public": true
}
Delete Setting
http
DELETE /api/settings/{key}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Bulk Update Settings
http
POST /api/settings/bulk
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "settings": [
    {
      "key": "currency",
      "value": "USD"
    },
    {
      "key": "timezone",
      "value": "UTC"
    }
  ]
}
Export Settings
http
GET /api/settings/export
Authorization: Bearer YOUR_SANCTUM_TOKEN
Import Settings
http
POST /api/settings/import
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: multipart/form-data

file: settings.json
Clear Settings Cache
http
GET /api/settings/cache/clear
Authorization: Bearer YOUR_SANCTUM_TOKEN
Quickstart Info
http
GET /api/settings/quickstart
Authorization: Bearer YOUR_SANCTUM_TOKEN
Dashboard & Reports
Analytics
http
GET /api/dashboard/analytics
Authorization: Bearer YOUR_SANCTUM_TOKEN
Payment Summary
http
GET /api/dashboard/payments-summary
Authorization: Bearer YOUR_SANCTUM_TOKEN
Inventory Summary
http
GET /api/dashboard/inventory-summary
Authorization: Bearer YOUR_SANCTUM_TOKEN
Invoice Count Summary
http
GET /api/dashboard/invoices-count-summary
Authorization: Bearer YOUR_SANCTUM_TOKEN
Invoice Amount Summary
http
GET /api/dashboard/invoices-amount-summary
Authorization: Bearer YOUR_SANCTUM_TOKEN
Business Health
http
GET /api/dashboard/business-health
Authorization: Bearer YOUR_SANCTUM_TOKEN
Forecast
http
GET /api/dashboard/forecast
Authorization: Bearer YOUR_SANCTUM_TOKEN
Risks
http
GET /api/dashboard/risks
Authorization: Bearer YOUR_SANCTUM_TOKEN
Anomalies
http
GET /api/dashboard/anomalies
Authorization: Bearer YOUR_SANCTUM_TOKEN
Rankings
http
GET /api/dashboard/rankings
Authorization: Bearer YOUR_SANCTUM_TOKEN
Hero Product
http
GET /api/dashboard/hero-product
Authorization: Bearer YOUR_SANCTUM_TOKEN
Hero Customer
http
GET /api/dashboard/hero-customer
Authorization: Bearer YOUR_SANCTUM_TOKEN
District Sales
http
GET /api/dashboard/district-sales?state=Karnataka
Authorization: Bearer YOUR_SANCTUM_TOKEN
Top Selling Products
http
GET /api/reports/top-selling-products?limit=5
Authorization: Bearer YOUR_SANCTUM_TOKEN
Least Selling Products
http
GET /api/reports/least-selling-products?limit=5
Authorization: Bearer YOUR_SANCTUM_TOKEN
Low Stock Products
http
GET /api/dashboard/low-stock
GET /api/products/low-stock
Authorization: Bearer YOUR_SANCTUM_TOKEN
Top Customers
http
GET /api/dashboard/top-customers?limit=5
GET /api/customers/top?limit=5
Authorization: Bearer YOUR_SANCTUM_TOKEN
Top Vendors
http
GET /api/dashboard/top-vendors?limit=5
GET /api/vendors/top?limit=5
Authorization: Bearer YOUR_SANCTUM_TOKEN
Purchase Due Invoices
http
GET /api/dashboard/purchase-due
GET /api/purchases/due
Authorization: Bearer YOUR_SANCTUM_TOKEN
Login Activity
http
GET /api/dashboard/login-activity
GET /api/admin/login-activity
Authorization: Bearer YOUR_SANCTUM_TOKEN
New vs Existing Customers
http
GET /api/dashboard/new-vs-existing-customers
Authorization: Bearer YOUR_SANCTUM_TOKEN
Companies
List Companies
http
GET /api/companies
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Company
http
POST /api/companies
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "name": "Nixa Technologies",
  "email": "info@nixa.com",
  "phone": "1234567890"
}
Get Company
http
GET /api/companies/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Update Company
http
PUT /api/companies/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Delete Company
http
DELETE /api/companies/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Branches
List Branches
http
GET /api/branches
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Branch
http
POST /api/branches
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "company_id": 1,
  "name": "Main Branch",
  "address": "123 Main St"
}
Get Branch
http
GET /api/branches/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Update Branch
http
PUT /api/branches/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Delete Branch
http
DELETE /api/branches/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Warehouses
List Warehouses
http
GET /api/warehouses
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Warehouse
http
POST /api/warehouses
Authorization: Bearer YOUR_SANCTUM_TOKEN
Get Warehouse
http
GET /api/warehouses/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Update Warehouse
http
PUT /api/warehouses/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Delete Warehouse
http
DELETE /api/warehouses/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Customers
List Customers
http
GET /api/customers
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Customer
http
POST /api/customers
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "1234567890"
}
Get Customer
http
GET /api/customers/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Update Customer
http
PUT /api/customers/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Delete Customer
http
DELETE /api/customers/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Import Customers
http
POST /api/customers/import
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: multipart/form-data

file: customers.csv
duplicate_action: skip|update|stop
dry_run: 0|1
Download Customer Template
http
GET /api/customers/template
Authorization: Bearer YOUR_SANCTUM_TOKEN
Products
List Products
http
GET /api/products
Authorization: Bearer YOUR_SANCTUM_TOKEN
Get All Products
http
GET /api/products/all
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Product
http
POST /api/products
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "name": "Product Name",
  "sku": "SKU-001",
  "price": 100.00,
  "quantity": 50
}
Get Product
http
GET /api/products/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Update Product
http
PUT /api/products/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Delete Product
http
DELETE /api/products/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Import Products
http
POST /api/inventory/import
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: multipart/form-data

file: products.csv
duplicate_action: skip|update|stop
dry_run: 0|1
Export Products
http
GET /api/inventory/export
Authorization: Bearer YOUR_SANCTUM_TOKEN
Download Product Template
http
GET /api/inventory/template
Authorization: Bearer YOUR_SANCTUM_TOKEN
Orders
List Orders
http
GET /api/orders
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Order
http
POST /api/orders
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "customer_id": 1,
  "items": [
    {
      "product_id": 1,
      "quantity": 2,
      "price": 100
    }
  ]
}
Get Order
http
GET /api/orders/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Update Order
http
PUT /api/orders/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Delete Order
http
DELETE /api/orders/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Payments
List Payments
http
GET /api/payments
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Payment
http
POST /api/payments
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "invoice_id": 1,
  "amount": 500.00,
  "payment_method": "cash"
}
Get Payment
http
GET /api/payments/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Update Payment
http
PUT /api/payments/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Delete Payment
http
DELETE /api/payments/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Dealers
List Dealers
http
GET /api/dealers
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Dealer
http
POST /api/dealers
Authorization: Bearer YOUR_SANCTUM_TOKEN
Get Dealer
http
GET /api/dealers/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Update Dealer
http
PUT /api/dealers/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Delete Dealer
http
DELETE /api/dealers/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Invoices
List Invoices
http
GET /api/invoices
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Invoice
http
POST /api/invoices
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "customer_id": 1,
  "items": [
    {
      "product_id": 1,
      "quantity": 2,
      "price": 100
    }
  ],
  "due_date": "2025-01-31"
}
Get Invoice
http
GET /api/invoices/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Update Invoice
http
PUT /api/invoices/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Delete Invoice
http
DELETE /api/invoices/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Purchase Invoices
List Purchase Invoices
http
GET /api/purchase-invoices
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Purchase Invoice
http
POST /api/purchase-invoices
Authorization: Bearer YOUR_SANCTUM_TOKEN
Get Purchase Invoice
http
GET /api/purchase-invoices/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Update Purchase Invoice
http
PUT /api/purchase-invoices/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Delete Purchase Invoice
http
DELETE /api/purchase-invoices/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Add Payment to Purchase Invoice
http
POST /api/purchase-invoices/{id}/payments
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "amount": 500.00,
  "payment_method": "bank_transfer"
}
Sales
Get Sales Summary
http
GET /api/sales/summary
Authorization: Bearer YOUR_SANCTUM_TOKEN
List Sales Orders
http
GET /api/sales/orders
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Sales Order
http
POST /api/sales/orders
Authorization: Bearer YOUR_SANCTUM_TOKEN
List Quotations
http
GET /api/sales/quotations
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Quotation
http
POST /api/sales/quotations
Authorization: Bearer YOUR_SANCTUM_TOKEN
List Proformas
http
GET /api/sales/proformas
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Proforma
http
POST /api/sales/proformas
Authorization: Bearer YOUR_SANCTUM_TOKEN
List Delivery Challans
http
GET /api/sales/delivery-challans
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Delivery Challan
http
POST /api/sales/delivery-challans
Authorization: Bearer YOUR_SANCTUM_TOKEN
List Sales Returns
http
GET /api/sales/returns
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Sales Return
http
POST /api/sales/returns
Authorization: Bearer YOUR_SANCTUM_TOKEN
Get Sales Reports
http
GET /api/sales/reports
Authorization: Bearer YOUR_SANCTUM_TOKEN
Purchases
Get Purchase Summary
http
GET /api/purchases/summary
Authorization: Bearer YOUR_SANCTUM_TOKEN
List Purchase Orders
http
GET /api/purchases/orders
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Purchase Order
http
POST /api/purchases/orders
Authorization: Bearer YOUR_SANCTUM_TOKEN
List Purchase Bills
http
GET /api/purchases/bills
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Purchase Bill
http
POST /api/purchases/bills
Authorization: Bearer YOUR_SANCTUM_TOKEN
List GRN
http
GET /api/purchases/grn
Authorization: Bearer YOUR_SANCTUM_TOKEN
List Purchase Returns
http
GET /api/purchases/returns
Authorization: Bearer YOUR_SANCTUM_TOKEN
Get Purchase Reports
http
GET /api/purchases/reports
Authorization: Bearer YOUR_SANCTUM_TOKEN
Accounting
Get Accounting Summary
http
GET /api/accounting/summary
Authorization: Bearer YOUR_SANCTUM_TOKEN
List Accounts
http
GET /api/accounting/accounts
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Account
http
POST /api/accounting/accounts
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "name": "Cash Account",
  "type": "asset",
  "balance": 0
}
Get Account
http
GET /api/accounting/accounts/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Update Account
http
PUT /api/accounting/accounts/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Delete Account
http
DELETE /api/accounting/accounts/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
List Journals
http
GET /api/accounting/journals
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Journal
http
POST /api/accounting/journals
Authorization: Bearer YOUR_SANCTUM_TOKEN
Get Statements
http
GET /api/accounting/statements
Authorization: Bearer YOUR_SANCTUM_TOKEN
Employees
List Employees
http
GET /api/employees
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Employee
http
POST /api/employees
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "name": "Employee Name",
  "email": "employee@example.com",
  "department": "IT"
}
Get Employee
http
GET /api/employees/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Update Employee
http
PUT /api/employees/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Delete Employee
http
DELETE /api/employees/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Attendance
Today's Summary
http
GET /api/attendance/today-summary
Authorization: Bearer YOUR_SANCTUM_TOKEN
Today's Employees
http
GET /api/attendance/today-employees
Authorization: Bearer YOUR_SANCTUM_TOKEN
List Attendance
http
GET /api/attendance
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Attendance
http
POST /api/attendance
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "employee_id": 1,
  "status": "present",
  "date": "2025-01-15"
}
Get Attendance
http
GET /api/attendance/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Update Attendance
http
PUT /api/attendance/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Delete Attendance
http
DELETE /api/attendance/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Bulk Update Status
http
POST /api/attendance/bulk-status
Authorization: Bearer YOUR_SANCTUM_TOKEN
Bulk Delete
http
POST /api/attendance/bulk-delete
Authorization: Bearer YOUR_SANCTUM_TOKEN
Payroll
List Payroll
http
GET /api/payroll
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Payroll
http
POST /api/payroll
Authorization: Bearer YOUR_SANCTUM_TOKEN
Run Payroll
http
POST /api/payroll/run
Authorization: Bearer YOUR_SANCTUM_TOKEN
Get Payroll
http
GET /api/payroll/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Update Payroll
http
PUT /api/payroll/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Delete Payroll
http
DELETE /api/payroll/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Advances
http
GET /api/payroll/advances
POST /api/payroll/advances
GET /api/payroll/advances/{id}
PUT /api/payroll/advances/{id}
DELETE /api/payroll/advances/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Leaves
http
GET /api/payroll/leaves
POST /api/payroll/leaves
GET /api/payroll/leaves/{id}
PUT /api/payroll/leaves/{id}
DELETE /api/payroll/leaves/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Shifts
http
GET /api/payroll/shifts
POST /api/payroll/shifts
GET /api/payroll/shifts/{id}
PUT /api/payroll/shifts/{id}
DELETE /api/payroll/shifts/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Loans
http
GET /api/payroll/loans
POST /api/payroll/loans
GET /api/payroll/loans/{id}
PUT /api/payroll/loans/{id}
DELETE /api/payroll/loans/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Payslips
http
GET /api/payroll/payslips
POST /api/payroll/payslips
GET /api/payroll/payslips/{id}
PUT /api/payroll/payslips/{id}
DELETE /api/payroll/payslips/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Biometric Devices
List Devices
http
GET /api/biometric/devices
Authorization: Bearer YOUR_SANCTUM_TOKEN
Register Device (Public)
http
POST /api/biometric/device/register
Content-Type: application/json

{
  "device_uid": "DEVICE-001",
  "name": "Main Entrance",
  "firmware_version": "1.0.0"
}
Device Heartbeat (Public)
http
POST /api/biometric/device/heartbeat
Content-Type: application/json

{
  "device_uid": "DEVICE-001",
  "status": "online"
}
Sync Device
http
POST /api/biometric/device/{id}/sync
Authorization: Bearer YOUR_SANCTUM_TOKEN
Update Device Settings
http
POST /api/biometric/device/{id}/settings
Authorization: Bearer YOUR_SANCTUM_TOKEN
Restart Device
http
POST /api/biometric/device/{id}/restart
Authorization: Bearer YOUR_SANCTUM_TOKEN
Update Device
http
PUT /api/biometric/device/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Delete Device
http
DELETE /api/biometric/device/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Start Enrollment (Public)
http
POST /api/biometric/device/{id}/enroll
Content-Type: application/json

{
  "employee_id": 1
}
Update Enrollment Status (Public)
http
POST /api/biometric/device/{id}/enroll-status
Content-Type: application/json

{
  "status": "success",
  "template_data": "..."
}
Pending Enrollment (Public)
http
GET /api/biometric/device/pending-enrollment
Biometric Attendance (Public)
http
POST /api/biometric/attendance
Content-Type: application/json

{
  "device_uid": "DEVICE-001",
  "employee_id": 1,
  "timestamp": "2025-01-15 09:00:00"
}
Live Feed
http
GET /api/biometric/scans
Authorization: Bearer YOUR_SANCTUM_TOKEN
Pending Queue
http
GET /api/biometric/offline/pending
Authorization: Bearer YOUR_SANCTUM_TOKEN
Unknown Fingers
http
GET /api/biometric/unknown-fingers
Authorization: Bearer YOUR_SANCTUM_TOKEN
Upload Fingerprint Template
http
POST /api/biometric/templates/upload
Authorization: Bearer YOUR_SANCTUM_TOKEN
Download All Templates
http
POST /api/biometric/templates/download
Authorization: Bearer YOUR_SANCTUM_TOKEN
Delete Template
http
DELETE /api/biometric/templates/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
File Uploads
List Uploads
http
GET /api/uploads
Authorization: Bearer YOUR_SANCTUM_TOKEN
Upload File
http
POST /api/uploads
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: multipart/form-data

file: your-file.pdf
Create Folder
http
POST /api/uploads/folders
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "folder": "documents"
}
Delete File
http
POST /api/uploads/delete
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "path": "documents/file.pdf"
}
User Management
List Users
http
GET /api/users
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create User
http
POST /api/users
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "name": "User Name",
  "email": "user@example.com",
  "password": "password123"
}
Assign Roles to User
http
POST /api/users/{id}/roles
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "role_ids": [1, 2]
}
List Roles
http
GET /api/roles
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Role
http
POST /api/roles
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "name": "Manager",
  "description": "Manager role"
}
Update Role
http
PUT /api/roles/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Delete Role
http
DELETE /api/roles/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
List Permissions
http
GET /api/permissions
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Permission
http
POST /api/permissions
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "name": "create_invoice",
  "description": "Can create invoices"
}
Backups
List Backups
http
GET /api/backups
GET /api/health/backups
Authorization: Bearer YOUR_SANCTUM_TOKEN
Create Backup
http
POST /api/backups
POST /api/health/backup
Authorization: Bearer YOUR_SANCTUM_TOKEN
Restore Backup
http
POST /api/backups/restore
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "backup_id": 1
}
Download Backup
http
GET /api/backups/{id}/download
Authorization: Bearer YOUR_SANCTUM_TOKEN
Marketing
Dashboard
http
GET /api/marketing/dashboard
Authorization: Bearer YOUR_SANCTUM_TOKEN
Accounts
http
GET /api/marketing/accounts
Authorization: Bearer YOUR_SANCTUM_TOKEN
Posts
http
GET /api/marketing/posts
POST /api/marketing/posts
PUT /api/marketing/posts/{id}
DELETE /api/marketing/posts/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Calendar
http
GET /api/marketing/calendar
Authorization: Bearer YOUR_SANCTUM_TOKEN
Analytics
http
GET /api/marketing/analytics
Authorization: Bearer YOUR_SANCTUM_TOKEN
Inbox
http
GET /api/marketing/inbox
Authorization: Bearer YOUR_SANCTUM_TOKEN
GBP Locations (Public)
http
GET /api/marketing/gbp-locations
AI Assistant
Get Insights
http
GET /api/ai/assistant/insights
Authorization: Bearer YOUR_SANCTUM_TOKEN
Chat
http
POST /api/ai/assistant/chat
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "message": "What is my best selling product?",
  "provider_id": 1
}
Dashboard AI - Ask
http
POST /api/dashboard/ai/ask
Authorization: Bearer YOUR_SANCTUM_TOKEN
Business Health AI
http
POST /api/dashboard/ai/business-health
Authorization: Bearer YOUR_SANCTUM_TOKEN
Forecast AI
http
POST /api/dashboard/ai/forecast
Authorization: Bearer YOUR_SANCTUM_TOKEN
Generic Analysis
http
POST /api/dashboard/ai/generic
Authorization: Bearer YOUR_SANCTUM_TOKEN
AI Providers
http
GET /api/ai/providers
POST /api/ai/providers
PUT /api/ai/providers/{id}
Authorization: Bearer YOUR_SANCTUM_TOKEN
Inbox
List Messages
http
GET /api/inbox
Authorization: Bearer YOUR_SANCTUM_TOKEN
Mark as Read
http
POST /api/inbox/{id}/read
Authorization: Bearer YOUR_SANCTUM_TOKEN
Send Email
http
POST /api/inbox/email/send
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "to": "recipient@example.com",
  "subject": "Hello",
  "body": "Message body"
}
Send WhatsApp
http
POST /api/inbox/whatsapp/send
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "phone": "1234567890",
  "message": "Hello"
}
Suppliers (Public)
List Suppliers
http
GET /api/suppliers
Create Supplier
http
POST /api/suppliers
Content-Type: application/json

{
  "name": "Supplier Name",
  "email": "supplier@example.com",
  "phone": "1234567890"
}
Get Supplier
http
GET /api/suppliers/{id}
Update Supplier
http
PUT /api/suppliers/{id}
Delete Supplier
http
DELETE /api/suppliers/{id}
Webhooks
WhatsApp Webhook (Public)
http
POST /api/webhooks/whatsapp
Content-Type: application/json

{
  "event": "message",
  "from": "1234567890",
  "message": "Hello"
}
Email Webhook (Protected)
http
POST /api/webhooks/email
Authorization: Bearer YOUR_SANCTUM_TOKEN
Content-Type: application/json

{
  "event": "email_received",
  "from": "sender@example.com",
  "subject": "Email Subject"
}
Health Check
API Status (Public)
http
GET /api/status
Response
json
{
  "status": "ok",
  "service": "Business OS API"
}
Cron Health
http
GET /api/health/cron
Authorization: Bearer YOUR_SANCTUM_TOKEN
Error Response Format
All errors follow this format:

json
{
  "success": false,
  "message": "Error message",
  "errors": {
    "field_name": ["Validation error message"]
  }
}
HTTP Status Codes
200 - Success

201 - Created

400 - Bad Request

401 - Unauthorized

403 - Forbidden

404 - Not Found

422 - Validation Error

500 - Server Error

Rate Limiting
API requests are rate-limited. Default limits:

60 requests per minute per IP

Support
For API support, contact: support@nixaerp.com

Last Updated: 2025-01-15
Version: 1.0.0

text

This documentation file provides a complete reference for all API endpoints in your NixaERP system. Save this as `API_DOCUMENTATION.md` in your backend folder for easy reference.
