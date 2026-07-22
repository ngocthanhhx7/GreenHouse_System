const EmailOutbox = require('../models/emailOutbox.model');
const { decryptOtp } = require('./passwordReset.service');

function renderEmail(entry, otpSecret) {
  const payload = entry.payload || {};
  if (entry.eventType === 'PASSWORD_RESET_OTP_REQUESTED') {
    const otp = decryptOtp(payload.encryptedOtp, otpSecret);
    return {
      subject: 'Mã OTP đặt lại mật khẩu GreenHome Kitchen',
      text: `Mã OTP của bạn là ${otp}. Mã có hiệu lực trong ${payload.expiresInMinutes || 10} phút. Không chia sẻ mã này với bất kỳ ai.`,
    };
  }
  if (entry.eventType === 'CONTACT_SUBMISSION') {
    return {
      subject: `Liên hệ mới: ${payload.subject || payload.name || 'khách hàng GreenHome'}`,
      text: `Họ tên: ${payload.name || ''}\nEmail: ${payload.email || ''}\nSố điện thoại: ${payload.phone || ''}\nChủ đề: ${payload.subject || ''}\nNội dung: ${payload.message || ''}`,
    };
  }
  if (entry.eventType === 'ORDER_CREATED') {
    return {
      subject: `GreenHome đã nhận đơn hàng ${payload.orderCode || ''}`.trim(),
      text: `Đơn hàng ${payload.orderCode || ''} đã được tạo thành công. Tổng thanh toán: ${payload.totalAmount || 0} VND.`,
    };
  }
  throw new Error(`Unsupported email event: ${entry.eventType}`);
}

function createEmailProvider(providerName = process.env.MAIL_PROVIDER || 'disabled', options = {}) {
  if (providerName === 'fake') return { async send() { return { accepted: true }; } };
  if (providerName !== 'smtp') return { async send() { return { accepted: false, disabled: true }; } };

  const host = options.host || process.env.SMTP_HOST;
  const port = Number(options.port || process.env.SMTP_PORT || 465);
  const secure = options.secure ?? String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true';
  const user = options.user || process.env.SMTP_USER;
  const pass = options.pass || process.env.SMTP_PASS;
  const from = options.from || process.env.MAIL_FROM || user;
  const otpSecret = options.otpSecret || process.env.RESET_OTP_SECRET || process.env.JWT_SECRET || 'greenhome-development-otp-secret';
  let transporter = options.transporter;

  if (!transporter) {
    if (!host || !user || !pass || !from) throw new Error('Thiếu cấu hình SMTP_HOST, SMTP_USER, SMTP_PASS hoặc MAIL_FROM.');
    // Loaded only when SMTP is enabled so tests and local disabled mode stay offline.
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  }

  return {
    async send(entry) {
      const content = renderEmail(entry, otpSecret);
      const result = await transporter.sendMail({ from, to: entry.recipient, ...content });
      return { accepted: true, messageId: result && result.messageId };
    },
  };
}

function createModelEmailOutboxRepository() {
  return {
    async findByIdempotencyKey(key, session) {
      const query = EmailOutbox.findOne({ idempotencyKey: key });
      return (session ? query.session(session) : query).lean();
    },
    async create(data, session) {
      const [created] = await EmailOutbox.create([data], session ? { session } : undefined);
      return created.toObject();
    },
    async claimNext(now, leaseUntil) {
      return EmailOutbox.findOneAndUpdate(
        { $or: [{ status: { $in: ['Pending', 'Failed'] }, availableAt: { $lte: now } }, { status: 'Processing', leaseUntil: { $lt: now } }] },
        { $set: { status: 'Processing', leaseUntil }, $inc: { attemptCount: 1 } },
        { sort: { availableAt: 1 }, new: true }
      ).lean();
    },
    async markSent(id, data) { return EmailOutbox.findByIdAndUpdate(id, { $set: data }, { new: true }).lean(); },
    async markFailed(id, data) { return EmailOutbox.findByIdAndUpdate(id, { $set: data }, { new: true }).lean(); },
  };
}

function createEmailOutboxService({ repository = createModelEmailOutboxRepository(), provider = createEmailProvider(), now = () => new Date(), leaseMs = 60_000 } = {}) {
  return {
    async enqueue(event, session) {
      const existing = await repository.findByIdempotencyKey(event.idempotencyKey, session);
      if (existing) return existing;
      try {
        return await repository.create({ status: 'Pending', attemptCount: 0, availableAt: now(), ...event }, session);
      } catch (error) {
        if (error && error.code === 11000) return repository.findByIdempotencyKey(event.idempotencyKey, session);
        throw error;
      }
    },
    async deliverNext() {
      const current = now();
      const entry = await repository.claimNext(current, new Date(current.getTime() + leaseMs));
      if (!entry) return null;
      try {
        const result = await provider.send(entry);
        if (result && result.disabled) {
          await repository.markFailed(entry._id, { status: 'Failed', availableAt: new Date(current.getTime() + 60_000), leaseUntil: null, lastError: 'Email provider disabled' });
          return { ...entry, status: 'Failed' };
        }
        await repository.markSent(entry._id, { status: 'Sent', sentAt: now(), leaseUntil: null, lastError: '', providerMessageId: result.messageId || '' });
        return { ...entry, status: 'Sent' };
      } catch (error) {
        const attempt = Math.max(1, Number(entry.attemptCount || 1));
        const delay = Math.min(60 * 60_000, (2 ** Math.min(attempt, 10)) * 1000);
        await repository.markFailed(entry._id, { status: 'Failed', attemptCount: attempt, availableAt: new Date(current.getTime() + delay), leaseUntil: null, lastError: error.message });
        return { ...entry, status: 'Failed' };
      }
    },
  };
}

module.exports = { createEmailProvider, createEmailOutboxService, createModelEmailOutboxRepository, renderEmail };
