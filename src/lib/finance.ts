import type { Transaction, TransactionType } from '../types'

export const incomeCategories = ['Gaji', 'Freelance', 'Bonus', 'Investasi', 'Bisnis', 'Hadiah', 'Lain-lain']

export const expenseCategories = [
  'Makan',
  'Jajan',
  'Hiburan',
  'Transportasi',
  'Belanja',
  'Tagihan',
  'Kesehatan',
  'Pendidikan',
  'Lain-lain',
]

export const paymentMethods = ['Cash', 'Transfer Bank', 'E-Wallet', 'Kartu Debit', 'Kartu Kredit', 'Lainnya']

export const monthNames = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
]

export const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)

export const getMonthLabel = (monthIndex: number) => monthNames[monthIndex] ?? 'Bulan'

export const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()

export const generateId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `dompetku-${Date.now()}-${Math.random()}`

export const getTodayISO = () => new Date().toISOString().split('T')[0]

export const sumTransactions = (items: Transaction[], type: TransactionType) =>
  items
    .filter((item) => item.type === type)
    .reduce((total, item) => total + Number(item.amount || 0), 0)

export const getInitialTransactions = (userId: string): Transaction[] => {
  const baseDate = new Date()
  const year = baseDate.getFullYear()
  const month = baseDate.getMonth()

  return [
    {
      id: generateId(),
      user_id: userId,
      type: 'income',
      category: 'Gaji',
      description: 'Gaji bulanan',
      amount: 5600000,
      transaction_date: new Date(year, month, 1).toISOString().split('T')[0],
    },
    {
      id: generateId(),
      user_id: userId,
      type: 'income',
      category: 'Freelance',
      description: 'Freelance desain',
      amount: 850000,
      transaction_date: new Date(year, month, 8).toISOString().split('T')[0],
    },
    {
      id: generateId(),
      user_id: userId,
      type: 'expense',
      category: 'Makan',
      description: 'Makan siang',
      amount: 45000,
      transaction_date: new Date(year, month, 2).toISOString().split('T')[0],
      payment_method: 'Cash',
    },
    {
      id: generateId(),
      user_id: userId,
      type: 'expense',
      category: 'Transportasi',
      description: 'Bensin',
      amount: 120000,
      transaction_date: new Date(year, month, 5).toISOString().split('T')[0],
      payment_method: 'Transfer Bank',
    },
    {
      id: generateId(),
      user_id: userId,
      type: 'expense',
      category: 'Tagihan',
      description: 'Internet',
      amount: 190000,
      transaction_date: new Date(year, month, 10).toISOString().split('T')[0],
      payment_method: 'E-Wallet',
    },
    {
      id: generateId(),
      user_id: userId,
      type: 'expense',
      category: 'Belanja',
      description: 'Belanja kebutuhan',
      amount: 260000,
      transaction_date: new Date(year, month, 15).toISOString().split('T')[0],
      payment_method: 'Kartu Debit',
    },
  ]
}

