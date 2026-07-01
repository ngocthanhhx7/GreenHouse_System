import { useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const collections = [
  {
    title: 'Cookware',
    description: 'Ceramic pans, stainless pots, and everyday cooking essentials.',
    image: '/assets/background/photo-1605106250963-ffda6d2a4b32.avif',
  },
  {
    title: 'Tableware',
    description: 'Clean serving pieces for family meals and mentor-ready demos.',
    image: '/assets/background/photo-1605106702734-205df224ecce.avif',
  },
  {
    title: 'Kitchen Tools',
    description: 'Preparation tools that keep the daily kitchen workflow moving.',
    image: '/assets/background/photo-1664329182766-2f7759d13f78.avif',
  },
  {
    title: 'Smart Storage',
    description: 'Organized pantry and food storage for modern apartments.',
    image: '/assets/background/premium_photo-1664443591179-6a8e4a920981.avif',
  },
];

const workflowSteps = ['Browse', 'Cart', 'Checkout', 'Staff Processing', 'Warehouse', 'Delivery'];

const trustItems = [
  { value: '8+', label: 'demo categories and products' },
  { value: '4', label: 'role-based operating portals' },
  { value: '100%', label: 'inventory-backed order flow' },
];

export default function HomePage() {
  const pageRef = useRef(null);

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduceMotion) {
        gsap.set('.home-animate, .home-reveal', { autoAlpha: 1, y: 0, scale: 1 });
        return;
      }

      gsap.from('.home-animate', {
        autoAlpha: 0,
        y: 26,
        duration: 0.7,
        ease: 'power3.out',
        stagger: 0.08,
      });

      gsap.to('.hero-media-card', {
        y: -10,
        duration: 2.8,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
      });

      gsap.utils.toArray('.home-reveal').forEach((element) => {
        gsap.from(element, {
          autoAlpha: 0,
          y: 34,
          duration: 0.65,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: element,
            start: 'top 82%',
            toggleActions: 'play none none reverse',
          },
        });
      });
    },
    { scope: pageRef }
  );

  return (
    <main className="home-page" ref={pageRef}>
      <section className="home-hero">
        <div className="hero-copy">
          <span className="eyebrow home-animate">GreenHome Kitchen Commerce</span>
          <h1 className="home-animate">GreenHome Kitchen</h1>
          <p className="hero-lead home-animate">
            Premium kitchen goods, thoughtful order operations, and warehouse-backed fulfillment in one polished shopping experience.
          </p>
          <div className="hero-actions home-animate">
            <Link className="btn btn-success btn-lg" to="/products">
              Browse Products
            </Link>
            <Link className="btn btn-outline-success btn-lg" to="/register">
              Create Account
            </Link>
          </div>
          <div className="trust-strip home-animate">
            {trustItems.map((item) => (
              <div key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-media home-animate">
          <div className="hero-media-card">
            <img src="/assets/banner/banner.png" alt="GreenHome Kitchen curated cookware and tableware" />
            <div className="hero-media-note">
              <strong>Ready for demo</strong>
              <span>{'Product -> Cart -> Checkout -> Staff -> Warehouse'}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section home-reveal">
        <div className="section-heading">
          <span className="eyebrow">Kitchen Collections</span>
          <h2>Category Showcase</h2>
          <p>Give customers a polished first path into the catalog while keeping the business structure visible to mentors.</p>
        </div>
        <div className="collection-grid">
          {collections.map((collection) => (
            <Link className="collection-card" to="/products" key={collection.title}>
              <img src={collection.image} alt={`${collection.title} collection`} />
              <div>
                <h3>{collection.title}</h3>
                <p>{collection.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-section split-story home-reveal">
        <div>
          <span className="eyebrow">Business workflow preview</span>
          <h2>{'Browse -> Cart -> Checkout -> Staff Processing -> Warehouse -> Delivery'}</h2>
          <p>
            The homepage now introduces the real system flow, so the website feels like a complete commerce operation instead of a static catalog.
          </p>
        </div>
        <div className="workflow-chain">
          {workflowSteps.map((step, index) => (
            <div className="workflow-step" key={step}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{step}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="home-section premium-story home-reveal">
        <div className="story-panel">
          <span className="eyebrow">Premium but practical</span>
          <h2>Designed for customers, staff, warehouse managers, and admins.</h2>
          <p>
            GreenHome combines a calm storefront with operational clarity: payment status, order queues, inventory movement, after-sale support, reports, and audit logs.
          </p>
          <Link className="btn btn-light" to="/products">
            View Catalog
          </Link>
        </div>
      </section>

      <section className="home-section final-cta home-reveal">
        <span className="eyebrow">Final CTA</span>
        <h2>Start shopping with a kitchen system that is ready to operate.</h2>
        <div className="hero-actions">
          <Link className="btn btn-success btn-lg" to="/products">
            Start shopping
          </Link>
          <Link className="btn btn-outline-success btn-lg" to="/login">
            Login to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
