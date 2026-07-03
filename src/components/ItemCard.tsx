import { useState } from 'react';
import type { Item } from '../lib/catalog';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const count = new Intl.NumberFormat('en-US');

export function ItemCard({ item }: { item: Item }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = item.image !== null && !imageFailed;

  return (
    <article className={`card${item.inStock ? '' : ' card-unavailable'}`}>
      <div className="card-media">
        {showImage ? (
          <img
            src={item.image as string}
            alt={item.title}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="card-media-fallback">
            <span>{item.brand}</span>
            <small>No image</small>
          </div>
        )}
        {!item.inStock && <span className="badge badge-out">Sold out</span>}
        {item.inStock && item.comingSoon && <span className="badge">Coming soon</span>}
      </div>
      <div className="card-body">
        <p className="card-meta">
          {item.category} · {item.brand}
        </p>
        <h3>{item.title}</h3>
        {item.reviewed ? (
          <p className="card-rating">
            <strong>{(item.rating as number).toFixed(1)}</strong> ·{' '}
            {count.format(item.reviews)} review{item.reviews === 1 ? '' : 's'}
          </p>
        ) : (
          <p className="card-rating card-unrated">No reviews yet</p>
        )}
        {item.price !== null ? (
          <p className="card-price">{usd.format(item.price)}</p>
        ) : (
          <p className="card-price card-price-unknown">Price unavailable</p>
        )}
      </div>
    </article>
  );
}
