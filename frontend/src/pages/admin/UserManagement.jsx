import { useEffect, useState } from 'react'
import { Search, UserCheck, UserX } from 'lucide-react'
import api, { parseError } from '../../api'
import { useAuth } from '../../auth'
import { useFetch } from '../../hooks'
import { Badge, ConfirmDialog, EmptyState, ErrorBanner, PageHeader, Pagination, Skeleton, useToast } from '../../components/ui'
import { formatDate } from '../../utils'

const PAGE_SIZE = 10

export default function UserManagement() {
  const { user: me } = useAuth()
  const toast = useToast()
  const [f, setF] = useState({ search: '', status: '', role: '', page: 1 })
  const [q, setQ] = useState('')
  const [target, setTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { const t = setTimeout(() => setF((x) => ({ ...x, search: q, page: 1 })), 300); return () => clearTimeout(t) }, [q])
  const params = Object.fromEntries(Object.entries({ ...f, page_size: PAGE_SIZE }).filter(([, v]) => v !== ''))
  const { data, loading, error, reload } = useFetch('/api/admin/users', params)

  const toggle = async () => {
    const next = target.account_status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    setBusy(true)
    try { await api.put(`/api/admin/users/${target.id}/status`, { account_status: next }); toast(next === 'ACTIVE' ? 'Account activated' : 'Account deactivated'); setTarget(null); reload() }
    catch (e) { toast(parseError(e).message, 'error'); setTarget(null) } finally { setBusy(false) }
  }
  const deactivating = target?.account_status === 'ACTIVE'

  return (
    <>
      <PageHeader title="User Management" subtitle="Account details only. You can’t see anyone’s financial records." />
      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input aria-label="Search users" placeholder="Search name or email" className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select aria-label="Status" className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
        <select aria-label="Role" className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value, page: 1 })}><option value="">All roles</option><option value="USER">Users</option><option value="ADMIN">Administrators</option></select>
      </div>
      <ErrorBanner message={error} onRetry={reload} />
      <div className="card overflow-hidden">
        {loading && !data ? <div className="space-y-3 p-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
          : data?.items.length === 0 ? <EmptyState title="No users found" text="Try a different search or filter." /> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500"><tr>{['Name', 'Email', 'Role', 'Status', 'Registered'].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}<th className="px-4 py-3"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{data.items.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{u.full_name}{u.id === me.id && <span className="ml-2 text-xs text-slate-500">(you)</span>}</td>
                  <td className="px-4 py-3">{u.email}</td><td className="px-4 py-3"><Badge kind={u.role}>{u.role === 'ADMIN' ? 'Administrator' : 'User'}</Badge></td>
                  <td className="px-4 py-3"><Badge kind={u.account_status} /></td><td className="whitespace-nowrap px-4 py-3">{formatDate(u.created_at, me.date_format)}</td>
                  <td className="px-4 py-3 text-right">
                    <button className="btn-secondary" onClick={() => setTarget(u)}>{u.account_status === 'ACTIVE' ? <><UserX className="h-4 w-4" />Deactivate</> : <><UserCheck className="h-4 w-4" />Activate</>}</button>
                  </td>
                </tr>))}</tbody></table></div>)}
        {data && <Pagination page={data.page} pageSize={PAGE_SIZE} total={data.total} onChange={(p) => setF({ ...f, page: p })} />}
      </div>
      <ConfirmDialog open={!!target} busy={busy} onConfirm={toggle} onClose={() => setTarget(null)}
        title={deactivating ? 'Deactivate account?' : 'Activate account?'} confirmLabel={deactivating ? 'Deactivate' : 'Activate'}
        message={target ? (deactivating ? `${target.full_name} will be signed out and unable to log in until reactivated. Their data is kept.` : `${target.full_name} will be able to log in again.`) : ''} />
    </>
  )
}
