import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(
    supabaseUrl
    && supabasePublishableKey
    && !supabaseUrl.includes("SEU-PROJETO")
    && !supabasePublishableKey.includes("SUA_CHAVE")
);

export const supabase = isSupabaseConfigured
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            flowType: "pkce"
        }
    })
    : null;

