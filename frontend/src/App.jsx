import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import Layout from './components/Layout'
import { Spinner } from './components/ui'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Budgets from './pages/Budgets'
import AIInsights from './pages/AIInsights'
import SavingsGoals from './pages/SavingsGoals'
import AIChat from './pages/AIChat'
import Profile from './pages/Profile'
import AdminDashboard from './pages/admin/AdminDashboard'
import UserManagement from './pages/admin/UserManagement'
import AdminInsights from './pages/admin/AdminInsights'
import CategoryManagement from './pages/admin/CategoryManagement'
import AdminSettings from './pages/admin/AdminSettings'

const home = (u) => (u.role === 'ADMIN' ? '/admin/dashboard' : '/dashboard')

function Guard({ role, children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex h-screen items-center justify-center"><Spinner className="h-8 w-8" /></div>
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to={home(user)} replace />
  return children
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? <Navigate to={home(user)} replace /> : children
}

function Root() {
  const { user, loading } = useAuth()
  if (loading) return null
  return <Navigate to={user ? home(user) : '/login'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Root />} />
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />

      <Route element={<Guard role="USER"><Layout /></Guard>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/ai-insights" element={<AIInsights />} />
        <Route path="/savings-goals" element={<SavingsGoals />} />
        <Route path="/ai-chat" element={<AIChat />} />
        <Route path="/settings" element={<Profile />} />
      </Route>

      <Route element={<Guard role="ADMIN"><Layout admin /></Guard>}>
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/users" element={<UserManagement />} />
        <Route path="/admin/ai-insights" element={<AdminInsights />} />
        <Route path="/admin/categories" element={<CategoryManagement />} />
        <Route path="/admin/settings" element={<AdminSettings />} />
      </Route>

      <Route path="*" element={<Root />} />
    </Routes>
  )
}
