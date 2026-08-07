import { supabase } from "./supabase-client.js";
import {
    PLUGGY_META_KEYS,
    mapPluggyPayload,
    normalizeText,
    transactionFingerprint
} from "./folego-pluggy-domain.js";

const CARD_META_KEY = "folego_credit_cards_v2";
const LEGACY_CARD_META_KEY = "folego_credit_card_v1";
const CARD_SERIES_META_KEY = "folego_card_series_v2";
const AUTO_SYNC_INTERVAL = 15 * 60 * 1000;
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const elements = {
    section: document.querySelector("#v26BankSection"),
    status: document.querySelector("#v26BankStatus"),
    connect: document.querySelector("#v26ConnectBank"),
    sync: document.querySelector("#v26SyncBanks"),
    balance: document.querySelector("#v26BankBalance"),
    credit: document.querySelector("#v26CreditOpen"),
    lastSync: document.querySelector("#v26LastSync"),
    list: document.querySelector("#v26BankList"),
    note: document.querySelector("#v26BankNote")
};

const state = {
    user: null,
    metadata: {},
    items: [],
    snapshot: null,
    syncing: false,
    sdk: null,
    timer: null
};

function safeArray(value) {
    return Array.isArray(value) ? value : [];
}

function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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
    window.setTimeout(() => toast.classList.remove("show"), 4200);
}

function snapshotKey() {
    return `folego_pluggy_snapshot_v1_${state.user?.id || "guest"}`;
}

function readSnapshot() {
    try {
        return JSON.parse(localStorage.getItem(snapshotKey()) || "null");
    } catch {
        return null;
    }
}

function writeSnapshot(snapshot) {
    try {
        localStorage.setItem(snapshotKey(), JSON.stringify(snapshot));
    } catch (error) {
        console.warn("Não foi possível guardar o resumo bancário local:", error);
    }
}

function dateTimeLabel(value) {
    if (!value) return "AINDA NÃO";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "AINDA NÃO";
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

async function currentSession() {
    const { data } = await supabase.auth.getSession();
    return data?.session || null;
}

async function apiRequest(path, body) {
    const session = await currentSession();
    if (!session?.access_token) throw new Error("Entre novamente no Fôlego para conectar o banco.");
    const response = await fetch(path, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify(body || {})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "A integração bancária não respondeu.");
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

async function saveMetadata(values) {
    const { data, error } = await supabase.auth.updateUser({ data: values });
    if (error) throw error;
    state.user = data.user;
    state.metadata = data.user?.user_metadata || {};
}

async function refreshIdentity() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return false;
    state.user = data.user;
    state.metadata = data.user.user_metadata || {};
    state.items = safeArray(state.metadata[PLUGGY_META_KEYS.items]).filter((item) => item?.id);
    state.snapshot = readSnapshot();
    return true;
}

function renderSummary() {
    const summary = state.snapshot?.summary || {};
    if (elements.balance) elements.balance.textContent = currency.format(Number(summary.bankBalance || 0));
    if (elements.credit) elements.credit.textContent = currency.format(Number(summary.creditOpen || 0));
    if (elements.lastSync) elements.lastSync.textContent = dateTimeLabel(state.snapshot?.syncedAt || state.metadata[PLUGGY_META_KEYS.lastSync]);
}

function renderAccounts() {
    if (!elements.list) return;
    const accounts = safeArray(state.snapshot?.accounts);
    if (!state.items.length) {
        elements.list.innerHTML = `
            <div class="v26-bank-empty">
                <span>00</span>
                <div><strong>Nenhum banco ligado ao Fôlego</strong><p>Inter e Banco do Brasil já podem ser autorizados pelo botão acima. A conexão do Meu Pluggy não é transferida automaticamente.</p></div>
            </div>`;
        return;
    }
    if (!accounts.length) {
        elements.list.innerHTML = state.items.map((item, index) => `
            <article class="v26-bank-row">
                <span>${String(index + 1).padStart(2, "0")}</span>
                <div><small>CONEXÃO</small><strong>${escapeHTML(item.name)}</strong><p>Aguardando a primeira leitura de contas.</p></div>
                <b>${escapeHTML(item.status || "CONECTADO")}</b>
                <button type="button" data-v26-update-item="${escapeHTML(item.id)}">ATUALIZAR ACESSO</button>
            </article>`).join("");
        return;
    }
    elements.list.innerHTML = accounts.map((account, index) => {
        const credit = account.type === "CREDIT";
        const title = account.marketingName || account.name || (credit ? "Cartão" : "Conta bancária");
        const limit = Number(account.creditData?.creditLimit || 0);
        const value = credit ? Number(account.balance || 0) : Number(account.balance || 0);
        const detail = credit
            ? `Limite ${currency.format(limit)}${account.creditData?.balanceDueDate ? ` / vence ${String(account.creditData.balanceDueDate).slice(8, 10)}` : ""}`
            : account.bankData?.transferNumber || account.subtype || "Conta conectada";
        const item = state.items.find((candidate) => candidate.id === account.itemId);
        return `
            <article class="v26-bank-row ${credit ? "credit" : "bank"}">
                <span>${String(index + 1).padStart(2, "0")}</span>
                <div><small>${credit ? "CARTÃO" : "CONTA"} / ${escapeHTML(item?.name || "BANCO")}</small><strong>${escapeHTML(title)}</strong><p>${escapeHTML(detail)}</p></div>
                <b>${escapeHTML(currency.format(value))}</b>
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
            ? "OFFLINE / ÚLTIMA LEITURA SALVA"
            : state.items.length
                ? `${state.items.length} ${state.items.length === 1 ? "BANCO CONECTADO" : "BANCOS CONECTADOS"}`
                : "PRONTO PARA CONECTAR";
    if (elements.status) {
        elements.status.textContent = label;
        elements.status.dataset.state = state.syncing ? "loading" : online ? "online" : "offline";
    }
    if (elements.connect) elements.connect.disabled = state.syncing || !online || !state.user;
    if (elements.sync) elements.sync.disabled = state.syncing || !online || !state.items.length;
    if (elements.note) {
        elements.note.textContent = state.items.length
            ? "O Fôlego busca novas movimentações ao abrir, ao voltar para a aba e a cada 15 minutos enquanto estiver aberto."
            : "A autorização acontece no ambiente seguro da Pluggy. O Fôlego nunca recebe sua senha bancária.";
    }
    renderSummary();
    renderAccounts();
}

function matchingCard(cards, imported) {
    const importedName = normalizeText(imported.name);
    return cards.find((card) => card.id === imported.id)
        || cards.find((card) => {
            const name = normalizeText(card.name);
            return name && importedName && (name === importedName || name.includes(importedName) || importedName.includes(name));
        });
}

function mergeCards(importedCards, importedSeries) {
    const cards = safeArray(state.metadata[CARD_META_KEY]).map((card) => ({ ...card }));
    const accountToCard = {};
    importedCards.forEach((imported) => {
        const match = matchingCard(cards, imported);
        if (match) {
            accountToCard[imported.id] = match.id;
            Object.assign(match, {
                limit: imported.limit,
                closingDay: imported.closingDay,
                dueDay: imported.dueDay,
                archived: false,
                updatedAt: new Date().toISOString()
            });
        } else {
            cards.push(imported);
            accountToCard[imported.id] = imported.id;
        }
    });
    const existingSeries = safeObject(state.metadata[CARD_SERIES_META_KEY]);
    const remapped = Object.fromEntries(Object.entries(importedSeries).map(([transactionId, accountId]) => [transactionId, accountToCard[accountId] || accountId]));
    const series = Object.fromEntries(Object.entries({ ...existingSeries, ...remapped }).slice(-600));
    return { cards, series };
}

async function importTransactions(payload) {
    const mapped = mapPluggyPayload(payload, { userId: state.user.id });
    const { data: existing, error } = await supabase
        .from("transactions")
        .select("id,description,amount,type,occurred_on,status,series_id,series_kind")
        .eq("user_id", state.user.id);
    if (error) throw error;

    const existingSeries = new Set(safeArray(existing).map((row) => row.series_id).filter(Boolean));
    const fingerprints = new Set(safeArray(existing).map(transactionFingerprint));
    const rows = mapped.rows.filter((row) => !existingSeries.has(row.series_id) && !fingerprints.has(transactionFingerprint(row)));

    for (let index = 0; index < rows.length; index += 100) {
        const { error: insertError } = await supabase.from("transactions").insert(rows.slice(index, index + 100));
        if (insertError) throw insertError;
    }

    const cardData = mergeCards(mapped.cards, mapped.seriesMap);
    const firstCard = cardData.cards.find((card) => !card.archived) || null;
    await saveMetadata({
        [PLUGGY_META_KEYS.items]: state.items,
        [PLUGGY_META_KEYS.lastSync]: payload.syncedAt,
        [CARD_META_KEY]: cardData.cards,
        [CARD_SERIES_META_KEY]: cardData.series,
        [LEGACY_CARD_META_KEY]: firstCard ? {
            name: firstCard.name,
            limit: firstCard.limit,
            closingDay: firstCard.closingDay,
            dueDay: firstCard.dueDay,
            updatedAt: firstCard.updatedAt
        } : null
    });

    state.snapshot = {
        syncedAt: payload.syncedAt,
        summary: mapped.summary,
        accounts: safeArray(payload.accounts),
        itemCount: state.items.length,
        importedNow: rows.length
    };
    writeSnapshot(state.snapshot);
    return rows.length;
}

async function syncBanks({ silent = false } = {}) {
    if (state.syncing || !navigator.onLine || !state.items.length || !state.user) return;
    state.syncing = true;
    render();
    try {
        const payload = await apiRequest("/api/pluggy/sync", { itemIds: state.items.map((item) => item.id) });
        payload.items.forEach(mergeItem);
        const imported = await importTransactions(payload);
        render();
        window.dispatchEvent(new CustomEvent("folego:data-changed", { detail: { source: "pluggy", imported } }));
        if (!silent || imported) showToast(imported ? `${imported} movimentações bancárias adicionadas.` : "Bancos sincronizados. Nenhum movimento novo.");
    } catch (error) {
        console.error("Falha na sincronização Pluggy:", error);
        if (!silent) showToast(error.message || "Não foi possível sincronizar os bancos.", "error");
    } finally {
        state.syncing = false;
        render();
    }
}

function pluggyConstructor() {
    return window.PluggyConnect?.default || window.PluggyConnect || null;
}

async function openConnect(itemId = null) {
    if (!state.user || state.syncing) return;
    try {
        const Constructor = pluggyConstructor();
        if (!Constructor) throw new Error("O módulo seguro de conexão ainda não carregou. Atualize a página.");
        const token = await apiRequest("/api/pluggy/token", itemId ? { itemId } : {});
        if (!token.accessToken) throw new Error("A Pluggy não devolveu o token temporário.");
        state.sdk?.destroy?.().catch?.(() => {});
        state.sdk = new Constructor({
            connectToken: token.accessToken,
            includeSandbox: false,
            countries: ["BR"],
            language: "pt",
            theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
            ...(itemId ? { updateItem: itemId } : {}),
            onSuccess: async (result) => {
                const item = result?.item || result;
                if (!item?.id) return showToast("A conexão terminou sem identificação do banco.", "warning");
                mergeItem(item);
                await saveMetadata({ [PLUGGY_META_KEYS.items]: state.items });
                render();
                await syncBanks();
            },
            onError: (error) => showToast(error?.message || "A conexão bancária não foi concluída.", "error")
        });
        await state.sdk.init();
    } catch (error) {
        showToast(error.message || "Não foi possível abrir a conexão bancária.", "error");
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
            render();
        }
    });
}

async function boot() {
    if (!supabase || !elements.section) return;
    if (!await refreshIdentity()) return render();
    render();
    window.clearInterval(state.timer);
    state.timer = window.setInterval(() => syncBanks({ silent: true }), AUTO_SYNC_INTERVAL);
    const last = new Date(state.snapshot?.syncedAt || state.metadata[PLUGGY_META_KEYS.lastSync] || 0).getTime();
    if (state.items.length && navigator.onLine && Date.now() - last > AUTO_SYNC_INTERVAL) {
        window.setTimeout(() => syncBanks({ silent: true }), 1200);
    }
}

bindEvents();
boot();
