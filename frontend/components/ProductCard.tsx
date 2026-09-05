'use client';

type ProductCardProps = {
  id: string;
  name: string;
  price: string;
  description: string;
  badge?: string;
  imageUrl?: string;
  onAddToCart: () => void;
};

export function ProductCard({ name, price, description, badge, imageUrl, onAddToCart }: ProductCardProps) {
  return (
    <article>
      {imageUrl ? <img src={imageUrl} alt={name} className="mb-5 aspect-[4/3] w-full rounded-2xl object-cover" /> : null}
      {badge ? <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{badge}</p> : null}
      <h2 className="mt-2 text-xl font-semibold text-white">{name}</h2>
      <p className="mt-2 text-lg text-slate-200">{price}</p>
      <p className="mt-3 line-clamp-3 text-sm text-slate-400">{description}</p>
      <button
        type="button"
        onClick={onAddToCart}
        className="mt-5 rounded-full bg-slate-100 px-5 py-2 text-sm font-medium text-slate-950 transition hover:bg-white"
      >
        Add to cart
      </button>
    </article>
  );
}
