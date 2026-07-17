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

function transactionToRow(userId, transaction) {
    return {
        ...(transaction.id ? { id: transaction.id } : {}),
        user_id: userId,
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type,
        category: transaction.category,
        occurred_on: transaction.date,
        status: transaction.status
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

export async function loadUserData(userId) {
    const client = requireClient();
    const [transactionsResult, goalsResult, profileResult] = await Promise.all([
        client.from("transactions").select("*").eq("user_id", userId).order("occurred_on", { ascending: false }),
        client.from("goals").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
        client.from("profiles").select("*").eq("id", userId).maybeSingle()
    ]);

    throwIfError(transactionsResult.error);
    throwIfError(goalsResult.error);
    throwIfError(profileResult.error);

    return {
        transactions: transactionsResult.data.map(transactionFromRow),
        goals: goalsResult.data.map(goalFromRow),
        profile: profileResult.data
    };
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
            description: transaction.description,
            amount: transaction.amount,
            type: transaction.type,
            category: transaction.category,
            occurred_on: transaction.date,
            status: transaction.status,
            created_at: transaction.createdAt
        })),
        p_goals: goals.map((goal) => ({
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

export async function replaceUserSnapshot(transactions, goals) {
    const { data, error } = await requireClient().rpc("replace_user_snapshot", rpcSnapshot(transactions, goals));
    throwIfError(error);
    return data;
}

