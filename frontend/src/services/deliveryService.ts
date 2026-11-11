import api from '../api';

export interface DeliveryArea {
  id: number;
  company_id?: number;
  branch_id?: number;
  name: string;
  district: string;
  state: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  description?: string;
  is_active: boolean;
}

export interface DeliveryDriver {
  id: number;
  company_id: number;
  branch_id?: number;
  employee_id?: number;
  name: string;
  contact_number: string;
  alternate_contact?: string;
  license_number?: string;
  license_validity?: string;
  address?: string;
  status: 'available' | 'assigned' | 'on_trip' | 'on_leave' | 'inactive';
  notes?: string;
  is_active: boolean;
  assigned_vehicle_id?: number;
  is_vehicle_owner?: boolean;
  employee?: {
    id: number;
    name: string;
    phone?: string;
    email?: string;
  };
  vehicles?: DeliveryVehicle[];
}

export interface DeliveryVehicle {
  id: number;
  company_id: number;
  branch_id?: number;
  vehicle_code: string;
  registration_number: string;
  name: string;
  type: 'toto' | 'four_wheeler' | 'carrier' | 'other';
  category?: string;
  max_capacity: number;
  capacity_unit: 'kg' | 'pieces' | 'cubic_feet' | 'cubic_meters';
  default_driver_id?: number;
  backup_driver_id?: number;
  ownership_type: 'owned' | 'leased' | 'rented';
  is_driver_owner?: boolean;
  status: 'available' | 'assigned' | 'on_trip' | 'under_maintenance' | 'inactive';
  maintenance_status: 'good' | 'due_soon' | 'under_service';
  notes?: string;
  is_active: boolean;
  default_driver?: DeliveryDriver;
}

export interface DeliveryOrderItem {
  id: number;
  delivery_order_id: number;
  invoice_item_id: number;
  product_id: number;
  product_name: string;
  unit: string;
  requested_quantity: number;
  loaded_quantity: number;
  delivered_quantity: number;
  pending_quantity: number;
  source_warehouse_id?: number;
  unit_weight_kg?: number;
  unit_volume_cft?: number;
  product?: {
    id: number;
    name: string;
    sku: string;
    unit?: string;
  };
}

export interface DeliveryOrder {
  id: number;
  company_id: number;
  branch_id: number;
  invoice_id: number;
  customer_id: number;
  delivery_order_no: string;
  delivery_area_id?: number;
  delivery_type: 'local' | 'nearby_town' | 'district' | 'special' | 'customer_pickup' | 'other';
  priority: 'normal' | 'high' | 'urgent';
  expected_delivery_date: string;
  expected_delivery_time?: string;
  recipient_name: string;
  recipient_phone: string;
  delivery_address: string;
  district: string;
  town: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
  delivery_instructions?: string;
  delivery_charge: number;
  total_items_count: number;
  total_quantity: number;
  status:
    | 'delivery_pending'
    | 'scheduled'
    | 'vehicle_assigned'
    | 'loading_pending'
    | 'loading_in_progress'
    | 'ready_for_dispatch'
    | 'dispatched'
    | 'partially_delivered'
    | 'delivered'
    | 'delivery_failed'
    | 'rescheduled'
    | 'cancelled';
  current_trip_id?: number;
  delivery_completed_at?: string;
  customer?: {
    id: number;
    name: string;
    phone?: string;
    email?: string;
  };
  invoice?: {
    id: number;
    invoice_no: string;
    total_amount: number;
    status: string;
    due_date?: string;
  };
  area?: DeliveryArea;
  items?: DeliveryOrderItem[];
  current_trip?: {
    id: number;
    trip_code: string;
    status: string;
    vehicle?: {
      id: number;
      name: string;
      registration_number: string;
      type: string;
    };
    driver?: {
      id: number;
      name: string;
      contact_number: string;
    };
  };
}

export interface DeliveryTripStop {
  id: number;
  delivery_trip_id: number;
  delivery_order_id: number;
  invoice_id: number;
  stop_sequence: number;
  customer_name: string;
  delivery_area?: string;
  delivery_address: string;
  latitude?: number;
  longitude?: number;
  status: 'scheduled' | 'in_transit' | 'arrived' | 'delivered' | 'partially_delivered' | 'failed' | 'rescheduled';
  estimated_arrival?: string;
  actual_arrival?: string;
  notes?: string;
  order?: DeliveryOrder;
  invoice?: {
    id: number;
    invoice_no: string;
    total_amount: number;
  };
}

export interface DeliveryLoadingItem {
  id: number;
  delivery_trip_id: number;
  delivery_order_id: number;
  delivery_order_item_id: number;
  product_id: number;
  warehouse_id: number;
  planned_quantity: number;
  picked_quantity: number;
  is_loaded: boolean;
  loaded_at?: string;
  notes?: string;
  warehouse?: {
    id: number;
    name: string;
    code?: string;
  };
  product?: {
    id: number;
    name: string;
    sku: string;
  };
}

export interface DeliveryCostAllocation {
  id: number;
  delivery_trip_id: number;
  delivery_order_id: number;
  invoice_id: number;
  allocation_method: string;
  allocation_basis_value: number;
  allocation_percentage: number;
  calculated_amount: number;
  adjustment_amount: number;
  final_allocated_amount: number;
  adjustment_reason?: string;
  is_approved: boolean;
  order?: DeliveryOrder;
  invoice?: {
    id: number;
    invoice_no: string;
  };
}

export interface DeliveryTrip {
  id: number;
  company_id: number;
  branch_id: number;
  trip_code: string;
  vehicle_id?: number;
  driver_id?: number;
  source_warehouse_id?: number;
  planned_date: string;
  planned_departure?: string;
  expected_return?: string;
  actual_departure?: string;
  actual_return?: string;
  status:
    | 'draft'
    | 'planned'
    | 'vehicle_assigned'
    | 'loading_pending'
    | 'loading_in_progress'
    | 'ready_for_dispatch'
    | 'dispatched'
    | 'in_transit'
    | 'partially_completed'
    | 'completed'
    | 'cancelled'
    | 'closed';
  total_customers: number;
  total_items_count: number;
  total_quantity: number;
  total_weight_kg: number;
  total_volume_cft: number;
  capacity_override: boolean;
  capacity_override_reason?: string;
  transport_cost: number;
  cost_allocation_status: 'draft' | 'allocated' | 'approved';
  cost_allocation_method?: string;
  odometer_start?: number;
  odometer_end?: number;
  notes?: string;
  vehicle?: DeliveryVehicle;
  driver?: DeliveryDriver;
  source_warehouse?: {
    id: number;
    name: string;
    code?: string;
  };
  company?: {
    id: number;
    name: string;
    code?: string;
    address?: string;
    phone?: string;
    email?: string;
    gst_number?: string;
    pan_number?: string;
  };
  branch?: {
    id: number;
    name: string;
    code?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  stops?: DeliveryTripStop[];
  loading_items?: DeliveryLoadingItem[];
  cost_allocations?: DeliveryCostAllocation[];
}

export interface DeliveryDashboardData {
  metrics: {
    scheduled_today: number;
    pending_deliveries: number;
    overdue_deliveries: number;
    active_trips: number;
    dispatched_trips: number;
    completed_today: number;
    failed_deliveries: number;
    partial_deliveries: number;
    total_vehicles: number;
    available_vehicles: number;
    on_trip_vehicles: number;
    under_maintenance_vehicles: number;
    total_transport_expenditure: number;
    total_allocated_cost: number;
  };
  recent_trips: DeliveryTrip[];
  area_breakdown: Array<{
    town: string;
    district: string;
    count: number;
    total_qty: number;
  }>;
}

export const deliveryService = {
  // Dashboard
  getDashboard(params?: any) {
    return api.get<{ status: string; data: DeliveryDashboardData }>('/deliveries/dashboard', { params });
  },

  // Orders
  getOrders(params?: any) {
    return api.get<{ status: string; data: { data: DeliveryOrder[]; total: number; current_page: number; per_page: number } }>(
      '/deliveries/orders',
      { params }
    );
  },

  createOrder(data: any) {
    return api.post<{ status: string; message: string; data: DeliveryOrder }>('/deliveries/orders', data);
  },

  getOrder(id: number) {
    return api.get<{ status: string; data: DeliveryOrder }>(`/deliveries/orders/${id}`);
  },

  updateOrder(id: number, data: any) {
    return api.put<{ status: string; message: string; data: DeliveryOrder }>(`/deliveries/orders/${id}`, data);
  },

  scheduleOrder(id: number, data: { expected_delivery_date: string; expected_delivery_time?: string; priority?: string; remarks?: string }) {
    return api.post<{ status: string; message: string; data: DeliveryOrder }>(`/deliveries/orders/${id}/schedule`, data);
  },

  cancelOrder(id: number, reason: string) {
    return api.post<{ status: string; message: string; data: DeliveryOrder }>(`/deliveries/orders/${id}/cancel`, { reason });
  },

  confirmOrder(id: number, data: any) {
    return api.post<{ status: string; message: string; data: any }>(`/deliveries/orders/${id}/confirm`, data);
  },

  // Vehicles
  getVehicles(params?: any) {
    return api.get<{ status: string; data: DeliveryVehicle[] }>('/deliveries/vehicles', { params });
  },

  createVehicle(data: Partial<DeliveryVehicle>) {
    return api.post<{ status: string; message: string; data: DeliveryVehicle }>('/deliveries/vehicles', data);
  },

  updateVehicle(id: number, data: Partial<DeliveryVehicle>) {
    return api.put<{ status: string; message: string; data: DeliveryVehicle }>(`/deliveries/vehicles/${id}`, data);
  },

  // Drivers
  getDrivers(params?: any) {
    return api.get<{ status: string; data: DeliveryDriver[] }>('/deliveries/drivers', { params });
  },

  createDriver(data: Partial<DeliveryDriver>) {
    return api.post<{ status: string; message: string; data: DeliveryDriver }>('/deliveries/drivers', data);
  },

  updateDriver(id: number, data: Partial<DeliveryDriver>) {
    return api.put<{ status: string; message: string; data: DeliveryDriver }>(`/deliveries/drivers/${id}`, data);
  },

  // Trips
  getTrips(params?: any) {
    return api.get<{ status: string; data: { data: DeliveryTrip[]; total: number; current_page: number; per_page: number } }>(
      '/deliveries/trips',
      { params }
    );
  },

  createTrip(data: {
    delivery_order_ids: number[];
    vehicle_id?: number;
    driver_id?: number;
    source_warehouse_id?: number;
    planned_date: string;
    planned_departure?: string;
    expected_return?: string;
    capacity_override?: boolean;
    capacity_override_reason?: string;
    transport_cost?: number;
    notes?: string;
  }) {
    return api.post<{ status: string; message: string; data: DeliveryTrip }>('/deliveries/trips', data);
  },

  getTrip(id: number) {
    return api.get<{ status: string; data: DeliveryTrip }>(`/deliveries/trips/${id}`);
  },

  reorderTripStops(tripId: number, stopIds: number[]) {
    return api.post<{ status: string; message: string; data: DeliveryTrip }>(`/deliveries/trips/${tripId}/reorder`, { stop_ids: stopIds });
  },

  updateLoadingItem(itemId: number, pickedQty: number) {
    return api.put<{ status: string; message: string; data: DeliveryLoadingItem }>(`/deliveries/loading-items/${itemId}`, {
      picked_quantity: pickedQty,
    });
  },

  confirmLoading(tripId: number) {
    return api.post<{ status: string; message: string; data: DeliveryTrip }>(`/deliveries/trips/${tripId}/confirm-loading`);
  },

  dispatchTrip(tripId: number, data?: { actual_departure?: string; odometer_start?: number; remarks?: string }) {
    return api.post<{ status: string; message: string; data: DeliveryTrip }>(`/deliveries/trips/${tripId}/dispatch`, data || {});
  },

  closeTrip(tripId: number, data?: { actual_return?: string; odometer_end?: number; force_close?: boolean; remarks?: string }) {
    return api.post<{ status: string; message: string; data: DeliveryTrip }>(`/deliveries/trips/${tripId}/close`, data || {});
  },

  // Transportation Cost
  allocateCost(tripId: number, data: { transport_cost: number; method: string; custom_data?: Record<number, number> }) {
    return api.post<{ status: string; message: string; data: DeliveryCostAllocation[] }>(`/deliveries/trips/${tripId}/allocate-cost`, data);
  },

  adjustCostAllocation(allocationId: number, data: { new_amount: number; reason: string }) {
    return api.put<{ status: string; message: string; data: DeliveryCostAllocation }>(`/deliveries/cost-allocations/${allocationId}`, data);
  },

  approveCost(tripId: number) {
    return api.post<{ status: string; message: string }>(`/deliveries/trips/${tripId}/approve-cost`);
  },

  // Calendar & Areas
  getCalendar(params?: { start?: string; end?: string }) {
    return api.get<{ status: string; data: { orders: DeliveryOrder[]; trips: DeliveryTrip[] } }>('/deliveries/calendar', { params });
  },

  getAreas() {
    return api.get<{ status: string; data: DeliveryArea[] }>('/deliveries/areas');
  },

  createArea(data: Partial<DeliveryArea>) {
    return api.post<{ status: string; message: string; data: DeliveryArea }>('/deliveries/areas', data);
  },

  // Reports
  getReports(params: { type: string; date?: string; start_date?: string; end_date?: string }) {
    return api.get<{ status: string; report_type: string; data: any[] }>('/deliveries/reports', { params });
  },

  getExportUrl(type: string): string {
    return `/api/deliveries/reports/export?type=${type}`;
  },
};

export default deliveryService;
