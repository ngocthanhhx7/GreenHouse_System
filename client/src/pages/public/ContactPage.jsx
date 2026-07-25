import { useState } from 'react';
import { contactService } from '../../services/contactService.js';

const GOOGLE_MAPS_URL = 'https://maps.app.goo.gl/DUDu37Cr5h13RsqFA';
const GOOGLE_MAPS_EMBED_URL = 'https://www.google.com/maps?q=H%C3%A0%20N%E1%BB%99i%2C%20Vi%E1%BB%87t%20Nam&output=embed';

const ContactIcons = {
  pin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="contact-icon-svg">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="contact-icon-svg">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  mail: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="contact-icon-svg">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
};

const contactItems = [
  {
    icon: 'pin',
    label: 'Địa chỉ cửa hàng',
    lines: ['GreenHome Kitchen, Hà Nội, Việt Nam'],
  },
  {
    icon: 'phone',
    label: 'Điện thoại',
    lines: ['0856 464 980', 'Thứ 2 - Chủ nhật / 8:00 - 18:00'],
  },
  {
    icon: 'mail',
    label: 'Email',
    lines: ['kitchennhas@greenhome.com'],
  },
];

const EMPTY_FORM = {
  name: '',
  email: '',
  subject: '',
  message: '',
};

export default function ContactPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitted(false);
    setError('');
    setSubmitting(true);
    try {
      await contactService.submit(form);
      setForm(EMPTY_FORM);
      setSubmitted(true);
    } catch (requestError) {
      const fieldMessage = requestError?.errors?.[0]?.message;
      setError(fieldMessage || requestError?.message || 'Không thể gửi tin nhắn. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
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
                <span className="contact-info-icon" aria-hidden="true">{ContactIcons[item.icon]}</span>
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
              <a href={GOOGLE_MAPS_URL} target="_blank" rel="noreferrer" aria-label="Mở vị trí GreenHome trên bản đồ">
                {ContactIcons.pin}
              </a>
              <a href="mailto:kitchennhas@greenhome.com" aria-label="Gửi email cho GreenHome">
                {ContactIcons.mail}
              </a>
              <a href="tel:0856464980" aria-label="Gọi GreenHome Kitchen">
                {ContactIcons.phone}
              </a>
            </div>
          </div>
        </aside>

        <form id="contact-form" className="contact-message-card" onSubmit={handleSubmit}>
          <h2>Gửi tin nhắn</h2>
          <div className="contact-form-grid">
            <label htmlFor="contactName">
              Họ và tên
              <input
                id="contactName"
                name="name"
                value={form.name}
                onChange={handleChange}
                maxLength="120"
                placeholder="Nguyễn Văn A"
                required
              />
            </label>
            <label htmlFor="contactEmail">
              Email
              <input
                id="contactEmail"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="email@example.com"
                required
              />
            </label>
          </div>
          <label htmlFor="contactSubject">
            Chủ đề
            <input
              id="contactSubject"
              name="subject"
              value={form.subject}
              onChange={handleChange}
              maxLength="160"
              placeholder="Vấn đề bạn cần hỗ trợ"
              required
            />
          </label>
          <label htmlFor="contactMessage">
            Nội dung tin nhắn
            <textarea
              id="contactMessage"
              name="message"
              rows="6"
              value={form.message}
              onChange={handleChange}
              minLength="10"
              maxLength="5000"
              placeholder="Xin chào, tôi cần tư vấn về..."
              required
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Đang gửi...' : 'Gửi tin nhắn'}
          </button>
          {error && <p className="contact-error" role="alert">{error}</p>}
          {submitted && (
            <p className="contact-success" role="status">
              Đã ghi nhận tin nhắn. GreenHome sẽ phản hồi bạn trong thời gian sớm nhất.
            </p>
          )}
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
            <span aria-hidden="true">{ContactIcons.pin}</span>
            <strong id="location-title">Hà Nội, Việt Nam</strong>
            <a href={GOOGLE_MAPS_URL} target="_blank" rel="noreferrer">Mở Google Maps</a>
          </div>
        </div>
      </section>

      <section className="contact-faq-cta" aria-labelledby="quick-question-title">
        <h2 id="quick-question-title">Bạn có câu hỏi nhanh?</h2>
        <p>Gửi câu hỏi ngay trong biểu mẫu, GreenHome sẽ tiếp nhận và phản hồi qua email.</p>
        <a href="#contact-form">Gửi câu hỏi cho GreenHome →</a>
      </section>
    </main>
  );
}
