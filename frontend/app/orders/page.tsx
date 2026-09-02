'use client';

import { useEffect, useState } from 'react';
import { fetchJson, authHeaders, getToken } from '@/lib/auth';
import Link from 'next/link';

type Order = {
  id: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  items: Array<{
    id: string;
    quantity: number;
    price: number;
    product: { name: string };
  }>;
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) return;

    const loadOrders = async () => {
      setLoading(true);
      try {
        const data = await fetchJson<Order[]>('/api/orders', {
          headers: authHeaders(),
        });
        setOrders(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, []);

  if (!getToken()) {
    return (
      <main className="min-h-[calc(100vh-88px)] bg-slate-950 px-6 py-12 text-slate-100">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-slate-800 bg-slate-900/90 p-10 text-center shadow-glow">
          <h1 className="text-3xl font-semibold">Order history</h1>
          <p className="mt-4 text-slate-400">Sign in to see your orders and recent purchases.</p>
          <Link href="/login" className="mt-8 inline-flex rounded-full bg-slate-100 px-6 py-3 text-slate-950 transition hover:bg-slate-200">
            Sign in now
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-88px)] bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-10 shadow-glow">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-4xl font-semibold">Order history</h1>
              <p className="mt-3 text-slate-400">View your past purchases and the details for each order.</p>
            </div>
            <Link href="/dashboard" className="inline-flex rounded-full border border-slate-700 bg-slate-950/80 px-5 py-3 text-sm text-slate-100 transition hover:border-slate-500">
              Go to dashboard
            </Link>
          </div>
        </section>

        {loading ? (
          <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-10 text-center text-slate-400">Loading orders…</div>
        ) : orders.length === 0 ? (
          <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-10 text-center text-slate-400">You have no orders yet. Add items to the cart and checkout to get started.</div>
        ) : (
          <div className="space-y-6">
            {orders.map((order) => (
              <div key={order.id} className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-8 shadow-glow">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Order #{order.id.slice(0, 8)}</p>
                    <p className="mt-2 text-lg font-semibold text-white">Placed {new Date(order.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm uppercase tracking-[0.35em] text-slate-400">{order.status}</p>
                    <p className="mt-2 text-xl font-semibold text-white">${order.totalAmount.toFixed(2)}</p>
                  </div>
                </div>
                <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-400">Items</h2>
                  <ul className="mt-4 space-y-3">
                    {order.items.map((item) => (
                      <li key={item.id} className="flex items-center justify-between rounded-3xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-200">
                        <span>{item.product.name}</span>
                        <span className="text-slate-400">{item.quantity} × ${item.price.toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
