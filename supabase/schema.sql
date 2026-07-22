-- ============================================================================
-- FÔLEGO V2 — BASE DO BANCO, AUTENTICAÇÃO E POLÍTICAS DE SEGURANÇA
-- Use este arquivo somente em instalações novas. Depois, execute também
-- supabase/migrations/v2_1_additive.sql e depois v2_2_accounts.sql.
-- Em uma conta na V2.1, execute APENAS a migração aditiva v2_2_accounts.sql.
-- ============================================================================

create extension if not exists pgcrypto;

-- Cada conta possui um perfil. O e-mail continua protegido no schema auth.
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text not null default '' check (char_length(display_name) <= 80),
    theme text not null default 'light' check (theme in ('light', 'dark')),
    legacy_migrated_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Movimentações são vinculadas ao usuário e possuem regras no próprio banco.
create table if not exists public.transactions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    description text not null check (char_length(description) between 1 and 80),
    amount numeric(14, 2) not null check (amount > 0),
    type text not null check (type in ('income', 'expense')),
    category text not null check (char_length(category) between 1 and 40),
    occurred_on date not null,
    status text not null default 'paid' check (status in ('paid', 'pending')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Metas também pertencem a apenas uma conta.
create table if not exists public.goals (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null check (char_length(name) between 1 and 60),
    current_amount numeric(14, 2) not null default 0 check (current_amount >= 0),
    target_amount numeric(14, 2) not null check (target_amount > 0),
    deadline date not null,
    icon text not null default '✨' check (icon in ('🛡️', '🏠', '✈️', '🚗', '💻', '🎓', '✨')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists transactions_user_date_idx
    on public.transactions(user_id, occurred_on desc);

create index if not exists transactions_user_created_idx
    on public.transactions(user_id, created_at desc);

create index if not exists goals_user_created_idx
    on public.goals(user_id, created_at asc);

-- Atualiza automaticamente o instante de edição de cada registro.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

drop trigger if exists goals_set_updated_at on public.goals;
create trigger goals_set_updated_at
before update on public.goals
for each row execute function public.set_updated_at();

-- Cria o perfil junto com uma nova conta do Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Também cria perfis para contas existentes antes da instalação deste schema.
insert into public.profiles (id, display_name)
select id, coalesce(raw_user_meta_data ->> 'display_name', '')
from auth.users
on conflict (id) do nothing;

-- RLS é a barreira que impede uma conta de consultar dados de outra conta.
alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.goals enable row level security;

drop policy if exists "profile_select_own" on public.profiles;
create policy "profile_select_own"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "profile_insert_own" on public.profiles;
create policy "profile_insert_own"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "profile_update_own" on public.profiles;
create policy "profile_update_own"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own"
on public.transactions for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own"
on public.transactions for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own"
on public.transactions for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own"
on public.transactions for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "goals_select_own" on public.goals;
create policy "goals_select_own"
on public.goals for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "goals_insert_own" on public.goals;
create policy "goals_insert_own"
on public.goals for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "goals_update_own" on public.goals;
create policy "goals_update_own"
on public.goals for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "goals_delete_own" on public.goals;
create policy "goals_delete_own"
on public.goals for delete
to authenticated
using ((select auth.uid()) = user_id);

-- Importa a versão local antiga uma única vez e apenas em uma conta vazia.
-- Toda a operação ocorre na mesma transação: uma falha não deixa dados pela metade.
create or replace function public.import_legacy_snapshot(
    p_transactions jsonb,
    p_goals jsonb
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
begin
    if current_user_id is null then
        raise exception 'Sessão necessária';
    end if;

    if exists (select 1 from public.transactions where user_id = current_user_id)
       or exists (select 1 from public.goals where user_id = current_user_id)
       or exists (
            select 1 from public.profiles
            where id = current_user_id and legacy_migrated_at is not null
       ) then
        raise exception 'A migração local já foi concluída ou a conta não está vazia';
    end if;

    insert into public.transactions (
        user_id, description, amount, type, category, occurred_on, status, created_at
    )
    select
        current_user_id,
        left(trim(item ->> 'description'), 80),
        (item ->> 'amount')::numeric,
        item ->> 'type',
        left(trim(item ->> 'category'), 40),
        (item ->> 'occurred_on')::date,
        item ->> 'status',
        coalesce(nullif(item ->> 'created_at', '')::timestamptz, now())
    from jsonb_array_elements(coalesce(p_transactions, '[]'::jsonb)) as item;
    get diagnostics transaction_count = row_count;

    insert into public.goals (
        user_id, name, current_amount, target_amount, deadline, icon, created_at
    )
    select
        current_user_id,
        left(trim(item ->> 'name'), 60),
        (item ->> 'current_amount')::numeric,
        (item ->> 'target_amount')::numeric,
        (item ->> 'deadline')::date,
        item ->> 'icon',
        coalesce(nullif(item ->> 'created_at', '')::timestamptz, now())
    from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) as item;
    get diagnostics goal_count = row_count;

    update public.profiles
    set legacy_migrated_at = now()
    where id = current_user_id;

    return jsonb_build_object('transactions', transaction_count, 'goals', goal_count);
end;
$$;

-- Substitui um backup completo de forma atômica após validação no navegador.
create or replace function public.replace_user_snapshot(
    p_transactions jsonb,
    p_goals jsonb
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
begin
    if current_user_id is null then
        raise exception 'Sessão necessária';
    end if;

    delete from public.transactions where user_id = current_user_id;
    delete from public.goals where user_id = current_user_id;

    insert into public.transactions (
        user_id, description, amount, type, category, occurred_on, status, created_at
    )
    select
        current_user_id,
        left(trim(item ->> 'description'), 80),
        (item ->> 'amount')::numeric,
        item ->> 'type',
        left(trim(item ->> 'category'), 40),
        (item ->> 'occurred_on')::date,
        item ->> 'status',
        coalesce(nullif(item ->> 'created_at', '')::timestamptz, now())
    from jsonb_array_elements(coalesce(p_transactions, '[]'::jsonb)) as item;
    get diagnostics transaction_count = row_count;

    insert into public.goals (
        user_id, name, current_amount, target_amount, deadline, icon, created_at
    )
    select
        current_user_id,
        left(trim(item ->> 'name'), 60),
        (item ->> 'current_amount')::numeric,
        (item ->> 'target_amount')::numeric,
        (item ->> 'deadline')::date,
        item ->> 'icon',
        coalesce(nullif(item ->> 'created_at', '')::timestamptz, now())
    from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) as item;
    get diagnostics goal_count = row_count;

    return jsonb_build_object('transactions', transaction_count, 'goals', goal_count);
end;
$$;

revoke all on function public.import_legacy_snapshot(jsonb, jsonb) from public;
revoke all on function public.replace_user_snapshot(jsonb, jsonb) from public;
grant execute on function public.import_legacy_snapshot(jsonb, jsonb) to authenticated;
grant execute on function public.replace_user_snapshot(jsonb, jsonb) to authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.goals to authenticated;
