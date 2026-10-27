import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, Loader2, X } from 'lucide-react'
import { cx, PERIODS } from '../utils'

export const Spinner = ({ className = 'h-5 w-5' }) => <Loader2 className={cx('animate-spin text-brand-600', className)} aria-label="Loading" />

export const Skeleton = ({ className = 'h-6 w-full' }) => <div className={cx('animate-pulse rounded bg-slate-200', className)} />

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

export function EmptyState({ title, text, action, icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-brand-50 p-3 text-brand-600"><Icon className="h-6 w-6" /></div>
      <h3 className="text-base font-semibold text-navy-900">{title}</h3>
      {text && <p className="mt-1 max-w-md text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorBanner({ message, onRetry }) {
  if (!message) return null
  return (
    <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && <button onClick={onRetry} className="font-medium underline">Retry</button>}
    </div>
  )
}

export function Notice({ tone = 'info', children }) {
  const tones = { info: 'border-brand-100 bg-brand-50 text-navy-800', warn: 'border-amber-200 bg-amber-50 text-amber-800' }
  return <div className={cx('mb-4 rounded-lg border px-3 py-2 text-sm', tones[tone])}>{children}</div>
}

export function Field({ label, error, hint, children, htmlFor }) {
  return (
    <div>
      {label && <label htmlFor={htmlFor} className="label">{label}</label>}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

export function Modal({ open, title, onClose, children, wide }) {
  useEffect(() => {
    if (!open) return
    const h = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx('max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-navy-900">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', busy, onConfirm, onClose }) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p className="text-sm text-slate-600">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-danger" onClick={onConfirm} disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />}{confirmLabel}</button>
      </div>
    </Modal>
  )
}

export function StatCard({ label, value, hint, tone, loading }) {
  const color = { good: 'text-emerald-600', bad: 'text-red-600' }[tone] || 'text-navy-900'
  return (
    <div className="card p-4">
      <p className="text-sm text-slate-500">{label}</p>
      {loading ? <Skeleton className="mt-2 h-8 w-32" /> : <p className={cx('mt-1 text-2xl font-semibold tabular-nums', color)}>{value}</p>}
      {hint && !loading && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

export function ChartCard({ title, subtitle, loading, empty, emptyText, children }) {
  return (
    <div className="card p-4">
      <h3 className="font-semibold text-navy-900">{title}</h3>
      {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      <div className="mt-3 h-64">
        {loading ? <Skeleton className="h-full w-full" /> : empty ? <div className="flex h-full items-center justify-center text-center text-sm text-slate-500">{emptyText}</div> : children}
      </div>
    </div>
  )
}

export function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
      <span>Page {page} of {pages} · {total} total</span>
      <div className="flex gap-1">
        <button className="btn-secondary !px-2" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
        <button className="btn-secondary !px-2" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  )
}

export function PeriodFilter({ value, onChange }) {
  const { period, start, end } = value
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Period" className="input !w-auto" value={period} onChange={(e) => onChange({ ...value, period: e.target.value })}>
        {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      {period === 'custom' && (
        <>
          <input aria-label="Start date" type="date" className="input !w-auto" value={start} max={end || undefined} onChange={(e) => onChange({ ...value, start: e.target.value })} />
          <span className="text-slate-400">to</span>
          <input aria-label="End date" type="date" className="input !w-auto" value={end} min={start || undefined} onChange={(e) => onChange({ ...value, end: e.target.value })} />
        </>
      )}
    </div>
  )
}

const BADGES = {
  NORMAL: 'bg-emerald-50 text-emerald-700', ACTIVE: 'bg-brand-50 text-brand-700', COMPLETED: 'bg-emerald-50 text-emerald-700',
  APPROACHING: 'bg-amber-50 text-amber-700', EXCEEDED: 'bg-red-50 text-red-700', OVERDUE: 'bg-red-50 text-red-700',
  INACTIVE: 'bg-slate-100 text-slate-600', INCOME: 'bg-emerald-50 text-emerald-700', EXPENSE: 'bg-rose-50 text-rose-700',
  ADMIN: 'bg-navy-700 text-white', USER: 'bg-slate-100 text-slate-700',
}
const BADGE_TEXT = { NORMAL: 'On track', APPROACHING: 'Near limit', EXCEEDED: 'Over budget', OVERDUE: 'Overdue', COMPLETED: 'Completed' }
export const Badge = ({ kind, children }) => (
  <span className={cx('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', BADGES[kind] || 'bg-slate-100 text-slate-700')}>
    {children || BADGE_TEXT[kind] || kind[0] + kind.slice(1).toLowerCase()}
  </span>
)

export function ProgressBar({ percent, status }) {
  const color = status === 'EXCEEDED' || status === 'OVERDUE' ? 'bg-red-500' : status === 'APPROACHING' ? 'bg-amber-500' : status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-brand-600'
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.min(percent, 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full', color)} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  )
}

// ---- toasts
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((message, tone = 'success') => {
    const id = Math.random()
    setItems((x) => [...x, { id, message, tone }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4000)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx('pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-white shadow-lg', t.tone === 'error' ? 'bg-red-600' : 'bg-navy-800')}>
            {t.tone === 'error' ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
