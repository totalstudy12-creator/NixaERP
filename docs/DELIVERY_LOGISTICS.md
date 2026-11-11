# Smart Delivery, Vehicle, Trip & Route Management System

> **Module:** Logistics & Delivery Management  
> **Backend:** Laravel 12 / MySQL 8.0+ / Sanctum RBAC  
> **Frontend:** React 18 / TypeScript 5.5 / Vite 8 / Tailwind CSS 4  
> **Primary Business Coverage:** Kashichak, Warisaliganj, Pawapuri, Nalanda, Nawada, and surrounding regions (Bihar)

---

## 1. Executive Summary & Business Architecture

The **Smart Delivery, Vehicle, Trip & Route Management System** provides an end-to-end logistics platform designed for wholesale and retail supply operations (tent materials, catering equipment, furniture, sound systems, coolers, and hardware).

### Core Capabilities
1. **Invoice Delivery Scheduling**: Automatically schedule deliveries against confirmed sales invoices (`delivery_orders`), capturing delivery priority, recipient contacts, GPS coordinates, and destination towns.
2. **Multi-Customer Trip Consolidation**: Combine multiple customer orders into a single vehicle carrier trip (`delivery_trips`) to optimize transportation expenses and minimize fleet mileage.
3. **Fleet & Driver Management**: Manage battery-operated electric carrier vehicles (TOTOs) and 4-wheeler transport trucks with driver assignment, payload limits, and scheduling conflict prevention.
4. **Godown-Wise Loading Checklist**: Generate itemized picking checklists segregated by source warehouse/godown without double-deducting stock (stock deduction occurs during sales invoice creation).
5. **Route Sequencing & Google Maps Directions**: Order trip stops sequentially with direct multi-waypoint navigation links (`https://www.google.com/maps/dir/...`).
6. **Transportation Cost Allocation**: Distribute total vehicle trip expenses (fuel, driver stipend, maintenance) across all invoice orders using Equal, Quantity, Weight, Volume, or Manual allocation rules, with deterministic penny-perfect rounding and audit reason logs.
7. **Delivery Proof & Multi-Attempt Lifecycle**: Support full delivery, partial delivery with item return tracking, and failed delivery with standardized reason codes and rescheduling.
8. **Formula Injection-Defended CSV Export**: Export 14+ operational and financial reports with sanitized cell prefixes preventing CSV formula execution.

---

## 2. Database Schema Architecture

The module adds 12 tables under migration `2026_11_14_000000_create_delivery_management_tables.php`:

| Table Name | Primary Purpose |
| :--- | :--- |
| `delivery_areas` | Geographic localities, towns, districts, postal codes, and GPS coordinates |
| `delivery_drivers` | Fleet drivers, employee linkage, license validity, contact details, and trip status |
| `delivery_vehicles` | TOTOs and 4-wheelers with max capacity, category, driver assignment, and maintenance status |
| `delivery_orders` | Customer delivery orders linked to `invoices` and `customers` with address, priority, and status |
| `delivery_order_items` | Item-level delivery tracking (planned vs picked vs delivered vs pending) |
| `delivery_trips` | Carrier trip entities with vehicle, driver, date, departure/return, status, and transport cost |
| `delivery_trip_stops` | Ordered sequence of stops along a carrier trip with ETA, actual arrival, and stop status |
| `delivery_loading_items` | Warehouse-wise physical picking items for loading checklists |
| `delivery_attempts` | Full history of delivery attempts (driver remarks, recipient sign-off, failure reasons) |
| `delivery_attempt_items` | Quantity delivered vs returned per attempt per line item |
| `delivery_cost_allocations` | Allocated trip expense per order with audit reasons and approval state |
| `delivery_status_histories` | Immutable audit trail for every status transition across orders and trips |

---

## 3. Strict Safety Invariants & Accounting Rules

1. **Stock Deduction Invariant**:
   - Stock is decremented and `StockMovement` recorded when the Sales Invoice is created in `InvoiceController.php`.
   - Loading checklists and dispatch **never** issue secondary stock deductions.
   - When items are returned from failed deliveries, `return_to_inventory` triggers a single compensatory inbound movement.
2. **Transportation Cost Invariant**:
   - Carrier cost allocations are for internal profitability tracking and gross margin reporting.
   - They **never** alter `invoices.total_amount` or customer receivables.
   - Cost distribution uses integer-cents / paisa rounding with remainder distributed to the largest order to guarantee $100.00\%$ balance.
3. **Vehicle Conflict Prevention**:
   - Overlapping trips cannot be assigned to an already-busy vehicle or driver without completing or closing existing trips.
4. **Formula Injection Defense**:
   - Cells beginning with `=`, `+`, `-`, or `@` are prepended with `'` during CSV exports.

---

## 4. API Endpoints Reference

All routes are protected by Sanctum and RBAC permission middleware under `/api/deliveries/*`:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/deliveries/dashboard` | KPI metrics, recent trips, area breakdown |
| `GET` | `/api/deliveries/orders` | Paginated delivery orders with status/date filters |
| `POST` | `/api/deliveries/orders` | Create or update delivery order for an invoice |
| `GET` | `/api/deliveries/orders/{id}` | Order details with items, attempts, and trip linkage |
| `POST` | `/api/deliveries/orders/{id}/schedule` | Set expected delivery date and priority |
| `POST` | `/api/deliveries/orders/{id}/confirm` | Record full/partial/failed delivery attempt |
| `GET` | `/api/deliveries/trips` | Paginated carrier trips |
| `POST` | `/api/deliveries/trips` | Create multi-customer carrier trip |
| `GET` | `/api/deliveries/trips/{id}` | Detailed trip manifest, stops, loading items, costs |
| `POST` | `/api/deliveries/trips/{id}/reorder` | Update stop sequence along route |
| `PUT` | `/api/deliveries/loading-items/{id}` | Update warehouse picked quantity |
| `POST` | `/api/deliveries/trips/{id}/confirm-loading` | Complete loading verification |
| `POST` | `/api/deliveries/trips/{id}/dispatch` | Dispatch trip / mark in transit |
| `POST` | `/api/deliveries/trips/{id}/close` | Return carrier to depot and close trip |
| `POST` | `/api/deliveries/trips/{id}/allocate-cost` | Distribute trip cost across orders |
| `PUT` | `/api/deliveries/cost-allocations/{id}` | Adjust allocation with audit reason |
| `POST` | `/api/deliveries/trips/{id}/approve-cost` | Approve and lock trip cost distribution |
| `GET` | `/api/deliveries/vehicles` | List delivery carrier fleet |
| `POST` | `/api/deliveries/vehicles` | Register carrier vehicle |
| `GET` | `/api/deliveries/drivers` | List drivers with license and availability |
| `POST` | `/api/deliveries/drivers` | Register carrier driver |
| `GET` | `/api/deliveries/calendar` | Monthly deliveries and trips schedule |
| `GET` | `/api/deliveries/areas` | Delivery towns and districts |
| `GET` | `/api/deliveries/reports` | Operational and financial reports |
| `GET` | `/api/deliveries/reports/export` | Download CSV report with formula defense |

---

## 5. Canonical Permissions

The module defines 29 granular permissions registered in `PermissionCanonicalizer.php` and seeded via `CanonicalPermissionsSeeder`:
- `delivery.orders.view`, `delivery.orders.create`, `delivery.orders.edit`, `delivery.orders.delete`, `delivery.orders.schedule`, `delivery.orders.confirm`
- `delivery.vehicles.view`, `delivery.vehicles.create`, `delivery.vehicles.edit`, `delivery.vehicles.delete`
- `delivery.drivers.view`, `delivery.drivers.create`, `delivery.drivers.edit`, `delivery.drivers.delete`
- `delivery.trips.view`, `delivery.trips.create`, `delivery.trips.edit`, `delivery.trips.delete`, `delivery.trips.dispatch`, `delivery.trips.close`
- `delivery.routes.view`, `delivery.routes.manage`
- `delivery.loading.view`, `delivery.loading.update`, `delivery.loading.confirm`
- `delivery.costs.view`, `delivery.costs.allocate`, `delivery.costs.approve`
- `delivery.reports.view`, `delivery.reports.export`
