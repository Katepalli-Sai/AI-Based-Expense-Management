import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Plus, Wallet } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'
import { useAuth } from '../auth'
import { useFetch } from '../hooks'
import { Badge, ChartCard, EmptyState, ErrorBanner, PageHeader, PeriodFilter, ProgressBar, Skeleton, StatCard } from '../components/ui'
import TransactionForm from '../components/TransactionForm'
import ExportDialog from '../components/ExportDialog'
import { formatDate, formatMoney, formatMonth, periodParams } from '../utils'

const COLORS = ['#2563EB', '#0EA5E9', '#14B8A6', '#F59E0B', '#8B5CF6', '#EC4899', '#64748B', '#EF4444']

export default function Dashboard() {
  const { user } = useAuth()
  const [flt, setFlt] = useState({ period: 'this_month', start: '', end: '' })
  const [adding, setAdding] = useState(false)
  const [exporting, setExporting] = useState(false)
  const customIncomplete = flt.period === 'custom' && (!flt.start || !flt.end)
  const params = customIncomplete ? null : periodParams(flt)
  const url = (p) => (params ? p : null)

  const summary = useFetch(url('/api/dashboard/summary'), params)
  const series = useFetch(url('/api/dashboard/income-expenses'), params)
  const cats = useFetch(url('/api/dashboard/expense-categories'), params)
  const recent = useFetch('/api/dashboard/recent-transactions')
  const budgets = useFetch('/api/dashboard/budget-overview')
  const refreshAll = () => [summary, series, cats, recent, budgets].forEach((x) => x.reload())

  const money = (v) => formatMoney(v, user.currency)
  const s = summary.data
  const anyError = summary.error || series.error || cats.error
  const brandNew = s && !s.has_any_transactions

  const monthly = (series.data?.monthly || []).map((m) => ({ ...m, label: formatMonth(m.month), income: Number(m.income), expenses: Number(m.expenses) }))
  const trend = (series.data?.spending_trend || []).map((t) => ({ ...t, label: formatDate(t.date, user.date_format).slice(0, 5), expenses: Number(t.expenses) }))
  const pie = (cats.data?.items || []).map((c) => ({ name: c.category, value: Number(c.amount) }))
  const tip = (v) => money(v)

  return (
    <>
      <PageHeader title={`Hello, ${user.full_name.split(' ')[0]}`} subtitle={s ? `${formatDate(s.period.start, user.date_format)} – ${formatDate(s.period.end, user.date_format)}` : 'Your financial overview'}>
        <PeriodFilter value={flt} onChange={setFlt} />
        <button className="btn-secondary" onClick={() => setExporting(true)}><Download className="h-4 w-4" />Export</button>
        <button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add transaction</button>
      </PageHeader>

      {customIncomplete && <p className="mb-4 text-sm text-slate-500">Choose a start and end date to see your custom range.</p>}
      <ErrorBanner message={anyError} onRetry={refreshAll} />

      {brandNew ? (
        <div className="card">
          <EmptyState icon={Wallet} title="Welcome! Your account is empty"
            text="Add your first transaction to see totals and charts here, or set up a budget to track a spending limit."
            action={<div className="flex flex-wrap justify-center gap-2">
              <button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add your first transaction</button>
              <Link to="/budgets" className="btn-secondary">Create your first budget</Link>
            </div>} />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard loading={summary.loading && !s} label="Total income" value={s && money(s.income)} />
            <StatCard loading={summary.loading && !s} label="Total expenses" value={s && money(s.expenses)} />
            <StatCard loading={summary.loading && !s} label="Net cash flow" value={s && money(s.net)} tone={s && (Number(s.net) < 0 ? 'bad' : Number(s.net) > 0 ? 'good' : undefined)} hint="Income minus expenses in this period" />
            <StatCard loading={summary.loading && !s} label="Savings rate" value={s && (s.savings_rate === null ? '—' : `${s.savings_rate}%`)} tone={s && s.savings_rate !== null ? (s.savings_rate < 0 ? 'bad' : 'good') : undefined} hint={s?.savings_rate_note || 'Share of income left after expenses'} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <ChartCard title="Income vs expenses" subtitle="By month" loading={series.loading && !series.data} empty={monthly.length === 0} emptyText="No transactions in this period.">
              <ResponsiveContainer><BarChart data={monthly}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="label" fontSize={12} /><YAxis fontSize={12} width={60} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} /><Tooltip formatter={tip} /><Legend />
                <Bar dataKey="income" name="Income" fill="#10B981" radius={[4, 4, 0, 0]} /><Bar dataKey="expenses" name="Expenses" fill="#2563EB" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Expenses by category" loading={cats.loading && !cats.data} empty={pie.length === 0} emptyText="No expenses in this period.">
              <ResponsiveContainer><PieChart><Pie data={pie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>{pie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={tip} /><Legend /></PieChart></ResponsiveContainer>
            </ChartCard>
            <div className="lg:col-span-2">
              <ChartCard title="Spending trend" subtitle="Daily expenses (weekly for ranges over three months)" loading={series.loading && !series.data} empty={trend.length === 0} emptyText="No expenses in this period.">
                <ResponsiveContainer><LineChart data={trend}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="label" fontSize={12} /><YAxis fontSize={12} width={60} /><Tooltip formatter={tip} /><Line type="monotone" dataKey="expenses" name="Expenses" stroke="#2563EB" strokeWidth={2} dot={trend.length < 32} /></LineChart></ResponsiveContainer>
              </ChartCard>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-navy-900">Budget overview</h3><Link to="/budgets" className="text-sm font-medium text-brand-600 hover:underline">Manage</Link></div>
              {budgets.loading && !budgets.data ? <Skeleton className="h-20" /> : (budgets.data?.items.length ? (
                <div className="space-y-4">{budgets.data.items.map((b) => (
                  <div key={b.id}>
                    <div className="mb-1 flex items-center justify-between text-sm"><span className="font-medium text-slate-900">{b.category_name}</span><Badge kind={b.status} /></div>
                    <ProgressBar percent={b.progress_percent} status={b.status} />
                    <p className="mt-1 text-xs text-slate-500">{money(b.spent)} of {money(b.limit_amount)} · {b.progress_percent}%</p>
                  </div>))}</div>
              ) : <EmptyState title="No active budgets" text="Create a budget to see progress here." action={<Link to="/budgets" className="btn-secondary">Create your first budget</Link>} />)}
            </div>
            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-navy-900">Recent transactions</h3><Link to="/transactions" className="text-sm font-medium text-brand-600 hover:underline">View all</Link></div>
              {recent.loading && !recent.data ? <Skeleton className="h-20" /> : (recent.data?.items.length ? (
                <ul className="divide-y divide-slate-100">{recent.data.items.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                    <div className="min-w-0"><p className="truncate font-medium text-slate-900">{t.description || t.category_name}</p><p className="text-xs text-slate-500">{t.category_name} · {formatDate(t.transaction_date, user.date_format)}</p></div>
                    <span className={`ml-3 whitespace-nowrap font-medium tabular-nums ${t.type === 'INCOME' ? 'text-emerald-600' : 'text-slate-900'}`}>{t.type === 'INCOME' ? '+' : '−'}{money(t.amount)}</span>
                  </li>))}</ul>
              ) : <EmptyState title="No transactions yet" />)}
            </div>
          </div>
        </>
      )}

      <TransactionForm open={adding} onClose={() => setAdding(false)} onSaved={refreshAll} />
      <ExportDialog open={exporting} onClose={() => setExporting(false)} />
    </>
  )
}
