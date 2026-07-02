import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { productService } from '../../services/productService.js';
import { formatCurrency } from '../../utils/formatters.js';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const categories = [
  {
    title: 'Nồi chảo cao cấp',
    image: '/assets/background/cookware.png',
  },
  {
    title: 'Dụng cụ sơ chế',
    image: '/assets/background/kitchen_tools.png',
  },
  {
    title: 'Bàn ăn & phục vụ',
    image: '/assets/background/tableware.png',
  },
  {
    title: 'Lưu trữ thông minh',
    image: '/assets/background/smart_storage.png',
  },
];

const trustItems = [
  { label: 'Xác nhận nhanh trong ngày', icon: '01' },
  { label: 'Giao hàng nội thành 24h', icon: '02' },
  { label: 'Hỗ trợ đổi trả theo chính sách', icon: '03' },
];

const benefits = [
  { title: 'Sản phẩm chọn lọc chất lượng cao', icon: 'GH' },
  { title: 'Giao hàng nhanh và chuyên nghiệp', icon: '24' },
  { title: 'Thanh toán COD và trực tuyến an toàn', icon: 'VN' },
  { title: 'Chính sách đổi trả minh bạch', icon: '7D' },
];

const orderSteps = [
  'Đặt hàng',
  'Đóng gói',
  'Thanh toán',
  'Bồi đắp niềm tin',
  'Hỗ trợ sau mua',
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

const productShowcase = {
  'Green Ceramic Frying Pan': { name: 'Bộ 3 Nồi Chảo Gốm', price: 2499000 },
  'Stainless Sauce Pot': { name: 'Nồi Inox Đáy Dày', price: 1250000 },
  'Minimal Dinner Plate Set': { name: 'Bộ Bàn Ăn Gốm Tối Giản', price: 890000 },
  'Glass Storage Jar': { name: 'Hũ Thủy Tinh Lưu Trữ', price: 150000 },
  'Bamboo Cutting Board': { name: 'Thớt Gỗ Sồi', price: 320000 },
  'Chef Knife 8 Inch': { name: 'Bộ Dao 7 Món', price: 1800000 },
  'Eco Dish Soap': { name: 'Nước Rửa Chén Sinh Học', price: 79000 },
  'Stackable Food Container Set': { name: 'Set 5 Hộp Thủy Tinh', price: 450000 },
};

function HomeProductTile({ product }) {
  const id = product.id || product._id;
  const showcase = productShowcase[product.name] || {};
  const name = showcase.name || product.name;
  const price = showcase.price || product.price;

  return (
    <Link className="home-product-tile" to={`/products/${id}`}>
      <div className="home-product-image">
        {product.imageUrls?.[0] ? (
          <img src={product.imageUrls[0]} alt={name} loading="lazy" />
        ) : (
          <span>Chưa có ảnh</span>
        )}
      </div>
      <strong>{name}</strong>
      <span>{formatCurrency(price)}</span>
      <small>Xem chi tiết</small>
    </Link>
  );
}

export default function HomePage() {
  const pageRef = useRef(null);
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadFeaturedProducts() {
      try {
        const result = await productService.listProducts({ limit: 8 });
        if (!cancelled) setFeaturedProducts(result.items || result || []);
      } catch {
        if (!cancelled) setFeaturedProducts([]);
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
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
              <span>Deal của hôm nay</span>
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
          {categories.map((category) => (
            <Link className="premium-category-card" to="/products" key={category.title}>
              <img src={category.image} alt={category.title} loading="lazy" />
              <strong>{category.title}</strong>
            </Link>
          ))}
        </div>
      </section>

      <section className="premium-section">
        <div className="premium-heading home-reveal">
          <h2>Lựa chọn được quan tâm trong tuần</h2>
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
            <Link className="btn btn-outline-success" to="/products">Đi tới catalog</Link>
          </div>
        )}
      </section>

      <section className="premium-section premium-why">
        <div className="premium-heading home-reveal">
          <span>Vì sao chọn GreenHome</span>
        </div>
        <div className="premium-benefit-grid home-reveal">
          {benefits.map((benefit) => (
            <article className="premium-benefit-card" key={benefit.title}>
              <span>{benefit.icon}</span>
              <strong>{benefit.title}</strong>
            </article>
          ))}
        </div>
        <div className="premium-order-flow home-reveal">
          {orderSteps.map((step) => (
            <div className="premium-order-step" key={step}>
              <span />
              <strong>{step}</strong>
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
