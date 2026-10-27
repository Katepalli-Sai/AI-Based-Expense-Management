import { Target } from 'lucide-react'

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-navy-900 p-10 text-white lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold"><div className="rounded-lg bg-brand-600 p-2"><Target className="h-5 w-5" /></div> Income &amp; Expense</div>
        <div>
          <h2 className="max-w-md text-3xl font-semibold leading-tight">Know where your money goes, and where it could go next.</h2>
          <p className="mt-4 max-w-md text-blue-200">Track income and spending, set budgets, work toward savings goals, and ask questions about your own numbers.</p>
        </div>
        <p className="text-sm text-blue-300">Your records are private to your account.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-semibold text-navy-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-6">{children}</div>
          <p className="mt-6 text-center text-sm text-slate-600">{footer}</p>
        </div>
      </div>
    </div>
  )
}
