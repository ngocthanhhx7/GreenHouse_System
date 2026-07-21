export function buildAdminOverviewQuery({ from, to } = {}) {
  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  return query.toString();
}
