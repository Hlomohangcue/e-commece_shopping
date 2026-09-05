'use client';

import { useState } from 'react';
import { authHeaders, fetchJson, getToken } from '../lib/auth';

type AddToCartButtonProps = {
  productId: string;
};

type CartItemResponse = {
  id: string;
  productId: string;
  quantity: number;
};

export default function AddToCartButton({ productId }: AddToCartButtonProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const addToCart = async () => {
    if (!getToken()) {
      window.location.href = '/login';
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      await fetchJson<CartItemResponse>('/api/cart', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ productId, quantity: 1 }),
      });
      setMessage('Added to cart.');
      window.dispatchEvent(new Event('cart-updated'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to add item.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={addToCart}
        disabled={loading}
        className="w-full rounded-full bg-slate-100 px-6 py-3 text-slate-950 transition hover:bg-white disabled:opacity-60"
      >
        {loading ? 'Adding...' : 'Add to cart'}
      </button>
      {message ? <p className="mt-3 text-sm text-slate-400">{message}</p> : null}
    </div>
  );
}
