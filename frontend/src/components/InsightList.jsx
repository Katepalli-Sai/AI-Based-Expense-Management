import { Eye, Lightbulb, HelpCircle } from 'lucide-react'

const KINDS = {
  observation: { label: 'Observed', icon: Eye, cls: 'bg-brand-50 text-brand-700' },
  suggestion: { label: 'Suggestion', icon: Lightbulb, cls: 'bg-amber-50 text-amber-700' },
  possible_explanation: { label: 'Possible explanation', icon: HelpCircle, cls: 'bg-violet-50 text-violet-700' },
}

export default function InsightList({ insights }) {
  if (!insights) return null
  return (
    <div className="card p-4">
      {insights.summary && <p className="mb-3 text-slate-800">{insights.summary}</p>}
      <ul className="space-y-3">
        {insights.items.map((i, n) => {
          const k = KINDS[i.kind] || KINDS.observation
          const Icon = k.icon
          return (
            <li key={n} className="flex gap-3 rounded-lg border border-slate-100 p-3">
              <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${k.cls}`}><Icon className="h-4 w-4" /></span>
              <div><p className="text-sm font-medium text-navy-900">{i.title} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${k.cls}`}>{k.label}</span></p>
                <p className="mt-0.5 text-sm text-slate-600">{i.detail}</p></div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
