import { Link } from 'react-router-dom';

const values = [
  {
    title: 'Chọn lọc cho gia đình Việt',
    description: 'Tập trung vào dụng cụ bếp bền, dễ dùng và phù hợp thói quen nấu ăn hằng ngày.',
  },
  {
    title: 'Minh bạch khi mua hàng',
    description: 'Giá, tồn kho, trạng thái đơn và hỗ trợ sau mua được trình bày rõ ràng.',
  },
  {
    title: 'Vận hành có kiểm soát',
    description: 'Đơn hàng, kho, đổi trả và thông báo được tách thành khu vực nghiệp vụ riêng.',
  },
];

const milestones = [
  { year: '2022', title: 'Khởi đầu tại Hà Nội', desc: 'GreenHome Kitchen bắt đầu với nhóm sản phẩm nồi chảo và dụng cụ bếp gia đình.' },
  { year: '2024', title: 'Mở rộng lưu trữ thông minh', desc: 'Bổ sung hộp đựng, kệ bếp và giải pháp tối ưu không gian căn hộ.' },
  { year: '2026', title: 'Hoàn thiện hệ thống e-commerce', desc: 'Kết nối catalog, giỏ hàng, thanh toán, xử lý đơn, kho và hỗ trợ sau bán.' },
];

export default function AboutPage() {
  return (
    <main className="public-page about-page-v2">
      <section className="hero-band">
        <span className="eyebrow">Về GreenHome Kitchen</span>
        <h1>Cửa hàng dụng cụ bếp hướng tới trải nghiệm mua hàng rõ ràng</h1>
        <p className="hero-lead">
          GreenHome Kitchen không chỉ bán sản phẩm nhà bếp. Dự án còn mô phỏng một hệ thống vận hành đầy đủ: catalog, đơn hàng, kho, đổi trả, hỗ trợ và báo cáo.
        </p>
        <div className="hero-actions hero-actions-center">
          <Link className="btn btn-success btn-lg" to="/products">Xem sản phẩm</Link>
          <Link className="btn btn-outline-success btn-lg" to="/contact">Liên hệ hỗ trợ</Link>
        </div>
      </section>

      <section className="home-section section-alt">
        <div className="section-heading section-heading-center">
          <span className="eyebrow">Giá trị cốt lõi</span>
          <h2>Thiết kế cho cả khách hàng và đội vận hành</h2>
          <p>Mỗi phần của hệ thống cần có mục tiêu rõ, không lẫn trải nghiệm mua hàng với màn hình xử lý nội bộ.</p>
        </div>
        <div className="why-us-bar">
          {values.map((value, index) => (
            <article className="why-us-item" key={value.title}>
              <div className="why-us-icon">{String(index + 1).padStart(2, '0')}</div>
              <div className="why-us-text">
                <strong>{value.title}</strong>
                <span>{value.description}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="section-heading section-heading-center">
          <span className="eyebrow">Hành trình</span>
          <h2>Từ cửa hàng sản phẩm bếp đến hệ thống quản lý đơn hàng</h2>
        </div>
        <div className="commitment-steps">
          {milestones.map((item) => (
            <article className="commitment-step" key={item.year}>
              <span>{item.year.slice(2)}</span>
              <strong>{item.title}</strong>
              <p>{item.desc}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
