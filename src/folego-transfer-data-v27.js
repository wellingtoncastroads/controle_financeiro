import { supabase } from "./supabase-client.js";
import { TRANSFER_CATEGORY } from "./folego-transfer-v27.js";

function requireClient() {
    if (!supabase) throw new Error("Supabase não configurado.");
    return supabase;
}

function toRow(userId, transaction) {
    return {
        ...(transaction.id ? { id: transaction.id } : {}),
        user_id: userId,
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type,
        category: TRANSFER_CATEGORY,
        occurred_on: transaction.date,
        status: "paid",
        payment_method: transaction.paymentMethod,
        series_id: transaction.seriesId,
        series_kind: null,
        installment_number: null,
        installment_total: null
    };
}

function fromRow(row) {
    return {
        id: row.id,
        description: row.description,
        amount: Number(row.amount),
        type: row.type,
        category: row.category,
        date: row.occurred_on,
        status: row.status,
        paymentMethod: row.payment_method,
        seriesId: row.series_id,
        seriesKind: row.series_kind,
        installmentNumber: row.installment_number,
        installmentTotal: row.installment_total,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

export async function saveInternalTransferPair(userId, pair) {
    if (!userId || !pair?.outgoing || !pair?.incoming) throw new Error("Transferência incompleta.");
    const rows = [pair.outgoing, pair.incoming].map((transaction) => toRow(userId, transaction));
    const { data, error } = await requireClient().from("transactions").upsert(rows).select();
    if (error) throw error;
    return data.map(fromRow);
}

export async function removeInternalTransferPair(userId, seriesId) {
    if (!userId || !seriesId) throw new Error("Transferência não identificada.");
    const { error } = await requireClient()
        .from("transactions")
        .delete()
        .eq("user_id", userId)
        .eq("series_id", seriesId)
        .eq("category", TRANSFER_CATEGORY);
    if (error) throw error;
}
