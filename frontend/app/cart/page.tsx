'use client';

import { FormEvent, useEffect, useState } from 'react';
import { fetchJson, authHeaders, getToken } from '@/lib/auth';

type CartLineItem = {
  id: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    price: number;
    currency: string;
  };
};

type ApiMessage = {
  message?: string;
};

type PaymentLocation = 'lesotho' | 'international';

interface PaymentInfo {
  location: PaymentLocation;
  methods: string[];
  currency: string;
  currencySymbol: string;
}

const paymentInfoByCountry: Record<string, PaymentInfo> = {
  'LS': {
    location: 'lesotho',
    methods: ['Card', 'Bank Transfer'],
    currency: 'LSL',
    currencySymbol: 'L',
  },
  'US': {
    location: 'international',
    methods: ['Card', 'iDEAL', 'Bancontact', 'Giropay', 'EPS', 'Alipay', 'WeChat Pay'],
    currency: 'USD',
    currencySymbol: '$',
  },
  'GB': {
    location: 'international',
    methods: ['Card', 'iDEAL', 'Bancontact', 'Giropay', 'EPS', 'Alipay', 'WeChat Pay'],
    currency: 'USD',
    currencySymbol: '$',
  },
  'EU': {
    location: 'international',
    methods: ['Card', 'iDEAL', 'Bancontact', 'Giropay', 'EPS', 'Alipay', 'WeChat Pay'],
    currency: 'USD',
    currencySymbol: '$',
  },
};

const countries = [
  { code: 'LS', name: 'Lesotho' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'BW', name: 'Botswana' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'EU', name: 'European Union' },
  { code: 'OTHER', name: 'Other Countries' },
];

export default function CartPage() {
  const [items, setItems] = useState<CartLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string>('US');
  const [shippingDetails, setShippingDetails] = useState({
    fullName: '',
    email: '',
    phone: '',
    line1: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
  });

  const paymentInfo = paymentInfoByCountry[selectedCountry] || paymentInfoByCountry['US'];

  const loadCart = async () => {
    setLoading(true);
    try {
      const cart = await fetchJson<CartLineItem[]>('/api/cart', {
        headers: authHeaders(),
      });
      setItems(cart);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!getToken()) return;
    loadCart();
  }, []);

  const subtotal = items.reduce((total: number, item: CartLineItem) => total + item.product.price * item.quantity, 0);

  const handleQuantityChange = async (item: CartLineItem, nextQuantity: number) => {
    if (nextQuantity < 1) return;
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      await fetchJson<ApiMessage>('/api/cart', {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartItemId: item.id, quantity: nextQuantity }),
      });
      setSuccessMessage('Cart updated successfully.');
      window.dispatchEvent(new Event('cart-updated'));
      await loadCart();
    } catch (err: any) {
      setError(err.message || 'Unable to update item quantity.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveItem = async (productId: string) => {
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      await fetchJson<ApiMessage>(`/api/cart/${productId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      setSuccessMessage('Item removed from cart.');
      window.dispatchEvent(new Event('cart-updated'));
      await loadCart();
    } catch (err: any) {
      setError(err.message || 'Unable to remove item.');
    } finally {
      setLoading(false);
    }
  };

  const handleShippingChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setShippingDetails((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const countryCode = e.target.value;
    setSelectedCountry(countryCode);
    setShippingDetails((prev) => ({
      ...prev,
      country: countryCode,
    }));
  };

  const handleCheckout = async () => {
    // Validate shipping details
    if (!shippingDetails.fullName || !shippingDetails.email || !shippingDetails.phone || 
        !shippingDetails.line1 || !shippingDetails.city || !shippingDetails.postalCode) {
      setError('Please fill in all shipping details.');
      return;
    }

    setCheckoutLoading(true);
    setError(null);
    try {
      const response = await fetchJson<{ url: string }>('/api/checkout', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
            price: item.product.price,
          })),
          shippingAddress: {
            fullName: shippingDetails.fullName,
            email: shippingDetails.email,
            phone: shippingDetails.phone,
            line1: shippingDetails.line1,
            city: shippingDetails.city,
            state: shippingDetails.state,
            postalCode: shippingDetails.postalCode,
            country: countries.find((c) => c.code === shippingDetails.country)?.name || shippingDetails.country,
            countryCode: shippingDetails.country,
          },
          successUrl: `${window.location.origin}/checkout/success`,
          cancelUrl: `${window.location.origin}/checkout/cancel`,
        }),
      });
      window.location.href = response.url;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (!getToken()) {
    return (
      <main className="min-h-[calc(100vh-88px)] bg-slate-950 px-6 py-12 text-slate-100">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-slate-800 bg-slate-900/90 p-10 text-center shadow-glow">
          <h1 className="text-3xl font-semibold">Your cart is waiting</h1>
          <p className="mt-4 text-slate-400">Sign in to save your cart, continue checkout, and track your orders.</p>
          <a href="/login" className="mt-8 inline-flex rounded-full bg-slate-100 px-6 py-3 text-slate-950 transition hover:bg-slate-200">
            Sign in now
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-88px)] bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-8 shadow-glow">
          <h1 className="text-3xl font-semibold">Shopping cart</h1>
          {loading ? (
            <p className="mt-6 text-slate-400">Loading your items…</p>
          ) : items.length === 0 ? (
            <p className="mt-6 text-slate-400">No items in your cart yet.</p>
          ) : (
            <div className="mt-8 space-y-5">
              {successMessage ? <p className="text-sm text-emerald-300">{successMessage}</p> : null}
              {error ? <p className="text-sm text-rose-400">{error}</p> : null}
              {items.map((item) => (
                <div key={item.id} className="grid gap-4 rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-white">{item.product.name}</h2>
                      <p className="mt-2 text-sm text-slate-400">Price: ${item.product.price.toFixed(2)}</p>
                    </div>
                    <div className="flex flex-col items-start gap-3 sm:items-end">
                      <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(item, item.quantity - 1)}
                          disabled={item.quantity <= 1 || loading}
                          className="rounded-full bg-slate-800 px-3 py-1 text-slate-100 transition hover:bg-slate-700 disabled:opacity-50"
                        >
                          -
                        </button>
                        <span className="min-w-[2rem] text-center text-sm text-slate-100">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(item, item.quantity + 1)}
                          disabled={loading}
                          className="rounded-full bg-slate-800 px-3 py-1 text-slate-100 transition hover:bg-slate-700"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.product.id)}
                        disabled={loading}
                        className="rounded-full border border-rose-600 bg-rose-950/10 px-4 py-2 text-sm text-rose-200 transition hover:bg-rose-950 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-800 pt-4 text-sm text-slate-400">
                    <span>Line total</span>
                    <span className="text-white">${(item.product.price * item.quantity).toFixed(2)}</span>
                  </div>
                </div>
              ))}
              <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
                <div className="flex items-center justify-between text-sm text-slate-400">
                  <span>Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Shipping and Delivery Information */}
              <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 space-y-4">
                <h2 className="text-xl font-semibold text-white">Shipping & Delivery</h2>

                {/* Country Selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Country/Region</label>
                  <select
                    name="country"
                    value={selectedCountry}
                    onChange={handleCountryChange}
                    className="w-full rounded-lg bg-slate-900 px-4 py-2 text-slate-100 border border-slate-700 focus:border-slate-500 focus:outline-none"
                  >
                    {countries.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Shipping Form */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    type="text"
                    name="fullName"
                    placeholder="Full Name"
                    value={shippingDetails.fullName}
                    onChange={handleShippingChange}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-slate-100 border border-slate-700 focus:border-slate-500 focus:outline-none"
                  />
                  <input
                    type="email"
                    name="email"
                    placeholder="Email"
                    value={shippingDetails.email}
                    onChange={handleShippingChange}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-slate-100 border border-slate-700 focus:border-slate-500 focus:outline-none"
                  />
                  <input
                    type="tel"
                    name="phone"
                    placeholder="Phone Number"
                    value={shippingDetails.phone}
                    onChange={handleShippingChange}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-slate-100 border border-slate-700 focus:border-slate-500 focus:outline-none sm:col-span-2"
                  />
                  <input
                    type="text"
                    name="line1"
                    placeholder="Street Address"
                    value={shippingDetails.line1}
                    onChange={handleShippingChange}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-slate-100 border border-slate-700 focus:border-slate-500 focus:outline-none sm:col-span-2"
                  />
                  <input
                    type="text"
                    name="city"
                    placeholder="City"
                    value={shippingDetails.city}
                    onChange={handleShippingChange}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-slate-100 border border-slate-700 focus:border-slate-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    name="state"
                    placeholder="State/Province (Optional)"
                    value={shippingDetails.state}
                    onChange={handleShippingChange}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-slate-100 border border-slate-700 focus:border-slate-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    name="postalCode"
                    placeholder="Postal Code"
                    value={shippingDetails.postalCode}
                    onChange={handleShippingChange}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-slate-100 border border-slate-700 focus:border-slate-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Payment Information */}
              <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 space-y-4">
                <h2 className="text-xl font-semibold text-white">Payment Method</h2>
                <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
                  <p className="text-sm text-slate-300 font-medium">
                    {paymentInfo.location === 'lesotho' 
                      ? '🇱🇸 Lesotho Payment Options' 
                      : '🌍 International Payment Options'}
                  </p>
                  <p className="text-xs text-slate-400 mt-2">Currency: {paymentInfo.currency}</p>
                  <p className="text-sm text-slate-300 mt-3">Available payment methods:</p>
                  <ul className="mt-2 list-disc list-inside space-y-1">
                    {paymentInfo.methods.map((method) => (
                      <li key={method} className="text-sm text-slate-400">
                        {method}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <button
                onClick={handleCheckout}
                disabled={checkoutLoading || items.length === 0}
                className="w-full rounded-full bg-slate-100 px-6 py-3 text-slate-950 font-semibold transition hover:bg-slate-200 disabled:opacity-60"
              >
                {checkoutLoading ? 'Redirecting to payment…' : `Proceed to Payment (${paymentInfo.currencySymbol}${subtotal.toFixed(2)})`}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
