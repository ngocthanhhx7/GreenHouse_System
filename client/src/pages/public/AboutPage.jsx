const values = [
  {
    icon: '✓',
    title: 'Chất lượng tuyển chọn',
    description: 'Khắt khe trong từng khâu lựa chọn, chỉ mang đến những sản phẩm đạt tiêu chuẩn cao nhất về độ bền và an toàn.',
  },
  {
    icon: '◇',
    title: 'Minh bạch & Tin cậy',
    description: 'Mọi thông tin về nguồn gốc, chất liệu, giá và chính sách đều được công khai rõ ràng để khách hàng yên tâm mua sắm.',
  },
  {
    icon: '☘',
    title: 'Bền vững',
    description: 'Ưu tiên vật liệu thân thiện, thiết kế dùng lâu dài và các lựa chọn phù hợp với nhịp sống xanh của gia đình Việt.',
  },
];

export default function AboutPage() {
  return (
    <main className="public-page about-story-page">
      <section className="about-hero-grid" aria-labelledby="about-title">
        <div className="about-hero-copy">
          <h1 id="about-title">Câu chuyện về GreenHome Kitchen</h1>
          <p>
            Mang linh hồn của căn bếp xanh vào mỗi gia đình Việt. Chúng tôi tin
            rằng bữa ăn ngon bắt đầu từ những vật dụng nhà bếp chất lượng, an
            toàn và thân thiện với môi trường.
          </p>
        </div>
        <figure className="about-hero-media">
          <img src="/assets/banner/banner.png" alt="Không gian bếp sáng hiện đại của GreenHome Kitchen" />
        </figure>
      </section>

      <section className="about-mission-section" aria-labelledby="mission-title">
        <div className="about-mission-grid">
          <figure className="about-mission-media">
            <img src="/assets/background/cookware.png" alt="Bộ nồi chảo được tuyển chọn cho căn bếp gia đình" />
          </figure>
          <div className="about-mission-copy">
            <span className="section-kicker" aria-hidden="true" />
            <h2 id="mission-title">Sứ mệnh của chúng tôi</h2>
            <p>
              Tại GreenHome Kitchen, sứ mệnh của chúng tôi không chỉ dừng lại ở
              việc cung cấp đồ dùng nhà bếp. Chúng tôi mong muốn truyền cảm hứng
              cho những người yêu ẩm thực, giúp họ kiến tạo không gian sống tiện
              nghi, tinh tế và bền vững.
            </p>
            <p>
              Mỗi sản phẩm đều được tuyển chọn kỹ lưỡng từ những thương hiệu uy
              tín, ưu tiên chất liệu an toàn, thiết kế công thái học và khả năng
              sử dụng lâu dài trong căn bếp Việt.
            </p>
          </div>
        </div>
      </section>

      <section className="about-values-section" aria-labelledby="values-title">
        <div className="about-section-heading">
          <h2 id="values-title">Giá trị cốt lõi</h2>
          <p>Những nguyên tắc định hình cách chúng tôi phục vụ và mang đến giá trị cho căn bếp của bạn.</p>
        </div>
        <div className="about-values-grid">
          {values.map((value) => (
            <article className="about-value-card" key={value.title}>
              <span className="about-value-icon" aria-hidden="true">{value.icon}</span>
              <h3>{value.title}</h3>
              <p>{value.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
