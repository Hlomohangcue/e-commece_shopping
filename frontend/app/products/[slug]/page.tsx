import { notFound } from 'next/navigation';
import AddToCartButton from '../../../components/AddToCartButton';

type ProductDetail = {
  id: string;
  name: string;
  price: number;
  description: string;
  slug: string;
  images: Array<{ url: string }>;
  category: { name: string };
  reviews: Array<{ id: string; rating: number; title: string; body: string }>;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function getProduct(slug: string): Promise<ProductDetail> {
  const response = await fetch(`${API_URL}/api/products/${slug}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Product not found');
  }
  return response.json();
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  let product: ProductDetail;
  try {
    product = await getProduct(params.slug);
  } catch {
    notFound();
  }

  return (
    <main className="min-h-[calc(100vh-88px)] bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.3fr_0.9fr]">
        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-10 shadow-glow">
          <div className="flex flex-col gap-6">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-slate-400">{product.category.name}</p>
              <h1 className="mt-3 text-5xl font-semibold">{product.name}</h1>
              <p className="mt-3 text-xl text-slate-200">${product.price.toFixed(2)}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {product.images.slice(0, 2).map((image) => (
                <img key={image.url} src={image.url} alt={product.name} className="rounded-3xl object-cover" />
              ))}
            </div>
            <p className="text-slate-400">{product.description}</p>
          </div>
        </div>

        <aside className="space-y-6 rounded-[2rem] border border-slate-800 bg-slate-900/90 p-8 shadow-glow">
          <AddToCartButton productId={product.id} />
          <div className="rounded-3xl bg-slate-950/80 p-6">
            <h2 className="text-lg font-semibold">Customer reviews</h2>
            <div className="mt-4 space-y-4">
              {product.reviews.length === 0 ? (
                <p className="text-sm text-slate-400">No reviews yet.</p>
              ) : (
                product.reviews.map((review) => (
                  <div key={review.id} className="rounded-3xl border border-slate-800 p-4">
                    <p className="font-semibold">{review.title}</p>
                    <p className="text-sm text-slate-400">{review.body}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.35em] text-slate-500">{review.rating} / 5</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
