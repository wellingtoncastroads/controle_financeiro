import { supabase } from "./supabase-client.js";

function requireClient() {
    if (!supabase) throw new Error("Supabase não configurado.");
    return supabase;
}

function throwIfError(error) {
    if (error) throw error;
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
        seriesId: row.series_id ?? null,
        seriesKind: row.series_kind ?? null,
        installmentNumber: row.installment_number ?? null,
        installmentTotal: row.installment_total ?? null,
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

function transactionToRow(userId, transaction) {
    return {
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
    const cacheKey = `folego-cloud-cache-v25-${userId}`;
    try {
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

        const snapshot = {
            transactions: transactionsResult.data.map(transactionFromRow),
            goals: goalsResult.data.map(goalFromRow),
            profile: profileResult.data,
            budgets: budgetsResult.data.map(budgetFromRow),
            contributions: contributionsResult.data.map(contributionFromRow)
        };
        if (typeof localStorage !== "undefined") localStorage.setItem(cacheKey, JSON.stringify(snapshot));
        return snapshot;
    } catch (error) {
        if (typeof localStorage !== "undefined") {
            try {
                const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
                if (cached?.transactions && cached?.goals) return cached;
            } catch (cacheError) {
                console.warn("O cache offline do Fôlego ficou ilegível:", cacheError);
            }
        }
        throw error;
    }
}

export async function saveTransaction(userId, transaction) {
    const client = requireClient();
    const query = transaction.id
        ? client.from("transactions").update(transactionToRow(userId, { ...transaction, id: "" })).eq("id", transaction.id).eq("user_id", userId)
        : client.from("transactions").insert(transactionToRow(userId, transaction));
    const { data, error } = await query.select().single();
    throwIfError(error);
    return transactionFromRow(data);
}

export async function saveTransactions(userId, transactions) {
    if (!Array.isArray(transactions) || transactions.length === 0) return [];
    const rows = transactions.map((transaction) => transactionToRow(userId, transaction));
    const { data, error } = await requireClient().from("transactions").insert(rows).select();
    throwIfError(error);
    return data.map(transactionFromRow);
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

export async function replaceUserSnapshot(transactions, goals, budgets = [], contributions = []) {
    const snapshot = rpcSnapshot(transactions, goals);
    const { data, error } = await requireClient().rpc("replace_user_snapshot_v3", {
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
    });
    throwIfError(error);
    return data;
}

export async function deleteAccount() {
    const { error } = await requireClient().rpc("delete_my_account");
    throwIfError(error);
}


