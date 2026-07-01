import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { productService } from '../../services/productService.js';
import ProductCard from '../../components/product/ProductCard.jsx';

gsap.registerPlugin(useGSAP, ScrollTrigger);

/* ─── Data ───────────────────────────────────── */

const differentiators = [
  {
    icon: (
      <svg className="why-us-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="7"></circle>
        <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>
      </svg>
    ),
    title: 'Premium Quality',
    description: 'Vetted for durability and design excellence.',
  },
  {
    icon: (
      <svg className="why-us-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13"></rect>
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
        <circle cx="5.5" cy="18.5" r="2.5"></circle>
        <circle cx="18.5" cy="18.5" r="2.5"></circle>
      </svg>
    ),
    title: 'Free Shipping',
    description: 'Complimentary delivery on orders over $50.',
  },
  {
    icon: (
      <svg className="why-us-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
      </svg>
    ),
    title: 'Fast Fulfillment',
    description: 'Orders processed and shipped same day.',
  },
  {
    icon: (
      <svg className="why-us-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1 4 1 10 7 10"></polyline>
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
      </svg>
    ),
    title: 'Easy Returns',
    description: '30-day hassle-free return policy.',
  },
];

const collections = [
  {
    title: 'Cookware',
    description: 'Premium ceramic pans and stainless steel pots.',
    image: '/assets/background/cookware.png',
    icon: (
      <svg className="category-svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z" />
        <path d="M3 12h18V9a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3Z" />
        <path d="M12 7V3" />
      </svg>
    ),
  },
  {
    title: 'Tableware',
    description: 'Elegant pieces for everyday and special occasions.',
    image: '/assets/background/tableware.png',
    icon: (
      <svg className="category-svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
      </svg>
    ),
  },
  {
    title: 'Kitchen Tools',
    description: 'Professional-grade tools for effortless prep.',
    image: '/assets/background/kitchen_tools.png',
    icon: (
      <svg className="category-svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l4.77-4.77a1 1 0 0 0-1.4-1.4L14.7 6.3Z" />
        <path d="M14.7 6.3 4.5 16.5V20h3.5L18.2 9.8" />
        <path d="m8.5 14.5-3 3" />
      </svg>
    ),
  },
  {
    title: 'Smart Storage',
    description: 'Organized solutions for modern kitchen spaces.',
    image: '/assets/background/smart_storage.png',
    icon: (
      <svg className="category-svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5" />
        <path d="M12 22V12" />
      </svg>
    ),
  },
];

const testimonials = [
  {
    quote: 'The cookware set exceeded my expectations. Packaged beautifully and the quality is restaurant-grade.',
    name: 'Sarah M.',
    role: 'Home Chef',
    stars: 5,
    initials: 'SM',
    gradient: 'linear-gradient(135deg, #2f6b42, #5daa68)',
    verified: true,
  },
  {
    quote: 'From cart to doorstep in 3 days. The tracking system kept me informed the whole way.',
    name: 'James K.',
    role: 'Verified Buyer',
    stars: 5,
    initials: 'JK',
    gradient: 'linear-gradient(135deg, #1f3f2b, #3d8b5a)',
    verified: true,
  },
  {
    quote: 'Customer support resolved my return in hours. Best online shopping experience I have had.',
    name: 'Linh T.',
    role: 'Regular Customer',
    stars: 5,
    initials: 'LT',
    gradient: 'linear-gradient(135deg, #17281d, #2f6b42)',
    verified: true,
  },
];

const trustItems = [
  { 
    value: 500, 
    suffix: '+', 
    label: 'Kitchen Products', 
    icon: (
      <svg className="trust-svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ) 
  },
  { 
    value: 10000, 
    suffix: '+', 
    label: 'Happy Customers', 
    icon: (
      <svg className="trust-svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ) 
  },
  { 
    value: 99.8, 
    suffix: '%', 
    label: 'Order Accuracy', 
    icon: (
      <svg className="trust-svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <polyline points="9 11 11 13 15 9" />
      </svg>
    ) 
  },
];

const newsletterBenefits = [
  'Exclusive recipes & cooking tips',
  'Early access to new collections',
  'Green living & sustainability guides',
  '10% off your first order',
];

/* ─── Component ──────────────────────────────── */

export default function HomePage() {
  const pageRef = useRef(null);
  const heroCardRef = useRef(null);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [activeReview, setActiveReview] = useState(0);
  const [subscribed, setSubscribed] = useState(false);
  const [scrollPercent, setScrollPercent] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);

  // Clear all global ScrollTriggers on mount and ensure cleanup on unmount to prevent page collision
  useEffect(() => {
    ScrollTrigger.refresh();
    return () => {
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  // Recalculate ScrollTrigger positions when dynamic catalog data loads (prevents layout offsets)
  useEffect(() => {
    if (!productsLoading) {
      const timer = setTimeout(() => {
        ScrollTrigger.refresh();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [productsLoading]);

  // Auto scroll testimonials
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveReview((prev) => (prev + 1) % testimonials.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  // Track page scroll progress + back-to-top visibility
  useEffect(() => {
    const handleScroll = () => {
      const wins = document.documentElement.scrollTop || document.body.scrollTop;
      const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const pct = docHeight > 0 ? (wins / docHeight) * 100 : 0;
      setScrollPercent(pct);
      setShowBackToTop(pct > 25);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await productService.listProducts({ limit: 8 });
        if (!cancelled) setFeaturedProducts(data || []);
      } catch {
        // Silently fail — section hides when empty
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // 3D tilt effects
  const handleMouseMove = (e) => {
    const card = heroCardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    gsap.to(card, {
      rotateX: -y / 15,
      rotateY: x / 15,
      transformPerspective: 1000,
      duration: 0.3,
      ease: 'power1.out',
    });
  };

  const handleMouseLeave = () => {
    const card = heroCardRef.current;
    if (!card) return;
    gsap.to(card, {
      rotateX: 0,
      rotateY: 0,
      duration: 0.5,
      ease: 'power1.out',
    });
  };

  const handleSubscribe = (e) => {
    e.preventDefault();
    setSubscribed(true);
    setTimeout(() => {
      setSubscribed(false);
      e.target.reset();
    }, 6000);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduceMotion) {
        gsap.set('.home-animate, .home-reveal', { autoAlpha: 1, y: 0, scale: 1 });
        return;
      }

      // Hero animations
      gsap.from('.home-animate', {
        autoAlpha: 0,
        y: 30,
        duration: 0.8,
        ease: 'power4.out',
        stagger: 0.1,
      });

      // Ambient blobs subtle float
      gsap.to('.ambient-blob.blob-1', {
        x: '30px',
        y: '20px',
        duration: 8,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
      gsap.to('.ambient-blob.blob-2', {
        x: '-20px',
        y: '30px',
        duration: 10,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
      gsap.to('.ambient-blob.blob-3', {
        x: '15px',
        y: '-25px',
        duration: 12,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });

      // Stats Count Up Animation (runs immediately on mount since Hero is visible)
      gsap.utils.toArray('.trust-counter', pageRef.current).forEach((el) => {
        const targetVal = parseFloat(el.getAttribute('data-target'));
        const obj = { val: 0 };
        gsap.to(obj, {
          val: targetVal,
          duration: 2.5,
          ease: 'power2.out',
          onUpdate: () => {
            if (el) {
              el.innerText = targetVal % 1 === 0 ? Math.floor(obj.val) : obj.val.toFixed(1);
            }
          }
        });
      });

      // Reveal inner elements on scroll (safe entry animation, once only)
      gsap.utils.toArray('.home-reveal', pageRef.current).forEach((element) => {
        gsap.from(element, {
          autoAlpha: 0,
          y: 25,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: element,
            start: 'top 92%',
            once: true,
          },
        });
      });

      // Why-us staggered reveal (accurate coordinates since parent is visible)
      gsap.utils.toArray('.why-us-item', pageRef.current).forEach((el, i) => {
        gsap.from(el, {
          autoAlpha: 0,
          y: 20,
          x: -10,
          duration: 0.6,
          delay: i * 0.1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 95%',
            once: true,
          },
        });
      });

      // Collection cards stagger (accrues from collection-card-v2 class name)
      gsap.utils.toArray('.collection-card-v2', pageRef.current).forEach((el, i) => {
        gsap.from(el, {
          autoAlpha: 0,
          y: 35,
          scale: 0.98,
          duration: 0.7,
          delay: i * 0.08,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 92%',
            once: true,
          },
        });
      });
    },
    { scope: pageRef }
  );

  const hasFeaturedProducts = featuredProducts.length > 0;
  const showFeaturedSection = hasFeaturedProducts || productsLoading;

  return (
    <main className="home-page" ref={pageRef}>
      {/* Scroll Progress Bar */}
      <div className="scroll-progress" style={{ width: `${scrollPercent}%` }} />

      {/* Decorative Blur Ambient Blobs */}
      <div className="ambient-blob blob-1" />
      <div className="ambient-blob blob-2" />
      <div className="ambient-blob blob-3" />

      {/* ===== Section 1: Hero ===== */}
      <section className="home-hero">
        <div className="hero-copy">
          <span className="hero-badge home-animate">
            <span className="hero-badge-icon">✦</span>
            New Collection 2026
          </span>
          <h1 className="home-animate hero-title-gradient">
            Green<span className="hero-title-accent">Home</span> Kitchen
          </h1>
          <p className="hero-lead home-animate">
            Premium kitchenware for modern homes. From cookware to smart storage — quality you can trust.
          </p>
          <div className="hero-actions home-animate">
            <Link className="btn btn-success btn-lg hero-btn-primary" to="/products">
              <span>Shop Now</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </Link>
            <Link className="btn btn-outline-success btn-lg" to="/register">
              Create Account
            </Link>
          </div>
          <div className="trust-strip home-animate">
            {trustItems.map((item) => (
              <div key={item.label} className="trust-strip-card">
                <span className="trust-icon">{item.icon}</span>
                <div className="trust-data">
                  <strong>
                    <span className="trust-counter" data-target={item.value}>0</span>
                    {item.suffix}
                  </strong>
                  <span>{item.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-media home-animate">
          <div 
            className="hero-media-card"
            ref={heroCardRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <img src="/assets/banner/banner.png" alt="GreenHome Kitchen curated cookware and tableware" />
            <div className="hero-card-ribbon">🔥 Bestseller Collection</div>
          </div>
        </div>
      </section>

      {/* Wave Separator */}
      <div className="wave-separator wave-1" />

      {/* ===== Section 2: Categories ===== */}
      <section className="home-section section-alt">
        <div className="section-heading section-heading-center home-reveal">
          <span className="eyebrow">Shop by Category</span>
          <h2>Kitchen Collections</h2>
          <p>Curated categories for every corner of your kitchen.</p>
        </div>
        <div className="collection-grid-v2">
          {collections.map((collection, idx) => (
            <Link 
              className={`collection-card-v2 ${idx === 0 ? 'collection-featured' : ''}`} 
              to="/products" 
              key={collection.title}
            >
              <img src={collection.image} alt={`${collection.title} collection`} loading="lazy" />
              <div className="collection-overlay-v2">
                {collection.icon}
                <h3>{collection.title}</h3>
                <p>{collection.description}</p>
                <span className="collection-cta">Explore Now →</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Wave Separator */}
      <div className="wave-separator wave-2" />

      {/* ===== Section 3: Featured Products ===== */}
      {showFeaturedSection && (
        <section className="home-section">
          <div className="section-heading-row home-reveal">
            <div className="section-heading">
              <span className="eyebrow">Featured Products</span>
              <h2>Best Sellers</h2>
              <p>Our most popular kitchen essentials, handpicked for quality and value.</p>
            </div>
            <Link to="/products" className="view-all-link">
              View All Products
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </Link>
          </div>

          {productsLoading && (
            <div className="featured-grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <div className="product-skeleton" key={i}>
                  <div className="product-skeleton-image" />
                  <div className="product-skeleton-body">
                    <div className="product-skeleton-line" />
                    <div className="product-skeleton-line" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!productsLoading && hasFeaturedProducts && (
            <div className="featured-grid home-reveal">
              {featuredProducts.slice(0, 4).map((product) => (
                <ProductCard key={product.id || product._id} product={product} />
              ))}
            </div>
          )}

          {!productsLoading && !hasFeaturedProducts && (
            <div className="featured-empty home-reveal">
              <div className="featured-empty-inner">
                <span className="featured-empty-icon">
                  <svg className="featured-empty-svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <path d="M16 10a4 4 0 0 1-8 0" />
                  </svg>
                </span>
                <h3>New Products Coming Soon</h3>
                <p>We're curating the best kitchen essentials for you. Check back soon!</p>
                <Link to="/products" className="btn btn-outline-success">Browse All Products</Link>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ===== Section 4: Why Choose Us ===== */}
      <section className="home-section section-alt">
        <div className="section-heading section-heading-center home-reveal">
          <span className="eyebrow">Why Choose Us</span>
          <h2>Kitchen commerce done right</h2>
          <p>We combine premium products with a seamless shopping experience.</p>
        </div>
        <div className="why-us-bar">
          {differentiators.map((item, idx) => (
            <div className="why-us-item" key={item.title} style={{ '--delay': `${idx * 0.08}s` }}>
              <div className="why-us-icon">
                {item.icon}
              </div>
              <div className="why-us-text">
                <strong>{item.title}</strong>
                <span>{item.description}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Wave Separator */}
      <div className="wave-separator wave-3" />

      {/* ===== Section 5: Testimonials ===== */}
      <section className="home-section">
        <div className="section-heading section-heading-center home-reveal">
          <span className="eyebrow">Customer Reviews</span>
          <h2>What our customers say</h2>
          <div className="testimonial-rating-summary">
            <div className="rating-stars-large">★★★★★</div>
            <span className="rating-text">4.9/5 from 2,000+ verified reviews</span>
          </div>
        </div>
        
        <div className="testimonial-slider-container home-reveal">
          <div 
            className="testimonial-slider-track"
            style={{ transform: `translateX(-${activeReview * 100}%)` }}
          >
            {testimonials.map((t) => (
              <div className="testimonial-slide" key={t.name}>
                <div className="testimonial-card-premium">
                  <div className="testimonial-quote-wrap">
                    <span className="testimonial-quote-mark">"</span>
                    <p className="testimonial-text">{t.quote}</p>
                  </div>
                  <div className="testimonial-meta-row">
                    <div className="testimonial-stars">{'★'.repeat(t.stars)}</div>
                    <div className="testimonial-author">
                      <div className="testimonial-avatar" style={{ background: t.gradient }}>{t.initials}</div>
                      <div className="testimonial-author-info">
                        <strong>{t.name}</strong>
                        <span>{t.role}</span>
                        {t.verified && <span className="verified-badge">✓ Verified Purchase</span>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="testimonial-dots">
            {testimonials.map((_, i) => (
              <button 
                key={i} 
                className={`testimonial-dot ${activeReview === i ? 'active' : ''}`}
                onClick={() => setActiveReview(i)}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ===== Section 6: Newsletter (Premium 2-Column) ===== */}
      <section className="home-section section-alt">
        <div className="newsletter-premium-v2">
          <div className="newsletter-info home-reveal">
            <span className="eyebrow text-success">Newsletter</span>
            <h2>Join the GreenHome Family</h2>
            <p>Subscribe for exclusive content and special offers.</p>
            <ul className="newsletter-benefits">
              {newsletterBenefits.map((b) => (
                <li key={b}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <div className="newsletter-form-wrap home-reveal">
            <form className="newsletter-form-v2" onSubmit={handleSubscribe}>
              <div className="newsletter-form-card">
                <span className="newsletter-form-icon">
                  <svg className="newsletter-svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </span>
                <h3>Get 10% Off</h3>
                <p>Your first order when you subscribe</p>
                <input 
                  type="email" 
                  className="form-control newsletter-input" 
                  placeholder="Enter your email address" 
                  required 
                />
                <button className="btn btn-success newsletter-btn-v2" type="submit">
                  Subscribe Now
                </button>
              </div>
            </form>
            {subscribed && (
              <div className="newsletter-success-toast animate__animated animate__fadeIn">
                🌱 Thank you! Check your inbox for your 10% discount code.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ===== Section 7: Final CTA (Dark Band) ===== */}
      <section className="final-cta-v2">
        <div className="final-cta-content home-reveal">
          <span className="eyebrow eyebrow-light">Ready to get started?</span>
          <h2>Upgrade your kitchen today.</h2>
          <p>Premium quality, free shipping on orders over $50, and hassle-free returns.</p>
          <div className="hero-actions hero-actions-center">
            <Link className="btn btn-light btn-lg hero-btn-primary" to="/products">
              <span>Start Shopping</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </Link>
            <Link className="btn btn-outline-light btn-lg" to="/register">
              Create Account
            </Link>
          </div>
          <p className="final-cta-note-v2">
            <svg className="cta-note-svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="3" width="15" height="13" />
              <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
              <circle cx="5.5" cy="18.5" r="2.5" />
              <circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
            Free shipping on orders over $50 · 
            <svg className="cta-note-svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '12px' }}>
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M16 3h5v5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 21H3v-5" />
            </svg>
            30-day returns
          </p>
        </div>
      </section>

      {/* Back to Top Button */}
      <button 
        className={`back-to-top ${showBackToTop ? 'visible' : ''}`}
        onClick={scrollToTop}
        aria-label="Scroll to top"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m18 15-6-6-6 6"/>
        </svg>
      </button>
    </main>
  );
}

