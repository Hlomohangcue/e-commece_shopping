'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { fetchJson, authHeaders, getToken } from '@/lib/auth';

type Product = {
  id: string;
  name: string;
  price: number;
  description: string;
  slug: string;
  images: Array<{ url: string }>;
  category: { name: string };
  featured: boolean;
};

type ApiMessage = {
  message?: string;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProducts = async (search = '') => {
    try {
      setLoading(true);
      const url = `/api/products${search ? `?q=${encodeURIComponent(search)}` : ''}`;
      const data = await fetchJson<Product[]>(url);
      setProducts(data);
    } catch (err) {
      console.error('Error loading products:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadProducts(query);
  };

  const handleAddToCart = async (productId: string) => {
    if (!getToken()) {
      window.location.href = '/login';
      return;
    }

    setError(null);
    setStatusMessage('Adding to cart...');

    try {
      await fetchJson<ApiMessage>('/api/cart', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity: 1 }),
      });
      setStatusMessage('Product added to your cart.');
    } catch (err: any) {
      setError(err.message);
      setStatusMessage(null);
    }

    window.setTimeout(() => {
      setStatusMessage(null);
      setError(null);
    }, 3000);
  };

  return (
    <main className="min-h-[calc(100vh-88px)] bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-col gap-4 rounded-[2rem] border border-slate-800 bg-slate-900/90 p-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Catalog</p>
            <h1 className="mt-3 text-4xl font-semibold">Browse our premium collection</h1>
          </div>
          <form onSubmit={handleSubmit} className="flex w-full gap-3 sm:w-auto">
            <input
              value={query}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
              placeholder="Search products"
              className="w-full rounded-full border border-slate-700 bg-slate-950 px-5 py-3 text-slate-100 outline-none transition focus:border-slate-500 sm:w-80"
            />
            <button className="rounded-full bg-slate-100 px-6 py-3 text-slate-950 transition hover:bg-slate-200">Search</button>
          </form>
        </div>

        {loading ? (
          <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-12 text-center text-slate-400">Loading products…</div>
        ) : (
          <>
            {(statusMessage || error) && (
              <div className="mb-6 rounded-3xl border border-slate-800 bg-slate-900/90 p-4 text-sm text-slate-200">
                {statusMessage ? <span className="text-emerald-300">{statusMessage}</span> : null}
                {error ? <span className="text-rose-300">{error}</span> : null}
              </div>
            )}
            <div className="grid gap-6 lg:grid-cols-3">
              {products.map((product) => (
                <div key={product.id} className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-glow">
                  <ProductCard
                    id={product.id}
                    name={product.name}
                    price={`$${product.price.toFixed(2)}`}
                    description={product.description}
                    badge={product.featured ? 'Featured' : product.category.name}
                    imageUrl={product.images[0]?.url}
                    onAddToCart={() => handleAddToCart(product.id)}
                  />
                  <a
                    href={`/products/${product.slug}`}
                    className="mt-4 inline-flex text-sm text-slate-200 underline-offset-4 hover:text-white"
                  >
                    View details
                  </a>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
