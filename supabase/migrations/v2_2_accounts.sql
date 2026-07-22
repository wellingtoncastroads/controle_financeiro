-- ============================================================================
-- FÔLEGO V2.2 — CONTAS, BANCOS E TRANSFERÊNCIAS
-- Execute este arquivo UMA ÚNICA VEZ no SQL Editor do Supabase.
--
-- Migração aditiva: nenhuma movimentação existente é apagada ou reclassificada.
-- Os registros antigos permanecem com account_id nulo ("Conta não definida").
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- --------------------------------------------------------------------------
-- 1. CONTAS FINANCEIRAS DO USUÁRIO
-- --------------------------------------------------------------------------

create table if not exists public.financial_accounts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    bank_code text not null check (bank_code ~ '^[a-z0-9_]{1,40}$'),
    institution_name text not null check (char_length(trim(institution_name)) between 1 and 60),
    name text not null check (char_length(trim(name)) between 1 and 60),
    account_type text not null check (account_type in (
        'checking', 'savings', 'payment', 'wallet', 'cash', 'other'
    )),
    initial_balance numeric(14, 2) not null default 0
        check (abs(initial_balance) <= 999999999999.99),
    color text not null default '#11120e' check (color ~ '^#[0-9A-Fa-f]{6}$'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists financial_accounts_user_created_idx
    on public.financial_accounts(user_id, created_at asc);

drop trigger if exists financial_accounts_set_updated_at on public.financial_accounts;
create trigger financial_accounts_set_updated_at
before update on public.financial_accounts
for each row execute function public.set_updated_at();

alter table public.transactions
    add column if not exists account_id uuid;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'transactions_account_id_fkey'
          and conrelid = 'public.transactions'::regclass
    ) then
        alter table public.transactions
            add constraint transactions_account_id_fkey
            foreign key (account_id)
            references public.financial_accounts(id)
            on delete set null;
    end if;
end;
$$;

create index if not exists transactions_user_account_date_idx
    on public.transactions(user_id, account_id, occurred_on desc);

-- --------------------------------------------------------------------------
-- 2. TRANSFERÊNCIAS: REDISTRIBUEM O SALDO, SEM VIRAR RECEITA OU DESPESA
-- --------------------------------------------------------------------------

create table if not exists public.account_transfers (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    from_account_id uuid not null references public.financial_accounts(id) on delete restrict,
    to_account_id uuid not null references public.financial_accounts(id) on delete restrict,
    amount numeric(14, 2) not null check (amount > 0),
    occurred_on date not null,
    status text not null default 'paid' check (status in ('paid', 'pending')),
    note text not null default '' check (char_length(note) <= 100),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (from_account_id <> to_account_id)
);

create index if not exists account_transfers_user_date_idx
    on public.account_transfers(user_id, occurred_on desc);

create index if not exists account_transfers_from_idx
    on public.account_transfers(from_account_id, occurred_on desc);

create index if not exists account_transfers_to_idx
    on public.account_transfers(to_account_id, occurred_on desc);

drop trigger if exists account_transfers_set_updated_at on public.account_transfers;
create trigger account_transfers_set_updated_at
before update on public.account_transfers
for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3. SEGURANÇA POR USUÁRIO
-- --------------------------------------------------------------------------

alter table public.financial_accounts enable row level security;
alter table public.account_transfers enable row level security;

drop policy if exists "financial_accounts_select_own" on public.financial_accounts;
create policy "financial_accounts_select_own"
on public.financial_accounts for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "financial_accounts_insert_own" on public.financial_accounts;
create policy "financial_accounts_insert_own"
on public.financial_accounts for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "financial_accounts_update_own" on public.financial_accounts;
create policy "financial_accounts_update_own"
on public.financial_accounts for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "financial_accounts_delete_own" on public.financial_accounts;
create policy "financial_accounts_delete_own"
on public.financial_accounts for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "account_transfers_select_own" on public.account_transfers;
create policy "account_transfers_select_own"
on public.account_transfers for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "account_transfers_insert_own" on public.account_transfers;
create policy "account_transfers_insert_own"
on public.account_transfers for insert to authenticated
with check (
    (select auth.uid()) = user_id
    and exists (
        select 1 from public.financial_accounts
        where id = from_account_id and user_id = (select auth.uid())
    )
    and exists (
        select 1 from public.financial_accounts
        where id = to_account_id and user_id = (select auth.uid())
    )
);

drop policy if exists "account_transfers_update_own" on public.account_transfers;
create policy "account_transfers_update_own"
on public.account_transfers for update to authenticated
using ((select auth.uid()) = user_id)
with check (
    (select auth.uid()) = user_id
    and exists (
        select 1 from public.financial_accounts
        where id = from_account_id and user_id = (select auth.uid())
    )
    and exists (
        select 1 from public.financial_accounts
        where id = to_account_id and user_id = (select auth.uid())
    )
);

drop policy if exists "account_transfers_delete_own" on public.account_transfers;
create policy "account_transfers_delete_own"
on public.account_transfers for delete to authenticated
using ((select auth.uid()) = user_id);

-- Impede que uma movimentação seja associada à conta de outro usuário.
drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own"
on public.transactions for insert to authenticated
with check (
    (select auth.uid()) = user_id
    and (
        account_id is null
        or exists (
            select 1 from public.financial_accounts
            where id = account_id and user_id = (select auth.uid())
        )
    )
);

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own"
on public.transactions for update to authenticated
using ((select auth.uid()) = user_id)
with check (
    (select auth.uid()) = user_id
    and (
        account_id is null
        or exists (
            select 1 from public.financial_accounts
            where id = account_id and user_id = (select auth.uid())
        )
    )
);

-- --------------------------------------------------------------------------
-- 4. BACKUP V4: RESTAURA CONTAS E TRANSFERÊNCIAS NA MESMA OPERAÇÃO
-- --------------------------------------------------------------------------

create or replace function public.replace_user_snapshot_v4(
    p_transactions jsonb,
    p_goals jsonb,
    p_budgets jsonb,
    p_contributions jsonb,
    p_accounts jsonb,
    p_transfers jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    current_user_id uuid := auth.uid();
    transaction_count integer := 0;
    goal_count integer := 0;
    budget_count integer := 0;
    contribution_count integer := 0;
    account_count integer := 0;
    transfer_count integer := 0;
begin
    if current_user_id is null then
        raise exception 'Sessão necessária';
    end if;

    -- A função é atômica: qualquer erro desfaz todas as exclusões e inserções.
    delete from public.account_transfers where user_id = current_user_id;
    delete from public.goal_contributions where user_id = current_user_id;
    delete from public.category_budgets where user_id = current_user_id;
    delete from public.transactions where user_id = current_user_id;
    delete from public.financial_accounts where user_id = current_user_id;
    delete from public.goals where user_id = current_user_id;

    insert into public.financial_accounts (
        id, user_id, bank_code, institution_name, name, account_type,
        initial_balance, color, created_at
    )
    select
        coalesce(nullif(item ->> 'id', '')::uuid, gen_random_uuid()),
        current_user_id,
        left(lower(trim(item ->> 'bank_code')), 40),
        left(trim(item ->> 'institution_name'), 60),
        left(trim(item ->> 'name'), 60),
        item ->> 'account_type',
        coalesce((item ->> 'initial_balance')::numeric, 0),
        coalesce(nullif(item ->> 'color', ''), '#11120e'),
        coalesce(nullif(item ->> 'created_at', '')::timestamptz, now())
    from jsonb_array_elements(coalesce(p_accounts, '[]'::jsonb)) as item;
    get diagnostics account_count = row_count;

    insert into public.transactions (
        id, user_id, description, amount, type, category, occurred_on, status,
        payment_method, account_id, series_id, series_kind, installment_number,
        installment_total, created_at
    )
    select
        coalesce(nullif(item ->> 'id', '')::uuid, gen_random_uuid()),
        current_user_id,
        left(trim(item ->> 'description'), 80),
        (item ->> 'amount')::numeric,
        item ->> 'type',
        left(trim(item ->> 'category'), 40),
        (item ->> 'occurred_on')::date,
        item ->> 'status',
        coalesce(nullif(item ->> 'payment_method', ''), 'other'),
        case
            when nullif(item ->> 'account_id', '') is not null
             and exists (
                select 1 from public.financial_accounts
                where id = (item ->> 'account_id')::uuid and user_id = current_user_id
             )
            then (item ->> 'account_id')::uuid
            else null
        end,
        nullif(item ->> 'series_id', '')::uuid,
        nullif(item ->> 'series_kind', ''),
        nullif(item ->> 'installment_number', '')::integer,
        nullif(item ->> 'installment_total', '')::integer,
        coalesce(nullif(item ->> 'created_at', '')::timestamptz, now())
    from jsonb_array_elements(coalesce(p_transactions, '[]'::jsonb)) as item;
    get diagnostics transaction_count = row_count;

    insert into public.goals (
        id, user_id, name, current_amount, target_amount, deadline, icon, created_at
    )
    select
        coalesce(nullif(item ->> 'id', '')::uuid, gen_random_uuid()),
        current_user_id,
        left(trim(item ->> 'name'), 60),
        (item ->> 'current_amount')::numeric,
        (item ->> 'target_amount')::numeric,
        (item ->> 'deadline')::date,
        item ->> 'icon',
        coalesce(nullif(item ->> 'created_at', '')::timestamptz, now())
    from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) as item;
    get diagnostics goal_count = row_count;

    insert into public.category_budgets (
        id, user_id, month_start, category, amount, created_at
    )
    select
        coalesce(nullif(item ->> 'id', '')::uuid, gen_random_uuid()),
        current_user_id,
        (item ->> 'month_start')::date,
        left(trim(item ->> 'category'), 40),
        (item ->> 'amount')::numeric,
        coalesce(nullif(item ->> 'created_at', '')::timestamptz, now())
    from jsonb_array_elements(coalesce(p_budgets, '[]'::jsonb)) as item;
    get diagnostics budget_count = row_count;

    insert into public.goal_contributions (
        id, user_id, goal_id, amount, contributed_on, note, created_at
    )
    select
        coalesce(nullif(item ->> 'id', '')::uuid, gen_random_uuid()),
        current_user_id,
        (item ->> 'goal_id')::uuid,
        (item ->> 'amount')::numeric,
        (item ->> 'contributed_on')::date,
        left(trim(coalesce(item ->> 'note', '')), 100),
        coalesce(nullif(item ->> 'created_at', '')::timestamptz, now())
    from jsonb_array_elements(coalesce(p_contributions, '[]'::jsonb)) as item;
    get diagnostics contribution_count = row_count;

    insert into public.account_transfers (
        id, user_id, from_account_id, to_account_id, amount, occurred_on,
        status, note, created_at
    )
    select
        coalesce(nullif(item ->> 'id', '')::uuid, gen_random_uuid()),
        current_user_id,
        (item ->> 'from_account_id')::uuid,
        (item ->> 'to_account_id')::uuid,
        (item ->> 'amount')::numeric,
        (item ->> 'occurred_on')::date,
        coalesce(nullif(item ->> 'status', ''), 'paid'),
        left(trim(coalesce(item ->> 'note', '')), 100),
        coalesce(nullif(item ->> 'created_at', '')::timestamptz, now())
    from jsonb_array_elements(coalesce(p_transfers, '[]'::jsonb)) as item;
    get diagnostics transfer_count = row_count;

    return jsonb_build_object(
        'transactions', transaction_count,
        'goals', goal_count,
        'budgets', budget_count,
        'contributions', contribution_count,
        'accounts', account_count,
        'transfers', transfer_count
    );
end;
$$;

revoke all on function public.replace_user_snapshot_v4(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.replace_user_snapshot_v4(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;

grant select, insert, update, delete on public.financial_accounts to authenticated;
grant select, insert, update, delete on public.account_transfers to authenticated;

commit;
