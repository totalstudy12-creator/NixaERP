import { useEffect, useState } from 'react';
import { ModernDataTable } from '../components/ModernDataTable';
import { Offcanvas } from '../components/Offcanvas';
import { apiClient } from '../api';
import { FiPlus } from 'react-icons/fi';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

export function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: '', sku: '', sale_price: '', stock_quantity: '' });
  const [submitting, setSubmitting] = useState(false);
  const { showSuccess, showError } = useNotification();

  const loadProducts = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getProducts();
      setProducts(Array.isArray(response) ? response : response.data || []);
    } catch (error: any) {
      console.error('Error loading products:', error);
      showError('Load failed', error.message || 'Unable to load products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const handleCreate = () => {
    setEditingId(null);
    setFormData({ name: '', sku: '', sale_price: '', stock_quantity: '' });
    setIsModalOpen(true);
  };

  const handleEdit = (product: any) => {
    setEditingId(product.id);
    setFormData(product);
    setIsModalOpen(true);
  };

  const handleDelete = async (product: any) => {
    if (!confirm(`Delete product "${product.name}"?`)) {
      return;
    }
    try {
      await apiClient.deleteProduct(product.id);
      showSuccess('Product deleted', `${product.name} has been removed.`);
      addAppLog({ module: 'Products', action: 'Delete product', status: 'success', message: `Deleted product ${product.name}` });
      loadProducts();
    } catch (error: any) {
      console.error('Error deleting product:', error);
      showError('Delete failed', error.message || 'Unable to delete product.');
      addAppLog({ module: 'Products', action: 'Delete product', status: 'error', message: error.message || 'Delete product failed' });
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (editingId) {
        await apiClient.updateProduct(editingId, formData);
        showSuccess('Product updated', `${formData.name} has been updated.`);
        addAppLog({ module: 'Products', action: 'Update product', status: 'success', message: `Updated product ${formData.name}` });
      } else {
        await apiClient.createProduct(formData);
        showSuccess('Product created', `${formData.name} has been added.`);
        addAppLog({ module: 'Products', action: 'Create product', status: 'success', message: `Created product ${formData.name}` });
      }
      setIsModalOpen(false);
      loadProducts();
    } catch (error: any) {
      console.error('Error saving product:', error);
      showError('Save failed', error.message || 'Unable to save product.');
      addAppLog({ module: 'Products', action: 'Save product', status: 'error', message: error.message || 'Save product failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { name: 'Product', selector: (row: any) => row.name, sortable: true },
    { name: 'SKU', selector: (row: any) => row.sku },
    { name: 'Unit Price', selector: (row: any) => `₹${row.sale_price}` },
    { name: 'Stock', selector: (row: any) => row.stock_quantity },
  ];

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-600">Manage product catalog and inventory</p>
        </div>
        <button onClick={handleCreate} className="btn btn-primary gap-2">
          <FiPlus /> Create Product
        </button>
      </div>

      <ModernDataTable
        title="Products"
        columns={columns}
        data={products}
        loading={loading}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <Offcanvas
        isOpen={isModalOpen}
        title={editingId ? 'Edit Product' : 'Create Product'}
        onClose={() => setIsModalOpen(false)}
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button onClick={() => setIsModalOpen(false)} className="btn btn-secondary w-full sm:w-auto">Cancel</button>
            <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary w-full sm:w-auto">
              {submitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
            <input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input-field w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
            <input value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} className="input-field w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price</label>
            <input type="number" step="0.01" value={formData.sale_price} onChange={(e) => setFormData({ ...formData, sale_price: e.target.value })} className="input-field w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stock Quantity</label>
            <input type="number" value={formData.stock_quantity} onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })} className="input-field w-full" />
          </div>
        </div>
      </Offcanvas>
    </div>
  );
}
