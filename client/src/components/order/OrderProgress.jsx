import { translateOrderStatus } from '../../utils/formatters.js';
import { getOrderProgress } from '../../utils/orderProgress.js';

export default function OrderProgress({ status, compact = false }) {
  const steps = getOrderProgress(status);
  const isTerminal = steps.every((step) => step.state === 'terminal');

  if (isTerminal) {
    return (
      <div className="order-progress-terminal" role="status">
        <span className="status-pill neutral">{translateOrderStatus(status)}</span>
        <small>Đơn hàng không tiếp tục theo tiến trình giao hàng.</small>
      </div>
    );
  }

  return (
    <ol
      className={`order-progress ${compact ? 'order-progress-compact' : ''}`}
      aria-label={`Tiến trình đơn hàng: ${translateOrderStatus(status)}`}
    >
      {steps.map((step, index) => (
        <li
          className={`order-progress-step is-${step.state}`}
          key={step.status}
          aria-current={step.state === 'current' ? 'step' : undefined}
        >
          <span className="order-progress-marker" aria-hidden="true">
            {step.state === 'complete' ? '✓' : index + 1}
          </span>
          <span className="order-progress-label">{translateOrderStatus(step.status)}</span>
          <span className="visually-hidden">
            {step.state === 'complete'
              ? 'Đã hoàn tất'
              : step.state === 'current'
                ? 'Hiện tại'
                : 'Sắp tới'}
          </span>
        </li>
      ))}
    </ol>
  );
}
