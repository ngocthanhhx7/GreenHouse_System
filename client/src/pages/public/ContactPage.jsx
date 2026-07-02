import { useState } from 'react';
import { Link } from 'react-router-dom';

const GOOGLE_MAPS_URL = 'https://maps.app.goo.gl/DUDu37Cr5h13RsqFA';
const GOOGLE_MAPS_EMBED_URL = 'https://www.google.com/maps?q=H%C3%A0%20N%E1%BB%99i%2C%20Vi%E1%BB%87t%20Nam&output=embed';

const contactItems = [
  {
    icon: '⌖',
    label: 'Địa chỉ cửa hàng',
    lines: ['GreenHome Kitchen, Hà Nội, Việt Nam'],
  },
  {
    icon: '☎',
    label: 'Điện thoại',
    lines: ['0856 464 980', 'Thứ 2 - Chủ nhật / 8:00 - 18:00'],
  },
  {
    icon: '✉',
    label: 'Email',
    lines: ['kitchennhas@greenhome.com'],
  },
];

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event) {
    event.preventDefault();
    setSubmitted(true);
    event.currentTarget.reset();
    setTimeout(() => setSubmitted(false), 5000);
  }

  return (
    <main className="public-page contact-story-page">
      <section className="contact-hero" aria-labelledby="contact-title">
        <h1 id="contact-title">Liên hệ với chúng tôi</h1>
        <p>
          Chúng tôi luôn sẵn sàng lắng nghe và hỗ trợ bạn. Vui lòng điền thông
          tin bên dưới hoặc liên hệ trực tiếp qua các kênh thông tin.
        </p>
      </section>

      <section className="contact-main-grid" aria-label="Thông tin liên hệ và biểu mẫu">
        <aside className="contact-info-panel">
          <h2>Thông tin liên hệ</h2>
          <div className="contact-info-list">
            {contactItems.map((item) => (
              <article className="contact-info-item" key={item.label}>
                <span className="contact-info-icon" aria-hidden="true">{item.icon}</span>
                <div>
                  <strong>{item.label}</strong>
                  {item.lines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="contact-socials">
            <span>Kết nối với chúng tôi</span>
            <div className="contact-social-row" aria-label="Kênh mạng xã hội">
              <a href={GOOGLE_MAPS_URL} target="_blank" rel="noreferrer" aria-label="Mở vị trí GreenHome trên bản đồ">◎</a>
              <a href="mailto:kitchennhas@greenhome.com" aria-label="Gửi email cho GreenHome">↗</a>
              <a href="tel:0856464980" aria-label="Gọi GreenHome Kitchen">☎</a>
            </div>
          </div>
        </aside>

        <form className="contact-message-card" onSubmit={handleSubmit}>
          <h2>Gửi tin nhắn</h2>
          <div className="contact-form-grid">
            <label htmlFor="contactName">
              Họ và tên
              <input id="contactName" name="name" placeholder="Nguyễn Văn A" required />
            </label>
            <label htmlFor="contactEmail">
              Email
              <input id="contactEmail" name="email" type="email" placeholder="email@example.com" required />
            </label>
          </div>
          <label htmlFor="contactSubject">
            Chủ đề
            <input id="contactSubject" name="subject" placeholder="Vấn đề bạn cần hỗ trợ" required />
          </label>
          <label htmlFor="contactMessage">
            Nội dung tin nhắn
            <textarea id="contactMessage" name="message" rows="6" placeholder="Xin chào, tôi cần tư vấn về..." required />
          </label>
          <button type="submit">Gửi tin nhắn</button>
          {submitted && <p className="contact-success">Đã ghi nhận tin nhắn. GreenHome sẽ phản hồi bạn trong thời gian sớm nhất.</p>}
        </form>
      </section>

      <section className="contact-location-section" aria-labelledby="location-title">
        <div className="contact-map-panel">
          <iframe
            title="Vị trí GreenHome Kitchen tại Hà Nội"
            src={GOOGLE_MAPS_EMBED_URL}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="contact-map-card">
            <span aria-hidden="true">⌖</span>
            <strong id="location-title">Hà Nội, Việt Nam</strong>
            <a href={GOOGLE_MAPS_URL} target="_blank" rel="noreferrer">Mở Google Maps</a>
          </div>
        </div>
      </section>

      <section className="contact-faq-cta" aria-labelledby="quick-question-title">
        <h2 id="quick-question-title">Bạn có câu hỏi nhanh?</h2>
        <p>Hãy xem qua danh sách các câu hỏi thường gặp, có thể câu trả lời bạn cần đã ở đó.</p>
        <Link to="/support">Xem trung tâm hỗ trợ & FAQ →</Link>
      </section>
    </main>
  );
}
