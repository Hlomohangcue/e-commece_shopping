import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm uppercase tracking-[0.35em] text-slate-400">E-Commerce Website</p>
        <h1 className="mt-6 max-w-3xl text-5xl font-semibold tracking-tight">Find something worth bringing home.</h1>
        <p className="mt-6 max-w-xl text-lg text-slate-400">Browse the catalog, save products to your cart, and follow your orders from one place.</p>
        <Link href="/products" className="mt-10 inline-flex rounded-full bg-slate-100 px-6 py-3 font-medium text-slate-950 transition hover:bg-white">
          Browse products
        </Link>
      </div>
    </main>
  );
}
