"use client";
import React, { useEffect, useState } from 'react';
import { BASE_URL } from '../../../lib/api';
import { Product } from '../../../lib/types';

type CartItem = { productId: string; quantity: number };

export default function CheckoutExamplePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${BASE_URL}/api/products`);
        if (!res.ok) throw new Error('Failed to load products');
        const data = await res.json();
        // Map backend product shape to frontend `Product` (best-effort)
        const mapped: Product[] = data.map((p: any) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          price: p.price,
          currency: p.currency || 'M',
          description: p.description || '',
          imageUrl: p.images && p.images[0] ? p.images[0].url : '',
          rating: 0,
          category: p.category?.name || '',
          featured: !!p.featured,
          inventory: p.inventory ?? 0,
        }));
        setProducts(mapped);
      } catch (err: any) {
        setMessage(err.message || 'Could not load products');
      }
    }
    load();
  }, []);

  function addToCart(productId: string) {
    setCart((c) => {
      const existing = c.find((i) => i.productId === productId);
      if (existing) return c.map((i) => (i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i));
      return [...c, { productId, quantity: 1 }];
    });
  }

  function removeFromCart(productId: string) {
    setCart((c) => c.filter((i) => i.productId !== productId));
  }

  function updateQuantity(productId: string, qty: number) {
    if (qty <= 0) return removeFromCart(productId);
    setCart((c) => c.map((i) => (i.productId === productId ? { ...i, quantity: qty } : i)));
  }

  async function handleCheckout() {
    if (cart.length === 0) {
      setMessage('Please add items to cart');
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`${BASE_URL}/api/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          items: cart,
          shippingAddress: {
            country: 'US',
            countryCode: 'US',
          },
          successUrl: window.location.origin + '/checkout/success',
          cancelUrl: window.location.origin + '/checkout/cancel',
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Checkout failed' }));
        throw new Error(err.message || 'Checkout failed');
      }

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setMessage('No checkout URL returned');
      }
    } catch (err: any) {
      setMessage(err.message || 'Error during checkout');
    } finally {
      setLoading(false);
    }
  }

  const cartTotal = cart.reduce((sum, it) => {
    const p = products.find((x) => x.id === it.productId);
    return sum + (p?.price || 0) * it.quantity;
  }, 0);

  return (
    <main style={{ padding: 20 }}>
      <h1>Checkout Example (Live Products)</h1>

      {message && <p style={{ color: 'red' }}>{message}</p>}

      <section style={{ display: 'flex', gap: 24 }}>
        <div style={{ flex: 1 }}>
          <h2>Products</h2>
          {products.length === 0 && <p>No products available.</p>}
          {products.map((p) => (
            <div key={p.id} style={{ marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <strong>{p.name}</strong>
                  <div style={{ fontSize: 12 }}>{p.description}</div>
                </div>
                <div>
                  <div style={{ textAlign: 'right' }}>
                    M{p.price}
                    <div>
                      <button onClick={() => addToCart(p.id)} style={{ marginLeft: 8 }}>
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <aside style={{ width: 320 }}>
          <h2>Cart</h2>
          {cart.length === 0 && <p>Your cart is empty.</p>}
          {cart.map((it) => {
            const p = products.find((x) => x.id === it.productId);
            return (
              <div key={it.productId} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <strong>{p?.name || 'Product'}</strong>
                    <div style={{ fontSize: 12 }}>M{p?.price}</div>
                  </div>
                  <div>
                    <input
                      type="number"
                      value={it.quantity}
                      min={1}
                      onChange={(e) => updateQuantity(it.productId, parseInt(e.target.value || '1', 10))}
                      style={{ width: 56 }}
                    />
                    <button onClick={() => removeFromCart(it.productId)} style={{ marginLeft: 8 }}>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          <div style={{ marginTop: 12 }}>
            <strong>Total: M{cartTotal.toFixed(2)}</strong>
          </div>

          <div style={{ marginTop: 12 }}>
            <button onClick={handleCheckout} disabled={loading || cart.length === 0} style={{ padding: '8px 12px' }}>
              {loading ? 'Creating session…' : 'Proceed to Payment'}
            </button>
          </div>
        </aside>
      </section>
    </main>
  );
}
