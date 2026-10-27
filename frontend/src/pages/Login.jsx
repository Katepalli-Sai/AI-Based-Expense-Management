import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import AuthShell from '../components/AuthShell'
import { ErrorBanner, Field, Spinner } from '../components/ui'
import { useAuth } from '../auth'
import { parseError } from '../api'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [error, setError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm()

  const onSubmit = async (v) => {
    setError('')
    try {
      const u = await login(v.email.trim(), v.password)
      nav(u.role === 'ADMIN' ? '/admin/dashboard' : '/dashboard', { replace: true })
    } catch (e) { setError(parseError(e).message) }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Log in to your account." footer={<>New here? <Link to="/register" className="font-medium text-brand-600 hover:underline">Create an account</Link></>}>
      <ErrorBanner message={error} />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <input id="email" type="email" autoComplete="email" className={`input ${errors.email ? 'input-error' : ''}`}
            {...register('email', { required: 'Enter your email', pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email' } })} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <input id="password" type="password" autoComplete="current-password" className={`input ${errors.password ? 'input-error' : ''}`}
            {...register('password', { required: 'Enter your password' })} />
        </Field>
        <button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting && <Spinner className="h-4 w-4 text-white" />}Log in</button>
      </form>
    </AuthShell>
  )
}
