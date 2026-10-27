import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import api, { parseError } from '../api'
import { useCategories } from '../hooks'
import { ErrorBanner, Field, Modal, Spinner, useToast } from './ui'
import { cx, todayISO } from '../utils'

/** Add / edit dialog. `initial` = existing transaction (edit) or { type } preset (add). */
export default function TransactionForm({ open, initial, onClose, onSaved }) {
  const editing = !!initial?.id
  const toast = useToast()
  const [error, setError] = useState('')
  const { register, handleSubmit, reset, watch, setValue, setError: setFieldError, formState: { errors, isSubmitting } } = useForm()
  const type = watch('type') || 'EXPENSE'
  const categories = useCategories(type)

  useEffect(() => {
    if (!open) return
    setError('')
    reset({
      type: initial?.type || 'EXPENSE', amount: initial?.amount ?? '', category_id: initial?.category_id ?? '',
      description: initial?.description || '', transaction_date: initial?.transaction_date || todayISO(),
    })
  }, [open, initial, reset])

  const onSubmit = async (v) => {
    setError('')
    const body = { type: v.type, amount: String(v.amount).trim(), category_id: Number(v.category_id), description: v.description?.trim() || null, transaction_date: v.transaction_date }
    try {
      if (editing) await api.put(`/api/transactions/${initial.id}`, body)
      else await api.post('/api/transactions', body)
      toast(editing ? 'Transaction updated' : 'Transaction added')
      onSaved?.()
      onClose()
    } catch (e) {
      const p = parseError(e)
      Object.entries(p.fields).forEach(([f, m]) => setFieldError(f, { message: m }))
      setError(p.message)
    }
  }

  const cls = (n) => cx('input', errors[n] && 'input-error')
  return (
    <Modal open={open} title={editing ? 'Edit transaction' : 'Add transaction'} onClose={onClose}>
      <ErrorBanner message={error} />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Type">
          {['EXPENSE', 'INCOME'].map((t) => (
            <label key={t} className={cx('cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium', type === t ? (t === 'INCOME' ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-rose-600 bg-rose-50 text-rose-700') : 'border-slate-300 text-slate-600')}>
              <input type="radio" value={t} className="sr-only" {...register('type', { onChange: () => setValue('category_id', '') })} />
              {t === 'INCOME' ? 'Income' : 'Expense'}
            </label>
          ))}
        </div>
        <Field label="Amount" htmlFor="amount" error={errors.amount?.message} hint="Up to 2 decimal places">
          <input id="amount" inputMode="decimal" placeholder="0.00" className={cls('amount')}
            {...register('amount', { required: 'Enter an amount', validate: (x) => (/^\d+(\.\d{1,2})?$/.test(String(x).trim()) && Number(x) > 0) || 'Enter a positive amount with up to 2 decimals' })} />
        </Field>
        <Field label="Category" htmlFor="category_id" error={errors.category_id?.message}>
          <select id="category_id" className={cls('category_id')} {...register('category_id', { required: 'Choose a category' })}>
            <option value="">Select a category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Date" htmlFor="transaction_date" error={errors.transaction_date?.message}>
          <input id="transaction_date" type="date" className={cls('transaction_date')} {...register('transaction_date', { required: 'Choose a date' })} />
        </Field>
        <Field label="Description (optional)" htmlFor="description" error={errors.description?.message}>
          <input id="description" maxLength={255} className={cls('description')} {...register('description')} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner className="h-4 w-4 text-white" />}{editing ? 'Save changes' : 'Add transaction'}</button>
        </div>
      </form>
    </Modal>
  )
}
