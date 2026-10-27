import { CheckCircle2, XCircle } from 'lucide-react'
import { useFetch } from '../../hooks'
import { ErrorBanner } from '../../components/ui'
import Profile from '../Profile'

export default function AdminSettings() {
  const { data, error, reload } = useFetch('/api/admin/settings')
  return (
    <>
      <Profile admin />
      <div className="card mt-4 p-5">
        <h2 className="font-semibold text-navy-900">Application settings</h2>
        <p className="mb-3 text-xs text-slate-500">Read-only. Secrets such as API keys and database passwords are never displayed; change them in the backend .env file.</p>
        <ErrorBanner message={error} onRetry={reload} />
        {data && (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">AI (Gemini)</dt><dd className="mt-0.5 flex items-center gap-1 font-medium text-slate-900">{data.ai_configured ? <><CheckCircle2 className="h-4 w-4 text-emerald-600" />Configured</> : <><XCircle className="h-4 w-4 text-amber-600" />Not configured</>}</dd></div>
            <div><dt className="text-slate-500">Default currency</dt><dd className="mt-0.5 font-medium text-slate-900">{data.default_currency}</dd></div>
            <div><dt className="text-slate-500">Session length</dt><dd className="mt-0.5 font-medium text-slate-900">{data.access_token_minutes} minutes</dd></div>
            <div><dt className="text-slate-500">Allowed frontend origin</dt><dd className="mt-0.5 font-medium text-slate-900">{data.frontend_origin}</dd></div>
            <div><dt className="text-slate-500">Version</dt><dd className="mt-0.5 font-medium text-slate-900">{data.app_version}</dd></div>
          </dl>
        )}
      </div>
    </>
  )
}
