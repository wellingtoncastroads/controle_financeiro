import { supabase } from "./supabase-client.js";

export const META_KEYS = {
    cards: "folego_credit_cards_v2",
    legacyCard: "folego_credit_card_v1",
    cardSeries: "folego_card_series_v2",
    invoicePayments: "folego_invoice_payments_v1",
    trash: "folego_trash_v1",
    rules: "folego_category_rules_v1"
};

const queueKey = (userId) => `folego_offline_queue_v1_${userId || "guest"}`;

export async function getSessionUser() {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data?.session?.user || null;
}

export async function getFreshUser() {
    if (!supabase) return null;
    const { data: sessionData } = await supabase.auth.getSession();
    const localUser = sessionData?.session?.user || null;
    if (!navigator.onLine) return localUser;
    const { data, error } = await supabase.auth.getUser();
    if (error) return localUser;
    return data?.user || localUser;
}

export async function updateMetadataKey(key, value) {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data, error } = await supabase.auth.updateUser({ data: { [key]: value } });
    if (error) throw error;
    return data.user;
}

export async function updateMetadataValues(values) {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data, error } = await supabase.auth.updateUser({ data: values });
    if (error) throw error;
    return data.user;
}

export async function loadFinanceData(userId) {
    if (!supabase || !userId) return { transactions: [], budgets: [] };
    const [transactionsResult, budgetsResult] = await Promise.all([
        supabase
            .from("transactions")
            .select("*")
            .eq("user_id", userId)
            .order("occurred_on", { ascending: true }),
        supabase
            .from("category_budgets")
            .select("*")
            .eq("user_id", userId)
            .order("month_start", { ascending: true })
    ]);
    if (transactionsResult.error) throw transactionsResult.error;
    if (budgetsResult.error) throw budgetsResult.error;
    return {
        transactions: transactionsResult.data || [],
        budgets: budgetsResult.data || []
    };
}

export function readQueue(userId) {
    try {
        const parsed = JSON.parse(localStorage.getItem(queueKey(userId)) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function writeQueue(userId, queue) {
    localStorage.setItem(queueKey(userId), JSON.stringify(Array.isArray(queue) ? queue : []));
}

export function enqueueOperation(userId, operation) {
    const queue = readQueue(userId);
    const item = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...operation
    };
    queue.push(item);
    writeQueue(userId, queue);
    window.dispatchEvent(new CustomEvent("folego:offline-queue-changed"));
    return item;
}

export function removeQueuedOperation(userId, operationId) {
    const queue = readQueue(userId).filter((item) => item.id !== operationId);
    writeQueue(userId, queue);
    window.dispatchEvent(new CustomEvent("folego:offline-queue-changed"));
    return queue;
}

export function clearQueue(userId) {
    writeQueue(userId, []);
    window.dispatchEvent(new CustomEvent("folego:offline-queue-changed"));
}

export async function insertRows(table, rows) {
    const { data, error } = await supabase.from(table).insert(rows).select();
    if (error) throw error;
    return data || [];
}

export async function upsertRows(table, rows, onConflict = "id") {
    const { data, error } = await supabase.from(table).upsert(rows, { onConflict }).select();
    if (error) throw error;
    return data || [];
}

export async function updateTransactionRows(userId, ids, values) {
    const { data, error } = await supabase
        .from("transactions")
        .update(values)
        .in("id", ids)
        .eq("user_id", userId)
        .select();
    if (error) throw error;
    return data || [];
}

export async function deleteTransactionRow(userId, id) {
    const { error } = await supabase.from("transactions").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
}
