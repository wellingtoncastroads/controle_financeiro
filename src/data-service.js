import { supabase } from "./supabase-client.js";

function requireClient() {
    if (!supabase) throw new Error("Supabase não configurado.");
    return supabase;
}

function throwIfError(error) {
    if (error) throw error;
}

function isMissingAccountsSchema(error) {
    const message = String(error?.message || "").toLowerCase();
    return ["42p01", "42703", "pgrst204", "pgrst205"].includes(String(error?.code || "").toLowerCase())
        || message.includes("financial_accounts")
        || message.includes("account_transfers")
        || message.includes("account_id");
}

function transactionFromRow(row) {
    return {
        id: row.id,
        description: row.description,
        amount: Number(row.amount),
        type: row.type,
        category: row.category,
        date: row.occurred_on,
        status: row.status,
        paymentMethod: row.payment_method ?? "other",
        accountId: row.account_id ?? null,
        seriesId: row.series_id ?? null,
        seriesKind: row.series_kind ?? null,
        installmentNumber: row.installment_number ?? null,
        installmentTotal: row.installment_total ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function accountFromRow(row) {
    return {
        id: row.id,
        bankCode: row.bank_code,
        institutionName: row.institution_name,
        name: row.name,
        accountType: row.account_type,
        initialBalance: Number(row.initial_balance),
        color: row.color,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function transferFromRow(row) {
    return {
        id: row.id,
        fromAccountId: row.from_account_id,
        toAccountId: row.to_account_id,
        amount: Number(row.amount),
        date: row.occurred_on,
        status: row.status,
        note: row.note,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function goalFromRow(row) {
    return {
        id: row.id,
        name: row.name,
        current: Number(row.current_amount),
        target: Number(row.target_amount),
        deadline: row.deadline,
        icon: row.icon,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function budgetFromRow(row) {
    return {
        id: row.id,
        month: row.month_start.slice(0, 7),
        category: row.category,
        amount: Number(row.amount),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function contributionFromRow(row) {
    return {
        id: row.id,
        goalId: row.goal_id,
        amount: Number(row.amount),
        date: row.contributed_on,
        note: row.note,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function transactionToRow(userId, transaction, accountsEnabled = true) {
    const row = {
        ...(transaction.id ? { id: transaction.id } : {}),
        user_id: userId,
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type,
        category: transaction.category,
        occurred_on: transaction.date,
        status: transaction.status,
        payment_method: transaction.paymentMethod ?? "other",
        series_id: transaction.seriesId ?? null,
        series_kind: transaction.seriesKind ?? null,
        installment_number: transaction.installmentNumber ?? null,
        installment_total: transaction.installmentTotal ?? null
    };
    if (accountsEnabled) row.account_id = transaction.accountId ?? null;
    return row;
}

function accountToRow(userId, account) {
    return {
        ...(account.id ? { id: account.id } : {}),
        user_id: userId,
        bank_code: account.bankCode,
        institution_name: account.institutionName,
        name: account.name,
        account_type: account.accountType,
        initial_balance: account.initialBalance,
        color: account.color
    };
}

function transferToRow(userId, transfer) {
    return {
        ...(transfer.id ? { id: transfer.id } : {}),
        user_id: userId,
        from_account_id: transfer.fromAccountId,
        to_account_id: transfer.toAccountId,
        amount: transfer.amount,
        occurred_on: transfer.date,
        status: transfer.status,
        note: transfer.note
    };
}

function goalToRow(userId, goal) {
    return {
        ...(goal.id ? { id: goal.id } : {}),
        user_id: userId,
        name: goal.name,
        current_amount: goal.current,
        target_amount: goal.target,
        deadline: goal.deadline,
        icon: goal.icon
    };
}

function budgetToRow(userId, budget) {
    return {
        ...(budget.id ? { id: budget.id } : {}),
        user_id: userId,
        month_start: `${budget.month}-01`,
        category: budget.category,
        amount: budget.amount
    };
}

export async function loadUserData(userId) {
    const client = requireClient();
    const [transactionsResult, goalsResult, profileResult, budgetsResult, contributionsResult] = await Promise.all([
        client.from("transactions").select("*").eq("user_id", userId).order("occurred_on", { ascending: false }),
        client.from("goals").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
        client.from("profiles").select("*").eq("id", userId).maybeSingle(),
        client.from("category_budgets").select("*").eq("user_id", userId).order("month_start", { ascending: false }),
        client.from("goal_contributions").select("*").eq("user_id", userId).order("contributed_on", { ascending: false })
    ]);

    throwIfError(transactionsResult.error);
    throwIfError(goalsResult.error);
    throwIfError(profileResult.error);
    throwIfError(budgetsResult.error);
    throwIfError(contributionsResult.error);

    const [accountsResult, transfersResult] = await Promise.all([
        client.from("financial_accounts").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
        client.from("account_transfers").select("*").eq("user_id", userId).order("occurred_on", { ascending: false })
    ]);
    const accountsSchemaMissing = isMissingAccountsSchema(accountsResult.error)
        || isMissingAccountsSchema(transfersResult.error);
    if (!accountsSchemaMissing) {
        throwIfError(accountsResult.error);
        throwIfError(transfersResult.error);
    }

    return {
        transactions: transactionsResult.data.map(transactionFromRow),
        goals: goalsResult.data.map(goalFromRow),
        profile: profileResult.data,
        budgets: budgetsResult.data.map(budgetFromRow),
        contributions: contributionsResult.data.map(contributionFromRow),
        accounts: accountsSchemaMissing ? [] : accountsResult.data.map(accountFromRow),
        transfers: accountsSchemaMissing ? [] : transfersResult.data.map(transferFromRow),
        accountsEnabled: !accountsSchemaMissing
    };
}

export async function saveTransaction(userId, transaction, accountsEnabled = true) {
    const client = requireClient();
    const query = transaction.id
        ? client.from("transactions").update(transactionToRow(userId, { ...transaction, id: "" }, accountsEnabled)).eq("id", transaction.id).eq("user_id", userId)
        : client.from("transactions").insert(transactionToRow(userId, transaction, accountsEnabled));
    const { data, error } = await query.select().single();
    throwIfError(error);
    return transactionFromRow(data);
}

export async function saveTransactions(userId, transactions, accountsEnabled = true) {
    if (!Array.isArray(transactions) || transactions.length === 0) return [];
    const rows = transactions.map((transaction) => transactionToRow(userId, transaction, accountsEnabled));
    const { data, error } = await requireClient().from("transactions").insert(rows).select();
    throwIfError(error);
    return data.map(transactionFromRow);
}

export async function saveFinancialAccount(userId, account) {
    const client = requireClient();
    const query = account.id
        ? client.from("financial_accounts").update(accountToRow(userId, { ...account, id: "" })).eq("id", account.id).eq("user_id", userId)
        : client.from("financial_accounts").insert(accountToRow(userId, account));
    const { data, error } = await query.select().single();
    throwIfError(error);
    return accountFromRow(data);
}

export async function removeFinancialAccount(userId, id) {
    const { error } = await requireClient().from("financial_accounts").delete().eq("id", id).eq("user_id", userId);
    throwIfError(error);
}

export async function saveAccountTransfer(userId, transfer) {
    const client = requireClient();
    const query = transfer.id
        ? client.from("account_transfers").update(transferToRow(userId, { ...transfer, id: "" })).eq("id", transfer.id).eq("user_id", userId)
        : client.from("account_transfers").insert(transferToRow(userId, transfer));
    const { data, error } = await query.select().single();
    throwIfError(error);
    return transferFromRow(data);
}

export async function removeAccountTransfer(userId, id) {
    const { error } = await requireClient().from("account_transfers").delete().eq("id", id).eq("user_id", userId);
    throwIfError(error);
}

export async function removeTransaction(userId, id) {
    const { error } = await requireClient().from("transactions").delete().eq("id", id).eq("user_id", userId);
    throwIfError(error);
}

export async function saveGoal(userId, goal) {
    const client = requireClient();
    const query = goal.id
        ? client.from("goals").update(goalToRow(userId, { ...goal, id: "" })).eq("id", goal.id).eq("user_id", userId)
        : client.from("goals").insert(goalToRow(userId, goal));
    const { data, error } = await query.select().single();
    throwIfError(error);
    return goalFromRow(data);
}

export async function removeGoal(userId, id) {
    const { error } = await requireClient().from("goals").delete().eq("id", id).eq("user_id", userId);
    throwIfError(error);
}

export async function saveBudget(userId, budget) {
    const { data, error } = await requireClient()
        .from("category_budgets")
        .upsert(budgetToRow(userId, budget), { onConflict: "user_id,month_start,category" })
        .select()
        .single();
    throwIfError(error);
    return budgetFromRow(data);
}

export async function removeBudget(userId, id) {
    const { error } = await requireClient()
        .from("category_budgets")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
    throwIfError(error);
}

export async function addGoalContribution(goalId, amount, date, note = "") {
    const { data, error } = await requireClient().rpc("add_goal_contribution", {
        p_goal_id: goalId,
        p_amount: amount,
        p_contributed_on: date,
        p_note: note
    });
    throwIfError(error);
    return goalFromRow(data);
}

export async function saveProfile(userId, values) {
    const { data, error } = await requireClient()
        .from("profiles")
        .upsert({ id: userId, ...values }, { onConflict: "id" })
        .select()
        .single();
    throwIfError(error);
    return data;
}

function rpcSnapshot(transactions, goals) {
    return {
        p_transactions: transactions.map((transaction) => ({
            id: transaction.id,
            description: transaction.description,
            amount: transaction.amount,
            type: transaction.type,
            category: transaction.category,
            occurred_on: transaction.date,
            status: transaction.status,
            payment_method: transaction.paymentMethod ?? "other",
            account_id: transaction.accountId,
            series_id: transaction.seriesId,
            series_kind: transaction.seriesKind,
            installment_number: transaction.installmentNumber,
            installment_total: transaction.installmentTotal,
            created_at: transaction.createdAt
        })),
        p_goals: goals.map((goal) => ({
            id: goal.id,
            name: goal.name,
            current_amount: goal.current,
            target_amount: goal.target,
            deadline: goal.deadline,
            icon: goal.icon,
            created_at: goal.createdAt
        }))
    };
}

export async function importLegacySnapshot(transactions, goals) {
    const { data, error } = await requireClient().rpc("import_legacy_snapshot", rpcSnapshot(transactions, goals));
    throwIfError(error);
    return data;
}

export async function replaceUserSnapshot(
    transactions,
    goals,
    budgets = [],
    contributions = [],
    accounts = [],
    transfers = [],
    accountsEnabled = true
) {
    const snapshot = rpcSnapshot(transactions, goals);
    const baseParameters = {
        ...snapshot,
        p_budgets: budgets.map((budget) => ({
            id: budget.id,
            month_start: `${budget.month}-01`,
            category: budget.category,
            amount: budget.amount,
            created_at: budget.createdAt
        })),
        p_contributions: contributions.map((contribution) => ({
            id: contribution.id,
            goal_id: contribution.goalId,
            amount: contribution.amount,
            contributed_on: contribution.date,
            note: contribution.note,
            created_at: contribution.createdAt
        }))
    };
    const { data, error } = accountsEnabled
        ? await requireClient().rpc("replace_user_snapshot_v4", {
            ...baseParameters,
            p_accounts: accounts.map((account) => ({
                id: account.id,
                bank_code: account.bankCode,
                institution_name: account.institutionName,
                name: account.name,
                account_type: account.accountType,
                initial_balance: account.initialBalance,
                color: account.color,
                created_at: account.createdAt
            })),
            p_transfers: transfers.map((transfer) => ({
                id: transfer.id,
                from_account_id: transfer.fromAccountId,
                to_account_id: transfer.toAccountId,
                amount: transfer.amount,
                occurred_on: transfer.date,
                status: transfer.status,
                note: transfer.note,
                created_at: transfer.createdAt
            }))
        })
        : await requireClient().rpc("replace_user_snapshot_v3", baseParameters);
    throwIfError(error);
    return data;
}

export async function deleteAccount() {
    const { error } = await requireClient().rpc("delete_my_account");
    throwIfError(error);
}
