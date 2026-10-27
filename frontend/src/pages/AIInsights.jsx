import { useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Sparkles } from 'lucide-react'
import api, { parseError } from '../api'
import { useFetch } from '../hooks'
import { EmptyState, ErrorBanner, Notice, PageHeader, Skeleton, Spinner } from '../components/ui'
import InsightList from '../components/InsightList'
import { useAuth } from '../auth'
import { formatDate } from '../utils'

export default function AIInsights() {
  const { user } = useAuth()
  const { data, loading, error, reload, setData } = useFetch('/api/ai/insights')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const refresh = async () => {
    setBusy(true); setErr('')
    try { const r = await api.post('/api/ai/insights/refresh'); setData(r.data) } catch (e) { setErr(parseError(e).message) } finally { setBusy(false) }
  }

  const generated = data?.generated_at && new Date(data.generated_at + 'Z').toLocaleString()
  return (
    <>
      <PageHeader title="AI Insights" subtitle="Plain-language explanations of patterns in your own records.">
        <button className="btn-primary" onClick={refresh} disabled={busy || !data?.enough_data || data?.ai_configured === false}>
          {busy ? <Spinner className="h-4 w-4 text-white" /> : <RefreshCw className="h-4 w-4" />}Refresh insights
        </button>
      </PageHeader>
      <ErrorBanner message={error || err} onRetry={error ? reload : undefined} />

      {loading && !data ? <Skeleton className="h-40" /> : data && !data.enough_data ? (
        <div className="card"><EmptyState icon={Sparkles} title="Add your first transaction to unlock personalized financial insights"
          text="Insights are built from your real transactions, budgets and goals. Nothing is shown until you add some."
          action={<Link to="/transactions" className="btn-primary">Add a transaction</Link>} /></div>
      ) : data && (
        <div className="space-y-4">
          {!data.ai_configured && <Notice tone="warn">AI explanations aren’t configured on this server yet. Ask the administrator to set GEMINI_API_KEY and GEMINI_MODEL. Your exact figures below still work.</Notice>}

          <div className="card p-4">
            <h2 className="font-semibold text-navy-900">Facts from your records</h2>
            <p className="text-xs text-slate-500">Calculated exactly from your data, not by AI.</p>
            <ul className="mt-3 space-y-2 text-sm">
              {data.facts.map((f, i) => <li key={i}><span className="font-medium text-slate-900">{f.label}: </span>{f.text}</li>)}
            </ul>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-navy-900">AI interpretation</h2>
              {generated && <span className="text-xs text-slate-500">Generated {generated}</span>}
            </div>
            {data.stale && data.insights && <Notice tone="warn">Your records have changed since these insights were generated. Select Refresh insights to update them.</Notice>}
            {data.insights ? <InsightList insights={data.insights} /> : data.ai_configured && (
              <div className="card"><EmptyState title="No insights generated yet" text="Select Refresh insights to have AI explain your patterns. Only summarised totals are sent, never your full history." /></div>
            )}
            <p className="mt-3 text-xs text-slate-500">{data.disclaimer} Insights cover {formatDate(data.period.start, user.date_format)} – {formatDate(data.period.end, user.date_format)} compared with the previous month.</p>
          </div>
        </div>
      )}
    </>
  )
}
