import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom'
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { expenseCategories, formatRupiah, generateId, getDaysInMonth, getMonthLabel, getTodayISO, incomeCategories, monthNames, paymentMethods, sumTransactions } from './lib/finance'
import { createTransaction, deleteTransactionById, ensureProfileExists, fetchProfileByUser, fetchTransactionsByUser, normalizeProfile, syncDefaultCategories, updateTransactionById } from './lib/dompetku'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { DraftTransaction, Transaction, TransactionType, UserProfile } from './types'

const emptyDraft: DraftTransaction = {
  description: '',
  category: 'Gaji',
  amount: '',
  transaction_date: getTodayISO(),
  payment_method: 'Cash',
  notes: '',
}

type AuthContextType = {
  user: UserProfile | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (fullName: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  updateProfile: (fullName: string) => Promise<void>
  updatePassword: (newPassword: string) => Promise<void>
}

type FinanceContextType = {
  transactions: Transaction[]
  addTransaction: (transaction: Transaction) => Promise<void>
  updateTransaction: (id: string, transaction: Transaction) => Promise<void>
  deleteTransaction: (id: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)
const FinanceContext = createContext<FinanceContextType | null>(null)

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const client = supabase
    if (!client) {
      setLoading(false)
      return
    }

    let isMounted = true

    const hydrate = async () => {
      const { data: { session } } = await client.auth.getSession()
      if (!isMounted) return

      if (session?.user) {
        const profile = await fetchProfileByUser(session.user.id)
        setUser(profile ?? normalizeProfile(session.user))
      } else {
        setUser(null)
      }

      setLoading(false)
    }

    hydrate()

    const { data: { subscription } } = client.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return

      if (session?.user) {
        const profile = await fetchProfileByUser(session.user.id)
        setUser(profile ?? normalizeProfile(session.user))
      } else {
        setUser(null)
      }

      setLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const login = async (email: string, password: string) => {
    if (!supabase) {
      throw new Error('Supabase belum dikonfigurasi. Silakan isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY.')
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      const message = error.message.toLowerCase()
      if (message.includes('not confirmed') || message.includes('email') && message.includes('confirm')) {
        throw new Error('Email belum dikonfirmasi. Silakan cek inbox email Anda lalu login kembali.')
      }
      if (message.includes('invalid login credentials')) {
        throw new Error('Email atau password salah, atau email Anda belum dikonfirmasi.')
      }
      if (message.includes('rate limit')) {
        throw new Error('Terlalu banyak percobaan login. Tunggu beberapa menit lalu coba lagi.')
      }
      throw new Error(error.message)
    }

    const profile = await fetchProfileByUser(data.user.id)
    setUser(profile ?? normalizeProfile(data.user))
  }

  const register = async (fullName: string, email: string, password: string) => {
    const trimmedName = fullName.trim()
    const normalizedEmail = email.trim().toLowerCase()

    if (!trimmedName || !normalizedEmail || password.length < 6) {
      throw new Error('Nama, email, dan password wajib diisi dengan benar.')
    }

    if (!supabase) {
      throw new Error('Supabase belum dikonfigurasi. Silakan isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY.')
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: trimmedName,
        },
      },
    })

    if (error) {
      const message = error.message.toLowerCase()
      if (message.includes('rate limit')) {
        throw new Error('Terlalu banyak permintaan pendaftaran. Tunggu beberapa menit lalu coba lagi.')
      }
      if (message.includes('already')) {
        throw new Error('Email ini sudah terdaftar. Silakan login atau gunakan email lain.')
      }
      throw new Error(error.message)
    }

    if (data.user) {
      await ensureProfileExists(data.user.id, trimmedName, normalizedEmail)
      await syncDefaultCategories(data.user.id)

      if (!data.session) {
        return
      }

      const profile = await fetchProfileByUser(data.user.id)
      setUser(profile ?? { id: data.user.id, full_name: trimmedName, email: normalizedEmail })
    }
  }

  const logout = async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setUser(null)
  }

  const updateProfile = async (fullName: string) => {
    if (!user || !supabase) return

    const nextName = fullName.trim()
    if (!nextName) return

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: nextName, updated_at: new Date().toISOString() })
      .eq('id', user.id)

    if (error) throw error

    setUser({ ...user, full_name: nextName })
  }

  const updatePassword = async (newPassword: string) => {
    if (!supabase || !user || newPassword.length < 6) return

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateProfile, updatePassword }}>
      {children}
    </AuthContext.Provider>
  )
}

function FinanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    const load = async () => {
      if (!user?.id || !supabase) {
        setTransactions([])
        return
      }

      try {
        const rows = await fetchTransactionsByUser(user.id)
        setTransactions(rows)
      } catch (error) {
        console.error('Failed to load transactions', error)
        setTransactions([])
      }
    }

    load()
  }, [user?.id])

  const addTransaction = async (transaction: Transaction) => {
    if (!user?.id || !supabase) return

    const created = await createTransaction({ ...transaction, user_id: user.id })
    setTransactions((current) => [created, ...current])
  }

  const updateTransaction = async (id: string, transaction: Transaction) => {
    if (!user?.id || !supabase) return

    const updated = await updateTransactionById({ ...transaction, id, user_id: user.id })
    setTransactions((current) => current.map((item) => (item.id === id ? updated : item)))
  }

  const deleteTransaction = async (id: string) => {
    if (!user?.id || !supabase) return

    await deleteTransactionById(id, user.id)
    setTransactions((current) => current.filter((item) => item.id !== id))
  }

  return (
    <FinanceContext.Provider value={{ transactions, addTransaction, updateTransaction, deleteTransaction }}>
      {children}
    </FinanceContext.Provider>
  )
}

function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('AuthContext is missing')
  return context
}

function useFinance() {
  const context = useContext(FinanceContext)
  if (!context) throw new Error('FinanceContext is missing')
  return context
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, logout } = useAuth()

  const navItems: Array<{ label: string; to: string; icon: LucideIcon }> = [
    { label: 'Dashboard', to: '/', icon: LayoutDashboard },
    { label: 'Pendapatan', to: '/income', icon: ArrowUpCircle },
    { label: 'Pengeluaran', to: '/expense', icon: ArrowDownCircle },
    { label: 'Pengaturan', to: '/settings', icon: Settings },
  ]

  const initials = user?.full_name?.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'DU'

  return (
    <div className="app-shell">
      <button className="mobile-menu-button" type="button" onClick={() => setMobileOpen((value) => !value)}>
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="brand-box">
          <div className="brand-mark">D</div>
          <div>
            <p className="brand-name">DompetKu</p>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map(({ label, to, icon: Icon }) => (
            <NavLink key={label} to={to} end={to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMobileOpen(false)}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="avatar">{initials}</div>
            <div>
              <strong>{user?.full_name || 'Pengguna'}</strong>
              <small>{user?.email || 'email@example.com'}</small>
            </div>
          </div>

          <button type="button" className="logout-button" onClick={logout}>
            <LogOut size={16} />
            Logout
          </button>

          <div className="watermark">Created by @ashofaya</div>
        </div>
      </aside>

      <div className="content-panel">
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function LoginPage() {
  const navigate = useNavigate()
  const { login, user } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [infoMessage, setInfoMessage] = useState('')

  useEffect(() => {
    const message = sessionStorage.getItem('dompetku-register-message')
    if (message) {
      setInfoMessage(message)
      sessionStorage.removeItem('dompetku-register-message')
    }

    if (user) navigate('/')
  }, [user, navigate])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login gagal.')
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card login-card">
        <div className="auth-header">
          <span className="brand-badge">D</span>
          <h2>Masuk ke DompetKu</h2>
        </div>

        <form onSubmit={submit} className="auth-form">
          <label>
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@contoh.com" required />
          </label>

          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" required />
          </label>

          {error ? <div className="error-box">{error}</div> : null}
          {infoMessage ? <div className="success-box">{infoMessage}</div> : null}

          <button type="submit" className="primary-button">Login</button>
        </form>

        <div className="auth-links">
          <a href="/register">Registrasi</a>
          <a href="/login">Lupa Password</a>
        </div>

        <div className="watermark auth-watermark">Created by @ashofaya</div>
      </div>
    </div>
  )
}

function RegisterPage() {
  const navigate = useNavigate()
  const { register, user } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    if (user) navigate('/')
  }, [user, navigate])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSuccessMessage('')

    if (password !== confirmPassword) {
      setError('Konfirmasi password tidak cocok.')
      return
    }

    try {
      await register(fullName, email, password)
      const info = 'Registrasi berhasil. Cek email Anda untuk verifikasi sebelum login.'
      setSuccessMessage(info)
      sessionStorage.setItem('dompetku-register-message', info)
      navigate('/login')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registrasi gagal.')
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <span className="brand-badge">D</span>
          <h2>Buat akun DompetKu</h2>
        </div>

        <form onSubmit={submit} className="auth-form">
          <label>
            <span>Nama lengkap</span>
            <input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nama lengkap" required />
          </label>

          <label>
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@contoh.com" required />
          </label>

          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimal 6 karakter" required />
          </label>

          <label>
            <span>Konfirmasi password</span>
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Ulangi password" required />
          </label>

          {error ? <div className="error-box">{error}</div> : null}
          {successMessage ? <div className="success-box">{successMessage}</div> : null}

          <button type="submit" className="primary-button">Register</button>
        </form>

        <div className="auth-links">
          <a href="/login">Sudah punya akun?</a>
        </div>

        <div className="watermark auth-watermark">Created by @ashofaya</div>
      </div>
    </div>
  )
}

function DashboardPage() {
  const { transactions } = useFinance()
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  const totalIncome = useMemo(() => sumTransactions(transactions, 'income'), [transactions])
  const totalExpense = useMemo(() => sumTransactions(transactions, 'expense'), [transactions])
  const totalBalance = totalIncome - totalExpense

  const monthIncome = useMemo(
    () => transactions.filter((item) => item.type === 'income' && matchesMonth(item.transaction_date, selectedMonth, selectedYear)).reduce((total, item) => total + Number(item.amount || 0), 0),
    [transactions, selectedMonth, selectedYear],
  )

  const monthExpense = useMemo(
    () => transactions.filter((item) => item.type === 'expense' && matchesMonth(item.transaction_date, selectedMonth, selectedYear)).reduce((total, item) => total + Number(item.amount || 0), 0),
    [transactions, selectedMonth, selectedYear],
  )

  const incomeSeries = useMemo(
    () => buildDailySeries(transactions.filter((item) => item.type === 'income'), selectedYear, selectedMonth),
    [transactions, selectedMonth, selectedYear],
  )

  const expenseSeries = useMemo(
    () => buildDailySeries(transactions.filter((item) => item.type === 'expense'), selectedYear, selectedMonth),
    [transactions, selectedMonth, selectedYear],
  )

  const donutData = useMemo(() => {
    const grouped = new Map<string, number>()
    const monthExpenseItems = transactions.filter((item) => item.type === 'expense' && matchesMonth(item.transaction_date, selectedMonth, selectedYear))

    monthExpenseItems.forEach((item) => {
      grouped.set(item.category, (grouped.get(item.category) ?? 0) + Number(item.amount || 0))
    })

    return Array.from(grouped.entries())
      .map(([name, value]) => ({ name, value, percent: monthExpense > 0 ? (value / monthExpense) * 100 : 0 }))
      .sort((a, b) => b.value - a.value)
  }, [monthExpense, selectedMonth, selectedYear, transactions])

  const recentTransactions = useMemo(
    () => [...transactions].sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()).slice(0, 10),
    [transactions],
  )

  return (
    <div className="dashboard-page">
      <div className="toolbar-row">
        <div>
          <p className="section-label">Filter Bulan & Tahun</p>
        </div>

        <div className="filters">
          <label>
            <span>Bulan</span>
            <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>
              {monthNames.map((name, index) => (
                <option key={name} value={index}>{name}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Tahun</span>
            <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
              {[2024, 2025, 2026, 2027].map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="summary-grid">
        <StatCard title="Total Saldo" value={formatRupiah(totalBalance)} tone="neutral" />
        <StatCard title="Total Pendapatan" value={formatRupiah(monthIncome)} tone="income" />
        <StatCard title="Total Pengeluaran" value={formatRupiah(monthExpense)} tone="expense" />
      </div>

      <div className="chart-grid">
        <ChartCard title="Grafik Pendapatan" subtitle={`${getMonthLabel(selectedMonth)} ${selectedYear}`}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={incomeSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dbe7f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(value) => formatCompact(value)} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => [formatRupiah(Number(value ?? 0)), 'Pendapatan']} labelFormatter={(label) => `Tanggal: ${label}`} />
              <Line type="monotone" dataKey="amount" stroke="#16a34a" strokeWidth={3} dot={{ r: 2 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Grafik Pengeluaran" subtitle={`${getMonthLabel(selectedMonth)} ${selectedYear}`}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={expenseSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dbe7f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(value) => formatCompact(value)} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => [formatRupiah(Number(value ?? 0)), 'Pengeluaran']} labelFormatter={(label) => `Tanggal: ${label}`} />
              <Line type="monotone" dataKey="amount" stroke="#ef4444" strokeWidth={3} dot={{ r: 2 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="dashboard-lower-grid">
        <ChartCard title="Donut Chart Pengeluaran Berdasarkan Kategori" subtitle={`${getMonthLabel(selectedMonth)} ${selectedYear}`}>
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={4}>
                  {donutData.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatRupiah(Number(value ?? 0))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="legend-list">
              {donutData.map((entry, index) => (
                <div key={entry.name} className="legend-item">
                  <span className="dot" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
                  <span>{entry.name}</span>
                  <strong>{entry.percent.toFixed(0)}%</strong>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Transaksi Terbaru" subtitle="10 transaksi terakhir">
          <div className="table-wrap slim-table">
            <table>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Ket.</th>
                  <th>Kategori</th>
                  <th>Tipe</th>
                  <th>Nominal</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.length ? recentTransactions.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDate(item.transaction_date)}</td>
                    <td>{item.description}</td>
                    <td>{item.category}</td>
                    <td>
                      <span className={`type-pill ${item.type === 'income' ? 'income' : 'expense'}`}>
                        {item.type === 'income' ? 'Pendapatan' : 'Pengeluaran'}
                      </span>
                    </td>
                    <td className={item.type === 'income' ? 'amount-income' : 'amount-expense'}>{formatRupiah(Number(item.amount))}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="empty-cell">Belum ada transaksi.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>
    </div>
  )
}

function TransactionPage({ type }: { type: TransactionType }) {
  const { user } = useAuth()
  const { transactions, addTransaction, updateTransaction, deleteTransaction } = useFinance()
  const [search, setSearch] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedCategory, setSelectedCategory] = useState('Semua')
  const [page, setPage] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [draft, setDraft] = useState<DraftTransaction>(emptyDraft)

  const categories = type === 'income' ? incomeCategories : expenseCategories
  const perPage = 5

  const filtered = useMemo(() => {
    const cleaned = transactions.filter((item) => item.type === type)

    return cleaned.filter((item) => {
      const dateMatches = selectedMonth === -1 || matchesMonth(item.transaction_date, selectedMonth, new Date().getFullYear())
      const categoryMatches = selectedCategory === 'Semua' || item.category === selectedCategory
      const searchMatches = !search || item.description.toLowerCase().includes(search.toLowerCase())
      return dateMatches && categoryMatches && searchMatches
    })
  }, [search, selectedCategory, selectedMonth, transactions, type])

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage))
  const pageItems = filtered.slice((page - 1) * perPage, page * perPage)

  useEffect(() => {
    setPage(1)
  }, [search, selectedCategory, selectedMonth])

  const resetForm = () => {
    setDraft({ ...emptyDraft, transaction_date: getTodayISO() })
    setEditingId(null)
    setErrorMessage('')
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const amount = Number(draft.amount)

    if (!draft.transaction_date || !draft.description.trim() || !draft.category || amount <= 0) {
      setErrorMessage('Tanggal, nama, kategori, dan nominal wajib diisi dengan benar.')
      return
    }

    if (!user?.id) {
      setErrorMessage('Anda belum login.')
      return
    }

    const payload: Transaction = {
      id: editingId ?? generateId(),
      user_id: user.id,
      type,
      category: draft.category,
      description: draft.description.trim(),
      amount,
      transaction_date: draft.transaction_date,
      payment_method: type === 'expense' ? draft.payment_method : undefined,
      notes: draft.notes.trim(),
    }

    try {
      if (editingId) {
        await updateTransaction(editingId, payload)
      } else {
        await addTransaction(payload)
      }
      resetForm()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menyimpan transaksi.')
    }
  }

  const handleEdit = (item: Transaction) => {
    setEditingId(item.id)
    setDraft({
      description: item.description,
      category: item.category,
      amount: String(item.amount),
      transaction_date: item.transaction_date,
      payment_method: item.payment_method ?? 'Cash',
      notes: item.notes ?? '',
    })
    setErrorMessage('')
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteTransaction(id)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menghapus transaksi.')
    }
  }

  return (
    <div className="page-box">
      <div className="page-header">
        <div>
          <p className="section-label">{type === 'income' ? 'Pendapatan' : 'Pengeluaran'}</p>
          <h2>{type === 'income' ? 'Kelola pendapatan' : 'Kelola pengeluaran'}</h2>
        </div>
        <button type="button" className="primary-button small" onClick={() => resetForm()}>
          <Plus size={16} />
          {editingId ? 'Reset form' : 'Tambah baru'}
        </button>
      </div>

      <div className="transaction-layout">
        <aside className="transaction-form-card">
          <h3>{editingId ? 'Edit' : 'Tambah'} {type === 'income' ? 'Pendapatan' : 'Pengeluaran'}</h3>

          <form className="transaction-form" onSubmit={handleSubmit}>
            <label>
              <span>Tanggal</span>
              <input type="date" value={draft.transaction_date} onChange={(event) => setDraft({ ...draft, transaction_date: event.target.value })} required />
            </label>

            <label>
              <span>Nama {type === 'income' ? 'Pendapatan' : 'Pengeluaran'}</span>
              <input type="text" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder={type === 'income' ? 'Gaji bulanan' : 'Makan siang'} required />
            </label>

            <label>
              <span>Kategori</span>
              <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} required>
                <option value="">Pilih kategori</option>
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>

            {type === 'expense' ? (
              <label>
                <span>Metode pembayaran</span>
                <select value={draft.payment_method} onChange={(event) => setDraft({ ...draft, payment_method: event.target.value })} required>
                  {paymentMethods.map((method) => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </label>
            ) : null}

            <label>
              <span>Nominal</span>
              <input type="number" min="1" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} placeholder="100000" required />
            </label>

            <label>
              <span>Catatan</span>
              <textarea rows={4} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Opsional" />
            </label>

            {errorMessage ? <div className="error-box">{errorMessage}</div> : null}

            <button type="submit" className="primary-button">
              {editingId ? 'Update' : 'Simpan'}
            </button>
          </form>
        </aside>

        <div className="transaction-table-card">
          <div className="table-toolbar">
            <label className="search-box">
              <Search size={16} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pencarian" />
            </label>

            <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>
              <option value={-1}>Semua bulan</option>
              {monthNames.map((name, index) => (
                <option key={name} value={index}>{name}</option>
              ))}
            </select>

            <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
              <option value="Semua">Semua kategori</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Nama</th>
                  <th>Kategori</th>
                  <th>Nominal</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.length ? pageItems.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDate(item.transaction_date)}</td>
                    <td>{item.description}</td>
                    <td>{item.category}</td>
                    <td className={item.type === 'income' ? 'amount-income' : 'amount-expense'}>{formatRupiah(Number(item.amount))}</td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="icon-button" onClick={() => handleEdit(item)}>
                          <Pencil size={15} />
                        </button>
                        <button type="button" className="icon-button danger" onClick={() => handleDelete(item.id)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="empty-cell">Tidak ada data transaksi.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pagination-row">
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>Sebelumnya</button>
            <span>Halaman {page} / {pageCount}</span>
            <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page === pageCount}>Berikutnya</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function IncomePage() {
  return <TransactionPage type="income" />
}

function ExpensePage() {
  return <TransactionPage type="expense" />
}

function SettingsPage() {
  const { user, updateProfile, updatePassword, logout } = useAuth()
  const [name, setName] = useState(user?.full_name ?? '')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setName(user?.full_name ?? '')
  }, [user])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setMessage('Nama pengguna wajib diisi.')
      return
    }

    try {
      await updateProfile(name)
      if (password.trim()) {
        await updatePassword(password)
      }
      setMessage('Profil berhasil diperbarui.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Gagal memperbarui profil.')
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-card">
        <h2>Pengaturan akun</h2>
        <form className="settings-form" onSubmit={submit}>
          <label>
            <span>Nama pengguna</span>
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <label>
            <span>Email</span>
            <input type="email" value={user?.email ?? ''} readOnly />
          </label>

          <label>
            <span>Password baru</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Kosongkan bila tidak diubah" />
          </label>

          {message ? <div className="success-box">{message}</div> : null}

          <div className="settings-actions">
            <button type="submit" className="primary-button">Simpan perubahan</button>
            <button type="button" className="secondary-button" onClick={logout}>Logout</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="income" element={<IncomePage />} />
        <Route path="expense" element={<ExpensePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <FinanceProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </FinanceProvider>
    </AuthProvider>
  )
}

function StatCard({ title, value, tone }: { title: string; value: string; tone: 'neutral' | 'income' | 'expense' }) {
  return (
    <div className={`stat-card ${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <h3>{title}</h3>
          <small>{subtitle}</small>
        </div>
      </div>
      {children}
    </div>
  )
}

function matchesMonth(dateValue: string, month: number, year: number) {
  const date = new Date(dateValue)
  return date.getMonth() === month && date.getFullYear() === year
}

function buildDailySeries(items: Transaction[], year: number, month: number) {
  const days = getDaysInMonth(year, month)
  const dailyMap = new Map<string, number>()

  items.forEach((item) => {
    const date = new Date(item.transaction_date)
    if (date.getFullYear() !== year || date.getMonth() !== month) return
    const key = date.getDate().toString()
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + Number(item.amount || 0))
  })

  return Array.from({ length: days }, (_, index) => {
    const day = index + 1
    const amount = dailyMap.get(String(day)) ?? 0
    return {
      label: `${day}`,
      amount,
    }
  })
}

function formatDate(dateValue: string) {
  const date = new Date(dateValue)
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatCompact(value: number) {
  return `Rp${Math.round(value / 1000)}k`
}

const CHART_COLORS = ['#0f172a', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#10b981', '#f97316', '#3b82f6']

export default App

if (isSupabaseConfigured && supabase) {
  console.info('Supabase initialized.')
}
