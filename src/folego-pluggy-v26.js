import { supabase } from "./supabase-client.js";
import { PLUGGY_META_KEYS, mapPluggyPayload } from "./folego-pluggy-domain.js";

const AUTO_SYNC_INTERVAL = 12 * 60 * 60 * 1000;
const LOCAL_STATE_VERSION = "v2";
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const elements = {
    section: document.querySelector("#v26BankSection"),
    status: document.querySelector("#v26BankStatus"),
    connect: document.querySelector("#v26ConnectBank"),
    sync: document.querySelector("#v26SyncBanks"),
    balance: document.querySelector("#v26BankBalance"),
    transactions: document.querySelector("#v26TransactionCount"),
    lastSync: document.querySelector("#v26LastSync"),
    list: document.querySelector("#v26BankList"),
    note: document.querySelector("#v26BankNote")
};

const state = {
    user: null,
    items: [],
    snapshot: null,
    previewRows: [],
    syncing: false,
    sdk: null,
    timer: null
};

function safeArray(value) {
    return Array.isArray(value) ? value : [];
}

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function showToast(message, type = "success") {
    const toast = document.querySelector("#toast");
    const copy = document.querySelector("#toastMessage");
    if (!toast || !copy) return;
    copy.textContent = message;
    toast.dataset.type = type;
    const icon = toast.querySelector(".toast-icon");
    if (icon) icon.textContent = type === "error" ? "×" : type === "warning" ? "!" : "✓";
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 5200);
}

function localStateKey() {
    return `folego_open_finance_${LOCAL_STATE_VERSION}_${state.user?.id || "guest"}`;
}

function readLocalState() {
    try {
        const stored = JSON.parse(localStorage.getItem(localStateKey()) || "null");
        return stored && typeof stored === "object" ? stored : {};
    } catch {
        return {};
    }
}

function writeLocalState() {
    try {
        localStorage.setItem(localStateKey(), JSON.stringify({
            items: state.items,
            snapshot: state.snapshot,
            savedAt: new Date().toISOString()
        }));
    } catch (error) {
        console.warn("Não foi possível guardar a leitura Open Finance neste navegador:", error);
    }
}

function dateTimeLabel(value) {
    if (!value) return "AINDA NÃO";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "AINDA NÃO";
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}

async function currentSession() {
    const { data } = await supabase.auth.getSession();
    return data?.session || null;
}

async function apiRequest(path, body) {
    const session = await currentSession();
    if (!session?.access_token) throw new Error("Entre novamente no Fôlego para conectar o banco.");
    const requestBody = body && typeof body === "object" && !Array.isArray(body) ? body : {};
    const response = await fetch(path, {
        method: "POST",
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ ...requestBody, __folegoSession: session.access_token })
    });
    const raw = await response.text();
    let payload = {};
    try {
        payload = raw ? JSON.parse(raw) : {};
    } catch {
        payload = {};
    }
    if (!response.ok) {
        const fallback = response.status === 494
            ? "A Vercel recusou os cabeçalhos da prévia. Atualize a página para carregar a correção."
            : response.status === 401 || response.status === 403
            ? "A prévia foi bloqueada antes de alcançar a integração. Reabra o link autorizado da Vercel."
            : `A integração bancária respondeu com o código ${response.status}.`;
        throw new Error(payload.error || fallback);
    }
    return payload;
}

function connectorName(item) {
    return item?.connector?.name || item?.name || "Instituição conectada";
}

function itemRecord(item) {
    return {
        id: item.id,
        name: connectorName(item),
        connectorId: item.connector?.id || item.connectorId || null,
        imageUrl: item.connector?.imageUrl || item.imageUrl || null,
        status: item.status || item.executionStatus || "CONNECTED",
        lastUpdatedAt: item.lastUpdatedAt || item.updatedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

function mergeItem(item) {
    if (!item?.id) return;
    const record = itemRecord(item);
    state.items = [...state.items.filter((current) => current.id !== record.id), record].slice(-8);
}

async function refreshIdentity() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return false;
    state.user = data.user;
    const stored = readLocalState();
    const legacyItems = safeArray(data.user.user_metadata?.[PLUGGY_META_KEYS.items]);
    state.items = safeArray(stored.items).filter((item) => item?.id);
    if (!state.items.length) state.items = legacyItems.filter((item) => item?.id);
    state.snapshot = stored.snapshot || null;
    return true;
}

function renderSummary() {
    const summary = state.snapshot?.summary || {};
    if (elements.balance) elements.balance.textContent = currency.format(Number(summary.bankBalance || 0));
    if (elements.transactions) elements.transactions.textContent = String(Number(summary.transactionCount || 0));
    if (elements.lastSync) elements.lastSync.textContent = dateTimeLabel(state.snapshot?.syncedAt);
}

function renderAccounts() {
    if (!elements.list) return;
    const accounts = safeArray(state.snapshot?.accounts).filter((account) => account?.type === "BANK");
    if (!state.items.length) {
        elements.list.innerHTML = `
            <div class="v26-bank-empty">
                <span>OF</span>
                <div><strong>Inter, Banco do Brasil e Itaú em uma única leitura</strong><p>Autorize cada banco já conectado ao Meu Pluggy. Nesta prévia, o Fôlego apenas lê e confere os dados — nenhum lançamento será gravado.</p></div>
            </div>`;
        return;
    }
    if (!accounts.length) {
        elements.list.innerHTML = state.items.map((item, index) => `
            <article class="v26-bank-row">
                <span>${String(index + 1).padStart(2, "0")}</span>
                <div><small>OPEN FINANCE / MEU PLUGGY</small><strong>${escapeHTML(item.name)}</strong><p>Aguardando a primeira leitura da conta.</p></div>
                <b>${escapeHTML(item.status || "CONECTADO")}</b>
                <button type="button" data-v26-update-item="${escapeHTML(item.id)}">ATUALIZAR ACESSO</button>
            </article>`).join("");
        return;
    }

    elements.list.innerHTML = accounts.map((account, index) => {
        const title = account.marketingName || account.name || "Conta bancária";
        const item = state.items.find((candidate) => candidate.id === account.itemId);
        const detail = account.bankData?.transferNumber || account.subtype || "Conta conectada";
        return `
            <article class="v26-bank-row bank">
                <span>${String(index + 1).padStart(2, "0")}</span>
                <div><small>CONTA / ${escapeHTML(item?.name || "OPEN FINANCE")}</small><strong>${escapeHTML(title)}</strong><p>${escapeHTML(detail)}</p></div>
                <b>${escapeHTML(currency.format(Number(account.balance || 0)))}</b>
                ${item ? `<button type="button" data-v26-update-item="${escapeHTML(item.id)}">ATUALIZAR</button>` : ""}
            </article>`;
    }).join("");
}

function render() {
    if (!elements.section) return;
    const online = navigator.onLine;
    const label = state.syncing
        ? "LENDO OS BANCOS"
        : !online
            ? "OFFLINE / ÚLTIMA LEITURA LOCAL"
            : state.items.length
                ? `${state.items.length} ${state.items.length === 1 ? "BANCO AUTORIZADO" : "BANCOS AUTORIZADOS"}`
                : "SOMENTE LEITURA";
    if (elements.status) {
        elements.status.textContent = label;
        elements.status.dataset.state = state.syncing ? "loading" : online ? "online" : "offline";
    }
    if (elements.connect) elements.connect.disabled = state.syncing || !online || !state.user;
    if (elements.sync) elements.sync.disabled = state.syncing || !online || !state.items.length;
    if (elements.note) {
        elements.note.textContent = state.items.length
            ? "Leitura segura: contas e movimentações ficam em conferência. Nada é lançado no Supabase nesta etapa. O Meu Pluggy atualiza as conexões diariamente."
            : "A autorização acontece no Meu Pluggy. O Fôlego nunca recebe sua senha bancária e não inicia pagamentos.";
    }
    renderSummary();
    renderAccounts();
}

async function syncBanks({ silent = false } = {}) {
    if (state.syncing || !navigator.onLine || !state.items.length || !state.user) return;
    state.syncing = true;
    render();
    try {
        const payload = await apiRequest("/api/pluggy/sync", { itemIds: state.items.map((item) => item.id) });
        safeArray(payload.items).forEach(mergeItem);
        const mapped = mapPluggyPayload(payload, { userId: state.user.id });
        state.previewRows = mapped.rows;
        state.snapshot = {
            syncedAt: payload.syncedAt,
            summary: mapped.summary,
            accounts: safeArray(payload.accounts).filter((account) => account?.type === "BANK"),
            itemCount: state.items.length
        };
        writeLocalState();
        render();
        if (!silent) {
            showToast(`${mapped.rows.length} movimentações conferidas. Nenhum dado foi lançado no Fôlego.`);
        }
    } catch (error) {
        console.error("Falha na leitura Open Finance:", error);
        if (!silent) showToast(error.message || "Não foi possível ler os bancos.", "error");
    } finally {
        state.syncing = false;
        render();
    }
}

const PLUGGY_SDK_URLS = [
    "https://cdn.pluggy.ai/pluggy-connect/latest/pluggy-connect.js",
    "https://cdn.pluggy.ai/pluggy-connect/v2.7.0/pluggy-connect.js"
];
let pluggySdkPromise = null;

function pluggyConstructor() {
    return window.PluggyConnect?.default || window.PluggyConnect || null;
}

function injectPluggySdk(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        const separator = url.includes("?") ? "&" : "?";
        const timeout = window.setTimeout(() => {
            script.remove();
            reject(new Error("A conexão segura demorou além do esperado para carregar."));
        }, 15000);

        script.src = `${url}${separator}folego_retry=${Date.now()}`;
        script.async = true;
        script.dataset.folegoPluggySdk = "true";
        script.onload = () => {
            window.clearTimeout(timeout);
            const Constructor = pluggyConstructor();
            if (Constructor) resolve(Constructor);
            else reject(new Error("O arquivo da conexão bancária carregou sem iniciar o módulo."));
        };
        script.onerror = () => {
            window.clearTimeout(timeout);
            script.remove();
            reject(new Error("Não foi possível baixar o módulo seguro de conexão."));
        };
        document.head.append(script);
    });
}

async function loadPluggyConstructor() {
    const ready = pluggyConstructor();
    if (ready) return ready;

    if (!pluggySdkPromise) {
        pluggySdkPromise = (async () => {
            let lastError = null;
            for (const url of PLUGGY_SDK_URLS) {
                try {
                    const Constructor = await injectPluggySdk(url);
                    if (Constructor) return Constructor;
                } catch (error) {
                    lastError = error;
                    console.warn("Tentativa de carregar Pluggy Connect falhou:", error);
                }
            }
            throw lastError || new Error("O módulo seguro de conexão não ficou disponível.");
        })().catch((error) => {
            pluggySdkPromise = null;
            throw error;
        });
    }

    return pluggySdkPromise;
}

async function persistConnectedItem(item) {
    if (!item?.id) return false;
    mergeItem(item);
    writeLocalState();
    render();
    return true;
}

async function openConnect(itemId = null) {
    if (!state.user || state.syncing) return;
    try {
        const Constructor = await loadPluggyConstructor();
        const token = await apiRequest("/api/pluggy/token", itemId ? { itemId } : {});
        if (!token.accessToken) throw new Error("A Pluggy não devolveu o token temporário.");
        try {
            await state.sdk?.destroy?.();
        } catch (error) {
            console.warn("O componente anterior da Pluggy não pôde ser encerrado:", error);
        }
        state.sdk = new Constructor({
            connectToken: token.accessToken,
            includeSandbox: false,
            products: ["ACCOUNTS", "TRANSACTIONS"],
            countries: ["BR"],
            forceOauthInBrowser: true,
            language: "pt",
            theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
            ...(itemId ? { updateItem: itemId } : {}),
            onEvent: async (event) => {
                const item = event?.item;
                if (!item?.id || state.items.some((current) => current.id === item.id)) return;
                await persistConnectedItem(item);
            },
            onSuccess: async (result) => {
                const item = result?.item || result;
                if (!await persistConnectedItem(item)) {
                    return showToast("A autorização terminou sem identificar o banco.", "warning");
                }
                await syncBanks();
            },
            onError: async (error) => {
                const item = error?.data?.item;
                if (item?.id) await persistConnectedItem(item);
                showToast(error?.message || "A autorização bancária não foi concluída.", "error");
            }
        });
        await state.sdk.init();
    } catch (error) {
        showToast(error.message || "Não foi possível abrir a autorização bancária.", "error");
    }
}

function bindEvents() {
    elements.connect?.addEventListener("click", () => openConnect());
    elements.sync?.addEventListener("click", () => syncBanks());
    elements.list?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-v26-update-item]");
        if (button) openConnect(button.dataset.v26UpdateItem);
    });
    window.addEventListener("online", () => syncBanks({ silent: true }));
    window.addEventListener("offline", render);
    window.addEventListener("focus", () => {
        const last = new Date(state.snapshot?.syncedAt || 0).getTime();
        if (Date.now() - last > AUTO_SYNC_INTERVAL) syncBanks({ silent: true });
    });
    supabase?.auth.onAuthStateChange((_event, session) => {
        if (session?.user) window.setTimeout(boot, 250);
        else {
            state.user = null;
            state.items = [];
            state.snapshot = null;
            state.previewRows = [];
            render();
        }
    });
}

async function boot() {
    if (!supabase || !elements.section) return;
    if (!await refreshIdentity()) return render();
    render();
    if (navigator.onLine) {
        loadPluggyConstructor().catch((error) => console.warn("Pré-carregamento Pluggy indisponível:", error));
    }
    window.clearInterval(state.timer);
    state.timer = window.setInterval(() => syncBanks({ silent: true }), AUTO_SYNC_INTERVAL);
    const last = new Date(state.snapshot?.syncedAt || 0).getTime();
    if (state.items.length && navigator.onLine && Date.now() - last > AUTO_SYNC_INTERVAL) {
        window.setTimeout(() => syncBanks({ silent: true }), 1200);
    }
}

bindEvents();
boot();
