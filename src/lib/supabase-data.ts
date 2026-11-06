import { supabase } from './supabase'
import type { Transaction, TransactionType, UserProfile } from '../types'

export type DbProfile = {
  id: string
  full_name: string
  email: string
  created_at?: string
  updated_at?: string
}

export type DbCategory = {
  id: string
  user_id: string
  name: string
  type: 'income' | 'expense'
  created_at?: string
  updated_at?: string
}

export type DbTransactionRow = {
  id: string
  user_id: string
  category_id: string
  type: TransactionType
  description: string
  amount: number | string
  transaction_date: string
  payment_method?: string | null
  notes?: string | null
  created_at?: string
  updated_at?: string
  categories?: {
    id: string
    name: string
    type: TransactionType
  } | null
}

export const DEFAULT_INCOME_CATEGORIES = ['Gaji', 'Freelance', 'Bonus', 'Investasi', 'Bisnis', 'Hadiah', 'Lain-lain']
export const DEFAULT_EXPENSE_CATEGORIES = ['Makan', 'Jajan', 'Hiburan', 'Transportasi', 'Belanja', 'Tagihan', 'Kesehatan', 'Pendidikan', 'Lain-lain']

export const getAuthenticatedUser = async (): Promise<UserProfile | null> => {
  if (!supabase) return null

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error || !session?.user) return null

  return {
    id: session.user.id,
    full_name: session.user.user_metadata?.full_name ?? 'Pengguna',
    email: session.user.email ?? '',
  }
}

export const ensureProfile = async (userId: string, fullName: string, email: string) => {
  if (!supabase) return

  const { data: existing } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, email, updated_at: new Date().toISOString() })
      .eq('id', userId)

    if (error) throw error
    return
  }

  const { error } = await supabase.from('profiles').insert({
    id: userId,
    full_name: fullName,
    email,
  })

  if (error) throw error
}

export const initializeDefaultCategories = async (userId: string) => {
  if (!supabase) return

  const { data: existingCategories, error: fetchError } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', userId)

  if (fetchError) throw fetchError

  if (existingCategories && existingCategories.length > 0) return

  const payload = [
    ...DEFAULT_INCOME_CATEGORIES.map((name) => ({ user_id: userId, name, type: 'income' as const })),
    ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ user_id: userId, name, type: 'expense' as const })),
  ]

  const { error } = await supabase.from('categories').insert(payload)
  if (error) throw error
}

export const getCategoriesForUser = async (userId: string): Promise<DbCategory[]> => {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', userId)
    .order('type', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as DbCategory[]
}

export const findCategoryIdByName = async (userId: string, type: TransactionType, categoryName: string) => {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .eq('type', type)
    .eq('name', categoryName)
    .maybeSingle()

  if (error) throw error
  return data?.id ?? null
}

export const getTransactionsForUser = async (userId: string): Promise<Transaction[]> => {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('transactions')
    .select('*, categories(id, name, type)')
    .eq('user_id', userId)
    .order('transaction_date', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row: DbTransactionRow) => ({
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    category: row.categories?.name ?? 'Lain-lain',
    description: row.description,
    amount: Number(row.amount ?? 0),
    transaction_date: row.transaction_date,
    payment_method: row.payment_method ?? undefined,
    notes: row.notes ?? undefined,
  }))
}

export const createTransactionRecord = async (transaction: Transaction) => {
  if (!supabase) return null

  const categoryId = await findCategoryIdByName(transaction.user_id, transaction.type, transaction.category)
  if (!categoryId) {
    throw new Error(`Kategori ${transaction.category} tidak ditemukan untuk ${transaction.type}.`)
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
      notes: transaction.notes ?? null,
    })
    .select('*, categories(id, name, type)')
    .single()

  if (error) throw error

  return data
}

export const updateTransactionRecord = async (transaction: Transaction) => {
  if (!supabase) return null

  const categoryId = await findCategoryIdByName(transaction.user_id, transaction.type, transaction.category)
  if (!categoryId) {
    throw new Error(`Kategori ${transaction.category} tidak ditemukan untuk ${transaction.type}.`)
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
      notes: transaction.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', transaction.id)
    .eq('user_id', transaction.user_id)
    .select('*, categories(id, name, type)')
    .single()

  if (error) throw error
  return data
}

export const deleteTransactionRecord = async (transactionId: string, userId: string) => {
  if (!supabase) return

  const { error } = await supabase.from('transactions').delete().eq('id', transactionId).eq('user_id', userId)
  if (error) throw error
}

export const getProfileByUserId = async (userId: string): Promise<UserProfile | null> => {
  if (!supabase) return null

  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) throw error
  if (!data) return null

  return {
    id: data.id,
    full_name: data.full_name,
    email: data.email,
  }
}
