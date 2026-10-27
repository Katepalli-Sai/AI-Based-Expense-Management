import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight, Bot, LayoutDashboard, LogOut, Menu, PiggyBank, Settings, ShieldCheck, Sparkles, Tags, Target, UserCog, Users, Wallet, X,
} from 'lucide-react'
import { useAuth } from '../auth'
import { cx } from '../utils'

export const USER_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/budgets', label: 'Budgets', icon: Wallet },
  { to: '/ai-insights', label: 'AI Insights', icon: Sparkles },
  { to: '/savings-goals', label: 'Savings Goals', icon: PiggyBank },
  { to: '/ai-chat', label: 'AI Financial Chat', icon: Bot },
  { to: '/settings', label: 'Profile & Settings', icon: UserCog },
]

export const ADMIN_NAV = [
  { to: '/admin/dashboard', label: 'Admin Dashboard', icon: LayoutDashboard },
  { to: '/admin/users', label: 'User Management', icon: Users },
  { to: '/admin/ai-insights', label: 'AI Insights', icon: Sparkles },
  { to: '/admin/categories', label: 'Category Management', icon: Tags },
  { to: '/admin/settings', label: 'Admin Settings', icon: Settings },
]

function NavItems({ items, onNavigate }) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} onClick={onNavigate}
          className={({ isActive }) => cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
            isActive ? 'bg-white/15 text-white' : 'text-blue-100 hover:bg-white/10 hover:text-white')}>
          <Icon className="h-5 w-5" />{label}
        </NavLink>
      ))}
    </nav>
  )
}

function Brand({ admin }) {
  return (
    <div className="flex items-center gap-2 px-2 pb-6 text-white">
      <div className="rounded-lg bg-brand-600 p-2"><Target className="h-5 w-5" /></div>
      <div>
        <p className="text-sm font-semibold leading-tight">Income &amp; Expense</p>
        <p className="flex items-center gap-1 text-xs text-blue-200">{admin ? <><ShieldCheck className="h-3 w-3" /> Administrator</> : 'Manager'}</p>
      </div>
    </div>
  )
}

export default function Layout({ admin = false }) {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const items = admin ? ADMIN_NAV : USER_NAV
  const signOut = async () => { await logout(); nav('/login') }

  const sidebar = (onNavigate) => (
    <div className="flex h-full flex-col bg-navy-900 p-4">
      <Brand admin={admin} />
      <NavItems items={items} onNavigate={onNavigate} />
      <div className="mt-auto border-t border-white/10 pt-4">
        <p className="truncate px-2 text-sm font-medium text-white">{user.full_name}</p>
        <p className="truncate px-2 text-xs text-blue-200">{user.email}</p>
        <button onClick={signOut} className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-blue-100 hover:bg-white/10 hover:text-white">
          <LogOut className="h-4 w-4" /> Log out
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 lg:block">{sidebar()}</aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2 font-semibold text-navy-900"><Target className="h-5 w-5 text-brand-600" /> Income &amp; Expense</div>
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded p-1 text-slate-700 hover:bg-slate-100"><Menu className="h-6 w-6" /></button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-xl">
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-3 z-10 rounded p-1 text-white hover:bg-white/10"><X className="h-5 w-5" /></button>
            {sidebar(() => setOpen(false))}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8"><Outlet /></main>
    </div>
  )
}
