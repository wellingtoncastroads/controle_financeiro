-- ============================================================================
-- FÔLEGO V2.1 — MIGRAÇÃO ADITIVA E SEGURA
-- Execute este arquivo UMA ÚNICA VEZ no SQL Editor do Supabase.
--
-- Esta migração não apaga movimentações, metas ou perfis existentes.
-- Registros antigos recebem "other" (Não informado) como forma de pagamento.
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- --------------------------------------------------------------------------
-- 1. NOVOS DADOS DAS MOVIMENTAÇÕES
-- --------------------------------------------------------------------------

alter table public.transactions
    add column if not exists payment_method text;

update public.transactions
set payment_method = 'other'
where payment_method is null;

alter table public.transactions
    alter column payment_method set default 'other',
    alter column payment_method set not null;

alter table public.transactions
    add column if not exists series_id uuid,
    add column if not exists series_kind text,
    add column if not exists installment_number integer,
    add column if not exists installment_total integer;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'transactions_payment_method_check'
          and conrelid = 'public.transactions'::regclass
    ) then
        alter table public.transactions
            add constraint transactions_payment_method_check
            check (payment_method in (
                'pix', 'cash', 'debit_card', 'credit_card',
                'bank_transfer', 'boleto', 'other'
            ));
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'transactions_series_kind_check'
          and conrelid = 'public.transactions'::regclass
    ) then
        alter table public.transactions
            add constraint transactions_series_kind_check
            check (series_kind is null or series_kind in ('recurring', 'installment'));
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'transactions_installment_check'
          and conrelid = 'public.transactions'::regclass
    ) then
        alter table public.transactions
            add constraint transactions_installment_check
            check (
                (installment_number is null and installment_total is null)
                or (
                    series_kind = 'installment'
                    and installment_number between 1 and 120
                    and installment_total between 2 and 120
                    and installment_number <= installment_total
                )
            );
    end if;
end;
$$;

create index if not exists transactions_user_series_idx
    on public.transactions(user_id, series_id)
    where series_id is not null;

create index if not exists transactions_user_pending_date_idx
    on public.transactions(user_id, occurred_on)
    where status = 'pending';

-- --------------------------------------------------------------------------
-- 2. LIMITES MENSAIS POR CATEGORIA
-- --------------------------------------------------------------------------

create table if not exists public.category_budgets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    month_start date not null check (extract(day from month_start) = 1),
    category text not null check (char_length(category) between 1 and 40),
    amount numeric(14, 2) not null check (amount > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, month_start, category)
);

create index if not exists category_budgets_user_month_idx
    on public.category_budgets(user_id, month_start);

drop trigger if exists category_budgets_set_updated_at on public.category_budgets;
create trigger category_budgets_set_updated_at
before update on public.category_budgets
for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3. APORTES EM METAS, COM HISTÓRICO
-- --------------------------------------------------------------------------

create table if not exists public.goal_contributions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    goal_id uuid not null references public.goals(id) on delete cascade,
    amount numeric(14, 2) not null check (amount > 0),
    contributed_on date not null default current_date,
    note text not null default '' check (char_length(note) <= 100),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists goal_contributions_user_date_idx
    on public.goal_contributions(user_id, contributed_on desc);

create index if not exists goal_contributions_goal_idx
    on public.goal_contributions(goal_id, contributed_on desc);

drop trigger if exists goal_contributions_set_updated_at on public.goal_contributions;
create trigger goal_contributions_set_updated_at
before update on public.goal_contributions
for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- 4. SEGURANÇA POR CONTA (RLS)
-- --------------------------------------------------------------------------

alter table public.category_budgets enable row level security;
alter table public.goal_contributions enable row level security;

drop policy if exists "category_budgets_select_own" on public.category_budgets;
create policy "category_budgets_select_own"
on public.category_budgets for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "category_budgets_insert_own" on public.category_budgets;
create policy "category_budgets_insert_own"
on public.category_budgets for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "category_budgets_update_own" on public.category_budgets;
create policy "category_budgets_update_own"
on public.category_budgets for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "category_budgets_delete_own" on public.category_budgets;
create policy "category_budgets_delete_own"
on public.category_budgets for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "goal_contributions_select_own" on public.goal_contributions;
create policy "goal_contributions_select_own"
on public.goal_contributions for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "goal_contributions_insert_own" on public.goal_contributions;
create policy "goal_contributions_insert_own"
on public.goal_contributions for insert to authenticated
with check (
    (select auth.uid()) = user_id
    and exists (
        select 1 from public.goals
        where goals.id = goal_id and goals.user_id = (select auth.uid())
    )
);

drop policy if exists "goal_contributions_update_own" on public.goal_contributions;
create policy "goal_contributions_update_own"
on public.goal_contributions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "goal_contributions_delete_own" on public.goal_contributions;
create policy "goal_contributions_delete_own"
on public.goal_contributions for delete to authenticated
using ((select auth.uid()) = user_id);

-- O aporte e a atualização da meta acontecem juntos: ou ambos salvam, ou nenhum.
create or replace function public.add_goal_contribution(
    p_goal_id uuid,
    p_amount numeric,
    p_contributed_on date default current_date,
    p_note text default ''
)
returns public.goals
language plpgsql
security invoker
set search_path = public
as $$
declare
    current_user_id uuid := auth.uid();
    updated_goal public.goals%rowtype;
begin
    if current_user_id is null then
        raise exception 'Sessão necessária';
    end if;

    if p_amount is null or p_amount <= 0 or p_amount > 999999999999.99 then
        raise exception 'Valor de aporte inválido';
    end if;

    if p_contributed_on is null then
        raise exception 'Data de aporte inválida';
    end if;

    if char_length(trim(coalesce(p_note, ''))) > 100 then
        raise exception 'A observação deve ter até 100 caracteres';
    end if;

    perform 1
    from public.goals
    where id = p_goal_id and user_id = current_user_id
    for update;

    if not found then
        raise exception 'Meta não encontrada';
    end if;

    insert into public.goal_contributions (
        user_id, goal_id, amount, contributed_on, note
    ) values (
        current_user_id, p_goal_id, round(p_amount, 2), p_contributed_on,
        left(trim(coalesce(p_note, '')), 100)
    );

    update public.goals
    set current_amount = current_amount + round(p_amount, 2)
    where id = p_goal_id and user_id = current_user_id
    returning * into updated_goal;

    return updated_goal;
end;
$$;

-- --------------------------------------------------------------------------
-- 5. BACKUP V3: MOVIMENTAÇÕES, METAS, LIMITES E APORTES
-- --------------------------------------------------------------------------

create or replace function public.replace_user_snapshot_v3(
    p_transactions jsonb,
    p_goals jsonb,
    p_budgets jsonb,
    p_contributions jsonb
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
begin
    if current_user_id is null then
        raise exception 'Sessão necessária';
    end if;

    -- A função inteira é atômica. Qualquer falha desfaz todas as exclusões.
    delete from public.goal_contributions where user_id = current_user_id;
    delete from public.category_budgets where user_id = current_user_id;
    delete from public.transactions where user_id = current_user_id;
    delete from public.goals where user_id = current_user_id;

    insert into public.transactions (
        id, user_id, description, amount, type, category, occurred_on, status,
        payment_method, series_id, series_kind, installment_number,
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

    return jsonb_build_object(
        'transactions', transaction_count,
        'goals', goal_count,
        'budgets', budget_count,
        'contributions', contribution_count
    );
end;
$$;

-- --------------------------------------------------------------------------
-- 6. EXCLUSÃO DA CONTA E DE TODOS OS DADOS
-- --------------------------------------------------------------------------

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    current_user_id uuid := auth.uid();
begin
    if current_user_id is null then
        raise exception 'Sessão necessária';
    end if;

    delete from auth.users where id = current_user_id;

    if not found then
        raise exception 'Conta não encontrada';
    end if;
end;
$$;

revoke all on function public.add_goal_contribution(uuid, numeric, date, text) from public;
revoke all on function public.replace_user_snapshot_v3(jsonb, jsonb, jsonb, jsonb) from public;
revoke all on function public.delete_my_account() from public;

grant execute on function public.add_goal_contribution(uuid, numeric, date, text) to authenticated;
grant execute on function public.replace_user_snapshot_v3(jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

grant select, insert, update, delete on public.category_budgets to authenticated;
grant select, insert, update, delete on public.goal_contributions to authenticated;

commit;

