import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <main className="public-page">
      <section className="hero-band">
        <div>
          <h1>GreenHome Kitchen</h1>
          <p>Cookware, tableware, kitchen tools, cleaning supplies, and smart storage for everyday kitchens.</p>
          <Link className="btn btn-success" to="/products">
            Browse products
          </Link>
        </div>
      </section>
    </main>
  );
}
