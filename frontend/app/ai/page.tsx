'use client';

import { useEffect, useState } from 'react';
import { fetchJson, authHeaders, getToken } from '@/lib/auth';

type Recommendation = string;

export default function AIPage() {
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadRecommendations = async () => {
      try {
        const result = await fetchJson<{ recommendations: Recommendation[] }>('/api/ai/recommendations', {
          method: 'POST',
          headers: { ...authHeaders() },
          body: JSON.stringify({ productIds: [] }),
        });
        setRecommendations(result.recommendations);
      } catch (error) {
        console.error(error);
      }
    };
    loadRecommendations();
  }, []);

  const handleSend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setReply('');
    try {
      const response = await fetchJson<{ reply: string }>('/api/ai/chat', {
        method: 'POST',
        headers: { ...authHeaders() },
        body: JSON.stringify({ message, sessionId: 'visitor-chat' }),
      });
      setReply(response.reply);
    } catch (error: any) {
      setReply(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-88px)] bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-10 shadow-glow">
          <h1 className="text-4xl font-semibold">AI assistant</h1>
          <p className="mt-3 text-slate-400">Ask product questions, get shopping guidance, or explore intelligent recommendations.</p>
        </section>

        <section className="grid gap-8 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-8 shadow-glow">
            <form onSubmit={handleSend} className="space-y-5">
              <label className="block text-sm text-slate-300">
                Send a message to the AI assistant
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={5}
                  className="mt-3 w-full rounded-3xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-slate-500"
                  placeholder="Ask about product sizing, shipping, or custom bundles."
                  required
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="rounded-full bg-slate-100 px-6 py-3 text-slate-950 transition hover:bg-slate-200 disabled:opacity-60"
              >
                {loading ? 'Thinking…' : 'Send to AI'}
              </button>
            </form>
            {reply ? (
              <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
                <p className="text-sm uppercase tracking-[0.35em] text-slate-400">AI reply</p>
                <p className="mt-4 text-slate-100">{reply}</p>
              </div>
            ) : null}
          </div>

          <aside className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-8 shadow-glow">
            <h2 className="text-2xl font-semibold">Recommendations</h2>
            <p className="mt-3 text-slate-400">AI-generated product suggestions tailored to your browsing behavior.</p>
            <div className="mt-6 space-y-3">
              {recommendations.length === 0 ? (
                <p className="text-sm text-slate-500">Loading recommendations…</p>
              ) : (
                recommendations.map((item, index) => (
                  <div key={index} className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
                    <p className="text-slate-100">{item}</p>
                  </div>
                ))
              )}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
