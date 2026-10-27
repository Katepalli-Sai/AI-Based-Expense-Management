import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Pencil, Plus } from 'lucide-react'
import api, { parseError } from '../../api'
import { useFetch } from '../../hooks'
import { Badge, EmptyState, ErrorBanner, Field, Modal, PageHeader, Skeleton, Spinner, useToast } from '../../components/ui'
import { cx } from '../../utils'

function CategoryForm({ open, initial, onClose, onSaved }) {
  const toast = useToast()
  const [error, setError] = useState('')
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm()
  const editing = !!initial?.id
  useEffect(() => { if (open) { setError(''); reset({ name: initial?.name || '', type: initial?.type || 'EXPENSE', description: initial?.description || '' }) } }, [open, initial, reset])
  const onSubmit = async (v) => {
    try {
      if (editing) await api.put(`/api/admin/categories/${initial.id}`, { name: v.name.trim(), description: v.description.trim() })
      else await api.post('/api/admin/categories', { name: v.name.trim(), type: v.type, description: v.description.trim() || null })
      toast(editing ? 'Category updated' : 'Category created'); onSaved(); onClose()
    } catch (e) { setError(parseError(e).message) }
  }
  return (
    <Modal open={open} title={editing ? 'Edit category' : 'Add category'} onClose={onClose}>
      <ErrorBanner message={error} />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Name" htmlFor="cn" error={errors.name?.message}><input id="cn" maxLength={80} className={cx('input', errors.name && 'input-error')} {...register('name', { required: 'Enter a name' })} /></Field>
        <Field label="Type" htmlFor="ct" hint={editing ? 'A category’s type can’t be changed.' : undefined}>
          <select id="ct" className="input" disabled={editing} {...register('type')}><option value="EXPENSE">Expense</option><option value="INCOME">Income</option></select></Field>
        <Field label="Description (optional)" htmlFor="cd"><input id="cd" maxLength={255} className="input" {...register('description')} /></Field>
        <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner className="h-4 w-4 text-white" />}{editing ? 'Save changes' : 'Add category'}</button></div>
      </form>
    </Modal>
  )
}

export default function CategoryManagement() {
  const toast = useToast()
  const { data, loading, error, reload } = useFetch('/api/admin/categories')
  const [form, setForm] = useState({ open: false, initial: null })
  const toggle = async (c) => {
    try { await api.put(`/api/admin/categories/${c.id}`, { is_active: !c.is_active }); toast(c.is_active ? 'Category deactivated' : 'Category activated'); reload() }
    catch (e) { toast(parseError(e).message, 'error') }
  }
  const Section = ({ type, title }) => {
    const rows = (data || []).filter((c) => c.type === type)
    return (
      <div className="card overflow-hidden">
        <h2 className="border-b border-slate-200 px-4 py-3 font-semibold text-navy-900">{title}</h2>
        {rows.length === 0 ? <EmptyState title="No categories" /> : (
          <ul className="divide-y divide-slate-100">{rows.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0"><p className={cx('font-medium', c.is_active ? 'text-slate-900' : 'text-slate-400 line-through')}>{c.name}</p>{c.description && <p className="truncate text-xs text-slate-500">{c.description}</p>}</div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge kind={c.is_active ? 'ACTIVE' : 'INACTIVE'} />
                <button className="btn-ghost !px-2" aria-label={`Edit ${c.name}`} onClick={() => setForm({ open: true, initial: c })}><Pencil className="h-4 w-4" /></button>
                <button className="btn-secondary" onClick={() => toggle(c)}>{c.is_active ? 'Deactivate' : 'Activate'}</button>
              </div>
            </li>))}</ul>)}
      </div>
    )
  }
  return (
    <>
      <PageHeader title="Category Management" subtitle="Categories are shared by all users. Deactivating hides a category from new entries but keeps history intact.">
        <button className="btn-primary" onClick={() => setForm({ open: true, initial: null })}><Plus className="h-4 w-4" />Add category</button>
      </PageHeader>
      <ErrorBanner message={error} onRetry={reload} />
      {loading && !data ? <Skeleton className="h-48" /> : <div className="grid items-start gap-4 lg:grid-cols-2"><Section type="INCOME" title="Income categories" /><Section type="EXPENSE" title="Expense categories" /></div>}
      <CategoryForm open={form.open} initial={form.initial} onClose={() => setForm({ open: false, initial: null })} onSaved={reload} />
    </>
  )
}
