import type { Transaction, UserProfile } from '../types'
import { supabase } from './supabase'

export const defaultIncomeCategories = ['Gaji', 'Freelance', 'Bonus', 'Investasi', 'Bisnis', 'Hadiah', 'Lain-lain']
export const defaultExpenseCategories = [
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

export const normalizeProfile = (user: { id: string; email?: string | null; user_metadata?: { full_name?: string } | null }): UserProfile => ({
  id: user.id,
  full_name: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'Pengguna',
  email: user.email ?? '',
})

export const ensureProfileExists = async (userId: string, fullName: string, email: string) => {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, full_name: fullName, email }, { onConflict: 'id' })
    .select()
    .single()

  if (error) throw error
  return data as UserProfile
}

export const syncDefaultCategories = async (userId: string) => {
  if (!supabase) return

  const incomeRows = defaultIncomeCategories.map((name) => ({ user_id: userId, name, type: 'income' }))
  const expenseRows = defaultExpenseCategories.map((name) => ({ user_id: userId, name, type: 'expense' }))

  const { error } = await supabase
    .from('categories')
    .upsert([...incomeRows, ...expenseRows], { onConflict: 'user_id,name,type' })

  if (error) throw error
}

export const fetchProfileByUser = async (userId: string): Promise<UserProfile | null> => {
  if (!supabase) return null

  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()

  if (error && error.code !== 'PGRST116') throw error
  if (!data) return null

  return {
    id: data.id,
    full_name: data.full_name,
    email: data.email,
  }
}

export const mapTransactionRow = (row: any): Transaction => ({
  id: row.id,
  user_id: row.user_id,
  type: row.type,
  category: row.categories?.name ?? row.category ?? 'Lain-lain',
  description: row.description,
  amount: Number(row.amount),
  transaction_date: row.transaction_date,
  payment_method: row.payment_method ?? undefined,
  notes: row.notes ?? '',
})

export const fetchTransactionsByUser = async (userId: string): Promise<Transaction[]> => {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('transactions')
    .select('*, categories(name)')
    .eq('user_id', userId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(mapTransactionRow)
}

export const createTransaction = async (transaction: Transaction): Promise<Transaction> => {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.')

  const { data: categoryData, error: categoryError } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', transaction.user_id)
    .eq('name', transaction.category)
    .eq('type', transaction.type)
    .maybeSingle()

  if (categoryError) throw categoryError

  let categoryId = categoryData?.id

  if (!categoryId) {
    const { data: newCategory, error: insertError } = await supabase
      .from('categories')
      .upsert(
        { user_id: transaction.user_id, name: transaction.category, type: transaction.type },
        { onConflict: 'user_id,name,type' },
      )
      .select('id')
      .single()

    if (insertError) throw insertError
    categoryId = newCategory.id
  }

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      id: transaction.id,
      user_id: transaction.user_id,
      category_id: categoryId,
      type: transaction.type,
      description: transaction.description,
      amount: Number(transaction.amount),
      transaction_date: transaction.transaction_date,
      payment_method: transaction.payment_method ?? null,
      notes: transaction.notes ?? '',
    })
    .select('*, categories(name)')
    .single()

  if (error) throw error
  return mapTransactionRow(data)
}

export const updateTransactionById = async (transaction: Transaction): Promise<Transaction> => {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.')

  const { data: categoryData, error: categoryError } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', transaction.user_id)
    .eq('name', transaction.category)
    .eq('type', transaction.type)
    .maybeSingle()

  if (categoryError) throw categoryError

  let categoryId = categoryData?.id

  if (!categoryId) {
    const { data: newCategory, error: insertError } = await supabase
      .from('categories')
      .upsert(
        { user_id: transaction.user_id, name: transaction.category, type: transaction.type },
        { onConflict: 'user_id,name,type' },
      )
      .select('id')
      .single()

    if (insertError) throw insertError
    categoryId = newCategory.id
  }

  const { data, error } = await supabase
    .from('transactions')
    .update({
      category_id: categoryId,
      type: transaction.type,
      description: transaction.description,
      amount: Number(transaction.amount),
      transaction_date: transaction.transaction_date,
      payment_method: transaction.payment_method ?? null,
      notes: transaction.notes ?? '',
      updated_at: new Date().toISOString(),
    })
    .eq('id', transaction.id)
    .eq('user_id', transaction.user_id)
    .select('*, categories(name)')
    .single()

  if (error) throw error
  return mapTransactionRow(data)
}

export const deleteTransactionById = async (transactionId: string, userId: string) => {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.')

  const { error } = await supabase.from('transactions').delete().eq('id', transactionId).eq('user_id', userId)
  if (error) throw error
}
