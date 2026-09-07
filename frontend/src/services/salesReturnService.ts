// src/services/salesReturnService.ts

export interface SalesReturn {
  id: number;
  return_number: string;
  company_id?: number;
  branch_id?: number;
  warehouse_id: number;
  customer_id: number;
  original_sale_id?: number;
  original_invoice_no?: string;
  return_date: string;
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_tax: number;
  grand_total: number;
  refund_amount: number;
  credit_amount: number;
  refund_status: string;
  reason: string;
  remark?: string;
  status: string;
  customer?: { id: number; name: string };
  warehouse?: { id: number; name: string };
  items?: SalesReturnItem[];
  order_id?: number; // added for form handling
}

export interface SalesReturnItem {
  id?: number;
  sales_return_id?: number;
  sale_item_id?: number;
  product_id: number;
  variant_id?: number;
  product?: { id: number; name: string; sku?: string; hsn_code?: string };
  sold_qty: number;
  already_returned_qty: number;
  return_qty: number;
  rate: number;
  discount_amount: number;
  taxable_amount: number;
  gst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
  condition: string;
  restock_status: string;
  reason?: string;
  // Optional fields used in form mapping
  quantity?: number;
  unit_price?: number;
}

export const salesReturnService = {
  async create(payload: any): Promise<any> {
    // Replace with actual API call
    console.log('create sales return', payload);
    return { data: { id: Date.now(), ...payload } };
  },
  async update(id: number, payload: any): Promise<any> {
    console.log('update sales return', id, payload);
    return { data: { id, ...payload } };
  },
  async getById(id: number): Promise<any> {
    console.log('get sales return', id);
    return { data: { id } };
  },
  async getAll(params?: any): Promise<any> {
    console.log('get all sales returns', params);
    return { data: { data: [] } };
  },
  async delete(id: number): Promise<any> {
    console.log('delete sales return', id);
    return { data: { success: true } };
  },
};