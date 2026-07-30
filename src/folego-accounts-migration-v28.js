import { supabase } from "./supabase-client.js";
import {
    ACCOUNT_ASSIGNMENTS_META_KEY,
    normalizeAccountAssignments
} from "./folego-accounts-v28.js";

export const ACCOUNT_MIGRATION_META_KEY = "folego_accounts_v28_migrated";

export async function migrateExistingTransactionsToInter(user) {
    if (!supabase || !user?.id || user.user_metadata?.[ACCOUNT_MIGRATION_META_KEY]) return user;

    const currentAssignments = normalizeAccountAssignments(
        user.user_metadata?.[ACCOUNT_ASSIGNMENTS_META_KEY]
    );
    const { data, error } = await supabase.auth.updateUser({
        data: {
            [ACCOUNT_MIGRATION_META_KEY]: true,
            [ACCOUNT_ASSIGNMENTS_META_KEY]: currentAssignments
        }
    });
    if (error) throw error;
    return data.user || user;
}
