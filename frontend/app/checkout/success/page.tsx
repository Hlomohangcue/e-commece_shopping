export default function CheckoutSuccessPage() {
  return (
    <main className="min-h-[calc(100vh-88px)] bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto max-w-3xl rounded-[2rem] border border-slate-800 bg-slate-900/90 p-10 text-center shadow-glow">
        <h1 className="text-4xl font-semibold">Payment complete</h1>
        <p className="mt-4 text-slate-400">Thank you for your order. Your payment has been processed successfully.</p>
        <a href="/dashboard" className="mt-8 inline-flex rounded-full bg-slate-100 px-6 py-3 text-slate-950 transition hover:bg-slate-200">
          View your dashboard
        </a>
      </div>
    </main>
  );
}
