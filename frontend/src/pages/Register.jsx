import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import AuthShell from '../components/AuthShell'
import { ErrorBanner, Field, Spinner } from '../components/ui'
import { useAuth } from '../auth'
import { parseError } from '../api'

export default function Register() {
  const { register: signUp } = useAuth()
  const nav = useNavigate()
  const [error, setError] = useState('')
  const { register, handleSubmit, watch, setError: setFieldError, formState: { errors, isSubmitting } } = useForm()

  const onSubmit = async (v) => {
    setError('')
    try {
      await signUp({ full_name: v.full_name.trim(), email: v.email.trim(), password: v.password, confirm_password: v.confirm_password })
      nav('/dashboard', { replace: true })
    } catch (e) {
      const p = parseError(e)
      Object.entries(p.fields).forEach(([f, m]) => setFieldError(f, { message: m }))
      setError(p.message)
    }
  }

  const cls = (n) => `input ${errors[n] ? 'input-error' : ''}`
  return (
    <AuthShell title="Create your account" subtitle="Start tracking your money. New accounts start empty." footer={<>Already registered? <Link to="/login" className="font-medium text-brand-600 hover:underline">Log in</Link></>}>
      <ErrorBanner message={error} />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Full name" htmlFor="full_name" error={errors.full_name?.message}>
          <input id="full_name" autoComplete="name" className={cls('full_name')} {...register('full_name', { required: 'Enter your name', minLength: { value: 2, message: 'At least 2 characters' } })} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <input id="email" type="email" autoComplete="email" className={cls('email')} {...register('email', { required: 'Enter your email', pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email' } })} />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters" error={errors.password?.message}>
          <input id="password" type="password" autoComplete="new-password" className={cls('password')} {...register('password', { required: 'Choose a password', minLength: { value: 8, message: 'At least 8 characters' } })} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm_password" error={errors.confirm_password?.message}>
          <input id="confirm_password" type="password" autoComplete="new-password" className={cls('confirm_password')}
            {...register('confirm_password', { required: 'Confirm your password', validate: (x) => x === watch('password') || 'Passwords do not match' })} />
        </Field>
        <button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting && <Spinner className="h-4 w-4 text-white" />}Create account</button>
      </form>
    </AuthShell>
  )
}
