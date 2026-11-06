export type TransactionType = 'income' | 'expense'

export type UserProfile = {
  id: string
  full_name: string
  email: string
}

export type Transaction = {
  id: string
  user_id: string
  type: TransactionType
  category: string
  description: string
  amount: number
  transaction_date: string
  payment_method?: string
  notes?: string
}

export type DraftTransaction = {
  description: string
  category: string
  amount: string
  transaction_date: string
  payment_method: string
  notes: string
}
