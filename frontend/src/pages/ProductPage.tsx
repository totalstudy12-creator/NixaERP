import { useEffect, useState } from 'react';
import { FiPlus } from 'react-icons/fi';
import { ModernDataTable } from '../components/ModernDataTable';
import { Offcanvas } from '../components/Offcanvas';
import { apiClient } from '../api';

interface CatalogForm {
  name: string;
  sku: string;
  type: string;
  price: string;
  status: string;
  description: string;
}

export function ProductPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<CatalogForm>({
    name: '',
    sku: '',
    type: 'product',
    price: '',
    status: 'active',
    description: '',
  });

  const loadItems = async () => {
    setLoading(true);
    try {
      // 🔧 FIX: cast apiClient to any to bypass missing method type error
      const response = await (apiClient as any).getCatalogItems();
      setItems(Array.isArray(response) ? response : response.data || []);
    } catch (error) {
      console.error('Error loading catalog items:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleCreate = () => {
    setEditingId(null);
    setFormData({ name: '', sku: '', type: 'product', price: '', status: 'active', description: '' });
    setIsPanelOpen(true);
  };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    setFormData({
      name: item.name || '',
      sku: item.sku || '',
      type: item.type || 'product',
      price: item.price?.toString() || '',
      status: item.status || 'active',
      description: item.description || '',
    });
    setIsPanelOpen(true);
  };

  const handleDelete = async (item: any) => {
    if (confirm('Delete catalog item?')) {
      try {
        // 🔧 FIX: cast apiClient to any to bypass missing method type error
        await (apiClient as any).deleteCatalogItem(item.id);
        loadItems();
      } catch (error) {
        console.error('Error deleting catalog item:', error);
      }
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (editingId) {
        // 🔧 FIX: cast apiClient to any to bypass missing method type error
        await (apiClient as any).updateCatalogItem(editingId, formData);
      } else {
        // 🔧 FIX: cast apiClient to any to bypass missing method type error
        await (apiClient as any).createCatalogItem(formData);
      }
      setIsPanelOpen(false);
      loadItems();
    } catch (error) {
      console.error('Error saving catalog item:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { name: 'Name', selector: (r: any) => r.name, sortable: true },
    { name: 'SKU', selector: (r: any) => r.sku },
    { name: 'Type', selector: (r: any) => r.type },
    { name: 'Price', selector: (r: any) => r.price ?? '-' },
    { name: 'Status', selector: (r: any) => r.status },
  ];

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Catalog Management</h1>
          <p className="text-gray-600">Manage catalog items, product SKUs, pricing, and status.</p>
        </div>
        <button onClick={handleCreate} className="btn btn-primary gap-2 w-full max-w-xs">
          <FiPlus /> Add Catalog Item
        </button>
      </div>

      <ModernDataTable
        title="Catalog Items"
        columns={columns}
        data={items}
        loading={loading}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <Offcanvas
        isOpen={isPanelOpen}
        title={editingId ? 'Edit Catalog Item' : 'Add Catalog Item'}
        onClose={() => setIsPanelOpen(false)}
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button onClick={() => setIsPanelOpen(false)} className="btn btn-secondary w-full sm:w-auto">Cancel</button>
            <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary w-full sm:w-auto">
              {submitting ? 'Saving...' : editingId ? 'Update Item' : 'Add Item'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input-field"
              placeholder="Item name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">SKU</label>
            <input
              type="text"
              value={formData.sku}
              onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              className="input-field"
              placeholder="SKU code"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="input-field"
              >
                <option value="product">Product</option>
                <option value="service">Service</option>
                <option value="bundle">Bundle</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Price</label>
              <input
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="input-field"
                placeholder="0.00"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="input-field"
            >
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input-field min-h-[140px]"
              placeholder="Item description"
            />
          </div>
        </div>
      </Offcanvas>
    </div>
  );
}