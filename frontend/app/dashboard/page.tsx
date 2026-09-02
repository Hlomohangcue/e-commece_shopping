'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchJson, authHeaders, getToken } from '@/lib/auth';

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

export default function DashboardPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) return;

    const load = async () => {
      try {
        const currentUser = await fetchJson<{ name: string; email: string }>('/api/auth/me', {
          headers: authHeaders(),
        });
        setUser(currentUser);
        const data = await fetchJson<Order[]>('/api/orders', {
          headers: authHeaders(),
        });
        setOrders(data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <main className="min-h-[calc(100vh-88px)] bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-10 shadow-glow">
          <h1 className="text-4xl font-semibold">User dashboard</h1>
          <p className="mt-3 text-slate-400">A single place to track orders, wishlist items, and AI recommendations.</p>
          {user ? (
            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-slate-200">Welcome back, {user.name || user.email}.</p>
              <Link href="/orders" className="inline-flex rounded-full border border-slate-700 bg-slate-950/80 px-5 py-3 text-sm text-slate-100 transition hover:border-slate-500">
                View full order history
              </Link>
            </div>
          ) : (
            <p className="mt-6 text-slate-400">Loading profile…</p>
          )}
        </section>

        <section className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-10 shadow-glow">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Recent orders</h2>
          </div>
          {loading ? (
            <p className="mt-6 text-slate-400">Loading your orders…</p>
          ) : orders.length === 0 ? (
            <p className="mt-6 text-slate-400">No orders yet. Add something to your cart to get started.</p>
          ) : (
            <div className="mt-6 space-y-4">
              {orders.map((order) => (
                <div key={order.id} className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="font-semibold text-white">Order #{order.id.slice(0, 8)}</p>
                      <p className="text-sm text-slate-400">Placed: {new Date(order.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm uppercase tracking-[0.35em] text-slate-400">{order.status}</p>
                      <p className="mt-2 text-lg font-semibold text-white">${order.totalAmount.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
                    <p className="text-sm text-slate-400">Items</p>
                    <ul className="mt-3 space-y-3">
                      {order.items.map((item) => (
                        <li key={item.id} className="flex items-center justify-between rounded-3xl border border-slate-800 bg-slate-950/90 px-4 py-3 text-sm text-slate-200">
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
        </section>
      </div>
    </main>
  );
}
