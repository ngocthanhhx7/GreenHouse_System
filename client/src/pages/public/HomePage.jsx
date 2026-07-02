import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import ProductCard from '../../components/product/ProductCard.jsx';
import { productService } from '../../services/productService.js';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const categories = [
  {
    title: 'Nồi chảo cao cấp',
    description: 'Chảo chống dính, nồi inox và bộ nấu ăn bền đẹp cho bữa cơm hằng ngày.',
    image: '/assets/background/photo-1605106250963-ffda6d2a4b32.avif',
  },
  {
    title: 'Dụng cụ sơ chế',
    description: 'Dao, thớt, kẹp gắp và dụng cụ chuẩn bị nguyên liệu gọn tay.',
    image: '/assets/background/photo-1664329182766-2f7759d13f78.avif',
  },
  {
    title: 'Bàn ăn & phục vụ',
    description: 'Chén, đĩa, ly và phụ kiện giúp bàn ăn gia đình chỉn chu hơn.',
    image: '/assets/background/photo-1705453168890-6c244eb82942.avif',
  },
  {
    title: 'Lưu trữ thông minh',
    description: 'Hộp đựng, kệ bếp và giải pháp tối ưu không gian căn hộ Việt.',
    image: '/assets/background/photo-1723282608501-38e2ba4c0933.avif',
  },
];

const commitments = [
  { value: '24h', label: 'Xác nhận đơn trong ngày làm việc' },
  { value: '2-4 ngày', label: 'Giao hàng tại các thành phố lớn' },
  { value: '7 ngày', label: 'Hỗ trợ đổi trả theo chính sách' },
];

const benefits = [
  'Sản phẩm chọn lọc cho căn bếp Việt',
  'Theo dõi trạng thái đơn hàng rõ ràng',
  'Thanh toán COD hoặc online linh hoạt',
  'Đội ngũ hỗ trợ sau bán hàng',
];

const reviews = [
  {
    quote: 'Bộ nồi chắc tay, đóng gói kỹ và giao đúng hẹn. Mình theo dõi trạng thái đơn rất dễ.',
    name: 'Nguyễn Minh Anh',
    role: 'Khách hàng tại Hà Nội',
  },
  {
    quote: 'Ảnh sản phẩm rõ, giá hiển thị dễ hiểu, đặt hàng nhanh hơn nhiều so với bản cũ.',
    name: 'Trần Gia Bảo',
    role: 'Khách hàng tại Đà Nẵng',
  },
  {
    quote: 'Khu vực đổi trả và hỗ trợ sau mua làm mình yên tâm hơn khi mua đồ bếp online.',
    name: 'Lê Phương Linh',
    role: 'Khách hàng tại TP. Hồ Chí Minh',
  },
];

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
        y: 24,
        duration: 0.7,
        ease: 'power3.out',
        stagger: 0.08,
      });

      gsap.utils.toArray('.home-reveal', pageRef.current).forEach((element) => {
        gsap.from(element, {
          autoAlpha: 0,
          y: 24,
          duration: 0.65,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: element,
            start: 'top 90%',
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

  const visibleProducts = featuredProducts.slice(0, 4);

  return (
    <main className="home-page home-commerce" ref={pageRef}>
      <section className="home-hero commerce-hero">
        <div className="hero-copy">
          <span className="hero-badge home-animate">Bộ sưu tập bếp xanh 2026</span>
          <h1 className="home-animate">
            Căn bếp xanh cho gia đình Việt hiện đại
          </h1>
          <p className="hero-lead home-animate">
            Mua sắm dụng cụ bếp, nồi chảo và giải pháp lưu trữ được chọn lọc, hiển thị giá rõ ràng và theo dõi đơn hàng minh bạch.
          </p>
          <form className="hero-search home-animate" onSubmit={handleSearch}>
            <label className="visually-hidden" htmlFor="homeSearch">Tìm sản phẩm</label>
            <input
              id="homeSearch"
              className="form-control"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Tìm nồi chống dính, hộp đựng, dao bếp..."
            />
            <button className="btn btn-success" type="submit">Tìm kiếm</button>
          </form>
          <div className="hero-actions home-animate">
            <Link className="btn btn-success btn-lg" to="/products">Mua sắm ngay</Link>
            <Link className="btn btn-outline-success btn-lg" to="/about">Tìm hiểu GreenHome</Link>
          </div>
          <div className="trust-strip home-animate">
            {commitments.map((item) => (
              <div className="trust-strip-card" key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-media home-animate">
          <img src="/assets/banner/banner.png" alt="Bộ dụng cụ bếp GreenHome Kitchen" />
          <div className="hero-media-note">
            <strong>Gợi ý hôm nay</strong>
            <span>Nồi chảo, dụng cụ sơ chế và hộp lưu trữ đang được khách hàng quan tâm.</span>
          </div>
        </div>
      </section>

      <section className="home-section section-alt">
        <div className="section-heading section-heading-center home-reveal">
          <span className="eyebrow">Danh mục nổi bật</span>
          <h2>Chọn nhanh theo nhu cầu căn bếp</h2>
          <p>Mỗi danh mục dẫn khách hàng vào catalog bằng nhãn rõ nghĩa, dễ scan và dễ so sánh.</p>
        </div>
        <div className="collection-grid-v2 commerce-category-grid">
          {categories.map((category) => (
            <Link className="collection-card-v2" to="/products" key={category.title}>
              <img src={category.image} alt={category.title} loading="lazy" />
              <div className="collection-overlay-v2">
                <h3>{category.title}</h3>
                <p>{category.description}</p>
                <span className="collection-cta">Xem sản phẩm</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="section-heading-row home-reveal">
          <div className="section-heading">
            <span className="eyebrow">Sản phẩm bán chạy</span>
            <h2>Lựa chọn được quan tâm trong tuần</h2>
            <p>Ưu tiên sản phẩm còn hàng, giá rõ ràng và phù hợp bữa cơm gia đình.</p>
          </div>
          <Link to="/products" className="view-all-link">Xem tất cả sản phẩm</Link>
        </div>

        {productsLoading && (
          <div className="featured-grid">
            {Array.from({ length: 4 }).map((_, index) => (
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
          <div className="featured-grid home-reveal">
            {visibleProducts.map((product) => (
              <ProductCard key={product.id || product._id} product={product} />
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

      <section className="home-section section-alt commerce-benefits">
        <div className="section-heading home-reveal">
          <span className="eyebrow">Vì sao chọn GreenHome</span>
          <h2>Mua đồ bếp online nhưng vẫn cần cảm giác chắc chắn</h2>
          <p>Trang mua hàng cần giúp khách hiểu nhanh: sản phẩm gì, giá bao nhiêu, giao thế nào và sau mua ai hỗ trợ.</p>
        </div>
        <div className="why-us-bar">
          {benefits.map((benefit, index) => (
            <div className="why-us-item" key={benefit}>
              <div className="why-us-icon">{String(index + 1).padStart(2, '0')}</div>
              <div className="why-us-text">
                <strong>{benefit}</strong>
                <span>Thiết kế để khách hàng Việt dễ hiểu và dễ ra quyết định.</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="home-section order-commitment">
        <div className="section-heading section-heading-center home-reveal">
          <span className="eyebrow">Cam kết xử lý đơn hàng</span>
          <h2>Từ đặt hàng đến giao nhận đều có trạng thái rõ ràng</h2>
          <p>Khách hàng nhìn thấy tiến độ đơn mua; nhân viên và kho xử lý ở khu vực vận hành riêng, không làm rối trải nghiệm mua hàng.</p>
        </div>
        <div className="commitment-steps home-reveal">
          {['Đặt hàng', 'Xác nhận', 'Chuẩn bị hàng', 'Giao hàng', 'Hỗ trợ sau mua'].map((step, index) => (
            <div className="commitment-step" key={step}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{step}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="home-section section-alt">
        <div className="section-heading section-heading-center home-reveal">
          <span className="eyebrow">Khách hàng nói gì</span>
          <h2>Niềm tin đến từ trải nghiệm mua hàng rõ ràng</h2>
        </div>
        <div className="testimonial-grid home-reveal">
          {reviews.map((review) => (
            <article className="testimonial-card-premium" key={review.name}>
              <div className="testimonial-stars">★★★★★</div>
              <p className="testimonial-text">"{review.quote}"</p>
              <div className="testimonial-author-info">
                <strong>{review.name}</strong>
                <span>{review.role}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="final-cta-v2">
        <div className="final-cta-content home-reveal">
          <span className="eyebrow eyebrow-light">Bắt đầu mua sắm</span>
          <h2>Sẵn sàng nâng cấp căn bếp của bạn?</h2>
          <p>Khám phá catalog sản phẩm bếp GreenHome với giá VND, danh mục rõ ràng và quy trình đặt hàng dễ theo dõi.</p>
          <div className="hero-actions hero-actions-center">
            <Link className="btn btn-light btn-lg" to="/products">Mua sắm ngay</Link>
            <Link className="btn btn-outline-light btn-lg" to="/register">Tạo tài khoản</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
