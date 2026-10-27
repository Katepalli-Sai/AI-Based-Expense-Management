import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Download, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import api, { parseError } from '../api'
import { useFetch, useCategories } from '../hooks'
import { useAuth } from '../auth'
import { Badge, ConfirmDialog, EmptyState, ErrorBanner, PageHeader, Pagination, Skeleton, useToast } from '../components/ui'
import TransactionForm from '../components/TransactionForm'
import ExportDialog from '../components/ExportDialog'
import { formatDate, formatMoney } from '../utils'

const PAGE_SIZE = 10

export default function Transactions() {
  const { user } = useAuth()
  const toast = useToast()
  const categories = useCategories()
  const [f, setF] = useState({ search: '', type: '', category_id: '', start_date: '', end_date: '', sort_by: 'date', sort_dir: 'desc', page: 1 })
  const [q, setQ] = useState('')
  const [form, setForm] = useState({ open: false, initial: null })
  const [del, setDel] = useState(null)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => { const t = setTimeout(() => setF((x) => ({ ...x, search: q, page: 1 })), 300); return () => clearTimeout(t) }, [q])

  const params = Object.fromEntries(Object.entries({ ...f, page_size: PAGE_SIZE }).filter(([, v]) => v !== ''))
  const { data, loading, error, reload } = useFetch('/api/transactions', params)
  const set = (patch) => setF((x) => ({ ...x, page: 1, ...patch }))
  const sortBy = (col) => set(f.sort_by === col ? { sort_dir: f.sort_dir === 'asc' ? 'desc' : 'asc' } : { sort_by: col, sort_dir: 'desc' })
  const SortIcon = ({ col }) => f.sort_by === col ? (f.sort_dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : null

  const remove = async () => {
    setBusy(true)
    try {
      await api.delete(`/api/transactions/${del.id}`)
      toast('Transaction deleted'); setDel(null)
      if (data.items.length === 1 && f.page > 1) setF((x) => ({ ...x, page: x.page - 1 })); else reload()
    } catch (e) { toast(parseError(e).message, 'error') } finally { setBusy(false) }
  }

  const filtersActive = f.search || f.type || f.category_id || f.start_date || f.end_date
  const items = data?.items || []

  return (
    <>
      <PageHeader title="Transactions" subtitle="Record, search and export your income and expenses.">
        <button className="btn-secondary" onClick={() => setExporting(true)}><Download className="h-4 w-4" />Export</button>
        <button className="btn-primary" onClick={() => setForm({ open: true, initial: null })}><Plus className="h-4 w-4" />Add transaction</button>
      </PageHeader>

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input aria-label="Search" placeholder="Search description or category" className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select aria-label="Type" className="input" value={f.type} onChange={(e) => set({ type: e.target.value })}>
          <option value="">All types</option><option value="INCOME">Income</option><option value="EXPENSE">Expense</option>
        </select>
        <select aria-label="Category" className="input" value={f.category_id} onChange={(e) => set({ category_id: e.target.value })}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.type === 'INCOME' ? 'income' : 'expense'})</option>)}
        </select>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
          <input aria-label="From date" type="date" className="input" value={f.start_date} max={f.end_date || undefined} onChange={(e) => set({ start_date: e.target.value })} />
          <input aria-label="To date" type="date" className="input" value={f.end_date} min={f.start_date || undefined} onChange={(e) => set({ end_date: e.target.value })} />
        </div>
      </div>

      <ErrorBanner message={error} onRetry={reload} />
      <div className="card overflow-hidden">
        {loading && !data ? (
          <div className="space-y-3 p-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : items.length === 0 ? (
          filtersActive ? (
            <EmptyState title="No matching transactions" text="Try changing or clearing your filters."
              action={<button className="btn-secondary" onClick={() => { setQ(''); setF({ search: '', type: '', category_id: '', start_date: '', end_date: '', sort_by: 'date', sort_dir: 'desc', page: 1 }) }}>Clear filters</button>} />
          ) : (
            <EmptyState title="No transactions yet" text="Add your first transaction to start tracking your money."
              action={<button className="btn-primary" onClick={() => setForm({ open: true, initial: null })}><Plus className="h-4 w-4" />Add your first transaction</button>} />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium"><button className="inline-flex items-center gap-1" onClick={() => sortBy('date')}>Date <SortIcon col="date" /></button></th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 text-right font-medium"><button className="inline-flex items-center gap-1" onClick={() => sortBy('amount')}>Amount <SortIcon col="amount" /></button></th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className={loading ? 'opacity-60' : ''}>
                {items.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(t.transaction_date, user.date_format)}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-slate-900">{t.description || <span className="text-slate-400">No description</span>}</td>
                    <td className="px-4 py-3">{t.category_name}</td>
                    <td className="px-4 py-3"><Badge kind={t.type} /></td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums ${t.type === 'INCOME' ? 'text-emerald-600' : 'text-slate-900'}`}>
                      {t.type === 'INCOME' ? '+' : '−'}{formatMoney(t.amount, user.currency)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button className="btn-ghost !px-2" aria-label={`Edit transaction ${t.id}`} onClick={() => setForm({ open: true, initial: t })}><Pencil className="h-4 w-4" /></button>
                      <button className="btn-ghost !px-2 text-red-600" aria-label={`Delete transaction ${t.id}`} onClick={() => setDel(t)}><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} pageSize={PAGE_SIZE} total={data.total} onChange={(p) => setF((x) => ({ ...x, page: p }))} />}
      </div>

      <TransactionForm open={form.open} initial={form.initial} onClose={() => setForm({ open: false, initial: null })} onSaved={reload} />
      <ExportDialog open={exporting} onClose={() => setExporting(false)} />
      <ConfirmDialog open={!!del} title="Delete transaction?" busy={busy} onConfirm={remove} onClose={() => setDel(null)}
        message={del ? `This permanently removes ${formatMoney(del.amount, user.currency)} (${del.category_name}, ${formatDate(del.transaction_date, user.date_format)}). Budgets and totals will update.` : ''} />
    </>
  )
}
