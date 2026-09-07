// src/types.ts

export interface Invoice {
  id?: number;
  invoice_no?: string;
  created_at?: string | Date;
  total_amount?: number | string;
  tax_amount?: number | string;
  discount_amount?: number | string;
  payments?: Payment[];
  items: InvoiceItem[];
  company?: Company;
  branch?: Branch;
  customer?: Customer;
  billing_street?: string;
  billing_city?: string;
  billing_state?: string;
  billing_country?: string;
  billing_pincode?: string;
  shipping_street?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_country?: string;
  shipping_pincode?: string;
  gstin?: string;
  pan?: string;
  due_date?: string;
  status?: string;
  [key: string]: any;
}

export interface Payment {
  id?: number;
  amount: number;
  [key: string]: any;
}

export interface InvoiceItem {
  id?: number;
  product_id?: number;
  product?: Product;
  quantity: number;
  unit_price: number;
  total: number;
  [key: string]: any;
}

export interface Company {
  id?: number;
  name?: string;
  address?: string;
  phone?: string;
  gstin?: string;
  [key: string]: any;
}

export interface Branch {
  id?: number;
  name?: string;
  address?: string;
  phone?: string;
  [key: string]: any;
}

export interface Customer {
  id?: number;
  name?: string;
  billing_street?: string;
  billing_city?: string;
  billing_state?: string;
  billing_country?: string;
  billing_pincode?: string;
  shipping_street?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_country?: string;
  shipping_pincode?: string;
  phone?: string;
  email?: string;
  contact_no?: string;
  gstin?: string;
  pan?: string;
  [key: string]: any;
}

export interface Product {
  id?: number;
  name?: string;
  [key: string]: any;
}