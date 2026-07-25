import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { productService } from '../../services/productService.js';
import { categoryService } from '../../services/categoryService.js';
import { resolveMediaUrl } from '../../services/apiClient.js';
import { formatCurrency } from '../../utils/formatters.js';
import { getHomeProductDisplay } from './homeProductDisplay.js';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const categoryImages = [
  '/assets/background/cookware.png',
  '/assets/background/kitchen_tools.png',
  '/assets/background/tableware.png',
  '/assets/background/smart_storage.png',
];

const trustItems = [
  { label: 'Xác nhận nhanh trong ngày', icon: '01' },
  { label: 'Giao hàng nội thành 24h', icon: '02' },
  { label: 'Hỗ trợ đổi trả theo chính sách', icon: '03' },
];

const BenefitIcons = {
  award: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="benefit-icon-svg">
      <circle cx="12" cy="8" r="7" />
      <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
      <polyline points="9 8 11 10 15 6" />
    </svg>
  ),
  delivery: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="benefit-icon-svg">
      <path d="M5 6h11v10H5z" />
      <path d="M16 8h4l3 3v5h-7z" />
      <circle cx="9" cy="18" r="2" />
      <circle cx="19" cy="18" r="2" />
      <path d="M1 9h2M0 12h3" />
    </svg>
  ),
  card: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="benefit-icon-svg">
      <rect x="2" y="5" width="20" height="14" rx="2" ry="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
      <rect x="5" y="14" width="3" height="2" />
    </svg>
  ),
  return: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="benefit-icon-svg">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <polyline points="3 3 3 8 8 8" />
      <path d="M8 12l4-2 4 2-4 2-4-2zM8 12v4l4 2v-4M16 12v4l-4 2" />
    </svg>
  ),
};

const StepIcons = {
  cart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="step-icon-svg">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  ),
  box: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="step-icon-svg">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="M3.27 6.96L12 12.01l8.73-5.05" />
      <path d="M12 22.08V12" />
    </svg>
  ),
  dollar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="step-icon-svg">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="step-icon-svg">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  support: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="step-icon-svg">
      <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />
    </svg>
  ),
};

const benefits = [
  { title: 'Sản phẩm chọn lọc chất lượng cao', icon: 'award' },
  { title: 'Giao hàng nhanh và chuyên nghiệp', icon: 'delivery' },
  { title: 'Thanh toán COD và trực tuyến an toàn', icon: 'card' },
  { title: 'Chính sách đổi trả minh bạch', icon: 'return' },
];

const orderSteps = [
  { label: 'Chọn sản phẩm', icon: 'cart' },
  { label: 'Đăng nhập', icon: 'user' },
  { label: 'Đặt hàng & thanh toán', icon: 'dollar' },
  { label: 'Đóng gói & giao hàng', icon: 'box' },
  { label: 'Theo dõi & hậu mãi', icon: 'support' },
];

const reviews = [
  {
    quote: 'GreenHome giúp căn bếp gia đình mình gọn hơn, đặt hàng cũng rất dễ theo dõi.',
    name: 'Nguyễn Minh Anh',
    city: 'Hà Nội',
    avatar: '/assets/icon/user/profile-circle.svg',
  },
  {
    quote: 'Mình thích phần giá rõ ràng và sản phẩm đúng hình. Nhận hàng đóng gói rất chắc.',
    name: 'Trần Gia Bảo',
    city: 'Đà Nẵng',
    avatar: '/assets/icon/user/profile-tick.svg',
  },
  {
    quote: 'Hỗ trợ sau mua phản hồi nhanh, phù hợp với gia đình hay mua đồ bếp online.',
    name: 'Lê Phương Linh',
    city: 'TP. Hồ Chí Minh',
    avatar: '/assets/icon/user/profile-2user.svg',
  },
];

function HomeProductTile({ product }) {
  const [imageError, setImageError] = useState(false);
  const id = product.id || product._id;
  const display = getHomeProductDisplay(product);

  return (
    <Link className="home-product-tile" to={`/products/${id}`}>
      <div className="home-product-image">
        {product.imageUrls?.[0] && !imageError ? (
          <img src={resolveMediaUrl(product.imageUrls[0])} alt={display.name} loading="lazy" onError={() => setImageError(true)} />
        ) : (
          <span>Chưa có ảnh</span>
        )}
      </div>
      <strong>{display.name}</strong>
      <span>{formatCurrency(display.price)}</span>
      <small>Xem chi tiết</small>
    </Link>
  );
}

export default function HomePage() {
  const pageRef = useRef(null);
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [categories, setCategories] = useState([]);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [sectionLabel, setSectionLabel] = useState('Bán chạy');
  const [productsLoading, setProductsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadFeaturedProducts() {
      const [categoryResult, rankingResult] = await Promise.allSettled([
        categoryService.listCategories(),
        productService.listBestSellers({ limit: 6 }),
      ]);
      if (cancelled) return;
      if (categoryResult.status === 'fulfilled') {
        setCategories(categoryResult.value || []);
      }
      if (rankingResult.status === 'fulfilled') {
        setFeaturedProducts(rankingResult.value.items || []);
        setSectionLabel(rankingResult.value.label || 'Bán chạy');
      } else {
        setFeaturedProducts([]);
      }
      setProductsLoading(false);
    }

    loadFeaturedProducts();
    return () => {
      cancelled = true;
    };
  }, []);

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduceMotion) {
        gsap.set('.home-animate, .home-reveal', { autoAlpha: 1, y: 0 });
        return;
      }

      gsap.from('.home-animate', {
        autoAlpha: 0,
        y: 18,
        duration: 0.55,
        ease: 'power3.out',
        stagger: 0.06,
      });

      gsap.utils.toArray('.home-reveal', pageRef.current).forEach((element) => {
        gsap.from(element, {
          autoAlpha: 0,
          y: 20,
          duration: 0.55,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: element,
            start: 'top 92%',
            once: true,
          },
        });
      });
    },
    { scope: pageRef }
  );

  function handleSearch(event) {
    event.preventDefault();
    const query = keyword.trim();
    navigate(query ? `/products?keyword=${encodeURIComponent(query)}` : '/products');
  }

  const visibleProducts = featuredProducts.slice(0, 6);

  return (
    <main className="home-page home-commerce home-premium" ref={pageRef}>
      <section className="premium-hero">
        <div className="premium-hero-copy">
          <h1 className="home-animate">Căn bếp xanh cho gia đình Việt hiện đại</h1>
          <form className="premium-search home-animate" onSubmit={handleSearch}>
            <label className="visually-hidden" htmlFor="homeSearch">Tìm sản phẩm</label>
            <input
              id="homeSearch"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Tìm nồi chống dính, hộp đựng thực phẩm..."
            />
            <button type="submit">Tìm kiếm</button>
          </form>
          <div className="premium-hero-actions home-animate">
            <Link className="btn btn-success btn-lg" to="/products">Mua sắm ngay</Link>
            <Link className="btn btn-outline-success btn-lg" to="/about">Tìm hiểu GreenHome</Link>
          </div>
          <div className="premium-trust-row home-animate">
            {trustItems.map((item) => (
              <div className="premium-trust-item" key={item.label}>
                <span>{item.icon}</span>
                <strong>{item.label}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="premium-hero-media home-animate">
          <img src="/assets/banner/banner.png" alt="Căn bếp GreenHome sáng và hiện đại" />
          <div className="premium-deal-card">
            <img src="/assets/background/cookware.png" alt="Bộ nồi chảo GreenHome" />
            <div>
              <span>Ưu đãi hôm nay</span>
              <strong>Giảm 30% cho Bộ nồi sứ cao cấp</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="premium-section premium-section-compact">
        <div className="premium-heading home-reveal">
          <h2>Chọn nhanh theo nhu cầu căn bếp</h2>
        </div>
        <div className="premium-category-grid home-reveal">
          {categories.slice(0, 4).map((category, index) => (
            <Link
              className="premium-category-card"
              to={`/products?categoryId=${category.id}`}
              key={category.id}
            >
              <img src={categoryImages[index % categoryImages.length]} alt={category.name} loading="lazy" />
              <strong>{category.name}</strong>
            </Link>
          ))}
        </div>
      </section>

      <section className="premium-section">
        <div className="premium-heading home-reveal" aria-label="Lựa chọn được quan tâm trong tuần">
          <h2>{sectionLabel}</h2>
        </div>

        {productsLoading && (
          <div className="premium-product-row">
            {Array.from({ length: 6 }).map((_, index) => (
              <div className="product-skeleton" key={index}>
                <div className="product-skeleton-image" />
                <div className="product-skeleton-body">
                  <div className="product-skeleton-line" />
                  <div className="product-skeleton-line" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!productsLoading && visibleProducts.length > 0 && (
          <div className="premium-product-row home-reveal">
            {visibleProducts.map((product) => (
              <HomeProductTile key={product.id || product._id} product={product} />
            ))}
          </div>
        )}

        {!productsLoading && visibleProducts.length === 0 && (
          <div className="featured-empty home-reveal">
            <h3>Chưa có sản phẩm hiển thị</h3>
            <p>Hãy seed dữ liệu mẫu hoặc thêm sản phẩm trong khu vực quản trị để Home hiển thị đầy đủ.</p>
            <Link className="btn btn-outline-success" to="/products">Xem tất cả sản phẩm</Link>
          </div>
        )}
      </section>

      <section id="quy-trinh-mua-hang" className="premium-section premium-why">
        <div className="premium-heading home-reveal">
          <span>Vì sao chọn GreenHome</span>
        </div>
        <div className="premium-benefit-grid home-reveal">
          {benefits.map((benefit) => (
            <article className="premium-benefit-card" key={benefit.title}>
              <span>{BenefitIcons[benefit.icon]}</span>
              <strong>{benefit.title}</strong>
            </article>
          ))}
        </div>
        <div className="premium-order-flow home-reveal">
          {orderSteps.map((step, index) => (
            <div className={`premium-order-step ${index === 0 ? 'active' : ''}`} key={step.label}>
              <span>{StepIcons[step.icon]}</span>
              <strong>{step.label}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="premium-section">
        <div className="premium-heading home-reveal">
          <h2>Niềm tin đến từ trải nghiệm mua hàng rõ ràng</h2>
        </div>
        <div className="premium-review-grid home-reveal">
          {reviews.map((review) => (
            <article className="premium-review-card" key={review.name}>
              <img src={review.avatar} alt={review.name} loading="lazy" />
              <div>
                <p>{review.quote}</p>
                <strong>{review.name}</strong>
                <span>{review.city}</span>
                <small>★★★★★</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="premium-final-cta home-reveal">
        <h2>Sẵn sàng nâng cấp căn bếp của bạn?</h2>
        <div>
          <Link className="btn btn-light" to="/products">Mua sắm ngay</Link>
          <Link className="btn btn-outline-light" to="/register">Tạo tài khoản</Link>
        </div>
      </section>
    </main>
  );
}
