export const todayISO = () => new Date().toISOString().slice(0, 10)

export function formatMoney(value, currency = 'INR') {
  const n = Number(value ?? 0)
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)
}

export function formatDate(iso, fmt = 'DD/MM/YYYY') {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  if (fmt === 'MM/DD/YYYY') return `${m}/${d}/${y}`
  if (fmt === 'YYYY-MM-DD') return `${y}-${m}-${d}`
  return `${d}/${m}/${y}`
}

export function formatMonth(ym) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-IN', { month: 'short', year: '2-digit' })
}

export const PERIODS = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_year', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
]

export const periodParams = ({ period, start, end }) =>
  period === 'custom' ? { period, start_date: start, end_date: end } : { period }

export const cx = (...a) => a.filter(Boolean).join(' ')
