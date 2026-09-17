'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token') || localStorage.getItem('authToken');
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'Request failed.');
  }

  return data as T;
}

type Analytics = {
  sales: number;
  ordersCount: number;
  usersCount: number;
  productsCount: number;
};

type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  currency: string;
  inventory: number;
  published: boolean;
  featured: boolean;
  category: { name: string };
  images: { url: string }[];
  createdAt: string;
};

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  orderCount: number;
  lastOrderAt: string | null;
};

type AdminOrder = {
  id: string;
  status: string;
  totalAmount: number;
  paymentIntentId: string | null;
  createdAt: string;
  updatedAt: string;
  shippingAddress: Record<string, unknown> | string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  items: Array<{
    id: string;
    quantity: number;
    price: number;
    product: {
      id: string;
      name: string;
      slug: string;
    };
  }>;
};

type ProductFormState = {
  name: string;
  slug: string;
  description: string;
  price: string;
  currency: string;
  categoryName: string;
  inventory: string;
  published: boolean;
  featured: boolean;
  imageUrls: string;
};

const initialFormState: ProductFormState = {
  name: '',
  slug: '',
  description: '',
  price: '0',
  currency: 'USD',
  categoryName: '',
  inventory: '0',
  published: true,
  featured: false,
  imageUrls: '',
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export default function AdminPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<AdminProduct | null>(null);
  const [form, setForm] = useState<ProductFormState>(initialFormState);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [imageBase64, setImageBase64] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [isCreated, setIsCreated] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);


  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showDialog) {
      timer = setTimeout(() => {
        setShowDialog(false);
      }, 3000);
    }
    return () => clearTimeout(timer);
  }, [showDialog]);

  const loadAdminData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [analyticsData, productData, userData, orderData] = await Promise.all([
        fetchJson<Analytics>('/api/admin/analytics', { headers: authHeaders() }),
        fetchJson<AdminProduct[]>('/api/admin/products', { headers: authHeaders() }),
        fetchJson<AdminUser[]>('/api/admin/users', { headers: authHeaders() }),
        fetchJson<AdminOrder[]>('/api/admin/orders', { headers: authHeaders() }),
      ]);
      setAnalytics(analyticsData);
      setProducts(productData);
      setUsers(userData);
      setOrders(orderData);
    } catch (err: any) {
      setError(err?.message || 'Unable to load admin dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!getToken()) return;
    loadAdminData();
  }, []);

  const resetForm = () => {
    setSelectedProduct(null);
    setForm(initialFormState);
    setImageFile(null);
    setImagePreview('');
    setImageBase64('');
    setMessage(null);
  };

  const selectProduct = (product: AdminProduct) => {
    setSelectedProduct(product);
    setForm({
      name: product.name,
      slug: product.slug,
      description: product.description,
      price: String(product.price),
      currency: product.currency,
      categoryName: product.category?.name || '',
      inventory: String(product.inventory),
      published: product.published,
      featured: product.featured,
      imageUrls: '',
    });
    setImageFile(null);
    setImageBase64('');
    setImagePreview(product.images[0]?.url || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFormChange = (field: keyof ProductFormState, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setImageFile(file);
    if (!file) {
      setImagePreview('');
      setImageBase64('');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        setImagePreview(result);
        setImageBase64(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProduct = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!getToken()) return;

    try {
      setSubmitting(true);
      setError(null);
      setMessage(null);

      const payload: any = {
        name: form.name,
        slug: form.slug,
        description: form.description,
        price: Number(form.price),
        currency: form.currency,
        inventory: Number(form.inventory),
        published: form.published,
        featured: form.featured,
        categoryName: form.categoryName,
      };

      if (imageBase64) {
        payload.imageFiles = [{ filename: imageFile?.name || 'product.png', data: imageBase64 }];
      } else if (!selectedProduct || form.imageUrls.trim()) {
        const urls = form.imageUrls
          .split(/\r?\n|,/)
          .map((url) => url.trim())
          .filter(Boolean);
        if (urls.length > 0) {
          payload.imageUrls = urls;
        }
      }

      if (selectedProduct) {
        await fetchJson<AdminProduct>(`/api/admin/products/${selectedProduct.id}`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify(payload),
        });
        setMessage('Product updated successfully.');
        setIsCreated(false);
        setShowDialog(true);
      } else {
        const createdProduct = await fetchJson<AdminProduct>('/api/admin/products', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(payload),
        });
        setMessage('Product created successfully!');
        setIsCreated(true);
        setShowDialog(true);
      }

      resetForm();
      loadAdminData();
    } catch (err: any) {
      setError(err?.message || 'Unable to save product.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!getToken()) return;
    if (!window.confirm('Delete this product? This action cannot be undone.')) return;

    try {
      setSubmitting(true);
      setError(null);
      await fetchJson('/api/admin/products/' + productId, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      setMessage('Product deleted successfully.');
      if (selectedProduct?.id === productId) resetForm();
      loadAdminData();
    } catch (err: any) {
      setError(err?.message || 'Unable to delete product.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, status: string) => {
    if (!getToken()) return;
    try {
      setUpdatingOrderId(orderId);
      setError(null);
      const updated = await fetchJson<AdminOrder>(`/api/admin/orders/${orderId}/status`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      });
      setOrders((prev) => prev.map((order) => (order.id === orderId ? updated : order)));
    } catch (err: any) {
      setError(err?.message || 'Unable to update order status.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  return (
    <main className="min-h-[calc(100vh-88px)] bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-8">
        {showDialog && message && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4 z-50">
            <div className="rounded-[2rem] border border-slate-700 bg-slate-900 p-8 shadow-2xl max-w-md text-center">
              <div className="mb-4 flex justify-center">
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-emerald-500/20 border border-emerald-500/30">
                  <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <h3 className="text-xl font-semibold text-slate-100">{isCreated ? 'Product Created!' : 'Product Updated!'}</h3>
              <p className="mt-3 text-slate-300">{message}</p>
              <button
                onClick={() => setShowDialog(false)}
                className="mt-6 inline-flex rounded-full bg-emerald-500 px-6 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
              >
                Close
              </button>
            </div>
          </div>
        )}
        <section className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-10 shadow-glow">
          <div className="flex flex-col gap-6 lg:items-center lg:justify-between lg:flex-row">
            <div>
              <h1 className="text-4xl font-semibold">Admin dashboard</h1>
              <p className="mt-3 max-w-2xl text-slate-400">Manage products, review site analytics, and track user activity from one place.</p>
            </div>
            <div className="rounded-3xl border border-slate-800 bg-slate-950/80 px-6 py-4 text-slate-300">
              <p className="text-sm uppercase tracking-[0.35em] text-slate-500">Status</p>
              <p className="mt-2 font-medium text-slate-100">{loading ? 'Refreshing...' : 'Live'}</p>
            </div>
          </div>
        </section>

        {(error || message) && (
          <div className="rounded-[2rem] border p-6 text-sm shadow-sm">
            {error ? (
              <p className="text-rose-300">{error}</p>
            ) : (
              <p className="text-emerald-300">{message}</p>
            )}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-4">
          {analytics ? (
            [
              { label: 'Revenue', value: `$${analytics.sales.toFixed(2)}` },
              { label: 'Orders', value: `${analytics.ordersCount}` },
              { label: 'Customers', value: `${analytics.usersCount}` },
              { label: 'Products', value: `${analytics.productsCount}` },
            ].map((card) => (
              <div key={card.label} className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
                <p className="text-sm uppercase tracking-[0.35em] text-slate-400">{card.label}</p>
                <p className="mt-4 text-3xl font-semibold">{card.value}</p>
              </div>
            ))
          ) : (
            <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 lg:col-span-4">
              <p className="text-slate-400">Loading analytics...</p>
            </div>
          )}
        </div>

        <section className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-8">
          <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Recent orders</h2>
              <p className="mt-2 text-slate-400">Track paid and pending orders from customers.</p>
            </div>
          </div>
          <div className="space-y-4">
            {orders.length === 0 ? (
              <p className="text-slate-400">No orders yet.</p>
            ) : (
              orders.map((order) => (
                <div key={order.id} className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-white">Order #{order.id.slice(0, 8)}</p>
                      <p className="text-sm text-slate-400">Customer: {order.user.name || order.user.email}</p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="text-sm uppercase tracking-[0.35em] text-slate-400">{order.status}</p>
                      <p className="mt-1 text-lg font-semibold text-white">${order.totalAmount.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
                    <p className="text-sm text-slate-400">Items</p>
                    <ul className="mt-3 space-y-2">
                      {order.items.map((item) => (
                        <li key={item.id} className="flex items-center justify-between text-sm text-slate-200">
                          <span>{item.product.name}</span>
                          <span className="text-slate-400">{item.quantity} × ${item.price.toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                   <div className="mt-4 flex flex-wrap items-center gap-3">
                      <label className="text-sm text-slate-400">
                        Status:
                        <select
                          value={order.status}
                          disabled={updatingOrderId === order.id}
                          onChange={(event) => handleUpdateOrderStatus(order.id, event.target.value)}
                          className="ml-2 rounded-full border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-100 outline-none focus:border-slate-500 disabled:opacity-60"
                        >
                          <option value="pending">Pending</option>
                          <option value="paid">Paid</option>
                          <option value="fulfilled">Fulfilled</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </label>
                      {order.status === 'paid' && (
                        <button
                          type="button"
                          disabled={updatingOrderId === order.id}
                          onClick={() => handleUpdateOrderStatus(order.id, 'fulfilled')}
                          className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60"
                        >
                          {updatingOrderId === order.id ? 'Approving…' : 'Approve order'}
                        </button>
                      )}
                  </div> 
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-8">
          <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Product management</h2>
              <p className="mt-2 text-slate-400">Create, update, and remove catalog items for your storefront.</p>
            </div>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-950/80 px-5 py-3 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-900"
            >
              {selectedProduct ? 'Create new product' : 'Reset form'}
            </button>
          </div>

          <form className="grid gap-6 lg:grid-cols-[1fr_320px]" onSubmit={handleSaveProduct}>
            <div className="space-y-6 rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Name</span>
                  <input
                    value={form.name}
                    onChange={(e) => handleFormChange('name', e.target.value)}
                    className="w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100 outline-none focus:border-slate-500"
                    required
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Slug</span>
                  <input
                    value={form.slug}
                    onChange={(e) => handleFormChange('slug', e.target.value)}
                    className="w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100 outline-none focus:border-slate-500"
                    required
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Category</span>
                  <input
                    value={form.categoryName}
                    onChange={(e) => handleFormChange('categoryName', e.target.value)}
                    className="w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100 outline-none focus:border-slate-500"
                    placeholder="Example: Apparel"
                    required
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Price</span>
                  <input
                    type="number"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => handleFormChange('price', e.target.value)}
                    className="w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100 outline-none focus:border-slate-500"
                    required
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Inventory</span>
                  <input
                    type="number"
                    value={form.inventory}
                    onChange={(e) => handleFormChange('inventory', e.target.value)}
                    className="w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100 outline-none focus:border-slate-500"
                    required
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Currency</span>
                  <input
                    value={form.currency}
                    onChange={(e) => handleFormChange('currency', e.target.value)}
                    className="w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100 outline-none focus:border-slate-500"
                    required
                  />
                </label>
              </div>

              <label className="space-y-2 text-sm text-slate-300">
                <span>Description</span>
                <textarea
                  value={form.description}
                  onChange={(e) => handleFormChange('description', e.target.value)}
                  rows={5}
                  className="w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100 outline-none focus:border-slate-500"
                  required
                />
              </label>

              <label className="space-y-2 text-sm text-slate-300">
                <span>Product image</span>
                <p className="text-xs text-slate-500">
                  {selectedProduct ? 'Upload a new image to replace the existing one' : 'Select an image for your product'}
                </p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100 outline-none file:rounded-full file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:text-sm file:text-slate-100"
                />
              </label>
              {imagePreview ? (
                <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
                  <p className="text-sm text-slate-400">Preview</p>
                  <img src={imagePreview} alt="Product preview" className="mt-3 h-48 w-full rounded-3xl object-cover" />
                </div>
              ) : null}

              <label className="space-y-2 text-sm text-slate-300">
                <span>Image URLs</span>
                <textarea
                  value={form.imageUrls}
                  onChange={(e) => handleFormChange('imageUrls', e.target.value)}
                  rows={4}
                  placeholder="Enter one URL per line"
                  className="w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100 outline-none focus:border-slate-500"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="inline-flex items-center gap-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.published}
                    onChange={(e) => handleFormChange('published', e.target.checked)}
                    className="h-5 w-5 rounded border-slate-700 bg-slate-900 text-slate-100"
                  />
                  Published
                </label>
                <label className="inline-flex items-center gap-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.featured}
                    onChange={(e) => handleFormChange('featured', e.target.checked)}
                    className="h-5 w-5 rounded border-slate-700 bg-slate-900 text-slate-100"
                  />
                  Featured
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center rounded-full bg-slate-100 px-6 py-3 text-slate-950 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {selectedProduct ? 'Update product' : 'Create product'}
              </button>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
              <h3 className="text-lg font-semibold text-slate-100">Product preview</h3>
              <p className="mt-3 text-slate-400">
                {selectedProduct ? 'Editing existing product' : 'Fill in product details and submit to add it to the catalog.'}
              </p>
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className="mt-6 h-48 w-full rounded-3xl object-cover" />
              ) : null}
              <dl className="mt-6 space-y-4 text-sm text-slate-300">
                <div>
                  <dt className="font-medium text-slate-100">Selected</dt>
                  <dd>{selectedProduct ? selectedProduct.name : 'None'}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-100">Category</dt>
                  <dd>{form.categoryName || 'Not set'}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-100">Status</dt>
                  <dd>{form.published ? 'Published' : 'Draft'}</dd>
                </div>
              </dl>
            </div>
          </form>
        </section>

        <section className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-8">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Product catalog</h2>
              <p className="mt-2 text-slate-400">Review and manage existing products.</p>
            </div>
            <p className="text-sm text-slate-500">{products.length} products listed</p>
          </div>

          <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-950/80">
            <table className="min-w-full border-collapse text-left text-sm text-slate-200">
              <thead className="border-b border-slate-800 bg-slate-900 text-slate-400">
                <tr>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Price</th>
                  <th className="px-6 py-4">Inventory</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b border-slate-800 hover:bg-slate-900/60">
                    <td className="px-6 py-4 font-medium text-slate-100">{product.name}</td>
                    <td className="px-6 py-4">{product.currency} {product.price.toFixed(2)}</td>
                    <td className="px-6 py-4">{product.inventory}</td>
                    <td className="px-6 py-4">{product.category?.name || 'Uncategorized'}</td>
                    <td className="px-6 py-4 text-slate-300">{product.published ? 'Published' : 'Draft'}</td>
                    <td className="px-6 py-4 space-x-2">
                      <button
                        type="button"
                        onClick={() => selectProduct(product)}
                        className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-xs text-slate-100 transition hover:border-slate-500"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProduct(product.id)}
                        className="rounded-full border border-rose-600 bg-rose-950/10 px-4 py-2 text-xs text-rose-200 transition hover:bg-rose-950"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-8">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold">User activity</h2>
            <p className="mt-2 text-slate-400">Track user signups and order activity for your site.</p>
          </div>

          <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-950/80">
            <table className="min-w-full border-collapse text-left text-sm text-slate-200">
              <thead className="border-b border-slate-800 bg-slate-900 text-slate-400">
                <tr>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Joined</th>
                  <th className="px-6 py-4">Orders</th>
                  <th className="px-6 py-4">Last order</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-slate-800 hover:bg-slate-900/60">
                    <td className="px-6 py-4 font-medium text-slate-100">
                      <div>{user.name || user.email}</div>
                      <div className="text-xs text-slate-500">{user.email}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-300">{user.role}</td>
                    <td className="px-6 py-4 text-slate-300">{formatDate(user.createdAt)}</td>
                    <td className="px-6 py-4 text-slate-300">{user.orderCount}</td>
                    <td className="px-6 py-4 text-slate-300">{formatDate(user.lastOrderAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
