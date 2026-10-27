import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api, { parseError } from '../api'
import { useAuth } from '../auth'
import { ErrorBanner, Field, PageHeader, Spinner, useToast } from '../components/ui'
import { cx, formatDate } from '../utils'

function ProfileForm() {
  const { user, setUser } = useAuth()
  const toast = useToast()
  const [error, setError] = useState('')
  const { register, handleSubmit, reset, setError: setFieldError, formState: { errors, isSubmitting, isDirty } } = useForm({ defaultValues: user })
  useEffect(() => { reset(user) }, [user, reset])
  const onSubmit = async (v) => {
    setError('')
    try {
      const r = await api.put('/api/auth/me', { full_name: v.full_name.trim(), email: v.email.trim(), currency: v.currency, date_format: v.date_format })
      setUser(r.data); toast('Profile saved')
    } catch (e) { const p = parseError(e); Object.entries(p.fields).forEach(([f, m]) => setFieldError(f, { message: m })); setError(p.message) }
  }
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4 p-5" noValidate>
      <h2 className="font-semibold text-navy-900">Profile</h2>
      <ErrorBanner message={error} />
      <Field label="Full name" htmlFor="p_name" error={errors.full_name?.message}><input id="p_name" className={cx('input', errors.full_name && 'input-error')} {...register('full_name', { required: 'Enter your name', minLength: { value: 2, message: 'At least 2 characters' } })} /></Field>
      <Field label="Email" htmlFor="p_email" error={errors.email?.message}><input id="p_email" type="email" className={cx('input', errors.email && 'input-error')} {...register('email', { required: 'Enter your email', pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email' } })} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display currency" htmlFor="p_cur" hint="Changes how amounts are shown; it does not convert them."><select id="p_cur" className="input" {...register('currency')}>
          <option value="INR">₹ Indian Rupee (INR)</option><option value="USD">$ US Dollar (USD)</option><option value="EUR">€ Euro (EUR)</option><option value="GBP">£ Pound (GBP)</option></select></Field>
        <Field label="Date format" htmlFor="p_df"><select id="p_df" className="input" {...register('date_format')}><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option></select></Field>
      </div>
      <div className="flex justify-end"><button className="btn-primary" disabled={isSubmitting || !isDirty}>{isSubmitting && <Spinner className="h-4 w-4 text-white" />}Save changes</button></div>
    </form>
  )
}

function PasswordForm() {
  const { acceptToken } = useAuth()
  const toast = useToast()
  const [error, setError] = useState('')
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm()
  const onSubmit = async (v) => {
    setError('')
    try {
      const r = await api.post('/api/auth/change-password', { current_password: v.current_password, new_password: v.new_password, confirm_password: v.confirm_password })
      acceptToken(r.data); reset(); toast('Password changed')
    } catch (e) { setError(parseError(e).message) }
  }
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4 p-5" noValidate>
      <h2 className="font-semibold text-navy-900">Change password</h2>
      <ErrorBanner message={error} />
      <Field label="Current password" htmlFor="cp" error={errors.current_password?.message}><input id="cp" type="password" autoComplete="current-password" className="input" {...register('current_password', { required: 'Enter your current password' })} /></Field>
      <Field label="New password" htmlFor="np" hint="At least 8 characters. Other devices will be signed out." error={errors.new_password?.message}><input id="np" type="password" autoComplete="new-password" className="input" {...register('new_password', { required: 'Choose a new password', minLength: { value: 8, message: 'At least 8 characters' } })} /></Field>
      <Field label="Confirm new password" htmlFor="cnp" error={errors.confirm_password?.message}><input id="cnp" type="password" autoComplete="new-password" className="input" {...register('confirm_password', { required: 'Confirm the new password', validate: (x) => x === watch('new_password') || 'Passwords do not match' })} /></Field>
      <div className="flex justify-end"><button className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner className="h-4 w-4 text-white" />}Change password</button></div>
    </form>
  )
}

export default function Profile({ admin = false }) {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  return (
    <>
      <PageHeader title={admin ? 'Admin Settings' : 'Profile & Settings'} subtitle={`Account created ${formatDate(user.created_at, user.date_format)} · Role: ${user.role === 'ADMIN' ? 'Administrator' : 'User'}`}>
        <button className="btn-secondary" onClick={async () => { await logout(); nav('/login') }}><LogOut className="h-4 w-4" />Log out</button>
      </PageHeader>
      <div className="grid items-start gap-4 lg:grid-cols-2"><ProfileForm /><PasswordForm /></div>
    </>
  )
}
