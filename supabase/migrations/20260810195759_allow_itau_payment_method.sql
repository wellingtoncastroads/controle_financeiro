-- Permite que a conta Itaú seja usada nas movimentações sem alterar registros existentes.
alter table public.transactions
  drop constraint if exists transactions_payment_method_check;

alter table public.transactions
  add constraint transactions_payment_method_check
  check (
    payment_method in (
      'pix',
      'cash',
      'debit_card',
      'credit_card',
      'bank_transfer',
      'boleto',
      'other',
      'itau'
    )
  ) not valid;

alter table public.transactions
  validate constraint transactions_payment_method_check;
