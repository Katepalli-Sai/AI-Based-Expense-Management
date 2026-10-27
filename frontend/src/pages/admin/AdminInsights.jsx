import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import api, { parseError } from '../../api'
import { useFetch } from '../../hooks'
import { ErrorBanner, Notice, PageHeader, Skeleton, Spinner, StatCard } from '../../components/ui'
import InsightList from '../../components/InsightList'

export default function AdminInsights() {
  const { data, loading, error, reload, setData } = useFetch('/api/admin/ai/insights')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const refresh = async () => {
    setBusy(true); setErr('')
    try { setData((await api.post('/api/admin/ai/insights/refresh')).data) } catch (e) { setErr(parseError(e).message) } finally { setBusy(false) }
  }
  const s = data?.stats
  return (
    <>
      <PageHeader title="AI Insights" subtitle="AI commentary on aggregated platform statistics. It never sees individual transactions, budgets, goals or chats.">
        <button className="btn-primary" onClick={refresh} disabled={busy || data?.ai_configured === false}>{busy ? <Spinner className="h-4 w-4 text-white" /> : <RefreshCw className="h-4 w-4" />}Refresh insights</button>
      </PageHeader>
      <ErrorBanner message={error || err} onRetry={error ? reload : undefined} />
      {loading && !data ? <Skeleton className="h-40" /> : data && (
        <div className="space-y-4">
          {!data.ai_configured && <Notice tone="warn">AI isn’t configured. Add GEMINI_API_KEY and GEMINI_MODEL to the backend .env file.</Notice>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Registered users" value={s.total_users} /><StatCard label="Active accounts" value={s.active_users} />
            <StatCard label="Registrations, 30 days" value={s.registrations_last_30_days} /><StatCard label="Transactions, 30 days" value={s.transactions_recorded_last_30_days} />
          </div>
          {data.stale && data.insights && <Notice tone="warn">Platform numbers have changed since these insights were generated.</Notice>}
          {data.insights ? <InsightList insights={data.insights} /> : data.ai_configured && <div className="card p-6 text-center text-sm text-slate-500">No insights yet. Select Refresh insights to generate them.</div>}
          <p className="text-xs text-slate-500">{data.disclaimer}{data.generated_at && ` Generated ${new Date(data.generated_at + 'Z').toLocaleString()}.`}</p>
        </div>
      )}
    </>
  )
}
