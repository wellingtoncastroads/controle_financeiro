import { supabase } from "./supabase-client.js";

export const ACCOUNT_MIGRATION_META_KEY = "folego_accounts_v28_migrated";

const TRANSFER_CATEGORIES = new Set(["Transferência", "Transferência interna"]);

export async function migrateExistingTransactionsToInter(user) {
    if (!supabase || !user?.id || user.user_metadata?.[ACCOUNT_MIGRATION_META_KEY]) return user;

    const { data: rows, error: loadError } = await supabase
        .from("transactions")
        .select("id,category,payment_method")
        .eq("user_id", user.id);
    if (loadError) throw loadError;

    const ids = (rows || [])
        .filter((row) => !TRANSFER_CATEGORIES.has(String(row.category || "")) && row.payment_method !== "pix")
        .map((row) => row.id)
        .filter(Boolean);

    for (let index = 0; index < ids.length; index += 100) {
        const chunk = ids.slice(index, index + 100);
        const { error } = await supabase
            .from("transactions")
            .update({ payment_method: "pix" })
            .eq("user_id", user.id)
            .in("id", chunk);
        if (error) throw error;
    }

    const { data, error } = await supabase.auth.updateUser({
        data: { [ACCOUNT_MIGRATION_META_KEY]: true }
    });
    if (error) throw error;
    return data.user || user;
}
