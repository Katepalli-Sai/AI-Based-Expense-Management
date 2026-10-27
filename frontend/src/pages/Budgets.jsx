import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import api, { parseError } from '../api'
import { useAuth } from '../auth'
import { useCategories, useFetch } from '../hooks'
import { Badge, ConfirmDialog, EmptyState, ErrorBanner, Field, Modal, PageHeader, ProgressBar, Skeleton, Spinner, useToast } from '../components/ui'
import { cx, formatDate, formatMoney, todayISO } from '../utils'

function monthRange() {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth()
  const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))]
}

function BudgetForm({ open, initial, onClose, onSaved }) {
  const toast = useToast()
  const categories = useCategories('EXPENSE')
  const [error, setError] = useState('')
  const { register, handleSubmit, reset, watch, setError: setFieldError, formState: { errors, isSubmitting } } = useForm()
  const editing = !!initial?.id

  useEffect(() => {
    if (!open) return
    setError('')
    const [s, e] = monthRange()
    reset({ category_id: initial?.category_id ?? '', limit_amount: initial?.limit_amount ?? '', start_date: initial?.start_date || s, end_date: initial?.end_date || e })
  }, [open, initial, reset])

  const onSubmit = async (v) => {
    setError('')
    const body = { category_id: Number(v.category_id), limit_amount: String(v.limit_amount).trim(), start_date: v.start_date, end_date: v.end_date }
    try {
      if (editing) await api.put(`/api/budgets/${initial.id}`, body); else await api.post('/api/budgets', body)
      toast(editing ? 'Budget updated' : 'Budget created'); onSaved(); onClose()
    } catch (e) {
      const p = parseError(e)
      Object.entries(p.fields).forEach(([f, m]) => setFieldError(f, { message: m }))
      setError(p.message)
    }
  }
  const cls = (n) => cx('input', errors[n] && 'input-error')
  return (
    <Modal open={open} title={editing ? 'Edit budget' : 'Create budget'} onClose={onClose}>
      <ErrorBanner message={error} />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Expense category" htmlFor="b_cat" error={errors.category_id?.message}>
          <select id="b_cat" className={cls('category_id')} {...register('category_id', { required: 'Choose a category' })}>
            <option value="">Select a category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Spending limit" htmlFor="b_limit" error={errors.limit_amount?.message}>
          <input id="b_limit" inputMode="decimal" className={cls('limit_amount')} {...register('limit_amount', { required: 'Enter a limit', validate: (x) => (/^\d+(\.\d{1,2})?$/.test(String(x).trim()) && Number(x) > 0) || 'Enter a positive amount with up to 2 decimals' })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date" htmlFor="b_start" error={errors.start_date?.message}><input id="b_start" type="date" className={cls('start_date')} {...register('start_date', { required: 'Required' })} /></Field>
          <Field label="End date" htmlFor="b_end" error={errors.end_date?.message}><input id="b_end" type="date" className={cls('end_date')} {...register('end_date', { required: 'Required', validate: (x) => x >= watch('start_date') || 'Must be on or after the start date' })} /></Field>
        </div>
        <p className="text-xs text-slate-500">Only expenses in this category and date range count toward the budget. Budgets for the same category can’t overlap.</p>
        <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner className="h-4 w-4 text-white" />}{editing ? 'Save changes' : 'Create budget'}</button></div>
      </form>
    </Modal>
  )
}

export default function Budgets() {
  const { user } = useAuth()
  const toast = useToast()
  const { data, loading, error, reload } = useFetch('/api/budgets')
  const [form, setForm] = useState({ open: false, initial: null })
  const [del, setDel] = useState(null)
  const [busy, setBusy] = useState(false)
  const money = (v) => formatMoney(v, user.currency)
  const remove = async () => {
    setBusy(true)
    try { await api.delete(`/api/budgets/${del.id}`); toast('Budget deleted'); setDel(null); reload() }
    catch (e) { toast(parseError(e).message, 'error') } finally { setBusy(false) }
  }
  const today = todayISO()

  return (
    <>
      <PageHeader title="Budgets" subtitle="Set spending limits and watch your progress.">
        <button className="btn-primary" onClick={() => setForm({ open: true, initial: null })}><Plus className="h-4 w-4" />Create budget</button>
      </PageHeader>
      <ErrorBanner message={error} onRetry={reload} />
      {loading && !data ? <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-36" />)}</div>
        : data?.items.length === 0 ? <div className="card"><EmptyState icon={Wallet} title="No budgets yet" text="Create a budget for a spending category to see how much you have left."
            action={<button className="btn-primary" onClick={() => setForm({ open: true, initial: null })}><Plus className="h-4 w-4" />Create your first budget</button>} /></div>
        : (
          <div className="grid gap-4 md:grid-cols-2">
            {data?.items.map((b) => (
              <div key={b.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-navy-900">{b.category_name}</h3>
                    <p className="text-xs text-slate-500">{formatDate(b.start_date, user.date_format)} – {formatDate(b.end_date, user.date_format)}{b.end_date < today && ' · ended'}{b.start_date > today && ' · upcoming'}</p>
                  </div>
                  <Badge kind={b.status} />
                </div>
                <div className="mt-4"><ProgressBar percent={b.progress_percent} status={b.status} /></div>
                <div className="mt-2 flex justify-between text-sm"><span className="text-slate-600">{b.progress_percent}% used</span><span className="font-medium text-slate-900">{money(b.spent)} / {money(b.limit_amount)}</span></div>
                <p className={cx('mt-1 text-sm', Number(b.remaining) < 0 ? 'font-medium text-red-600' : 'text-slate-500')}>
                  {Number(b.remaining) < 0 ? `${money(Math.abs(Number(b.remaining)))} over the limit` : `${money(b.remaining)} remaining`}
                </p>
                <div className="mt-3 flex justify-end gap-1">
                  <button className="btn-ghost !px-2" aria-label={`Edit ${b.category_name} budget`} onClick={() => setForm({ open: true, initial: b })}><Pencil className="h-4 w-4" /></button>
                  <button className="btn-ghost !px-2 text-red-600" aria-label={`Delete ${b.category_name} budget`} onClick={() => setDel(b)}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      <BudgetForm open={form.open} initial={form.initial} onClose={() => setForm({ open: false, initial: null })} onSaved={reload} />
      <ConfirmDialog open={!!del} title="Delete budget?" busy={busy} onConfirm={remove} onClose={() => setDel(null)}
        message={del ? `The ${del.category_name} budget will be removed. Your transactions are not affected.` : ''} />
    </>
  )
}
