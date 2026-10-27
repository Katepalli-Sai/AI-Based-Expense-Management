import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useFetch } from '../../hooks'
import { ChartCard, ErrorBanner, PageHeader, StatCard } from '../../components/ui'
import { formatMonth } from '../../utils'

export default function AdminDashboard() {
  const { data: d, loading, error, reload } = useFetch('/api/admin/dashboard')
  const L = loading && !d
  const series = (d?.registrations_by_month || []).map((r) => ({ ...r, label: formatMonth(r.month) }))
  return (
    <>
      <PageHeader title="Admin Dashboard" subtitle="Platform-level numbers only. Individual financial records are never shown here." />
      <ErrorBanner message={error} onRetry={reload} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard loading={L} label="Registered users" value={d?.total_users} />
        <StatCard loading={L} label="Active accounts" value={d?.active_users} hint={d && `${d.inactive_users} deactivated`} />
        <StatCard loading={L} label="New in last 7 days" value={d?.registrations_last_7_days} hint={d && `${d.registrations_last_30_days} in last 30 days`} />
        <StatCard loading={L} label="Transactions, last 30 days" value={d?.transactions_recorded_last_30_days} hint={d && `${d.users_with_at_least_one_transaction} users have recorded some`} />
      </div>
      <div className="mt-4">
        <ChartCard title="New registrations" subtitle="Last 12 months" loading={L} empty={series.length === 0} emptyText="No registrations in the last 12 months.">
          <ResponsiveContainer><BarChart data={series}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="label" fontSize={12} /><YAxis allowDecimals={false} fontSize={12} width={40} /><Tooltip /><Bar dataKey="count" name="Registrations" fill="#2563EB" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </ChartCard>
      </div>
    </>
  )
}
