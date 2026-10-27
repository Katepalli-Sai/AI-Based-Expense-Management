import { useState } from 'react'
import { Download, FileSpreadsheet, FileText, Table } from 'lucide-react'
import { downloadFile, parseError } from '../api'
import { ErrorBanner, Field, Modal, Spinner, useToast } from './ui'
import { cx } from '../utils'

const SCOPES = [
  ['all', 'All transactions'], ['income', 'Income only'], ['expenses', 'Expenses only'],
  ['this_month', 'This month'], ['last_month', 'Last month'], ['this_year', 'This year'], ['custom', 'Custom date range'],
]
const FORMATS = [['csv', 'CSV', Table, 'Excel / Google Sheets'], ['xlsx', 'Excel', FileSpreadsheet, '.xlsx with formatting'], ['pdf', 'PDF', FileText, 'Printable summary']]

export default function ExportDialog({ open, onClose }) {
  const toast = useToast()
  const [scope, setScope] = useState('all')
  const [format, setFormat] = useState('csv')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const go = async () => {
    setError('')
    if (scope === 'custom' && (!start || !end)) return setError('Choose both a start and an end date.')
    setBusy(true)
    try {
      await downloadFile('/api/exports/transactions', { format, scope, ...(scope === 'custom' ? { start_date: start, end_date: end } : {}) }, `transactions.${format}`)
      toast('Export downloaded')
      onClose()
    } catch (e) {
      // blob error bodies need decoding
      let msg = parseError(e).message
      if (e.response?.data instanceof Blob) {
        try { msg = JSON.parse(await e.response.data.text()).detail || msg } catch { /* keep generic */ }
      }
      setError(msg)
    } finally { setBusy(false) }
  }

  return (
    <Modal open={open} title="Export transactions" onClose={onClose}>
      <ErrorBanner message={error} />
      <div className="space-y-4">
        <Field label="What to export" htmlFor="scope">
          <select id="scope" className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
            {SCOPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        {scope === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" htmlFor="xs"><input id="xs" type="date" className="input" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="To" htmlFor="xe"><input id="xe" type="date" className="input" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} /></Field>
          </div>
        )}
        <div>
          <span className="label">Format</span>
          <div className="grid grid-cols-3 gap-2">
            {FORMATS.map(([v, l, Icon, sub]) => (
              <button key={v} type="button" onClick={() => setFormat(v)} aria-pressed={format === v}
                className={cx('rounded-lg border p-3 text-left', format === v ? 'border-brand-600 bg-brand-50' : 'border-slate-300 hover:bg-slate-50')}>
                <Icon className="h-5 w-5 text-brand-600" /><p className="mt-1 text-sm font-medium text-navy-900">{l}</p><p className="text-xs text-slate-500">{sub}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={go} disabled={busy}>{busy ? <Spinner className="h-4 w-4 text-white" /> : <Download className="h-4 w-4" />}Download</button>
        </div>
      </div>
    </Modal>
  )
}
