import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { adminService } from '../../services/adminService.js';
import { formatCurrency, translateOrderStatus } from '../../utils/formatters.js';

const EVENT_LABELS = {
  created: 'Đơn được tạo',
  confirmed: 'Đã xác nhận',
  shipped: 'Đã bàn giao vận chuyển',
  delivered: 'Đã giao',
  cancelled: 'Đã hủy',
  returned: 'Đã trả hàng',
};

function displayMetric(value, formatter = (entry) => String(entry)) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number' && !Number.isFinite(value)) return '—';
  return formatter(value);
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date);
}

function MetricBox({ label, value, hint }) {
  return (
    <article className="metric-box">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      {hint && <small className="text-secondary">{hint}</small>}
    </article>
  );
}

function ReportSection({ title, description, children }) {
  return (
    <section className="card mb-4">
      <div className="card-body">
        <div className="page-heading">
          <div>
            <h2 className="h4 mb-1">{title}</h2>
            {description && <p className="text-secondary mb-0">{description}</p>}
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

function KeyValueTable({ rows, labelHeading = 'Chỉ số', valueHeading = 'Giá trị' }) {
  if (!rows.length) return <p className="text-secondary mb-0">Không có dữ liệu phù hợp.</p>;
  return (
    <div className="table-responsive">
      <table className="table align-middle">
        <thead>
          <tr>
            <th>{labelHeading}</th>
            <th>{valueHeading}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{displayMetric(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState({ from: '', to: '' });
  const [activeMode, setActiveMode] = useState('currentMonth');
  const isMountedRef = useRef(false);
  const requestSequenceRef = useRef(0);

  const loadReport = useCallback((params = {}, mode = 'currentMonth') => {
    const requestId = ++requestSequenceRef.current;
    setReport(null);
    setError('');
    setLoading(true);
    adminService
      .getOverviewReport(params)
      .then((data) => {
        if (!isMountedRef.current || requestId !== requestSequenceRef.current) return;
        if (!data || typeof data !== 'object') {
          throw new Error('Máy chủ không trả về dữ liệu báo cáo hợp lệ.');
        }
        setReport(data);
        setActiveMode(mode);
      })
      .catch((requestError) => {
        if (!isMountedRef.current || requestId !== requestSequenceRef.current) return;
        setError(requestError.message || 'Không thể tải báo cáo.');
      })
      .finally(() => {
        if (!isMountedRef.current || requestId !== requestSequenceRef.current) return;
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    loadReport();
    return () => {
      isMountedRef.current = false;
      requestSequenceRef.current += 1;
    };
  }, [loadReport]);

  function handlePeriod(event) {
    event.preventDefault();
    if (!dates.from || !dates.to) {
      setError('Vui lòng chọn đầy đủ ngày bắt đầu và ngày kết thúc.');
      return;
    }
    if (dates.from > dates.to) {
      setError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
      return;
    }
    loadReport({ mode: 'period', from: dates.from, to: dates.to }, 'period');
  }

  function handleCurrentMonth() {
    setDates({ from: '', to: '' });
    loadReport({}, 'currentMonth');
  }

  function handleAllTime() {
    setDates({ from: '', to: '' });
    loadReport({ mode: 'allTime' }, 'allTime');
  }

  const periodEvents = Object.entries(report?.orders?.periodEvents || {})
    .map(([key, value]) => [EVENT_LABELS[key] || key, value]);
  const currentOrderStates = Object.entries(report?.orders?.currentSnapshot?.byStatus || {})
    .map(([key, value]) => [translateOrderStatus(key), value]);
  const inventoryMovements = Object.entries(report?.inventory?.periodMovements?.byType || {});
  const productRows = report?.products?.gross?.items || [];
  const staffRows = report?.staff?.items || [];

  return (
    <div className="surface">
      <div className="page-heading">
        <div>
          <p className="text-uppercase text-secondary mb-1">SL-009 · Báo cáo quản trị</p>
          <h1>Tổng quan vận hành</h1>
          <p className="text-secondary mb-0">
            Sự kiện trong kỳ được tách khỏi ảnh chụp trạng thái hiện tại.
          </p>
        </div>
        <div className="table-actions">
          <Link className="btn btn-outline-success" to="/admin/audit-logs">Nhật ký hệ thống</Link>
          <Link className="btn btn-outline-success" to="/admin/settings">Cấu hình</Link>
          <Link className="btn btn-outline-success" to="/admin/accounts">Tài khoản</Link>
        </div>
      </div>

      <form className="card card-body mb-4" onSubmit={handlePeriod}>
        <div className="table-actions align-items-end">
          <label className="form-label mb-0">
            Từ ngày
            <input
              type="date"
              className="form-control"
              value={dates.from}
              onChange={(event) => setDates((current) => ({ ...current, from: event.target.value }))}
            />
          </label>
          <label className="form-label mb-0">
            Đến ngày
            <input
              type="date"
              className="form-control"
              value={dates.to}
              onChange={(event) => setDates((current) => ({ ...current, to: event.target.value }))}
            />
          </label>
          <button type="submit" className="btn btn-success">Xem khoảng ngày</button>
          <button type="button" className="btn btn-outline-success" onClick={handleCurrentMonth}>
            Tháng hiện tại
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={handleAllTime}>
            Toàn thời gian
          </button>
        </div>
        <small className="text-secondary mt-2">
          Chế độ: {activeMode === 'allTime' ? 'Toàn thời gian' : activeMode === 'period' ? 'Khoảng ngày' : 'Tháng hiện tại'}
        </small>
      </form>

      <div aria-busy={loading}>
        {loading && (
          <div className="page-center" role="status" aria-live="polite">
            Đang tổng hợp báo cáo...
          </div>
        )}
        {error && <div className="alert alert-danger" role="alert">{error}</div>}

        {report && !loading && (
          <>
            <div className="alert alert-light border" aria-label="Nguồn gốc báo cáo">
              <strong>Tạo lúc:</strong> {formatDateTime(report.meta?.generatedAt)}
              {' · '}
              <strong>Dữ liệu tại thời điểm:</strong> {formatDateTime(report.meta?.dataAsOf)}
              {' · '}
              <strong>Múi giờ:</strong> {displayMetric(report.meta?.timezone)}
            </div>

            <div className="metrics-grid mb-4">
              <MetricBox
                label="Doanh thu gộp"
                value={displayMetric(report.revenue?.grossSales, formatCurrency)}
                hint="CompletedSale hợp lệ trong kỳ"
              />
              <MetricBox
                label="Đã hoàn tiền"
                value={displayMetric(report.revenue?.refunds, formatCurrency)}
                hint="Theo thời điểm hoàn tiền"
              />
              <MetricBox
                label="Doanh thu thuần"
                value={displayMetric(report.revenue?.netSales, formatCurrency)}
                hint="Có thể âm"
              />
              <MetricBox
                label="Đơn đang xử lý"
                value={displayMetric(report.orders?.currentSnapshot?.backlog)}
                hint="Ảnh chụp hiện tại"
              />
              <MetricBox
                label="Sắp hết hàng"
                value={displayMetric(report.inventory?.currentSnapshot?.lowStockCount)}
                hint="Ảnh chụp hiện tại"
              />
              <MetricBox
                label="Yêu cầu hỗ trợ đang mở"
                value={displayMetric(report.support?.open)}
                hint="Ảnh chụp hiện tại"
              />
            </div>

            <ReportSection
              title="Đơn hàng"
              description="Sự kiện được tính theo thời điểm riêng; trạng thái là ảnh chụp tại dataAsOf."
            >
              <div className="row g-4">
                <div className="col-lg-6">
                  <h3 className="h6">Sự kiện trong kỳ</h3>
                  <KeyValueTable rows={periodEvents} />
                </div>
                <div className="col-lg-6">
                  <h3 className="h6">Trạng thái hiện tại</h3>
                  <KeyValueTable rows={currentOrderStates} labelHeading="Trạng thái" valueHeading="Số đơn" />
                </div>
              </div>
            </ReportSection>

            <ReportSection
              title="Sản phẩm đã bán"
              description="Tên, SKU, số lượng và giá trị lấy từ dòng đơn hàng bất biến."
            >
              {productRows.length ? (
                <div className="table-responsive">
                  <table className="table align-middle">
                    <thead>
                      <tr>
                        <th>Sản phẩm tại thời điểm bán</th>
                        <th>SKU</th>
                        <th>Trạng thái hiện tại</th>
                        <th>Số lượng</th>
                        <th>Giá trị</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productRows.map((item) => (
                        <tr key={`${item.productId}-${item.productSkuSnapshot}`}>
                          <td>{displayMetric(item.productNameSnapshot)}</td>
                          <td>{displayMetric(item.productSkuSnapshot)}</td>
                          <td>{displayMetric(item.currentStatus)}</td>
                          <td>{displayMetric(item.units)}</td>
                          <td>{displayMetric(item.value, formatCurrency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-secondary mb-0">Không có CompletedSale trong kỳ.</p>}
            </ReportSection>

            <div className="row g-4 mb-4">
              <div className="col-lg-6">
                <ReportSection
                  title="Khách hàng"
                  description="Quần thể hiện tại và hành vi trong kỳ được hiển thị riêng."
                >
                  <KeyValueTable rows={[
                    ['Khách hàng mới', report.customers?.period?.newCustomers],
                    ['Khách đã đặt hàng', report.customers?.period?.orderingCustomers],
                    ['Khách có CompletedSale', report.customers?.period?.completedSaleCustomers],
                    ['Tổng khách hiện tại', report.customers?.currentSnapshot?.total],
                  ]} />
                </ReportSection>
              </div>
              <div className="col-lg-6">
                <ReportSection
                  title="Kho"
                  description="Ảnh chụp số lượng hiện tại và biến động có dấu trong kỳ."
                >
                  <KeyValueTable rows={[
                    ['Sellable', report.inventory?.currentSnapshot?.totals?.sellable],
                    ['Reserved', report.inventory?.currentSnapshot?.totals?.reserved],
                    ['Quarantined', report.inventory?.currentSnapshot?.totals?.quarantined],
                    ['Damaged', report.inventory?.currentSnapshot?.totals?.damaged],
                    ['Available', report.inventory?.currentSnapshot?.totals?.available],
                  ]} />
                  <h3 className="h6 mt-3">Biến động trong kỳ</h3>
                  <KeyValueTable
                    rows={inventoryMovements.map(([type, facts]) => [
                      type,
                      `${displayMetric(facts.count)} lần · ${displayMetric(facts.signedQuantity)}`,
                    ])}
                  />
                </ReportSection>
              </div>
            </div>

            <ReportSection
              title="Nhân viên hỗ trợ"
              description="Chỉ số có mẫu số rõ ràng; dữ liệu thiếu được giữ là dấu gạch ngang."
            >
              {staffRows.length ? (
                <div className="table-responsive">
                  <table className="table align-middle">
                    <thead>
                      <tr>
                        <th>Nhân viên</th>
                        <th>Trạng thái</th>
                        <th>Thao tác thành công</th>
                        <th>Phản hồi đầu tiên</th>
                        <th>Giải quyết</th>
                        <th>Thiếu thời điểm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffRows.map((item) => (
                        <tr key={item.staffId}>
                          <td>{displayMetric(item.fullName)}</td>
                          <td>{displayMetric(item.currentStatus)}</td>
                          <td>{displayMetric(item.workload?.successfulActions)}</td>
                          <td>
                            {displayMetric(item.support?.firstResponse?.averageMinutes)}
                            {' phút / '}
                            {displayMetric(item.support?.firstResponse?.qualifyingCount)}
                          </td>
                          <td>
                            {displayMetric(item.support?.resolution?.averageMinutes)}
                            {' phút / '}
                            {displayMetric(item.support?.resolution?.qualifyingCount)}
                          </td>
                          <td>
                            {displayMetric(item.support?.missingFirstResponseCount)}
                            {' phản hồi · '}
                            {displayMetric(item.support?.missingResolutionCount)}
                            {' giải quyết'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-secondary mb-0">Không có nhân viên phù hợp.</p>}
            </ReportSection>
          </>
        )}
      </div>
    </div>
  );
}

export { displayMetric };
