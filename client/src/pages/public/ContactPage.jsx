import { useState } from 'react';

const faqs = [
  {
    question: 'GreenHome giao hàng trong bao lâu?',
    answer: 'Đơn hàng nội thành thường được xử lý và giao trong 2-4 ngày làm việc tùy địa chỉ.',
  },
  {
    question: 'Tôi có thể đổi trả sản phẩm không?',
    answer: 'Khách hàng có thể gửi yêu cầu đổi trả / hoàn tiền trong khu vực tài khoản sau khi đơn đã giao.',
  },
  {
    question: 'Có hỗ trợ thanh toán khi nhận hàng không?',
    answer: 'Có. Quy trình thanh toán hiện hỗ trợ trả tiền khi nhận hàng và thanh toán online để phù hợp thói quen mua sắm tại Việt Nam.',
  },
];

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [activeFaq, setActiveFaq] = useState(null);

  function handleSubmit(event) {
    event.preventDefault();
    setSubmitted(true);
    event.currentTarget.reset();
    setTimeout(() => setSubmitted(false), 5000);
  }

  return (
    <main className="public-page contact-page-v2">
      <section className="hero-band">
        <span className="eyebrow">Liên hệ</span>
        <h1>GreenHome luôn sẵn sàng hỗ trợ đơn hàng của bạn</h1>
        <p className="hero-lead">
          Gửi thông tin cần hỗ trợ hoặc liên hệ trực tiếp qua hotline để được tư vấn sản phẩm, giao hàng và đổi trả.
        </p>
      </section>

      <section className="home-section section-alt">
        <div className="contact-grid">
          <aside className="surface">
            <span className="eyebrow">Thông tin liên hệ</span>
            <h2>Cửa hàng & hỗ trợ</h2>
            <div className="contact-list">
              <p><strong>Hotline:</strong> 0900 000 004</p>
              <p><strong>Email:</strong> greenhome.kitchen@example.com</p>
              <p><strong>Địa chỉ:</strong> GreenHome Kitchen, Hà Nội, Việt Nam</p>
              <p><strong>Giờ làm việc:</strong> 8:00 - 17:30, Thứ 2 - Thứ 6</p>
            </div>
          </aside>

          <form className="surface contact-form" onSubmit={handleSubmit}>
            <span className="eyebrow">Gửi yêu cầu</span>
            <h2>Nội dung cần hỗ trợ</h2>
            <label className="form-label" htmlFor="contactName">Họ và tên</label>
            <input id="contactName" className="form-control" required />
            <label className="form-label" htmlFor="contactEmail">Email</label>
            <input id="contactEmail" className="form-control" type="email" required />
            <label className="form-label" htmlFor="contactSubject">Chủ đề</label>
            <input id="contactSubject" className="form-control" required />
            <label className="form-label" htmlFor="contactMessage">Nội dung</label>
            <textarea id="contactMessage" className="form-control" rows="5" required />
            <button className="btn btn-success mt-3" type="submit">Gửi yêu cầu</button>
            {submitted && <div className="alert alert-success mt-3">Đã ghi nhận yêu cầu. Đội ngũ hỗ trợ sẽ phản hồi sớm.</div>}
          </form>
        </div>
      </section>

      <section className="home-section">
        <div className="section-heading section-heading-center">
          <span className="eyebrow">Câu hỏi thường gặp</span>
          <h2>Thông tin khách hàng hay cần trước khi mua</h2>
        </div>
        <div className="faq-list">
          {faqs.map((faq, index) => (
            <article className="faq-item" key={faq.question}>
              <button type="button" onClick={() => setActiveFaq(activeFaq === index ? null : index)}>
                <strong>{faq.question}</strong>
                <span>{activeFaq === index ? '-' : '+'}</span>
              </button>
              {activeFaq === index && <p>{faq.answer}</p>}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
