const PLUGGY_API = "https://api.pluggy.ai";
let cachedApiKey = null;
let cachedApiKeyExpiresAt = 0;

export function sendJson(response, status, payload) {
    response.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(JSON.stringify(payload));
}

export function allowMethods(request, response, methods) {
    if (methods.includes(request.method)) return true;
    response.setHeader("Allow", methods.join(", "));
    sendJson(response, 405, { error: "Método não permitido." });
    return false;
}

export async function readJson(request) {
    if (request.body && typeof request.body === "object") return request.body;
    if (typeof request.body === "string" && request.body.trim()) return JSON.parse(request.body);
    return {};
}

function bearerToken(request) {
    const header = String(request.headers.authorization || "");
    return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export async function requireSupabaseUser(request) {
    const token = bearerToken(request);
    if (!token) throw Object.assign(new Error("Sessão do Fôlego ausente."), { status: 401 });

    const url = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
    const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !publishableKey) {
        throw Object.assign(new Error("Supabase não configurado no servidor."), { status: 500 });
    }

    const response = await fetch(`${url}/auth/v1/user`, {
        headers: {
            apikey: publishableKey,
            Authorization: `Bearer ${token}`
        }
    });
    if (!response.ok) throw Object.assign(new Error("Sessão do Fôlego inválida ou expirada."), { status: 401 });
    return response.json();
}

async function createPluggyApiKey() {
    const clientId = process.env.PLUGGY_CLIENT_ID;
    const clientSecret = process.env.PLUGGY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw Object.assign(new Error("Credenciais da Pluggy ausentes na Vercel."), { status: 503 });
    }

    const response = await fetch(`${PLUGGY_API}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.apiKey) {
        throw Object.assign(new Error(payload.message || "A Pluggy recusou as credenciais configuradas."), { status: response.status || 502 });
    }
    cachedApiKey = payload.apiKey;
    cachedApiKeyExpiresAt = Date.now() + 105 * 60 * 1000;
    return cachedApiKey;
}

export async function getPluggyApiKey() {
    if (cachedApiKey && Date.now() < cachedApiKeyExpiresAt) return cachedApiKey;
    return createPluggyApiKey();
}

export async function pluggyRequest(pathOrUrl, { method = "GET", body, apiKey } = {}) {
    const key = apiKey || await getPluggyApiKey();
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${PLUGGY_API}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
    const response = await fetch(url, {
        method,
        headers: {
            "Content-Type": "application/json",
            "X-API-KEY": key
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(payload.message || payload.codeDescription || "Falha ao consultar a Pluggy.");
        error.status = response.status;
        error.payload = payload;
        throw error;
    }
    return payload;
}

export async function collectPluggyPages(path, apiKey, maxPages = 30) {
    const results = [];
    let next = new URL(path, PLUGGY_API).toString();
    let pages = 0;
    while (next && pages < maxPages) {
        const current = new URL(next, PLUGGY_API);
        const payload = await pluggyRequest(current.toString(), { apiKey });
        if (Array.isArray(payload.results)) results.push(...payload.results);
        if (!payload.next) break;
        next = new URL(payload.next, current).toString();
        pages += 1;
    }
    return results;
}

export async function assertItemOwnership(itemId, userId, apiKey) {
    const item = await pluggyRequest(`/items/${encodeURIComponent(itemId)}`, { apiKey });
    if (String(item.clientUserId || "") !== String(userId)) {
        throw Object.assign(new Error("Esta conexão bancária não pertence à conta atual do Fôlego."), { status: 403 });
    }
    return item;
}

export function publicItem(item) {
    return {
        id: item.id,
        status: item.status,
        executionStatus: item.executionStatus,
        connector: item.connector ? {
            id: item.connector.id,
            name: item.connector.name,
            primaryColor: item.connector.primaryColor,
            imageUrl: item.connector.imageUrl
        } : null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        lastUpdatedAt: item.lastUpdatedAt,
        error: item.error ? { code: item.error.code, message: item.error.message } : null
    };
}

export function handleApiError(response, error) {
    const status = Number(error?.status) || 500;
    console.error("Fôlego / Pluggy:", error?.message || error);
    sendJson(response, status, { error: error?.message || "Falha inesperada na integração bancária." });
}
