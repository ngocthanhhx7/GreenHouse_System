// Reviewed from the VietQR/NAPAS bank-list snapshot on 2026-07-26. Only
// transfer-supported institutions are eligible as refund destinations.
const reviewedBanks = [
  { code: 'ABB', name: 'ABBANK', bin: '970425' },
  { code: 'ACB', name: 'ACB', bin: '970416' },
  { code: 'BAB', name: 'BacABank', bin: '970409' },
  { code: 'BIDV', name: 'BIDV', bin: '970418' },
  { code: 'BVB', name: 'BaoVietBank', bin: '970438' },
  { code: 'CAKE', name: 'CAKE', bin: '546034' },
  { code: 'CIMB', name: 'CIMB', bin: '422589' },
  { code: 'COOPBANK', name: 'COOPBANK', bin: '970446' },
  { code: 'EIB', name: 'Eximbank', bin: '970431' },
  { code: 'HDB', name: 'HDBank', bin: '970437' },
  { code: 'ICB', name: 'VietinBank', bin: '970415' },
  { code: 'KBANK', name: 'KBank', bin: '668888' },
  { code: 'KLB', name: 'KienLongBank', bin: '970452' },
  { code: 'LPB', name: 'LPBank', bin: '970449' },
  { code: 'MB', name: 'MBBank', bin: '970422' },
  { code: 'MBV', name: 'MBV', bin: '970414' },
  { code: 'MOMO', name: 'MoMo', bin: '971025' },
  { code: 'MSB', name: 'MSB', bin: '970426' },
  { code: 'NAB', name: 'NamABank', bin: '970428' },
  { code: 'NCB', name: 'NCB', bin: '970419' },
  { code: 'OCB', name: 'OCB', bin: '970448' },
  { code: 'PGB', name: 'PGBank', bin: '970430' },
  { code: 'PVCB', name: 'PVcomBank', bin: '970412' },
  { code: 'PVDB', name: 'PVcomBank Pay', bin: '971133' },
  { code: 'SCB', name: 'SCB', bin: '970429' },
  { code: 'SEAB', name: 'SeABank', bin: '970440' },
  { code: 'SGICB', name: 'SaigonBank', bin: '970400' },
  { code: 'SHB', name: 'SHB', bin: '970443' },
  { code: 'SHBVN', name: 'ShinhanBank', bin: '970424' },
  { code: 'STB', name: 'Sacombank', bin: '970403' },
  { code: 'TCB', name: 'Techcombank', bin: '970407' },
  { code: 'TIMO', name: 'Timo', bin: '963388' },
  { code: 'TPB', name: 'TPBank', bin: '970423' },
  { code: 'UBANK', name: 'Ubank', bin: '546035' },
  { code: 'VAB', name: 'VietABank', bin: '970427' },
  { code: 'VBA', name: 'Agribank', bin: '970405' },
  { code: 'VCB', name: 'Vietcombank', bin: '970436' },
  { code: 'VCCB', name: 'VietCapitalBank', bin: '970454' },
  { code: 'VIB', name: 'VIB', bin: '970441' },
  { code: 'VIETBANK', name: 'VietBank', bin: '970433' },
  { code: 'VPB', name: 'VPBank', bin: '970432' },
  { code: 'WVN', name: 'Woori', bin: '970457' },
];

function normalizeCode(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9]+$/.test(normalized) ? normalized : null;
}

function buildCatalog(entries) {
  const codes = new Set();
  const bins = new Set();
  const catalog = entries.map((entry) => {
    const code = normalizeCode(entry.code);
    if (!code || typeof entry.name !== 'string' || !entry.name.trim() || !/^\d{6}$/.test(entry.bin)) {
      throw new Error('Invalid refund bank catalog entry');
    }
    if (codes.has(code) || bins.has(entry.bin)) throw new Error('Duplicate refund bank catalog code or BIN');
    codes.add(code);
    bins.add(entry.bin);
    return Object.freeze({ code, name: entry.name.trim(), bin: entry.bin });
  });
  return Object.freeze(catalog.sort((left, right) => left.code.localeCompare(right.code)));
}

const REFUND_BANK_CATALOG = buildCatalog(reviewedBanks);
const banksByCode = new Map(REFUND_BANK_CATALOG.map((bank) => [bank.code, bank]));
const PUBLIC_BANKS = Object.freeze(REFUND_BANK_CATALOG.map((bank) => Object.freeze({
  code: bank.code,
  name: bank.name,
})));

function listPublicBanks() {
  return PUBLIC_BANKS;
}

function resolveBank(code) {
  const normalized = normalizeCode(code);
  return normalized ? banksByCode.get(normalized) || null : null;
}

module.exports = {
  REFUND_BANK_CATALOG,
  listPublicBanks,
  resolveBank,
};
