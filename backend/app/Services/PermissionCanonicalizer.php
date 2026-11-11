<?php

namespace App\Services;

class PermissionCanonicalizer
{
    /**
     * Complete canonical catalog of permissions grouped by module.
     * Each entry specifies the canonical machine key, display label, module group, and description.
     */
    public const CATALOG = [
        // ==========================================
        // 1. NIXA WMS — WAREHOUSE MANAGEMENT SYSTEM
        // ==========================================
        'wms.dashboard.view' => [
            'group'       => 'Nixa WMS',
            'label'       => 'View WMS Dashboard',
            'description' => 'Access real-time warehouse metrics, stock value, and turnover analytics',
        ],
        'wms.settings.view' => [
            'group'       => 'Nixa WMS',
            'label'       => 'View WMS Settings',
            'description' => 'View warehouse configuration, reorder rules, and operational thresholds',
        ],
        'wms.settings.update' => [
            'group'       => 'Nixa WMS',
            'label'       => 'Update WMS Settings',
            'description' => 'Modify warehouse parameters, numbering sequences, and notification rules',
        ],
        'wms.warehouses.view' => [
            'group'       => 'Nixa WMS',
            'label'       => 'View Warehouses',
            'description' => 'List and inspect warehouse facilities within authorized company scope',
        ],
        'wms.warehouses.create' => [
            'group'       => 'Nixa WMS',
            'label'       => 'Create Warehouse',
            'description' => 'Provision new warehouse facilities, branch bindings, and storage areas',
        ],
        'wms.warehouses.update' => [
            'group'       => 'Nixa WMS',
            'label'       => 'Update Warehouse',
            'description' => 'Modify warehouse facility details, codes, contact points, and active flags',
        ],
        'wms.warehouses.archive' => [
            'group'       => 'Nixa WMS',
            'label'       => 'Archive / Delete Warehouse',
            'description' => 'Archive or remove warehouse facilities with zero active stock',
        ],
        'wms.warehouses.assign_users' => [
            'group'       => 'Nixa WMS',
            'label'       => 'Assign Warehouse Users',
            'description' => 'Authorize staff members to specific warehouses and restrict operation scopes',
        ],
        'wms.locations.view' => [
            'group'       => 'Nixa WMS',
            'label'       => 'View Warehouse Locations',
            'description' => 'Inspect racks, shelves, bins, and storage zones within warehouses',
        ],
        'wms.locations.manage' => [
            'group'       => 'Nixa WMS',
            'label'       => 'Manage Warehouse Locations',
            'description' => 'Create, edit, and deactivate racks, shelves, and bin identifiers',
        ],
        'wms.inventory.view' => [
            'group'       => 'Nixa WMS',
            'label'       => 'View Inventory & Stock Levels',
            'description' => 'View current physical, reserved, and available stock across warehouses',
        ],
        'wms.inventory.view_cost' => [
            'group'       => 'Nixa WMS',
            'label'       => 'View Inventory Valuation & Costs',
            'description' => 'Inspect average cost, purchase valuation, and monetary asset values',
        ],
        'wms.stock.receive' => [
            'group'       => 'Nixa WMS',
            'label'       => 'Receive Stock (Stock IN)',
            'description' => 'Record inward stock from supplier purchases, returns, or opening balances',
        ],
        'wms.stock.issue' => [
            'group'       => 'Nixa WMS',
            'label'       => 'Issue Stock (Stock OUT)',
            'description' => 'Record outward stock for customer shipments, internal consumption, or scrap',
        ],
        'wms.stock.transfer.create' => [
            'group'       => 'Nixa WMS',
            'label'       => 'Create Stock Transfer',
            'description' => 'Initiate inter-warehouse inventory movement orders between facilities',
        ],
        'wms.stock.transfer.approve' => [
            'group'       => 'Nixa WMS',
            'label'       => 'Approve Stock Transfer',
            'description' => 'Authorize pending transfer requests before physical dispatch',
        ],
        'wms.stock.transfer.dispatch' => [
            'group'       => 'Nixa WMS',
            'label'       => 'Dispatch Stock Transfer',
            'description' => 'Mark transfer order as in-transit and deduct from source warehouse',
        ],
        'wms.stock.transfer.receive' => [
            'group'       => 'Nixa WMS',
            'label'       => 'Receive Stock Transfer',
            'description' => 'Confirm receipt of in-transit goods into destination warehouse',
        ],
        'wms.stock.adjustment.create' => [
            'group'       => 'Nixa WMS',
            'label'       => 'Create Stock Adjustment',
            'description' => 'Submit quantity corrections for damages, expiry, or audit discrepancies',
        ],
        'wms.stock.adjustment.approve' => [
            'group'       => 'Nixa WMS',
            'label'       => 'Approve Stock Adjustment',
            'description' => 'Authorize inventory adjustments and write adjustments to the general ledger',
        ],
        'wms.stock.count.create' => [
            'group'       => 'Nixa WMS',
            'label'       => 'Create Physical Stock Count',
            'description' => 'Initiate cycle count sheets and physical stock audits for a facility',
        ],
        'wms.stock.count.submit' => [
            'group'       => 'Nixa WMS',
            'label'       => 'Submit Physical Count Results',
            'description' => 'Record counted quantities and calculate system variance discrepancies',
        ],
        'wms.stock.count.approve' => [
            'group'       => 'Nixa WMS',
            'label'       => 'Approve & Reconcile Count',
            'description' => 'Apply reconciliation entries to align system balances with physical counts',
        ],
        'wms.stock.history.view' => [
            'group'       => 'Nixa WMS',
            'label'       => 'View Stock Movement Ledger',
            'description' => 'Inspect immutable audit ledger of every IN, OUT, transfer, and adjustment',
        ],
        'wms.reports.view' => [
            'group'       => 'Nixa WMS',
            'label'       => 'View WMS Reports',
            'description' => 'Access stock aging, turnover, warehouse utilization, and movement summaries',
        ],
        'wms.reports.export' => [
            'group'       => 'Nixa WMS',
            'label'       => 'Export WMS Reports & Lists',
            'description' => 'Download warehouse stock sheets and audit ledgers in CSV/Excel formats',
        ],
        'wms.documents.download' => [
            'group'       => 'Nixa WMS',
            'label'       => 'Download Transfer & Count Slips',
            'description' => 'Download printable dispatch notes, goods receipt notes, and count tally sheets',
        ],
        'wms.inventory.import' => [
            'group'       => 'Nixa WMS',
            'label'       => 'Import Inventory Data',
            'description' => 'Upload bulk product stock balances and opening inventory spreadsheets',
        ],
        'wms.audit.view' => [
            'group'       => 'Nixa WMS',
            'label'       => 'View WMS Audit Trail',
            'description' => 'Inspect chronological log of warehouse configuration and stock transactions',
        ],
        'wms.audit.export' => [
            'group'       => 'Nixa WMS',
            'label'       => 'Export WMS Audit Logs',
            'description' => 'Export warehouse security and transaction audit trails for external compliance',
        ],

        // ==========================================
        // 2. CORE ADMINISTRATION & ACCESS CONTROL
        // ==========================================
        'users.view' => [
            'group'       => 'User Administration',
            'label'       => 'View Users',
            'description' => 'List and view user profiles within company scope',
        ],
        'users.create' => [
            'group'       => 'User Administration',
            'label'       => 'Create Users',
            'description' => 'Provision new staff accounts and set credentials',
        ],
        'users.update' => [
            'group'       => 'User Administration',
            'label'       => 'Update Users',
            'description' => 'Edit user profiles, contacts, and account statuses',
        ],
        'users.delete' => [
            'group'       => 'User Administration',
            'label'       => 'Delete / Deactivate Users',
            'description' => 'Deactivate or delete user accounts',
        ],
        'users.assign_roles' => [
            'group'       => 'User Administration',
            'label'       => 'Assign User Roles',
            'description' => 'Assign or revoke security roles on user accounts',
        ],
        'roles.view' => [
            'group'       => 'Roles & Permissions',
            'label'       => 'View Roles',
            'description' => 'List security roles and assigned permission catalogs',
        ],
        'roles.create' => [
            'group'       => 'Roles & Permissions',
            'label'       => 'Create Roles',
            'description' => 'Create new security roles for staff departments',
        ],
        'roles.update' => [
            'group'       => 'Roles & Permissions',
            'label'       => 'Update Roles',
            'description' => 'Modify role descriptions and group categorizations',
        ],
        'roles.delete' => [
            'group'       => 'Roles & Permissions',
            'label'       => 'Delete Roles',
            'description' => 'Delete custom security roles',
        ],
        'roles.assign_permissions' => [
            'group'       => 'Roles & Permissions',
            'label'       => 'Assign Role Permissions',
            'description' => 'Grant or revoke permissions on security roles',
        ],
        'permissions.view' => [
            'group'       => 'Roles & Permissions',
            'label'       => 'View Permissions',
            'description' => 'Browse the canonical permission catalog',
        ],
        'permissions.create' => [
            'group'       => 'Roles & Permissions',
            'label'       => 'Create Permissions',
            'description' => 'Create new permission catalog definitions',
        ],
        'permissions.update' => [
            'group'       => 'Roles & Permissions',
            'label'       => 'Update Permissions',
            'description' => 'Modify permission metadata and grouping',
        ],
        'permissions.delete' => [
            'group'       => 'Roles & Permissions',
            'label'       => 'Delete Permissions',
            'description' => 'Remove or deprecate custom permissions',
        ],
        'permissions.manage' => [
            'group'       => 'Roles & Permissions',
            'label'       => 'Manage Permissions',
            'description' => 'Full administrative control over permissions',
        ],
        'profile.view' => [
            'group'       => 'Profile',
            'label'       => 'View Own Profile',
            'description' => 'View personal profile and account settings',
        ],
        'profile.update' => [
            'group'       => 'Profile',
            'label'       => 'Update Own Profile',
            'description' => 'Edit personal contact info and preferences',
        ],
        'profile.change_password' => [
            'group'       => 'Profile',
            'label'       => 'Change Password',
            'description' => 'Update personal authentication password and 2FA',
        ],
        'settings.view' => [
            'group'       => 'Settings',
            'label'       => 'View System Settings',
            'description' => 'Inspect application configuration and third-party keys',
        ],
        'settings.update' => [
            'group'       => 'Settings',
            'label'       => 'Update System Settings',
            'description' => 'Modify system preferences, tax defaults, and branding',
        ],
        'audit_logs.view' => [
            'group'       => 'Audit Logs',
            'label'       => 'View Audit Logs',
            'description' => 'Inspect immutable audit logs across operations',
        ],
        'audit_logs.export' => [
            'group'       => 'Audit Logs',
            'label'       => 'Export Audit Logs',
            'description' => 'Export system audit trails to CSV or Excel',
        ],

        // ==========================================
        // 2a. BACKUP & DISASTER RECOVERY
        // ==========================================
        'system.backups.view' => [
            'group'       => 'Backup and Disaster Recovery',
            'label'       => 'View Backup Center',
            'description' => 'Inspect automated backup statuses, schedules, Google Drive storage quotas, and run history',
        ],
        'system.backups.create' => [
            'group'       => 'Backup and Disaster Recovery',
            'label'       => 'Execute Backups',
            'description' => 'Trigger manual or on-demand encrypted database and files backups to Google Drive',
        ],
        'system.backups.restore' => [
            'group'       => 'Backup and Disaster Recovery',
            'label'       => 'Restore Backups',
            'description' => 'Execute disaster recovery database and asset restoration workflows',
        ],
        'system.backups.delete' => [
            'group'       => 'Backup and Disaster Recovery',
            'label'       => 'Prune and Delete Backups',
            'description' => 'Delete remote backup artifacts or trigger retention pruning policies',
        ],
        'system.backups.settings' => [
            'group'       => 'Backup and Disaster Recovery',
            'label'       => 'Manage Backup Settings',
            'description' => 'Configure Google Drive OAuth integration, retention rules, and alerts',
        ],

        // ==========================================
        // 2b. SECURITY FIREWALL & ACCESS CONTROL
        // ==========================================
        'security.view' => [
            'group'       => 'Security & Firewall',
            'label'       => 'View Security Center',
            'description' => 'Access the security dashboard, active sessions, and firewall rules',
        ],
        'security.firewall.manage' => [
            'group'       => 'Security & Firewall',
            'label'       => 'Manage IP Firewall Rules',
            'description' => 'Create, modify, block, and allowlist IP addresses and CIDR subnets',
        ],
        'security.sessions.manage' => [
            'group'       => 'Security & Firewall',
            'label'       => 'Manage User Sessions',
            'description' => 'Inspect and terminate active device sessions across the enterprise',
        ],
        'users.ban' => [
            'group'       => 'User Administration',
            'label'       => 'Ban / Suspend Users',
            'description' => 'Apply temporary suspensions or permanent bans to user accounts',
        ],
        'users.unban' => [
            'group'       => 'User Administration',
            'label'       => 'Unban / Reactivate Users',
            'description' => 'Restore banned user accounts and reset lockout restrictions',
        ],
        'customers.360.view' => [
            'group'       => 'Customers & CRM',
            'label'       => 'View Customer 360 Workspace',
            'description' => 'Inspect complete 360 customer profile, aging, and transaction history',
        ],
        'apps.view' => [
            'group'       => 'App Ecosystem',
            'label'       => 'View App Launcher',
            'description' => 'View available connected business applications and versions',
        ],
        'apps.manage' => [
            'group'       => 'App Ecosystem',
            'label'       => 'Manage App Registry',
            'description' => 'Configure connected applications, release updates, and API keys',
        ],
        'erp.access' => [
            'group'       => 'App Ecosystem',
            'label'       => 'Access Nixa ERP',
            'description' => 'Access core enterprise ERP modules and workspaces',
        ],
        'wms.access' => [
            'group'       => 'App Ecosystem',
            'label'       => 'Access Nixa WMS',
            'description' => 'Access warehouse management system modules and scanner views',
        ],
        'billing.access' => [
            'group'       => 'App Ecosystem',
            'label'       => 'Access Nixa Billing',
            'description' => 'Access fast billing POS and thermal printing terminals',
        ],
        'hr.access' => [
            'group'       => 'App Ecosystem',
            'label'       => 'Access Nixa HR',
            'description' => 'Access human resources directory, shifts, and payroll system',
        ],
        'crm.access' => [
            'group'       => 'App Ecosystem',
            'label'       => 'Access Nixa CRM',
            'description' => 'Access CRM pipeline, opportunities, and lead conversion workflows',
        ],

        // ==========================================
        // 3. COMPANIES & BRANCHES
        // ==========================================
        'companies.view' => [
            'group'       => 'Companies',
            'label'       => 'View Companies',
            'description' => 'View company profiles and legal entity records',
        ],
        'companies.create' => [
            'group'       => 'Companies',
            'label'       => 'Create Companies',
            'description' => 'Register new company entities in the ERP',
        ],
        'companies.update' => [
            'group'       => 'Companies',
            'label'       => 'Update Companies',
            'description' => 'Edit company tax IDs, addresses, and details',
        ],
        'companies.delete' => [
            'group'       => 'Companies',
            'label'       => 'Delete Companies',
            'description' => 'Remove or deactivate company entities',
        ],
        'branches.view' => [
            'group'       => 'Branches',
            'label'       => 'View Branches',
            'description' => 'View organizational branch offices',
        ],
        'branches.create' => [
            'group'       => 'Branches',
            'label'       => 'Create Branches',
            'description' => 'Register new branch locations under a company',
        ],
        'branches.update' => [
            'group'       => 'Branches',
            'label'       => 'Update Branches',
            'description' => 'Edit branch contacts and operational details',
        ],
        'branches.delete' => [
            'group'       => 'Branches',
            'label'       => 'Delete Branches',
            'description' => 'Remove or archive branch records',
        ],

        // ==========================================
        // 4. PRODUCTS & CATALOG
        // ==========================================
        'products.view' => [
            'group'       => 'Products',
            'label'       => 'View Products',
            'description' => 'Browse product master catalog, prices, and SKUs',
        ],
        'products.create' => [
            'group'       => 'Products',
            'label'       => 'Create Products',
            'description' => 'Add new products, categories, and barcodes',
        ],
        'products.update' => [
            'group'       => 'Products',
            'label'       => 'Update Products',
            'description' => 'Edit product details, tax rates, and prices',
        ],
        'products.delete' => [
            'group'       => 'Products',
            'label'       => 'Delete Products',
            'description' => 'Archive or remove products from the catalog',
        ],
        'products.export' => [
            'group'       => 'Products',
            'label'       => 'Export Products',
            'description' => 'Download product master catalog spreadsheets',
        ],
        'products.import' => [
            'group'       => 'Products',
            'label'       => 'Import Products',
            'description' => 'Bulk import product catalogs from Excel/CSV',
        ],
        'products.purchase_price.view' => [
            'group'       => 'Products',
            'label'       => 'View Purchase / Cost Price',
            'description' => 'Inspect product purchase costs, valuation, and margin calculations',
        ],
        'products.purchase_price.edit' => [
            'group'       => 'Products',
            'label'       => 'Edit Purchase / Cost Price',
            'description' => 'Modify purchase rates and cost prices on products',
        ],

        // ==========================================
        // 5. CUSTOMERS & CRM
        // ==========================================
        'customers.view' => [
            'group'       => 'Customers',
            'label'       => 'View Customers',
            'description' => 'Browse customer profiles, balances, and contacts',
        ],
        'customers.create' => [
            'group'       => 'Customers',
            'label'       => 'Create Customers',
            'description' => 'Add new customer accounts and billing addresses',
        ],
        'customers.update' => [
            'group'       => 'Customers',
            'label'       => 'Update Customers',
            'description' => 'Edit customer credit limits, GSTINs, and details',
        ],
        'customers.delete' => [
            'group'       => 'Customers',
            'label'       => 'Delete Customers',
            'description' => 'Archive or remove customer accounts',
        ],
        'customers.export' => [
            'group'       => 'Customers',
            'label'       => 'Export Customers',
            'description' => 'Download customer master list to CSV',
        ],
        'customers.import' => [
            'group'       => 'Customers',
            'label'       => 'Import Customers',
            'description' => 'Bulk import customer accounts from spreadsheet',
        ],
        'customers.ledger.view' => [
            'group'       => 'Customers',
            'label'       => 'View Customer Ledger',
            'description' => 'Access transactional debit/credit statements',
        ],

        // ==========================================
        // 6. SUPPLIERS & PURCHASING
        // ==========================================
        'suppliers.view' => [
            'group'       => 'Suppliers',
            'label'       => 'View Suppliers',
            'description' => 'Browse vendor profiles, terms, and purchase records',
        ],
        'suppliers.create' => [
            'group'       => 'Suppliers',
            'label'       => 'Create Suppliers',
            'description' => 'Register new vendors and trade suppliers',
        ],
        'suppliers.update' => [
            'group'       => 'Suppliers',
            'label'       => 'Update Suppliers',
            'description' => 'Edit supplier contact points and payment terms',
        ],
        'suppliers.delete' => [
            'group'       => 'Suppliers',
            'label'       => 'Delete Suppliers',
            'description' => 'Archive or remove supplier records',
        ],
        'suppliers.export' => [
            'group'       => 'Suppliers',
            'label'       => 'Export Suppliers',
            'description' => 'Download supplier records to CSV',
        ],
        'purchases.view' => [
            'group'       => 'Purchases',
            'label'       => 'View Purchase Invoices',
            'description' => 'Inspect purchase invoices, bills, and purchase orders',
        ],
        'purchases.create' => [
            'group'       => 'Purchases',
            'label'       => 'Create Purchase Invoices',
            'description' => 'Record inward purchase invoices and bills',
        ],
        'purchases.update' => [
            'group'       => 'Purchases',
            'label'       => 'Update Purchase Invoices',
            'description' => 'Edit unapproved purchase invoices and items',
        ],
        'purchases.delete' => [
            'group'       => 'Purchases',
            'label'       => 'Delete Purchase Invoices',
            'description' => 'Delete or void unposted purchase invoices',
        ],
        'purchases.export' => [
            'group'       => 'Purchases',
            'label'       => 'Export Purchase Records',
            'description' => 'Download purchase registers and tax summaries',
        ],

        // ==========================================
        // 7. SALES & INVOICES
        // ==========================================
        'invoices.view' => [
            'group'       => 'Invoices',
            'label'       => 'View Sales Invoices',
            'description' => 'Browse tax invoices, quotations, and proformas',
        ],
        'invoices.create' => [
            'group'       => 'Invoices',
            'label'       => 'Create Sales Invoices',
            'description' => 'Generate new sales invoices and quotations',
        ],
        'invoices.update' => [
            'group'       => 'Invoices',
            'label'       => 'Update Sales Invoices',
            'description' => 'Edit invoice line items, discounts, and terms',
        ],
        'invoices.delete' => [
            'group'       => 'Invoices',
            'label'       => 'Delete Sales Invoices',
            'description' => 'Cancel or void sales invoices',
        ],
        'invoices.export' => [
            'group'       => 'Invoices',
            'label'       => 'Export Sales Invoices',
            'description' => 'Export sales invoice registers and GST data',
        ],
        'invoices.print' => [
            'group'       => 'Invoices',
            'label'       => 'Print Sales Invoices',
            'description' => 'Download or print PDF copies of sales invoices',
        ],
        'sales.returns.view' => [
            'group'       => 'Sales Returns',
            'label'       => 'View Sales Returns',
            'description' => 'Browse credit notes and sales return documents',
        ],
        'sales.returns.create' => [
            'group'       => 'Sales Returns',
            'label'       => 'Create Sales Returns',
            'description' => 'Issue credit notes for customer item returns',
        ],
        'sales.returns.update' => [
            'group'       => 'Sales Returns',
            'label'       => 'Update Sales Returns',
            'description' => 'Edit pending sales return documents',
        ],
        'sales.returns.delete' => [
            'group'       => 'Sales Returns',
            'label'       => 'Delete Sales Returns',
            'description' => 'Void or delete unposted sales returns',
        ],
        'sales.returns.export' => [
            'group'       => 'Sales Returns',
            'label'       => 'Export Sales Returns',
            'description' => 'Export sales return registers',
        ],
        'pos.view' => [
            'group'       => 'Point of Sale',
            'label'       => 'Access Point of Sale (POS)',
            'description' => 'Open the rapid retail point of sale terminal',
        ],
        'pos.create_sale' => [
            'group'       => 'Point of Sale',
            'label'       => 'Complete POS Sales',
            'description' => 'Post sales transactions from the POS terminal',
        ],

        // ==========================================
        // CRM & QUOTATIONS
        // ==========================================
        'quotations.view' => [
            'group'       => 'CRM & Quotations',
            'label'       => 'View Quotations',
            'description' => 'Browse and inspect sales quotations and price proposals',
        ],
        'quotations.create' => [
            'group'       => 'CRM & Quotations',
            'label'       => 'Create Quotations',
            'description' => 'Create new sales quotations and proposals',
        ],
        'quotations.update' => [
            'group'       => 'CRM & Quotations',
            'label'       => 'Update Quotations',
            'description' => 'Edit quotation details, line items, discounts, and terms',
        ],
        'quotations.delete' => [
            'group'       => 'CRM & Quotations',
            'label'       => 'Delete Quotations',
            'description' => 'Cancel or delete sales quotations',
        ],
        'quotations.convert' => [
            'group'       => 'CRM & Quotations',
            'label'       => 'Convert Quotations',
            'description' => 'Convert approved quotations to sales invoices or sales orders',
        ],
        'leads.view' => [
            'group'       => 'CRM & Leads',
            'label'       => 'View Leads',
            'description' => 'Browse sales leads and customer acquisition pipeline',
        ],
        'leads.create' => [
            'group'       => 'CRM & Leads',
            'label'       => 'Create Leads',
            'description' => 'Capture and log prospective customer leads',
        ],
        'leads.update' => [
            'group'       => 'CRM & Leads',
            'label'       => 'Update Leads',
            'description' => 'Update lead status, qualification, notes, and follow-ups',
        ],
        'leads.delete' => [
            'group'       => 'CRM & Leads',
            'label'       => 'Delete Leads',
            'description' => 'Remove leads from CRM pipeline',
        ],
        'leads.convert' => [
            'group'       => 'CRM & Leads',
            'label'       => 'Convert Leads',
            'description' => 'Convert qualified leads into active customer accounts',
        ],
        'contacts.view' => [
            'group'       => 'CRM & Contacts',
            'label'       => 'View Contacts',
            'description' => 'Browse business contacts and directory',
        ],
        'contacts.create' => [
            'group'       => 'CRM & Contacts',
            'label'       => 'Create Contacts',
            'description' => 'Add new business contacts and stakeholders',
        ],
        'contacts.update' => [
            'group'       => 'CRM & Contacts',
            'label'       => 'Update Contacts',
            'description' => 'Update contact profiles and communication channels',
        ],
        'contacts.delete' => [
            'group'       => 'CRM & Contacts',
            'label'       => 'Delete Contacts',
            'description' => 'Remove contacts from address directory',
        ],
        'opportunities.view' => [
            'group'       => 'CRM',
            'label'       => 'View Opportunities',
            'description' => 'Browse sales pipeline opportunities',
        ],
        'campaigns.view' => [
            'group'       => 'CRM',
            'label'       => 'View Campaigns',
            'description' => 'Browse marketing campaigns',
        ],

        // ==========================================
        // 8. FINANCE & ACCOUNTING
        // ==========================================
        'income_expenses.view' => [
            'group'       => 'Income & Expenses',
            'label'       => 'View Income & Expenses',
            'description' => 'Inspect income entries, expense vouchers, and categories',
        ],
        'income_expenses.create' => [
            'group'       => 'Income & Expenses',
            'label'       => 'Record Income & Expenses',
            'description' => 'Create income receipts and expense vouchers',
        ],
        'income_expenses.edit' => [
            'group'       => 'Income & Expenses',
            'label'       => 'Edit Income & Expenses',
            'description' => 'Update recorded income or expense entries',
        ],
        'income_expenses.delete' => [
            'group'       => 'Income & Expenses',
            'label'       => 'Delete Income & Expenses',
            'description' => 'Remove or reverse income and expense vouchers',
        ],
        'income_expenses.export' => [
            'group'       => 'Income & Expenses',
            'label'       => 'Export Income & Expenses',
            'description' => 'Download income and expense reports to Excel/CSV',
        ],
        'income_expenses.manage_categories' => [
            'group'       => 'Income & Expenses',
            'label'       => 'Manage Categories',
            'description' => 'Create and edit income and expense chart categories',
        ],
        'income_expenses.manage_accounts' => [
            'group'       => 'Income & Expenses',
            'label'       => 'Manage Accounts',
            'description' => 'Manage income and expense bank and cash accounts',
        ],
        'income_expenses.manage_recurring' => [
            'group'       => 'Income & Expenses',
            'label'       => 'Manage Recurring Entries',
            'description' => 'Manage recurring schedules for repetitive bills and income',
        ],
        'income_expenses.view_reports' => [
            'group'       => 'Income & Expenses',
            'label'       => 'View Income & Expense Reports',
            'description' => 'Inspect comprehensive financial analytics and category breakdowns',
        ],
        'income_expenses.approve' => [
            'group'       => 'Income & Expenses',
            'label'       => 'Approve Expenses',
            'description' => 'Authorize and approve submitted expense vouchers',
        ],
        'income_expenses.reject' => [
            'group'       => 'Income & Expenses',
            'label'       => 'Reject Expenses',
            'description' => 'Reject submitted expense vouchers',
        ],
        'income_expenses.reverse' => [
            'group'       => 'Income & Expenses',
            'label'       => 'Reverse Expenses',
            'description' => 'Reverse posted income or expense transactions',
        ],
        'accounting.view' => [
            'group'       => 'Accounting',
            'label'       => 'View Accounting Records',
            'description' => 'Inspect chart of accounts, bank balances, and journals',
        ],
        'accounting.manage' => [
            'group'       => 'Accounting',
            'label'       => 'Manage Accounting Accounts',
            'description' => 'Create and modify bank/cash accounts and ledgers',
        ],

        // ==========================================
        // 8B. BANK & CASH RECONCILIATION
        // ==========================================
        'banking.accounts.view' => [
            'group'       => 'Banking & Cash',
            'label'       => 'View Bank & Cash Accounts',
            'description' => 'Browse bank accounts, cash drawers, and running book balances',
        ],
        'banking.accounts.manage' => [
            'group'       => 'Banking & Cash',
            'label'       => 'Manage Bank & Cash Accounts',
            'description' => 'Create, modify, and configure bank accounts and cash drawers',
        ],
        'banking.transactions.view' => [
            'group'       => 'Banking & Cash',
            'label'       => 'View Account Transactions',
            'description' => 'Inspect account ledgers, deposits, withdrawals, and internal transfers',
        ],
        'banking.transactions.manage' => [
            'group'       => 'Banking & Cash',
            'label'       => 'Manage Transactions & Transfers',
            'description' => 'Record deposits, withdrawals, adjustments, and inter-account transfers',
        ],
        'banking.cash_closing.view' => [
            'group'       => 'Banking & Cash',
            'label'       => 'View Cash Closings',
            'description' => 'Inspect daily cash register closings and count sheets',
        ],
        'banking.cash_closing.manage' => [
            'group'       => 'Banking & Cash',
            'label'       => 'Submit Cash Closing',
            'description' => 'Count physical cash and submit daily register closings',
        ],
        'banking.cash_closing.approve' => [
            'group'       => 'Banking & Cash',
            'label'       => 'Approve Cash Variances',
            'description' => 'Authorize and approve cash shortage or excess adjustments',
        ],
        'banking.statements.upload' => [
            'group'       => 'Banking & Cash',
            'label'       => 'Upload Bank Statements',
            'description' => 'Upload, parse, and import CSV, Excel, and PDF bank statements',
        ],
        'banking.reconciliation.view' => [
            'group'       => 'Banking & Cash',
            'label'       => 'View Bank Reconciliation',
            'description' => 'Inspect bank statement matches, outstanding items, and reconciliation dashboard',
        ],
        'banking.reconciliation.manage' => [
            'group'       => 'Banking & Cash',
            'label'       => 'Perform Bank Reconciliation',
            'description' => 'Confirm matches, split settlements, create adjustments, and approve reconciliations',
        ],
        'banking.rules.view' => [
            'group'       => 'Banking & Cash',
            'label'       => 'View Learned Reconciliation Rules',
            'description' => 'Inspect automated pattern recognition rules and merchant mappings',
        ],
        'banking.rules.manage' => [
            'group'       => 'Banking & Cash',
            'label'       => 'Manage Reconciliation Rules',
            'description' => 'Create, edit, toggle, and delete learned matching rules',
        ],

        // ==========================================
        // 8C. CASH DRAWER MANAGEMENT
        // ==========================================
        'finance.cash_drawer.view' => [
            'group'       => 'Cash Drawer',
            'label'       => 'View Cash Drawers',
            'description' => 'Browse cash drawers, active sessions, and cash balances',
        ],
        'finance.cash_drawer.create' => [
            'group'       => 'Cash Drawer',
            'label'       => 'Create Cash Drawers',
            'description' => 'Register and configure new cash drawers for branches',
        ],
        'finance.cash_drawer.open' => [
            'group'       => 'Cash Drawer',
            'label'       => 'Open Cash Drawer Session',
            'description' => 'Count denominations and open daily cash drawer sessions',
        ],
        'finance.cash_drawer.close' => [
            'group'       => 'Cash Drawer',
            'label'       => 'Close Cash Drawer Session',
            'description' => 'Count closing cash and submit daily register closing reconciliation',
        ],
        'finance.cash_drawer.cash_in' => [
            'group'       => 'Cash Drawer',
            'label'       => 'Record Cash In',
            'description' => 'Enter cash-in receipts, customer cash, and cash float deposits',
        ],
        'finance.cash_drawer.cash_out' => [
            'group'       => 'Cash Drawer',
            'label'       => 'Record Cash Out',
            'description' => 'Enter cash-out disbursements, staff expenses, and cash payments',
        ],
        'finance.cash_drawer.transfer' => [
            'group'       => 'Cash Drawer',
            'label'       => 'Transfer Cash',
            'description' => 'Initiate, receive, and confirm inter-drawer and cross-branch cash transfers',
        ],
        'finance.cash_drawer.adjust' => [
            'group'       => 'Cash Drawer',
            'label'       => 'Adjust Cash Balance',
            'description' => 'Perform authorized opening and closing cash adjustments with audit trail',
        ],
        'finance.cash_drawer.approve' => [
            'group'       => 'Cash Drawer',
            'label'       => 'Approve Cash Discrepancies',
            'description' => 'Review and approve closing cash shortage or excess discrepancies',
        ],
        'finance.cash_drawer.report' => [
            'group'       => 'Cash Drawer',
            'label'       => 'Cash Drawer Reports',
            'description' => 'Inspect daily cash book, cashier summaries, differences, and export logs',
        ],
        'finance.cash_drawer.manage' => [
            'group'       => 'Cash Drawer',
            'label'       => 'Full Cash Drawer Management',
            'description' => 'Full administrative control over cash drawers, sessions, and settings',
        ],

        // ==========================================
        // 9. HR & PAYROLL
        // ==========================================
        'employees.view' => [
            'group'       => 'Employees',
            'label'       => 'View Employees',
            'description' => 'Browse staff directory, departments, and designations',
        ],
        'employees.create' => [
            'group'       => 'Employees',
            'label'       => 'Create Employees',
            'description' => 'Onboard new staff and add personnel profiles',
        ],
        'employees.update' => [
            'group'       => 'Employees',
            'label'       => 'Update Employees',
            'description' => 'Modify staff information, salaries, and bank details',
        ],
        'employees.delete' => [
            'group'       => 'Employees',
            'label'       => 'Delete Employees',
            'description' => 'Archive or terminate employee profiles',
        ],
        'employees.export' => [
            'group'       => 'Employees',
            'label'       => 'Export Employees',
            'description' => 'Download employee registers to spreadsheet',
        ],
        'attendance.view' => [
            'group'       => 'Attendance',
            'label'       => 'View Attendance',
            'description' => 'Inspect daily clock-ins, biometric logs, and timesheets',
        ],
        'attendance.create' => [
            'group'       => 'Attendance',
            'label'       => 'Record Attendance',
            'description' => 'Manually log or correct daily staff attendance',
        ],
        'attendance.update' => [
            'group'       => 'Attendance',
            'label'       => 'Update Attendance',
            'description' => 'Modify timesheet hours and approve punch adjustments',
        ],
        'attendance.delete' => [
            'group'       => 'Attendance',
            'label'       => 'Delete Attendance',
            'description' => 'Void erroneous attendance records',
        ],
        'payroll.view' => [
            'group'       => 'Payroll',
            'label'       => 'View Payroll',
            'description' => 'Inspect monthly payroll summaries and payslips',
        ],
        'payroll.create' => [
            'group'       => 'Payroll',
            'label'       => 'Generate Payroll Run',
            'description' => 'Compute monthly salary sheets and deductions',
        ],
        'payroll.approve' => [
            'group'       => 'Payroll',
            'label'       => 'Approve Payroll',
            'description' => 'Authorize salary payouts and bank transfer orders',
        ],
        'payroll.export' => [
            'group'       => 'Payroll',
            'label'       => 'Export Payroll Reports',
            'description' => 'Download monthly payroll registers and bank advice sheets',
        ],

        // ==========================================
        // 10. NOTIFICATIONS, MARKETING & AI
        // ==========================================
        'notifications.view' => [
            'group'       => 'Notifications',
            'label'       => 'View Notifications',
            'description' => 'Access notification center and message queue status',
        ],
        'notifications.manage' => [
            'group'       => 'Notifications',
            'label'       => 'Manage Notifications',
            'description' => 'Configure automated alert rules, SMS, and WhatsApp triggers',
        ],
        'marketing.view' => [
            'group'       => 'Marketing',
            'label'       => 'View Marketing',
            'description' => 'Inspect campaign calendars and analytics',
        ],
        'marketing.manage' => [
            'group'       => 'Marketing',
            'label'       => 'Manage Marketing Posts',
            'description' => 'Schedule social media posts and promotional messages',
        ],
        'ai.assistant.view' => [
            'group'       => 'AI Assistant',
            'label'       => 'Access AI Assistant',
            'description' => 'Interact with ERP natural language query and insights',
        ],
        'ai.providers.manage' => [
            'group'       => 'AI Assistant',
            'label'       => 'Manage AI Providers',
            'description' => 'Configure Gemini API keys and fallback models',
        ],

        // ==========================================
        // DELIVERY & LOGISTICS MANAGEMENT
        // ==========================================
        'delivery.orders.view' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'View Delivery Orders',
            'description' => 'List and inspect invoice delivery orders, schedules, and customer addresses',
        ],
        'delivery.orders.create' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'Create Delivery Order',
            'description' => 'Create delivery orders linked to sales invoices',
        ],
        'delivery.orders.update' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'Update Delivery Order',
            'description' => 'Modify delivery destination address, contact, and instructions',
        ],
        'delivery.orders.schedule' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'Schedule Delivery',
            'description' => 'Assign expected delivery date and time slots',
        ],
        'delivery.orders.reschedule' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'Reschedule Delivery',
            'description' => 'Postpone or reschedule delivery orders',
        ],
        'delivery.orders.cancel' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'Cancel Delivery',
            'description' => 'Cancel pending delivery orders',
        ],
        'delivery.orders.confirm' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'Confirm Delivery',
            'description' => 'Record delivery confirmation, receiver proof, and partial delivery',
        ],
        'delivery.vehicles.view' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'View Vehicles',
            'description' => 'List and inspect carrier vehicles, capacities, and availability',
        ],
        'delivery.vehicles.create' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'Create Vehicle',
            'description' => 'Register new delivery vehicles and carriers',
        ],
        'delivery.vehicles.update' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'Update Vehicle',
            'description' => 'Modify vehicle specifications, driver bindings, and maintenance status',
        ],
        'delivery.vehicles.manage' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'Manage Vehicles',
            'description' => 'Full administrative control over delivery vehicle fleet',
        ],
        'delivery.drivers.view' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'View Drivers',
            'description' => 'List and inspect delivery drivers and availability',
        ],
        'delivery.drivers.manage' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'Manage Drivers',
            'description' => 'Register, update, and manage delivery drivers',
        ],
        'delivery.trips.view' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'View Trips',
            'description' => 'Inspect multi-order vehicle trips and routes',
        ],
        'delivery.trips.create' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'Create Trip',
            'description' => 'Plan and combine multiple customer orders into a single vehicle trip',
        ],
        'delivery.trips.update' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'Update Trip',
            'description' => 'Modify trip details, route sequence, and assignments',
        ],
        'delivery.trips.assign_vehicle' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'Assign Vehicle & Driver',
            'description' => 'Allocate carrier vehicles and drivers to delivery trips',
        ],
        'delivery.trips.dispatch' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'Dispatch Trip',
            'description' => 'Authorize and record departure of loaded vehicle on road',
        ],
        'delivery.trips.close' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'Close Trip',
            'description' => 'Finalize completed trip and release vehicle and driver',
        ],
        'delivery.routes.view' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'View Routes',
            'description' => 'View map routes, area groupings, and stops',
        ],
        'delivery.routes.manage' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'Manage Routes',
            'description' => 'Reorder stops and configure delivery routes',
        ],
        'delivery.loading.view' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'View Loading Checklist',
            'description' => 'View warehouse-wise product picking checklists for trips',
        ],
        'delivery.loading.manage' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'Manage Loading',
            'description' => 'Record picked quantities and godown picking checkpoints',
        ],
        'delivery.loading.confirm' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'Confirm Loading',
            'description' => 'Verify and finalize loading before vehicle dispatch',
        ],
        'delivery.costs.view' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'View Transport Costs',
            'description' => 'View trip transportation costs and invoice-wise allocations',
        ],
        'delivery.costs.manage' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'Manage Transport Costs',
            'description' => 'Allocate trip expenses proportionally or equally across orders',
        ],
        'delivery.costs.approve' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'Approve Transport Costs',
            'description' => 'Approve final transportation cost allocations',
        ],
        'delivery.reports.view' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'View Delivery Reports',
            'description' => 'Access delivery performance, vehicle utilization, and trip analytics',
        ],
        'delivery.reports.export' => [
            'group'       => 'Logistics & Delivery',
            'label'       => 'Export Delivery Reports',
            'description' => 'Export logistics and delivery reports to CSV / Excel',
        ],
    ];

    /**
     * Complete mapping of legacy / alternate aliases to their canonical keys.
     * Ensures all existing route checks, frontend permissions, and legacy database
     * records resolve seamlessly without breaking any existing assignment.
     */
    private static array $aliasMap = [
        // --- Warehouses & WMS ---
        'view warehouses'               => 'wms.warehouses.view',
        'warehouses.view'               => 'wms.warehouses.view',
        'warehouses:view'               => 'wms.warehouses.view',
        'create warehouses'             => 'wms.warehouses.create',
        'warehouses.create'             => 'wms.warehouses.create',
        'warehouses:create'             => 'wms.warehouses.create',
        'edit warehouses'               => 'wms.warehouses.update',
        'warehouses.update'             => 'wms.warehouses.update',
        'warehouses:edit'               => 'wms.warehouses.update',
        'delete warehouses'             => 'wms.warehouses.archive',
        'warehouses.delete'             => 'wms.warehouses.archive',
        'warehouses:delete'             => 'wms.warehouses.archive',
        'export warehouses'             => 'wms.reports.export',
        'warehouses.export'             => 'wms.reports.export',
        'view inventory'                => 'wms.inventory.view',
        'manage inventory'              => 'wms.inventory.view',
        'adjust stock'                  => 'wms.stock.adjustment.create',
        'import inventory'              => 'wms.inventory.import',
        'export inventory'              => 'wms.reports.export',
        'download inventory template'   => 'wms.documents.download',
        'view low stock products'       => 'wms.inventory.view',

        // --- Users & Roles ---
        'view users'                    => 'users.view',
        'users.view'                    => 'users.view',
        'users:view'                    => 'users.view',
        'create users'                  => 'users.create',
        'users.create'                  => 'users.create',
        'edit users'                    => 'users.update',
        'users.update'                  => 'users.update',
        'delete users'                  => 'users.delete',
        'users.delete'                  => 'users.delete',
        'assign user roles'             => 'users.assign_roles',
        'view roles'                    => 'roles.view',
        'roles.view'                    => 'roles.view',
        'create roles'                  => 'roles.create',
        'roles.create'                  => 'roles.create',
        'edit roles'                    => 'roles.update',
        'roles.update'                  => 'roles.update',
        'delete roles'                  => 'roles.delete',
        'roles.delete'                  => 'roles.delete',
        'assign permissions'            => 'roles.assign_permissions',
        'view permissions'              => 'permissions.view',
        'permissions.view'              => 'permissions.view',
        'manage permissions'            => 'permissions.manage',
        'permissions.manage'            => 'permissions.manage',
        'create permissions'            => 'permissions.create',
        'permissions.create'            => 'permissions.create',
        'edit permissions'              => 'permissions.update',
        'permissions.edit'              => 'permissions.update',
        'permissions.update'            => 'permissions.update',
        'delete permissions'            => 'permissions.delete',
        'permissions.delete'            => 'permissions.delete',

        // --- Profile ---
        'view profile'                  => 'profile.view',
        'profile:view'                  => 'profile.view',
        'edit profile'                  => 'profile.update',
        'profile:edit'                  => 'profile.update',
        'profile:change_password'       => 'profile.change_password',

        // --- Settings & Audit ---
        'view settings'                 => 'settings.view',
        'settings.view'                 => 'settings.view',
        'edit settings'                 => 'settings.update',
        'settings.update'               => 'settings.update',
        'view audit logs'               => 'audit_logs.view',
        'audit_logs.view'               => 'audit_logs.view',
        'export audit logs'             => 'audit_logs.export',
        'manage audit logs'             => 'audit_logs.export',

        // --- Backup & Disaster Recovery ---
        'backup.view'                   => 'system.backups.view',
        'view backups'                  => 'system.backups.view',
        'backups.view'                  => 'system.backups.view',
        'backup.create'                 => 'system.backups.create',
        'create backups'                => 'system.backups.create',
        'backups.create'                => 'system.backups.create',
        'backup.restore'                => 'system.backups.restore',
        'restore backups'               => 'system.backups.restore',
        'backups.restore'               => 'system.backups.restore',
        'backup.download'               => 'system.backups.view',
        'backup.delete'                 => 'system.backups.delete',
        'delete backups'                => 'system.backups.delete',
        'backups.delete'                => 'system.backups.delete',
        'backup.settings'               => 'system.backups.settings',
        'manage backup settings'        => 'system.backups.settings',
        // --- Companies & Branches ---
        'view companies'                => 'companies.view',
        'create companies'              => 'companies.create',
        'edit companies'                => 'companies.update',
        'delete companies'              => 'companies.delete',
        'view branches'                 => 'branches.view',
        'create branches'               => 'branches.create',
        'edit branches'                 => 'branches.update',
        'delete branches'               => 'branches.delete',

        // --- Products ---
        'view products'                 => 'products.view',
        'create products'               => 'products.create',
        'edit products'                 => 'products.update',
        'delete products'               => 'products.delete',
        'view purchase price'           => 'products.purchase_price.view',
        'products.purchase_price.view'  => 'products.purchase_price.view',
        'products.view_purchase_price'  => 'products.purchase_price.view',
        'products.purchase_price:view'  => 'products.purchase_price.view',
        'purchase_price.view'           => 'products.purchase_price.view',
        'view product purchase price'   => 'products.purchase_price.view',
        'products.view_cost'            => 'products.purchase_price.view',
        'edit purchase price'           => 'products.purchase_price.edit',
        'products.purchase_price.edit'  => 'products.purchase_price.edit',
        'products.edit_purchase_price'  => 'products.purchase_price.edit',
        'products.purchase_price:edit'  => 'products.purchase_price.edit',
        'purchase_price.edit'           => 'products.purchase_price.edit',

        // --- Customers ---
        'view customers'                => 'customers.view',
        'create customers'              => 'customers.create',
        'edit customers'                => 'customers.update',
        'delete customers'              => 'customers.delete',
        'export customers'              => 'customers.export',
        'import customers'              => 'customers.import',
        'view customer ledger'          => 'customers.ledger.view',

        // --- Suppliers & Purchases ---
        'view suppliers'                => 'suppliers.view',
        'suppliers:view'                => 'suppliers.view',
        'create suppliers'              => 'suppliers.create',
        'suppliers:create'              => 'suppliers.create',
        'edit suppliers'                => 'suppliers.update',
        'suppliers:edit'                => 'suppliers.update',
        'delete suppliers'              => 'suppliers.delete',
        'suppliers:delete'              => 'suppliers.delete',
        'export suppliers'              => 'suppliers.export',
        'suppliers:export'              => 'suppliers.export',
        'view purchase invoices'        => 'purchases.view',
        'view purchases'                => 'purchases.view',
        'create purchase invoices'      => 'purchases.create',
        'edit purchase invoices'        => 'purchases.update',
        'delete purchase invoices'      => 'purchases.delete',

        // --- Quotations & CRM ---
        'view sales quotations'         => 'quotations.view',
        'convert sales quotations'      => 'quotations.convert',
        'convert quotations'            => 'quotations.convert',
        'convert leads'                 => 'leads.convert',
        'create sales quotations'       => 'quotations.create',
        'edit sales quotations'         => 'quotations.update',
        'delete sales quotations'       => 'quotations.delete',
        'view quotations'               => 'quotations.view',
        'create quotations'             => 'quotations.create',
        'edit quotations'               => 'quotations.update',
        'delete quotations'             => 'quotations.delete',
        'view leads'                    => 'leads.view',
        'create leads'                  => 'leads.create',
        'edit leads'                    => 'leads.update',
        'delete leads'                  => 'leads.delete',
        'view contacts'                 => 'contacts.view',
        'create contacts'               => 'contacts.create',
        'edit contacts'                 => 'contacts.update',
        'delete contacts'               => 'contacts.delete',
        'view opportunities'            => 'opportunities.view',
        'view campaigns'                => 'campaigns.view',

        // --- Invoices & POS ---
        'view invoices'                 => 'invoices.view',
        'invoices.view'                 => 'invoices.view',
        'create invoices'               => 'invoices.create',
        'invoices.create'               => 'invoices.create',
        'edit invoices'                 => 'invoices.update',
        'invoices.update'               => 'invoices.update',
        'delete invoices'               => 'invoices.delete',
        'invoices.delete'               => 'invoices.delete',
        'export invoices'               => 'invoices.export',
        'invoices.export'               => 'invoices.export',
        'print invoices'                => 'invoices.print',
        'invoices.print'                => 'invoices.print',
        'view pos'                      => 'pos.view',
        'pos.view'                      => 'pos.view',
        'pos.create_sale'               => 'pos.create_sale',

        // --- Income & Expenses ---
        'income_expenses.view'          => 'income_expenses.view',
        'view income and expenses'      => 'income_expenses.view',
        'income_expenses.create'        => 'income_expenses.create',
        'income_expenses.edit'          => 'income_expenses.edit',
        'income_expenses.delete'        => 'income_expenses.delete',
        'income_expenses.export'        => 'income_expenses.export',

        // --- Payroll ---
        'view payroll'                  => 'payroll.view',
        'payroll:view'                  => 'payroll.view',
        'create payroll'                => 'payroll.create',
        'payroll:create'                => 'payroll.create',
        'approve payroll'               => 'payroll.approve',
        'payroll:approve'               => 'payroll.approve',
        'run payroll'                   => 'payroll.create',
        'export payroll'                => 'payroll.export',
        'payroll:download'              => 'payroll.export',

        // --- Attendance & Employees ---
        'view attendance'               => 'attendance.view',
        'create attendance'             => 'attendance.create',
        'edit attendance'               => 'attendance.update',
        'delete attendance'             => 'attendance.delete',
        'view employees'                => 'employees.view',
        'create employees'              => 'employees.create',
        'edit employees'                => 'employees.update',
        'delete employees'              => 'employees.delete',
        'export employees'              => 'employees.export',

        // --- AI & Marketing ---
        'view ai assistant insights'    => 'ai.assistant.view',
        'chat with ai'                  => 'ai.assistant.view',
        'chat with ai assistant'        => 'ai.assistant.view',
        'chat with ai agent'            => 'ai.assistant.view',

        // --- Banking & Reconciliation Aliases ---
        'view bank accounts'            => 'banking.accounts.view',
        'manage bank accounts'          => 'banking.accounts.manage',
        'view bank statements'          => 'banking.reconciliation.view',
        'upload bank statements'        => 'banking.statements.upload',
        'reconcile bank accounts'       => 'banking.reconciliation.manage',
        'manage cash closings'          => 'banking.cash_closing.manage',
        'approve cash closings'         => 'banking.cash_closing.approve',
        'view reconciliation rules'     => 'banking.rules.view',
        'manage reconciliation rules'   => 'banking.rules.manage',

        // --- Cash Drawer Aliases ---
        'view cash drawers'             => 'finance.cash_drawer.view',
        'create cash drawers'           => 'finance.cash_drawer.create',
        'open cash drawer'              => 'finance.cash_drawer.open',
        'close cash drawer'             => 'finance.cash_drawer.close',
        'cash in'                       => 'finance.cash_drawer.cash_in',
        'cash out'                      => 'finance.cash_drawer.cash_out',
        'transfer cash'                 => 'finance.cash_drawer.transfer',
        'adjust cash drawer'            => 'finance.cash_drawer.adjust',
        'approve cash discrepancies'    => 'finance.cash_drawer.approve',
        'view cash drawer reports'      => 'finance.cash_drawer.report',
        'manage cash drawers'           => 'finance.cash_drawer.manage',
    ];

    /**
     * Resolves any permission key (legacy alias or canonical key) into its canonical representation.
     */
    public static function canonicalKey(string $permission): string
    {
        $normalized = trim(strtolower($permission));
        if (isset(self::CATALOG[$normalized])) {
            return $normalized;
        }

        return self::$aliasMap[$normalized] ?? $normalized;
    }

    /**
     * Checks if a key is a valid registered canonical key.
     */
    public static function isCanonical(string $permission): bool
    {
        return isset(self::CATALOG[trim(strtolower($permission))]);
    }

    /**
     * Returns all known aliases for a given canonical key (including the canonical key itself).
     *
     * @return array<int, string>
     */
    public static function aliasesFor(string $canonicalKey): array
    {
        $canonical = self::canonicalKey($canonicalKey);
        $aliases = [$canonical];

        foreach (self::$aliasMap as $alias => $target) {
            if ($target === $canonical && !in_array($alias, $aliases, true)) {
                $aliases[] = $alias;
            }
        }

        return $aliases;
    }

    /**
     * Expands a list of permissions with all their valid aliases.
     *
     * @param array<int, string> $permissions
     * @return array<int, string>
     */
    public static function expandWithAliases(array $permissions): array
    {
        $expanded = [];
        foreach ($permissions as $p) {
            foreach (self::aliasesFor($p) as $alias) {
                $expanded[$alias] = true;
            }
        }

        return array_keys($expanded);
    }

    /**
     * Returns the full catalog grouped by module.
     *
     * @return array<string, array<int, array{key: string, label: string, description: string}>>
     */
    public static function getGroupedCatalog(): array
    {
        $grouped = [];
        foreach (self::CATALOG as $key => $meta) {
            $group = $meta['group'];
            if (!isset($grouped[$group])) {
                $grouped[$group] = [];
            }
            $grouped[$group][] = [
                'key'         => $key,
                'label'       => $meta['label'],
                'description' => $meta['description'],
            ];
        }

        return $grouped;
    }
}
