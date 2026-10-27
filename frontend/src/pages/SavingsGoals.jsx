import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { ChevronDown, ChevronUp, PiggyBank, Pencil, Plus, Trash2 } from 'lucide-react'
import api, { parseError } from '../api'
import { useAuth } from '../auth'
import { useFetch } from '../hooks'
import { Badge, ConfirmDialog, EmptyState, ErrorBanner, Field, Modal, PageHeader, ProgressBar, Skeleton, Spinner, useToast } from '../components/ui'
import { cx, formatDate, formatMoney, todayISO } from '../utils'

const amountRule = { required: 'Enter an amount', validate: (x) => (/^\d+(\.\d{1,2})?$/.test(String(x).trim()) && Number(x) > 0) || 'Enter a positive amount with up to 2 decimals' }

function GoalForm({ open, initial, onClose, onSaved }) {
  const toast = useToast()
  const [error, setError] = useState('')
  const { register, handleSubmit, reset, setError: setFieldError, formState: { errors, isSubmitting } } = useForm()
  const editing = !!initial?.id
  useEffect(() => { if (open) { setError(''); reset({ name: initial?.name || '', target_amount: initial?.target_amount ?? '', target_date: initial?.target_date || '' }) } }, [open, initial, reset])
  const onSubmit = async (v) => {
    const body = { name: v.name.trim(), target_amount: String(v.target_amount).trim(), target_date: v.target_date || null }
    try {
      if (editing) await api.put(`/api/savings-goals/${initial.id}`, body); else await api.post('/api/savings-goals', body)
      toast(editing ? 'Goal updated' : 'Goal created'); onSaved(); onClose()
    } catch (e) { const p = parseError(e); Object.entries(p.fields).forEach(([f, m]) => setFieldError(f, { message: m })); setError(p.message) }
  }
  const cls = (n) => cx('input', errors[n] && 'input-error')
  return (
    <Modal open={open} title={editing ? 'Edit goal' : 'Create savings goal'} onClose={onClose}>
      <ErrorBanner message={error} />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Goal name" htmlFor="g_name" error={errors.name?.message}><input id="g_name" maxLength={120} className={cls('name')} {...register('name', { required: 'Enter a name' })} /></Field>
        <Field label="Target amount" htmlFor="g_target" error={errors.target_amount?.message}><input id="g_target" inputMode="decimal" className={cls('target_amount')} {...register('target_amount', amountRule)} /></Field>
        <Field label="Target date (optional)" htmlFor="g_date"><input id="g_date" type="date" className="input" {...register('target_date')} /></Field>
        <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner className="h-4 w-4 text-white" />}{editing ? 'Save changes' : 'Create goal'}</button></div>
      </form>
    </Modal>
  )
}

function ContributionForm({ goal, onClose, onSaved }) {
  const toast = useToast()
  const [error, setError] = useState('')
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm()
  useEffect(() => { if (goal) { setError(''); reset({ amount: '', contribution_date: todayISO(), description: '' }) } }, [goal, reset])
  const onSubmit = async (v) => {
    try {
      await api.post(`/api/savings-goals/${goal.id}/contributions`, { amount: String(v.amount).trim(), contribution_date: v.contribution_date, description: v.description?.trim() || null })
      toast('Contribution recorded'); onSaved(); onClose()
    } catch (e) { setError(parseError(e).message) }
  }
  return (
    <Modal open={!!goal} title={goal ? `Add to “${goal.name}”` : ''} onClose={onClose}>
      <ErrorBanner message={error} />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Amount" htmlFor="c_amt" error={errors.amount?.message}><input id="c_amt" inputMode="decimal" className={cx('input', errors.amount && 'input-error')} {...register('amount', amountRule)} /></Field>
        <Field label="Date" htmlFor="c_date" error={errors.contribution_date?.message}><input id="c_date" type="date" className="input" {...register('contribution_date', { required: 'Choose a date' })} /></Field>
        <Field label="Note (optional)" htmlFor="c_desc"><input id="c_desc" maxLength={255} className="input" {...register('description')} /></Field>
        <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner className="h-4 w-4 text-white" />}Record contribution</button></div>
      </form>
    </Modal>
  )
}

function Contributions({ goal, onChanged }) {
  const { user } = useAuth()
  const toast = useToast()
  const { data, loading, reload } = useFetch(`/api/savings-goals/${goal.id}/contributions`, undefined, [goal.total_contributed])
  const remove = async (c) => {
    try { await api.delete(`/api/savings-goals/${goal.id}/contributions/${c.id}`); toast('Contribution removed'); onChanged() } catch (e) { toast(parseError(e).message, 'error') }
  }
  if (loading && !data) return <Skeleton className="mt-3 h-10" />
  if (!data?.items.length) return <p className="mt-3 text-sm text-slate-500">No contributions yet.</p>
  return (
    <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100 text-sm">
      {data.items.map((c) => (
        <li key={c.id} className="flex items-center justify-between py-2">
          <span><span className="font-medium text-slate-900">{formatMoney(c.amount, user.currency)}</span> <span className="text-slate-500">· {formatDate(c.contribution_date, user.date_format)}{c.description && ` · ${c.description}`}</span></span>
          <button className="btn-ghost !px-2 text-red-600" aria-label="Remove contribution" onClick={() => remove(c)}><Trash2 className="h-4 w-4" /></button>
        </li>))}
    </ul>
  )
}

export default function SavingsGoals() {
  const { user } = useAuth()
  const toast = useToast()
  const { data, loading, error, reload } = useFetch('/api/savings-goals')
  const [form, setForm] = useState({ open: false, initial: null })
  const [contrib, setContrib] = useState(null)
  const [open, setOpen] = useState(null)
  const [del, setDel] = useState(null)
  const [busy, setBusy] = useState(false)
  const money = (v) => formatMoney(v, user.currency)
  const remove = async () => {
    setBusy(true)
    try { await api.delete(`/api/savings-goals/${del.id}`); toast('Goal deleted'); setDel(null); reload() } catch (e) { toast(parseError(e).message, 'error') } finally { setBusy(false) }
  }
  const total = (data?.items || []).reduce((a, g) => a + Number(g.total_contributed), 0)

  return (
    <>
      <PageHeader title="Savings Goals" subtitle="Only contributions you record count toward a goal.">
        <button className="btn-primary" onClick={() => setForm({ open: true, initial: null })}><Plus className="h-4 w-4" />Create goal</button>
      </PageHeader>
      <ErrorBanner message={error} onRetry={reload} />
      {loading && !data ? <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-44" />)}</div>
        : data?.items.length === 0 ? <div className="card"><EmptyState icon={PiggyBank} title="No savings goals yet" text="Set a target, then record contributions as you save."
            action={<button className="btn-primary" onClick={() => setForm({ open: true, initial: null })}><Plus className="h-4 w-4" />Create your first goal</button>} /></div>
        : (
          <>
            <p className="mb-4 text-sm text-slate-600">Total contributed across goals: <span className="font-semibold text-navy-900">{money(total)}</span></p>
            <div className="grid items-start gap-4 md:grid-cols-2">
              {data.items.map((g) => (
                <div key={g.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div><h3 className="font-semibold text-navy-900">{g.name}</h3>
                      <p className="text-xs text-slate-500">{g.target_date ? `Target ${formatDate(g.target_date, user.date_format)}` : 'No target date'}</p></div>
                    <Badge kind={g.status} />
                  </div>
                  <div className="mt-4"><ProgressBar percent={g.progress_percent} status={g.status} /></div>
                  <div className="mt-2 flex justify-between text-sm"><span>{g.progress_percent}%</span><span className="font-medium text-slate-900">{money(g.total_contributed)} / {money(g.target_amount)}</span></div>
                  <p className="mt-1 text-sm text-slate-500">{g.status === 'COMPLETED' ? 'Goal reached' : `${money(g.remaining)} remaining`}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <button className="btn-secondary" onClick={() => setContrib(g)}><Plus className="h-4 w-4" />Add contribution</button>
                    <div className="flex gap-1">
                      <button className="btn-ghost !px-2" aria-label={`Show contributions for ${g.name}`} aria-expanded={open === g.id} onClick={() => setOpen(open === g.id ? null : g.id)}>{open === g.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
                      <button className="btn-ghost !px-2" aria-label={`Edit ${g.name}`} onClick={() => setForm({ open: true, initial: g })}><Pencil className="h-4 w-4" /></button>
                      <button className="btn-ghost !px-2 text-red-600" aria-label={`Delete ${g.name}`} onClick={() => setDel(g)}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  {open === g.id && <Contributions goal={g} onChanged={reload} />}
                </div>
              ))}
            </div>
          </>
        )}
      <GoalForm open={form.open} initial={form.initial} onClose={() => setForm({ open: false, initial: null })} onSaved={reload} />
      <ContributionForm goal={contrib} onClose={() => setContrib(null)} onSaved={reload} />
      <ConfirmDialog open={!!del} title="Delete goal?" busy={busy} onConfirm={remove} onClose={() => setDel(null)}
        message={del ? `“${del.name}” and its ${money(del.total_contributed)} of recorded contributions will be removed.` : ''} />
    </>
  )
}
