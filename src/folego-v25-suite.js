import { supabase } from "./supabase-client.js";
import {
    TRANSFER_CATEGORY,
    addDays,
    annualSummary,
    buildCreditRows,
    buildTransferRows,
    cardIdForRow,
    cardUsage,
    cleanCard,
    cleanCards,
    compareMonths,
    dateAtMonthDay,
    keywordCandidate,
    monthKey,
    monthWithOffset,
    normalizeKeyword,
    riskSnapshot,
    splitMoney,
    suggestCategory,
    todayKey
} from "./folego-v25-domain.js";
import {
    META_KEYS,
    deleteTransactionRow,
    enqueueOperation,
    getFreshUser,
    getSessionUser,
    insertRows,
    loadFinanceData,
    readQueue,
    removeQueuedOperation,
    updateMetadataKey,
    updateMetadataValues,
    updateTransactionRows,
    upsertRows
} from "./folego-v25-store.js";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const requestedArchiveView = window.location.hash === "#archive";
const CACHE_PREFIX = "folego_v25_finance_cache_";

const DEFAULT_RULES = [
    { id: "default-uber", keyword: "uber", category: "Transporte", default: true },
    { id: "default-99", keyword: "99", category: "Transporte", default: true },
    { id: "default-ifood", keyword: "ifood", category: "Alimentação", default: true },
    { id: "default-mercado", keyword: "supermercado", category: "Alimentação", default: true },
    { id: "default-netflix", keyword: "netflix", category: "Assinaturas", default: true },
    { id: "default-spotify", keyword: "spotify", category: "Assinaturas", default: true },
    { id: "default-farmacia", keyword: "farmácia", category: "Saúde", default: true },
    { id: "default-aluguel", keyword: "aluguel", category: "Moradia", default: true },
    { id: "default-energia", keyword: "energia", category: "Contas", default: true },
    { id: "default-internet", keyword: "internet", category: "Contas", default: true },
    { id: "default-salario", keyword: "salário", category: "Salário", default: true }
];

const elements = {
    appShell: document.querySelector("#appShell"),
    pageTitle: document.querySelector("#pageTitle"),
    archiveView: document.querySelector("#archiveView"),
    cardsView: document.querySelector("#cardsView"),
    transactionRows: document.querySelector("#transactionRows"),
    transactionDialog: document.querySelector("#transactionDialog"),
    transactionForm: document.querySelector("#transactionForm"),
    transactionId: document.querySelector("#transactionId"),
    transactionDescription: document.querySelector("#transactionDescription"),
    transactionAmount: document.querySelector("#transactionAmount"),
    transactionCategory: document.querySelector("#transactionCategory"),
    transactionDate: document.querySelector("#transactionDate"),
    transactionStatus: document.querySelector("#transactionStatus"),
    transactionPaymentMethod: document.querySelector("#transactionPaymentMethod"),
    transactionMode: document.querySelector("#transactionMode"),
    recurrenceFrequency: document.querySelector("#recurrenceFrequency"),
    recurrenceCount: document.querySelector("#recurrenceCount"),
    installmentCount: document.querySelector("#installmentCount"),
    creditPurchaseFields: document.querySelector("#creditPurchaseFields"),
    creditInstallmentCount: document.querySelector("#creditInstallmentCount"),
    newCreditCardButton: document.querySelector("#newCreditCardButton"),
    creditCardDialog: document.querySelector("#creditCardDialog"),
    creditCardForm: document.querySelector("#creditCardForm"),
    creditCardModalTitle: document.querySelector("#creditCardModalTitle"),
    creditCardName: document.querySelector("#creditCardName"),
    creditCardLimit: document.querySelector("#creditCardLimit"),
    creditCardClosingDay: document.querySelector("#creditCardClosingDay"),
    creditCardDueDay: document.querySelector("#creditCardDueDay"),
    cardTotalLimit: document.querySelector("#cardTotalLimit"),
    cardUsedLimit: document.querySelector("#cardUsedLimit"),
    cardAvailableLimit: document.querySelector("#cardAvailableLimit"),
    cardCurrentInvoice: document.querySelector("#cardCurrentInvoice"),
    cardInvoiceCaption: document.querySelector("#cardInvoiceCaption"),
    creditCardPanel: document.querySelector("#creditCardPanel"),
    invoiceMonthFilter: document.querySelector("#invoiceMonthFilter"),
    invoiceOpenTotal: document.querySelector("#invoiceOpenTotal"),
    invoicePurchaseCount: document.querySelector("#invoicePurchaseCount"),
    invoiceList: document.querySelector("#creditCardInvoiceList"),
    payInvoiceButton: document.querySelector("#payInvoiceButton"),
    cardHistoryList: document.querySelector("#cardHistoryList"),
    transferDialog: document.querySelector("#v25TransferDialog"),
    transferForm: document.querySelector("#v25TransferForm"),
    transferAmount: document.querySelector("#v25TransferAmount"),
    transferSource: document.querySelector("#v25TransferSource"),
    transferDestination: document.querySelector("#v25TransferDestination"),
    transferDate: document.querySelector("#v25TransferDate"),
    transferNote: document.querySelector("#v25TransferNote"),
    invoiceDialog: document.querySelector("#v25InvoicePaymentDialog"),
    invoiceForm: document.querySelector("#v25InvoicePaymentForm"),
    invoicePaymentCard: document.querySelector("#v25InvoicePaymentCard"),
    invoicePaymentMonth: document.querySelector("#v25InvoicePaymentMonth"),
    invoicePaymentTotal: document.querySelector("#v25InvoicePaymentTotal"),
    invoicePaymentSource: document.querySelector("#v25InvoicePaymentSource"),
    trashDialog: document.querySelector("#v25TrashDialog"),
    trashList: document.querySelector("#v25TrashList"),
    undoBar: document.querySelector("#v25UndoBar"),
    undoCopy: document.querySelector("#v25UndoCopy"),
    connectionBadge: document.querySelector("#v25ConnectionBadge"),
    riskList: document.querySelector("#v25RiskList"),
    compareMonth: document.querySelector("#v25CompareMonth"),
    compareCurrent: document.querySelector("#v25CompareCurrent"),
    comparePrevious: document.querySelector("#v25ComparePrevious"),
    compareDelta: document.querySelector("#v25CompareDelta"),
    compareCategory: document.querySelector("#v25CompareCategory"),
    annualYear: document.querySelector("#v25AnnualYear"),
    annualIncome: document.querySelector("#v25AnnualIncome"),
    annualExpense: document.querySelector("#v25AnnualExpense"),
    annualResult: document.querySelector("#v25AnnualResult"),
    annualAverage: document.querySelector("#v25AnnualAverage"),
    annualHighlights: document.querySelector("#v25AnnualHighlights"),
    annualMonths: document.querySelector("#v25AnnualMonths"),
    annualCategories: document.querySelector("#v25AnnualCategories"),
    ruleForm: document.querySelector("#v25RuleForm"),
    ruleKeyword: document.querySelector("#v25RuleKeyword"),
    ruleCategory: document.querySelector("#v25RuleCategory"),
    ruleList: document.querySelector("#v25RuleList"),
    offlineCount: document.querySelector("#v25OfflineCount"),
    offlineList: document.querySelector("#v25OfflineList"),
    offlineSyncButton: document.querySelector("#v25OfflineSyncButton"),
    toast: document.querySelector("#toast"),
    toastMessage: document.querySelector("#toastMessage")
};

const state = {
    user: null,
    metadata: {},
    transactions: [],
    budgets: [],
    cards: [],
    cardSeries: {},
    invoicePayments: [],
    trash: [],
    rules: [],
    selectedCardId: null,
    editingCardId: null,
    lastDeletedId: null,
    loading: false,
    syncing: false,
    internalCardRender: false,
    toastTimer: null,
    undoTimer: null
};

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatCurrency(value) {
    return currency.format(Number(value) || 0);
}

function formatMonth(value) {
    const [year, month] = String(value).split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
        .format(new Date(year, month - 1, 1))
        .replace(/^./, (letter) => letter.toUpperCase());
}

function formatShortMonth(value) {
    const [year, month] = String(value).split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR", { month: "short" })
        .format(new Date(year, month - 1, 1))
        .replace(".", "")
        .toUpperCase();
}

function formatDate(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
        .format(new Date(`${value}T12:00:00`))
        .replaceAll(" de ", " ");
}

function showToast(message, type = "success") {
    if (!elements.toast || !elements.toastMessage) return;
    window.clearTimeout(state.toastTimer);
    elements.toastMessage.textContent = message;
    elements.toast.dataset.type = type;
    const icon = elements.toast.querySelector(".toast-icon");
    if (icon) icon.textContent = type === "error" ? "×" : type === "warning" ? "!" : "✓";
    elements.toast.classList.add("show");
    state.toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 3800);
}

function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeArray(value) {
    return Array.isArray(value) ? value : [];
}

function cacheKey() {
    return `${CACHE_PREFIX}${state.user?.id || "guest"}`;
}

function cacheFinanceData() {
    if (!state.user) return;
    try {
        localStorage.setItem(cacheKey(), JSON.stringify({
            savedAt: new Date().toISOString(),
            transactions: state.transactions,
            budgets: state.budgets
        }));
    } catch (error) {
        console.warn("O cache financeiro local não pôde ser atualizado:", error);
    }
}

function readFinanceCache() {
    try {
        const parsed = JSON.parse(localStorage.getItem(cacheKey()) || "null");
        return parsed && Array.isArray(parsed.transactions)
            ? { transactions: parsed.transactions, budgets: safeArray(parsed.budgets) }
            : { transactions: [], budgets: [] };
    } catch {
        return { transactions: [], budgets: [] };
    }
}

function activeCards() {
    return state.cards.filter((card) => !card.archived);
}

function fallbackCardId() {
    return state.cards[0]?.id || null;
}

function isCreditRow(row) {
    return row?.type === "expense" && (
        row.payment_method === "credit_card"
        || Boolean(row.series_id && state.cardSeries[row.series_id])
    );
}

function cardForRow(row) {
    return cardIdForRow(row, state.cardSeries, fallbackCardId());
}

function rowsForCard(cardId) {
    return state.transactions.filter((row) => isCreditRow(row) && cardForRow(row) === cardId);
}

function currentInvoiceRows() {
    const cardId = state.selectedCardId;
    const month = elements.invoiceMonthFilter?.value || monthKey();
    return cardId
        ? rowsForCard(cardId).filter((row) => row.status === "pending" && String(row.occurred_on).slice(0, 7) === month)
        : [];
}

function sumRows(rows) {
    return rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

async function saveMetadataKey(key, value) {
    const user = await updateMetadataKey(key, value);
    state.user = user;
    state.metadata = user?.user_metadata || {};
    return user;
}

async function saveCards() {
    const first = activeCards()[0] || null;
    const user = await updateMetadataValues({
        [META_KEYS.cards]: state.cards,
        [META_KEYS.legacyCard]: first ? {
            name: first.name,
            limit: first.limit,
            closingDay: first.closingDay,
            dueDay: first.dueDay,
            updatedAt: first.updatedAt
        } : null
    });
    state.user = user;
    state.metadata = user?.user_metadata || {};
}

function ensureDynamicFields() {
    if (elements.creditCardForm && !document.querySelector("#v25CreditCardId")) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.id = "v25CreditCardId";
        elements.creditCardForm.prepend(input);
    }

    if (elements.creditPurchaseFields && !document.querySelector("#v25PurchaseCard")) {
        const label = document.createElement("label");
        label.className = "form-field v25-card-choice";
        label.innerHTML = '<span>QUAL CARTÃO</span><select id="v25PurchaseCard" required></select>';
        elements.creditPurchaseFields.prepend(label);
    }

    const control = document.querySelector(".credit-invoice-control");
    if (control && !document.querySelector("#v25InvoiceCardSelect")) {
        const label = document.createElement("label");
        label.className = "v25-invoice-card-field";
        label.innerHTML = '<span>CARTÃO /</span><select id="v25InvoiceCardSelect"></select>';
        control.prepend(label);
    }

    const descriptionField = elements.transactionDescription?.closest(".form-field");
    if (descriptionField && !document.querySelector("#v25CategorySuggestion")) {
        const hint = document.createElement("small");
        hint.id = "v25CategorySuggestion";
        hint.className = "v25-category-suggestion";
        hint.hidden = true;
        descriptionField.append(hint);
    }

    populateCardSelectors();
}

function populateCardSelectors() {
    const cards = activeCards();
    if (!state.selectedCardId || !cards.some((card) => card.id === state.selectedCardId)) {
        state.selectedCardId = cards[0]?.id || null;
    }
    const options = cards.map((card) => `<option value="${escapeHTML(card.id)}">${escapeHTML(card.name)}</option>`).join("");
    const purchase = document.querySelector("#v25PurchaseCard");
    const invoice = document.querySelector("#v25InvoiceCardSelect");
    if (purchase) {
        purchase.innerHTML = options || '<option value="">Adicione um cartão</option>';
        purchase.value = cards.some((card) => card.id === state.selectedCardId) ? state.selectedCardId : cards[0]?.id || "";
        purchase.disabled = !cards.length;
    }
    if (invoice) {
        invoice.innerHTML = options || '<option value="">Sem cartão</option>';
        invoice.value = state.selectedCardId || "";
        invoice.disabled = !cards.length;
    }
}

async function loadSuite({ force = false } = {}) {
    if (state.loading && !force) return;
    state.loading = true;
    try {
        state.user = navigator.onLine ? await getFreshUser() : await getSessionUser();
        if (!state.user) return;
        state.metadata = state.user.user_metadata || {};
        state.cards = cleanCards(state.metadata[META_KEYS.cards], state.metadata[META_KEYS.legacyCard]);
        state.cardSeries = safeObject(state.metadata[META_KEYS.cardSeries]);
        state.invoicePayments = safeArray(state.metadata[META_KEYS.invoicePayments]);
        state.trash = safeArray(state.metadata[META_KEYS.trash])
            .filter((item) => item?.deletedAt && Date.now() - new Date(item.deletedAt).getTime() < 30 * 86400000)
            .slice(0, 50);
        state.rules = safeArray(state.metadata[META_KEYS.rules]);

        if (!Array.isArray(state.metadata[META_KEYS.cards]) && state.cards.length && navigator.onLine) {
            await saveCards();
        }
        if (state.trash.length !== safeArray(state.metadata[META_KEYS.trash]).length && navigator.onLine) {
            await saveMetadataKey(META_KEYS.trash, state.trash);
        }

        try {
            const cloud = navigator.onLine ? await loadFinanceData(state.user.id) : readFinanceCache();
            state.transactions = cloud.transactions;
            state.budgets = cloud.budgets;
            if (navigator.onLine) cacheFinanceData();
        } catch (error) {
            const cached = readFinanceCache();
            state.transactions = cached.transactions;
            state.budgets = cached.budgets;
            if (!state.transactions.length) throw error;
        }

        ensureDynamicFields();
        renderCards();
        renderArchive();
        renderTrash();
        renderOffline();
        updateConnectionState();
        setupCardObservers();

        if (navigator.onLine && readQueue(state.user.id).length) {
            window.setTimeout(syncOfflineQueue, 250);
        }
    } catch (error) {
        console.error("Falha ao abrir a evolução V2.5:", error);
    } finally {
        state.loading = false;
    }
}

function openCardDialog(cardId = null) {
    ensureDynamicFields();
    const card = state.cards.find((item) => item.id === cardId && !item.archived) || null;
    state.editingCardId = card?.id || null;
    elements.creditCardForm?.reset();
    const idInput = document.querySelector("#v25CreditCardId");
    if (idInput) idInput.value = card?.id || "";
    if (elements.creditCardModalTitle) elements.creditCardModalTitle.textContent = card ? "Editar cartão" : "Adicionar cartão";
    if (elements.creditCardName) elements.creditCardName.value = card?.name || "";
    if (elements.creditCardLimit) elements.creditCardLimit.value = card?.limit || "";
    if (elements.creditCardClosingDay) elements.creditCardClosingDay.value = card?.closingDay || 10;
    if (elements.creditCardDueDay) elements.creditCardDueDay.value = card?.dueDay || 17;
    elements.creditCardDialog?.showModal();
    window.setTimeout(() => elements.creditCardName?.focus(), 60);
}

async function handleCardSubmit(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const id = document.querySelector("#v25CreditCardId")?.value || state.editingCardId;
    const card = cleanCard({
        id,
        name: elements.creditCardName?.value,
        limit: elements.creditCardLimit?.value,
        closingDay: elements.creditCardClosingDay?.value,
        dueDay: elements.creditCardDueDay?.value,
        createdAt: state.cards.find((item) => item.id === id)?.createdAt
    });
    if (!card) {
        showToast("Revise o nome, o limite e as datas do cartão.", "warning");
        return;
    }
    const button = elements.creditCardForm?.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
        state.cards = state.cards.some((item) => item.id === card.id)
            ? state.cards.map((item) => item.id === card.id ? { ...item, ...card, archived: false } : item)
            : [...state.cards, card];
        state.selectedCardId = card.id;
        await saveCards();
        elements.creditCardDialog?.close();
        populateCardSelectors();
        renderCards();
        showToast(state.editingCardId ? "Cartão atualizado." : "Novo cartão adicionado.");
    } catch (error) {
        showToast(error?.message || "Não foi possível salvar o cartão.", "error");
    } finally {
        state.editingCardId = null;
        if (button) button.disabled = false;
    }
}

async function archiveCard(cardId) {
    const card = state.cards.find((item) => item.id === cardId);
    if (!card) return;
    const pending = rowsForCard(cardId).filter((row) => row.status === "pending");
    if (pending.length) {
        showToast("Pague ou exclua as parcelas abertas antes de arquivar este cartão.", "warning");
        return;
    }
    if (!window.confirm(`Arquivar o cartão “${card.name}”? O histórico continuará disponível.`)) return;
    state.cards = state.cards.map((item) => item.id === cardId ? { ...item, archived: true, updatedAt: new Date().toISOString() } : item);
    state.selectedCardId = activeCards()[0]?.id || null;
    await saveCards();
    populateCardSelectors();
    renderCards();
    showToast("Cartão arquivado. O histórico foi preservado.");
}

function renderCards() {
    if (!elements.cardsView || !elements.creditCardPanel) return;
    ensureDynamicFields();
    state.internalCardRender = true;
    try {
        const usages = cardUsage(state.transactions, state.cards, state.cardSeries);
        const cards = activeCards();
        const selected = cards.find((card) => card.id === state.selectedCardId) || cards[0] || null;
        state.selectedCardId = selected?.id || null;
        populateCardSelectors();

        const totalLimit = usages.reduce((sum, card) => sum + card.limit, 0);
        const totalUsed = usages.reduce((sum, card) => sum + card.pending, 0);
        const available = totalLimit - totalUsed;
        const invoiceRows = currentInvoiceRows();
        const invoiceTotal = sumRows(invoiceRows);
        const month = elements.invoiceMonthFilter?.value || monthKey();

        if (elements.cardTotalLimit) elements.cardTotalLimit.textContent = formatCurrency(totalLimit);
        if (elements.cardUsedLimit) elements.cardUsedLimit.textContent = formatCurrency(totalUsed);
        if (elements.cardAvailableLimit) {
            elements.cardAvailableLimit.textContent = formatCurrency(available);
            elements.cardAvailableLimit.classList.toggle("negative", available < 0);
        }
        if (elements.cardCurrentInvoice) elements.cardCurrentInvoice.textContent = formatCurrency(invoiceTotal);
        if (elements.cardInvoiceCaption) elements.cardInvoiceCaption.textContent = selected ? `${selected.name} / ${formatMonth(month)}` : "adicione um cartão";

        if (!cards.length) {
            elements.creditCardPanel.innerHTML = `
                <div class="credit-card-empty v25-card-empty">
                    <span>04</span>
                    <strong>Crédito ainda sem página</strong>
                    <p>Adicione um ou mais cartões. Cada limite, fechamento e vencimento fica separado.</p>
                    <button class="ink-button" type="button" data-v25-card-create><span>+</span> Adicionar cartão</button>
                </div>`;
        } else {
            elements.creditCardPanel.innerHTML = `<div class="v25-card-carousel">${usages.map((card) => {
                const ratio = card.limit > 0 ? card.pending / card.limit : 0;
                const status = ratio > 1 ? "exceeded" : ratio >= 0.8 ? "warning" : "safe";
                return `
                    <article class="credit-card-sheet v25-card-sheet ${status} ${card.id === state.selectedCardId ? "selected" : ""}" data-v25-card="${escapeHTML(card.id)}">
                        <header><span>CRÉDITO / ${escapeHTML(card.name.toUpperCase())}</span><b>FÔLEGO®</b></header>
                        <button class="v25-card-select" type="button" data-v25-card-select="${escapeHTML(card.id)}" aria-label="Selecionar ${escapeHTML(card.name)}">
                            <span>LIMITE DISPONÍVEL</span>
                            <strong class="${card.available < 0 ? "negative" : ""}">${escapeHTML(formatCurrency(card.available))}</strong>
                        </button>
                        <div class="credit-limit-track"><i style="width:${Math.min(100, Math.max(0, ratio * 100))}%"></i></div>
                        <dl>
                            <div><dt>LIMITE</dt><dd>${escapeHTML(formatCurrency(card.limit))}</dd></div>
                            <div><dt>USADO</dt><dd>${escapeHTML(formatCurrency(card.pending))}</dd></div>
                            <div><dt>PRESSÃO</dt><dd>${integer.format(ratio * 100)}%</dd></div>
                        </dl>
                        <footer>
                            <span>FECHA DIA ${String(card.closingDay).padStart(2, "0")} / VENCE DIA ${String(card.dueDay).padStart(2, "0")}</span>
                            <div><button type="button" data-v25-card-edit="${escapeHTML(card.id)}">EDITAR</button><button type="button" data-v25-card-archive="${escapeHTML(card.id)}">ARQUIVAR</button></div>
                        </footer>
                    </article>`;
            }).join("")}</div>`;
        }

        if (elements.invoiceOpenTotal) elements.invoiceOpenTotal.textContent = formatCurrency(invoiceTotal);
        if (elements.invoicePurchaseCount) elements.invoicePurchaseCount.textContent = `${invoiceRows.length} ${invoiceRows.length === 1 ? "parcela" : "parcelas"}`;
        if (elements.payInvoiceButton) elements.payInvoiceButton.disabled = !invoiceRows.length;
        if (elements.invoiceList) {
            elements.invoiceList.innerHTML = invoiceRows.length
                ? invoiceRows.map((row) => `
                    <div class="credit-invoice-row" data-v25-invoice-row>
                        <span>${escapeHTML(formatDate(row.occurred_on))}</span>
                        <div><strong>${escapeHTML(row.description)}</strong><small>${escapeHTML(row.category)}${row.installment_total ? ` • ${row.installment_number}/${row.installment_total}` : ""}</small></div>
                        <b>${escapeHTML(formatCurrency(row.amount))}</b>
                    </div>`).join("")
                : '<div class="credit-invoice-empty">Nenhuma parcela aberta para este cartão e mês.</div>';
        }
        renderCardHistory();
    } finally {
        window.setTimeout(() => { state.internalCardRender = false; }, 0);
    }
}

function renderCardHistory() {
    if (!elements.cardHistoryList) return;
    const fallback = fallbackCardId();
    const grouped = new Map();
    state.transactions.filter(isCreditRow).forEach((row) => {
        const cardId = cardIdForRow(row, state.cardSeries, fallback);
        const month = String(row.occurred_on || "").slice(0, 7);
        if (!cardId || !month) return;
        const key = `${cardId}:${month}`;
        if (!grouped.has(key)) grouped.set(key, { cardId, month, rows: [] });
        grouped.get(key).rows.push(row);
    });
    const summaries = [...grouped.values()].map((item) => {
        const card = state.cards.find((entry) => entry.id === item.cardId);
        const pending = item.rows.filter((row) => row.status === "pending");
        return {
            ...item,
            cardName: card?.name || "Cartão arquivado",
            total: sumRows(item.rows),
            pending: pending.length,
            paid: item.rows.length - pending.length
        };
    }).sort((a, b) => b.month.localeCompare(a.month) || a.cardName.localeCompare(b.cardName, "pt-BR"));

    elements.cardHistoryList.innerHTML = summaries.length
        ? summaries.map((item, index) => `
            <button class="card-history-item ${item.pending ? "open" : "paid"}" type="button" data-v25-card-history-month="${escapeHTML(item.month)}" data-v25-card-history-card="${escapeHTML(item.cardId)}" data-v25-history>
                <span class="card-history-index">${String(index + 1).padStart(2, "0")}</span>
                <div class="card-history-copy"><strong>${escapeHTML(item.cardName)}</strong><small>${escapeHTML(formatMonth(item.month))}</small></div>
                <div class="card-history-total"><span>TOTAL DA FATURA</span><strong>${escapeHTML(formatCurrency(item.total))}</strong></div>
                <div class="card-history-breakdown"><span>${item.paid} pagas</span><span>${item.pending} abertas</span></div>
                <span class="card-history-stamp">${item.pending ? "Aberta" : "Paga"}</span>
            </button>`).join("")
        : '<div class="credit-invoice-empty" data-v25-history>As faturas aparecerão aqui depois da primeira compra no crédito.</div>';
}

function setupCardObservers() {
    if (elements.creditCardPanel && !elements.creditCardPanel.dataset.v25Observed) {
        elements.creditCardPanel.dataset.v25Observed = "true";
        new MutationObserver(() => {
            if (state.internalCardRender) return;
            if (!elements.creditCardPanel.querySelector("[data-v25-card], .v25-card-empty")) window.setTimeout(renderCards, 30);
        }).observe(elements.creditCardPanel, { childList: true, subtree: true });
    }
    if (elements.cardHistoryList && !elements.cardHistoryList.dataset.v25Observed) {
        elements.cardHistoryList.dataset.v25Observed = "true";
        new MutationObserver(() => {
            if (state.internalCardRender) return;
            if (!elements.cardHistoryList.querySelector("[data-v25-history]")) window.setTimeout(renderCardHistory, 30);
        }).observe(elements.cardHistoryList, { childList: true, subtree: true });
    }
}

function transactionPayloadFromForm() {
    const type = elements.transactionForm?.querySelector('input[name="transactionType"]:checked')?.value || "expense";
    return {
        id: elements.transactionId?.value || "",
        description: elements.transactionDescription?.value.trim() || "",
        amount: Number(elements.transactionAmount?.value),
        type,
        category: elements.transactionCategory?.value || "",
        date: elements.transactionDate?.value || todayKey(),
        status: elements.transactionStatus?.value || "paid",
        paymentMethod: elements.transactionPaymentMethod?.value || "pix",
        mode: elements.transactionMode?.value || "single",
        frequency: elements.recurrenceFrequency?.value || "monthly",
        count: Number(elements.recurrenceCount?.value || 12),
        installments: Number(elements.installmentCount?.value || 2)
    };
}

function basicRowsFromPayload(payload) {
    const base = {
        user_id: state.user.id,
        description: payload.description,
        amount: payload.amount,
        type: payload.type,
        category: payload.category,
        occurred_on: payload.date,
        status: payload.status,
        payment_method: payload.paymentMethod,
        series_id: null,
        series_kind: null,
        installment_number: null,
        installment_total: null
    };
    if (payload.mode === "single" || payload.id) return [base];
    const seriesId = crypto.randomUUID();
    if (payload.mode === "installment") {
        const parts = splitMoney(payload.amount, payload.installments);
        return parts.map((amount, index) => ({
            ...base,
            amount,
            occurred_on: dateAtMonthDay(monthWithOffset(payload.date.slice(0, 7), index), Number(payload.date.slice(8, 10))),
            status: index === 0 ? payload.status : "pending",
            series_id: seriesId,
            series_kind: "installment",
            installment_number: index + 1,
            installment_total: parts.length
        }));
    }
    const count = Math.max(2, Math.min(60, Number(payload.count) || 12));
    return Array.from({ length: count }, (_, index) => ({
        ...base,
        occurred_on: payload.frequency === "weekly"
            ? addDays(payload.date, index * 7)
            : dateAtMonthDay(monthWithOffset(payload.date.slice(0, 7), index * (payload.frequency === "yearly" ? 12 : 1)), Number(payload.date.slice(8, 10))),
        status: index === 0 ? payload.status : "pending",
        series_id: seriesId,
        series_kind: "recurring"
    }));
}

async function executeBasicTransaction(payload) {
    const rows = basicRowsFromPayload(payload);
    if (payload.id) {
        const { error } = await supabase
            .from("transactions")
            .update({ ...rows[0], user_id: undefined })
            .eq("id", payload.id)
            .eq("user_id", state.user.id);
        if (error) throw error;
        return;
    }
    await insertRows("transactions", rows);
}

async function executeCreditPurchase(payload) {
    const card = activeCards().find((item) => item.id === payload.cardId);
    if (!card) throw new Error("O cartão escolhido não está mais ativo.");
    const seriesId = payload.seriesId || crypto.randomUUID();
    const rows = buildCreditRows({
        userId: state.user.id,
        description: payload.description,
        amount: payload.amount,
        category: payload.category,
        purchaseDate: payload.purchaseDate,
        count: payload.count,
        card,
        seriesId
    });
    await insertRows("transactions", rows);
    state.cardSeries = { ...state.cardSeries, [seriesId]: card.id };
    await saveMetadataKey(META_KEYS.cardSeries, state.cardSeries);
}

async function handleCreditPurchase(event, payload = null) {
    event?.preventDefault();
    event?.stopImmediatePropagation();
    const formPayload = payload || {
        description: elements.transactionDescription?.value.trim() || "",
        amount: Number(elements.transactionAmount?.value),
        category: elements.transactionCategory?.value || "",
        purchaseDate: elements.transactionDate?.value || todayKey(),
        count: Number(elements.creditInstallmentCount?.value || 1),
        cardId: document.querySelector("#v25PurchaseCard")?.value || state.selectedCardId
    };
    if (!formPayload.description || !Number.isFinite(formPayload.amount) || formPayload.amount <= 0 || !formPayload.category || !formPayload.cardId) {
        showToast("Revise descrição, valor, categoria e cartão.", "warning");
        return;
    }
    if (!navigator.onLine) {
        enqueueOperation(state.user?.id, { kind: "credit_purchase", payload: formPayload });
        elements.transactionDialog?.close();
        renderOffline();
        showToast("Compra guardada no aparelho. Ela será enviada quando a internet voltar.", "warning");
        return;
    }
    const button = elements.transactionForm?.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
        await executeCreditPurchase(formPayload);
        elements.transactionDialog?.close();
        showToast(formPayload.count > 1 ? `Compra registrada em ${formPayload.count} parcelas.` : "Compra adicionada à fatura.");
        window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
        showToast(error?.message || "Não foi possível registrar a compra.", "error");
        if (button) button.disabled = false;
    }
}

function queueOfflineTransaction(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const payload = transactionPayloadFromForm();
    if (!payload.description || !Number.isFinite(payload.amount) || payload.amount <= 0 || !payload.category || !payload.date) {
        showToast("Revise descrição, valor, categoria e data.", "warning");
        return;
    }
    enqueueOperation(state.user?.id, { kind: "transaction", payload });
    elements.transactionDialog?.close();
    renderOffline();
    showToast("Movimentação guardada no aparelho. Envio automático ao reconectar.", "warning");
}

function openInvoicePayment() {
    const card = activeCards().find((item) => item.id === state.selectedCardId);
    const rows = currentInvoiceRows();
    if (!card || !rows.length) return;
    const month = elements.invoiceMonthFilter?.value || monthKey();
    if (elements.invoicePaymentCard) elements.invoicePaymentCard.textContent = card.name;
    if (elements.invoicePaymentMonth) elements.invoicePaymentMonth.textContent = formatMonth(month);
    if (elements.invoicePaymentTotal) elements.invoicePaymentTotal.textContent = formatCurrency(sumRows(rows));
    if (elements.invoicePaymentSource) elements.invoicePaymentSource.value = "pix";
    elements.invoiceDialog?.showModal();
}

async function payInvoice(event) {
    event.preventDefault();
    const rows = currentInvoiceRows();
    const card = activeCards().find((item) => item.id === state.selectedCardId);
    if (!rows.length || !card) return;
    if (!navigator.onLine) {
        showToast("Conecte-se para confirmar o pagamento da fatura.", "warning");
        return;
    }
    const source = elements.invoicePaymentSource?.value === "cash" ? "cash" : "pix";
    const month = elements.invoiceMonthFilter?.value || monthKey();
    const total = sumRows(rows);
    const button = elements.invoiceForm?.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
        await updateTransactionRows(state.user.id, rows.map((row) => row.id), { status: "paid", payment_method: source });
        const payment = {
            id: crypto.randomUUID(),
            cardId: card.id,
            month,
            source,
            total,
            rowIds: rows.map((row) => row.id),
            paidAt: new Date().toISOString()
        };
        state.invoicePayments = [payment, ...state.invoicePayments].slice(0, 120);
        await saveMetadataKey(META_KEYS.invoicePayments, state.invoicePayments);
        elements.invoiceDialog?.close();
        showToast(`Fatura paga com ${source === "cash" ? "espécie" : "Pix"}.`);
        window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
        showToast(error?.message || "Não foi possível pagar a fatura.", "error");
        if (button) button.disabled = false;
    }
}

function openTransferDialog() {
    elements.transferForm?.reset();
    if (elements.transferSource) elements.transferSource.value = "pix";
    if (elements.transferDestination) elements.transferDestination.value = "cash";
    if (elements.transferDate) elements.transferDate.value = todayKey();
    elements.transferDialog?.showModal();
    window.setTimeout(() => elements.transferAmount?.focus(), 60);
}

async function executeTransfer(payload) {
    const rows = buildTransferRows({
        userId: state.user.id,
        amount: payload.amount,
        source: payload.source,
        destination: payload.destination,
        date: payload.date,
        note: payload.note,
        seriesId: payload.seriesId || crypto.randomUUID()
    });
    await insertRows("transactions", rows);
}

async function handleTransfer(event) {
    event.preventDefault();
    const payload = {
        amount: Number(elements.transferAmount?.value),
        source: elements.transferSource?.value,
        destination: elements.transferDestination?.value,
        date: elements.transferDate?.value,
        note: elements.transferNote?.value.trim() || ""
    };
    if (!Number.isFinite(payload.amount) || payload.amount <= 0 || !payload.date || payload.source === payload.destination) {
        showToast("Revise o valor e escolha origens diferentes.", "warning");
        return;
    }
    if (!navigator.onLine) {
        enqueueOperation(state.user?.id, { kind: "transfer", payload });
        elements.transferDialog?.close();
        renderOffline();
        showToast("Transferência guardada para sincronização.", "warning");
        return;
    }
    const button = elements.transferForm?.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
        await executeTransfer(payload);
        elements.transferDialog?.close();
        showToast("Transferência registrada sem alterar o saldo total.");
        window.setTimeout(() => window.location.reload(), 420);
    } catch (error) {
        showToast(error?.message || "Não foi possível registrar a transferência.", "error");
        if (button) button.disabled = false;
    }
}

function syncTransferDestination() {
    if (!elements.transferSource || !elements.transferDestination) return;
    elements.transferDestination.value = elements.transferSource.value === "pix" ? "cash" : "pix";
}

function allRules() {
    return [...state.rules, ...DEFAULT_RULES];
}

function applyCategorySuggestion() {
    const description = elements.transactionDescription?.value || "";
    const rule = suggestCategory(description, allRules());
    const hint = document.querySelector("#v25CategorySuggestion");
    if (!hint || !elements.transactionCategory) return;
    if (!rule) {
        hint.hidden = true;
        return;
    }
    const option = [...elements.transactionCategory.options].find((item) => item.value === rule.category);
    if (!option) {
        hint.hidden = true;
        return;
    }
    elements.transactionCategory.value = rule.category;
    hint.textContent = `SUGESTÃO APLICADA / ${rule.keyword.toUpperCase()} → ${rule.category.toUpperCase()}`;
    hint.hidden = false;
}

async function learnRuleFromForm() {
    if (!navigator.onLine || !state.user) return;
    const description = elements.transactionDescription?.value || "";
    const category = elements.transactionCategory?.value || "";
    const keyword = keywordCandidate(description);
    if (!keyword || !category || category === TRANSFER_CATEGORY) return;
    const existing = state.rules.find((rule) => normalizeKeyword(rule.keyword) === normalizeKeyword(keyword));
    if (existing?.category === category) return;
    const rule = { id: existing?.id || crypto.randomUUID(), keyword, category, updatedAt: new Date().toISOString() };
    state.rules = existing
        ? state.rules.map((item) => item.id === existing.id ? rule : item)
        : [rule, ...state.rules].slice(0, 80);
    try {
        await saveMetadataKey(META_KEYS.rules, state.rules);
        renderRules();
    } catch (error) {
        console.warn("A regra de categoria não pôde ser sincronizada:", error);
    }
}

async function addRule(event) {
    event.preventDefault();
    const keyword = normalizeKeyword(elements.ruleKeyword?.value);
    const category = elements.ruleCategory?.value;
    if (!keyword || keyword.length < 2 || !category) {
        showToast("Informe uma palavra e uma categoria.", "warning");
        return;
    }
    const existing = state.rules.find((rule) => normalizeKeyword(rule.keyword) === keyword);
    const rule = { id: existing?.id || crypto.randomUUID(), keyword, category, updatedAt: new Date().toISOString() };
    state.rules = existing
        ? state.rules.map((item) => item.id === existing.id ? rule : item)
        : [rule, ...state.rules].slice(0, 80);
    try {
        await saveMetadataKey(META_KEYS.rules, state.rules);
        elements.ruleForm?.reset();
        renderRules();
        showToast("Regra de categoria salva.");
    } catch (error) {
        showToast(error?.message || "Não foi possível salvar a regra.", "error");
    }
}

async function deleteRule(id) {
    state.rules = state.rules.filter((rule) => rule.id !== id);
    await saveMetadataKey(META_KEYS.rules, state.rules);
    renderRules();
    showToast("Regra removida.");
}

function renderRules() {
    if (!elements.ruleList) return;
    elements.ruleList.innerHTML = state.rules.length
        ? state.rules.map((rule, index) => `
            <div class="v25-rule-row">
                <span>${String(index + 1).padStart(2, "0")}</span>
                <strong>${escapeHTML(rule.keyword)}</strong>
                <i>→</i>
                <b>${escapeHTML(rule.category)}</b>
                <button type="button" data-v25-rule-delete="${escapeHTML(rule.id)}">REMOVER</button>
            </div>`).join("")
        : '<div class="v25-empty-line">O Fôlego já reconhece exemplos comuns. Suas regras pessoais aparecerão aqui.</div>';
}

async function trashTransaction(id) {
    if (!navigator.onLine) {
        showToast("Conecte-se para excluir e enviar à lixeira.", "warning");
        return;
    }
    let row = state.transactions.find((item) => item.id === id);
    if (!row) {
        const { data, error } = await supabase.from("transactions").select("*").eq("id", id).eq("user_id", state.user.id).maybeSingle();
        if (error) throw error;
        row = data;
    }
    if (!row || !window.confirm(`Mover “${row.description}” para a lixeira?`)) return;
    const entry = { id: crypto.randomUUID(), kind: "transaction", row, deletedAt: new Date().toISOString() };
    state.trash = [entry, ...state.trash].slice(0, 50);
    await saveMetadataKey(META_KEYS.trash, state.trash);
    try {
        await deleteTransactionRow(state.user.id, id);
    } catch (error) {
        state.trash = state.trash.filter((item) => item.id !== entry.id);
        await saveMetadataKey(META_KEYS.trash, state.trash);
        throw error;
    }
    state.transactions = state.transactions.filter((item) => item.id !== id);
    state.lastDeletedId = entry.id;
    document.querySelector(`[data-action="delete-transaction"][data-id="${CSS.escape(id)}"]`)?.closest("tr")?.remove();
    showUndo(entry);
    renderTrash();
    renderArchive();
}

function showUndo(entry) {
    if (!elements.undoBar) return;
    window.clearTimeout(state.undoTimer);
    if (elements.undoCopy) elements.undoCopy.textContent = `“${entry.row.description}” foi para a lixeira.`;
    elements.undoBar.hidden = false;
    elements.undoBar.classList.add("show");
    state.undoTimer = window.setTimeout(() => {
        elements.undoBar.classList.remove("show");
        window.setTimeout(() => { elements.undoBar.hidden = true; }, 220);
        window.location.reload();
    }, 9000);
}

async function restoreTrash(id) {
    const entry = state.trash.find((item) => item.id === id);
    if (!entry) return;
    await upsertRows("transactions", [entry.row], "id");
    state.trash = state.trash.filter((item) => item.id !== id);
    await saveMetadataKey(META_KEYS.trash, state.trash);
    state.lastDeletedId = null;
    elements.undoBar?.classList.remove("show");
    renderTrash();
    showToast("Movimentação restaurada.");
    window.setTimeout(() => window.location.reload(), 350);
}

async function forgetTrash(id) {
    state.trash = state.trash.filter((item) => item.id !== id);
    await saveMetadataKey(META_KEYS.trash, state.trash);
    renderTrash();
    showToast("Item removido definitivamente da lixeira.");
}

function renderTrash() {
    if (!elements.trashList) return;
    elements.trashList.innerHTML = state.trash.length
        ? state.trash.map((entry, index) => `
            <article class="v25-trash-row">
                <span>${String(index + 1).padStart(2, "0")}</span>
                <div><strong>${escapeHTML(entry.row.description)}</strong><small>${escapeHTML(entry.row.category)} • excluída em ${escapeHTML(formatDate(entry.deletedAt.slice(0, 10)))}</small></div>
                <b>${escapeHTML(formatCurrency(entry.row.amount))}</b>
                <button type="button" data-v25-trash-restore="${escapeHTML(entry.id)}">RESTAURAR</button>
                <button type="button" data-v25-trash-forget="${escapeHTML(entry.id)}">APAGAR</button>
            </article>`).join("")
        : '<div class="v25-empty-line">A lixeira está vazia. Movimentações excluídas ficam recuperáveis por 30 dias.</div>';
}

function renderRisk() {
    if (!elements.riskList) return;
    const risk = riskSnapshot({
        rows: state.transactions,
        budgets: state.budgets.map((budget) => ({ ...budget, month: String(budget.month_start || budget.month || "").slice(0, 7) })),
        cards: state.cards,
        seriesMap: state.cardSeries,
        today: todayKey()
    });
    const alerts = [];
    if (risk.negativeDate) {
        alerts.push({ level: "danger", code: "CAIXA", title: "Saldo negativo no caminho", copy: `Pelos registros atuais, o caixa cruza zero em ${formatDate(risk.negativeDate)}.` });
    } else {
        alerts.push({ level: "safe", code: "CAIXA", title: "Rota sem negativo previsto", copy: `O saldo projetado termina em ${formatCurrency(risk.projectedBalance)} dentro da agenda cadastrada.` });
    }
    risk.cardAlerts.slice(0, 2).forEach((card) => alerts.push({
        level: card.ratio > 1 ? "danger" : "warning",
        code: "CRÉDITO",
        title: `${card.name} em ${integer.format(card.ratio * 100)}%`,
        copy: `${formatCurrency(card.pending)} comprometidos de um limite de ${formatCurrency(card.limit)}.`
    }));
    risk.budgetAlerts.slice(0, 2).forEach((budget) => alerts.push({
        level: budget.ratio > 1 ? "danger" : "warning",
        code: "ORÇAMENTO",
        title: `${budget.category} em ${integer.format(budget.ratio * 100)}%`,
        copy: `Previsão de ${formatCurrency(budget.projected)} para uma margem de ${formatCurrency(budget.amount)}.`
    }));
    if (risk.commitmentRatio >= 0.8) {
        alerts.push({
            level: risk.commitmentRatio > 1 ? "danger" : "warning",
            code: "PRÓXIMO MÊS",
            title: risk.nextIncome > 0 ? `${integer.format(risk.commitmentRatio * 100)}% da renda comprometida` : "Despesas sem renda prevista",
            copy: `${formatCurrency(risk.nextExpense)} de saídas para ${formatCurrency(risk.nextIncome)} de entradas cadastradas.`
        });
    }
    elements.riskList.innerHTML = alerts.slice(0, 6).map((alert, index) => `
        <article class="v25-risk-item ${alert.level}">
            <span>${String(index + 1).padStart(2, "0")}</span>
            <div><small>${escapeHTML(alert.code)}</small><strong>${escapeHTML(alert.title)}</strong><p>${escapeHTML(alert.copy)}</p></div>
        </article>`).join("");
}

function renderComparison() {
    if (!elements.compareMonth) return;
    const month = elements.compareMonth.value || monthKey();
    elements.compareMonth.value = month;
    const comparison = compareMonths(state.transactions, month);
    const previousLabel = formatMonth(comparison.previous.month);
    if (elements.compareCurrent) elements.compareCurrent.textContent = formatCurrency(comparison.current.result);
    if (elements.comparePrevious) elements.comparePrevious.textContent = formatCurrency(comparison.previous.result);
    if (elements.compareDelta) {
        const delta = comparison.current.result - comparison.previous.result;
        elements.compareDelta.textContent = `${delta >= 0 ? "+" : "−"} ${formatCurrency(Math.abs(delta))}`;
        elements.compareDelta.classList.toggle("negative", delta < 0);
        elements.compareDelta.closest("article")?.querySelector("small")?.replaceChildren(document.createTextNode(`contra ${previousLabel}`));
    }
    if (elements.compareCategory) {
        elements.compareCategory.innerHTML = comparison.biggestIncrease
            ? `<span>MAIOR ALTA</span><strong>${escapeHTML(comparison.biggestIncrease.category)}</strong><small>+ ${escapeHTML(formatCurrency(comparison.biggestIncrease.delta))} frente ao mês anterior</small>`
            : '<span>MAIOR ALTA</span><strong>Sem pressão nova</strong><small>nenhuma categoria aumentou neste recorte</small>';
    }
}

function availableYears() {
    const years = state.transactions.map((row) => Number(String(row.occurred_on || "").slice(0, 4))).filter(Number.isFinite);
    const current = new Date().getFullYear();
    const min = years.length ? Math.min(...years, current) : current;
    const max = years.length ? Math.max(...years, current) : current;
    return Array.from({ length: max - min + 1 }, (_, index) => max - index);
}

function renderAnnual() {
    if (!elements.annualYear) return;
    const years = availableYears();
    const currentValue = Number(elements.annualYear.value) || new Date().getFullYear();
    elements.annualYear.innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join("");
    elements.annualYear.value = years.includes(currentValue) ? String(currentValue) : String(years[0]);
    const report = annualSummary(state.transactions, Number(elements.annualYear.value));
    if (elements.annualIncome) elements.annualIncome.textContent = formatCurrency(report.income);
    if (elements.annualExpense) elements.annualExpense.textContent = formatCurrency(report.expense);
    if (elements.annualResult) {
        elements.annualResult.textContent = formatCurrency(report.result);
        elements.annualResult.classList.toggle("negative", report.result < 0);
    }
    if (elements.annualAverage) elements.annualAverage.textContent = formatCurrency(report.averageExpense);
    if (elements.annualHighlights) {
        elements.annualHighlights.innerHTML = `
            <div><span>MELHOR MÊS</span><strong>${report.bestMonth ? formatMonth(report.bestMonth.month) : "—"}</strong><small>${report.bestMonth ? formatCurrency(report.bestMonth.result) : "sem registros"}</small></div>
            <div><span>MÊS MAIS APERTADO</span><strong>${report.worstMonth ? formatMonth(report.worstMonth.month) : "—"}</strong><small>${report.worstMonth ? formatCurrency(report.worstMonth.result) : "sem registros"}</small></div>
            <div><span>MAIOR PESO</span><strong>${escapeHTML(report.categories[0]?.category || "—")}</strong><small>${report.categories[0] ? formatCurrency(report.categories[0].amount) : "sem despesas"}</small></div>`;
    }
    if (elements.annualMonths) {
        const max = Math.max(1, ...report.months.map((item) => Math.max(item.income, item.expense)));
        elements.annualMonths.innerHTML = report.months.map((item) => `
            <div class="v25-annual-month">
                <span>${escapeHTML(formatShortMonth(item.month))}</span>
                <div class="v25-annual-bars"><i style="width:${(item.income / max) * 100}%"></i><b style="width:${(item.expense / max) * 100}%"></b></div>
                <strong class="${item.result < 0 ? "negative" : ""}">${escapeHTML(formatCurrency(item.result))}</strong>
            </div>`).join("");
    }
    if (elements.annualCategories) {
        const top = report.categories.slice(0, 8);
        const max = Math.max(1, ...top.map((item) => item.amount));
        elements.annualCategories.innerHTML = top.length
            ? top.map((item, index) => `<div><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHTML(item.category)}</strong><i><b style="width:${(item.amount / max) * 100}%"></b></i><em>${escapeHTML(formatCurrency(item.amount))}</em></div>`).join("")
            : '<div class="v25-empty-line">Nenhuma despesa confirmada neste ano.</div>';
    }
}

function renderOffline() {
    const queue = readQueue(state.user?.id);
    if (elements.offlineCount) elements.offlineCount.textContent = `${queue.length} ${queue.length === 1 ? "ITEM" : "ITENS"}`;
    if (elements.offlineList) {
        elements.offlineList.innerHTML = queue.length
            ? queue.map((item, index) => `
                <div class="v25-offline-row">
                    <span>${String(index + 1).padStart(2, "0")}</span>
                    <div><strong>${item.kind === "credit_purchase" ? "Compra no crédito" : item.kind === "transfer" ? "Transferência" : "Movimentação"}</strong><small>${escapeHTML(item.payload?.description || item.payload?.note || "aguardando conexão")}</small></div>
                    <b>AGUARDANDO ENVIO</b>
                </div>`).join("")
            : '<div class="v25-empty-line">Nenhum registro aguardando sincronização.</div>';
    }
    if (elements.offlineSyncButton) elements.offlineSyncButton.disabled = !navigator.onLine || !queue.length || state.syncing;
    updateConnectionState();
}

function updateConnectionState() {
    const queue = readQueue(state.user?.id);
    const label = navigator.onLine
        ? queue.length ? `ONLINE / ${queue.length} AGUARDANDO` : "ONLINE / SINCRONIZADO"
        : queue.length ? `OFFLINE / ${queue.length} NA FILA` : "OFFLINE / PRONTO PARA ANOTAR";
    if (elements.connectionBadge) {
        elements.connectionBadge.textContent = label;
        elements.connectionBadge.dataset.online = String(navigator.onLine);
    }
    const global = document.querySelector("#v25GlobalConnection");
    if (global) {
        global.textContent = label;
        global.dataset.online = String(navigator.onLine);
    }
}

async function syncOfflineQueue() {
    if (!navigator.onLine || !state.user || state.syncing) return;
    const queue = readQueue(state.user.id);
    if (!queue.length) return;
    state.syncing = true;
    renderOffline();
    let synced = 0;
    try {
        for (const item of queue) {
            if (item.kind === "transaction") await executeBasicTransaction(item.payload);
            if (item.kind === "credit_purchase") await executeCreditPurchase(item.payload);
            if (item.kind === "transfer") await executeTransfer(item.payload);
            removeQueuedOperation(state.user.id, item.id);
            synced += 1;
        }
        showToast(`${synced} ${synced === 1 ? "registro sincronizado" : "registros sincronizados"}.`);
        window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
        showToast(`A fila parou após ${synced} envio(s). ${error?.message || "Tente novamente."}`, "error");
    } finally {
        state.syncing = false;
        renderOffline();
    }
}

function renderArchive() {
    if (!elements.archiveView) return;
    renderRisk();
    renderComparison();
    renderAnnual();
    renderRules();
    renderOffline();
}

function showArchive(updateHistory = true) {
    document.querySelectorAll("[data-view-section]").forEach((section) => section.classList.toggle("active", section.dataset.viewSection === "archive"));
    document.querySelectorAll(".rail-link[data-view]").forEach((button) => {
        const active = button.dataset.view === "archive";
        button.classList.toggle("active", active);
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
    });
    if (elements.pageTitle) elements.pageTitle.textContent = "Arquivo e inteligência";
    if (updateHistory) history.replaceState(null, "", "#archive");
    window.scrollTo({ top: 0, behavior: "smooth" });
    renderArchive();
}

function printAnnualReport() {
    document.body.classList.add("v25-print-annual");
    window.print();
    window.setTimeout(() => document.body.classList.remove("v25-print-annual"), 500);
}

function handleCaptureClick(event) {
    const archiveButton = event.target.closest('[data-view="archive"]');
    if (archiveButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showArchive();
        return;
    }
    if (event.target.closest("#newCreditCardButton, [data-v25-card-create]")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openCardDialog();
        return;
    }
    const selectCard = event.target.closest("[data-v25-card-select]");
    if (selectCard) {
        event.preventDefault();
        event.stopImmediatePropagation();
        state.selectedCardId = selectCard.dataset.v25CardSelect;
        populateCardSelectors();
        renderCards();
        return;
    }
    const editCard = event.target.closest("[data-v25-card-edit]");
    if (editCard) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openCardDialog(editCard.dataset.v25CardEdit);
        return;
    }
    const archiveCardButton = event.target.closest("[data-v25-card-archive]");
    if (archiveCardButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        archiveCard(archiveCardButton.dataset.v25CardArchive).catch((error) => showToast(error.message, "error"));
        return;
    }
    if (event.target.closest("#payInvoiceButton")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openInvoicePayment();
        return;
    }
    const history = event.target.closest("[data-v25-card-history-month]");
    if (history) {
        event.preventDefault();
        event.stopImmediatePropagation();
        state.selectedCardId = history.dataset.v25CardHistoryCard;
        if (elements.invoiceMonthFilter) elements.invoiceMonthFilter.value = history.dataset.v25CardHistoryMonth;
        renderCards();
        elements.cardsView?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
    }
    const deleteTransaction = event.target.closest('[data-action="delete-transaction"]');
    if (deleteTransaction) {
        event.preventDefault();
        event.stopImmediatePropagation();
        trashTransaction(deleteTransaction.dataset.id).catch((error) => showToast(error.message || "Não foi possível excluir.", "error"));
        return;
    }
    if (event.target.closest("#v25TransferButton")) {
        openTransferDialog();
        return;
    }
    if (event.target.closest("#v25TrashButton")) {
        renderTrash();
        elements.trashDialog?.showModal();
        return;
    }
    if (event.target.closest("[data-v25-undo]")) {
        if (state.lastDeletedId) restoreTrash(state.lastDeletedId).catch((error) => showToast(error.message, "error"));
        return;
    }
    const restore = event.target.closest("[data-v25-trash-restore]");
    if (restore) {
        restoreTrash(restore.dataset.v25TrashRestore).catch((error) => showToast(error.message, "error"));
        return;
    }
    const forget = event.target.closest("[data-v25-trash-forget]");
    if (forget) {
        forgetTrash(forget.dataset.v25TrashForget).catch((error) => showToast(error.message, "error"));
        return;
    }
    const deleteRuleButton = event.target.closest("[data-v25-rule-delete]");
    if (deleteRuleButton) {
        deleteRule(deleteRuleButton.dataset.v25RuleDelete).catch((error) => showToast(error.message, "error"));
        return;
    }
    if (event.target.closest("#v25OfflineSyncButton")) {
        syncOfflineQueue();
        return;
    }
    if (event.target.closest("#v25AnnualPrint")) {
        printAnnualReport();
    }
}

function handleCaptureSubmit(event) {
    if (event.target === elements.creditCardForm) {
        handleCardSubmit(event);
        return;
    }
    if (event.target === elements.invoiceForm) {
        event.stopImmediatePropagation();
        payInvoice(event);
        return;
    }
    if (event.target === elements.transferForm) {
        event.stopImmediatePropagation();
        handleTransfer(event);
        return;
    }
    if (event.target === elements.ruleForm) {
        addRule(event);
        return;
    }
    if (event.target !== elements.transactionForm) return;
    learnRuleFromForm();
    const type = elements.transactionForm.querySelector('input[name="transactionType"]:checked')?.value;
    const method = elements.transactionPaymentMethod?.value;
    const editing = Boolean(elements.transactionId?.value);
    if (type === "expense" && method === "credit_card" && !editing) {
        handleCreditPurchase(event);
        return;
    }
    if (!navigator.onLine) queueOfflineTransaction(event);
}

function handleCaptureChange(event) {
    if (event.target === elements.invoiceMonthFilter) {
        event.stopImmediatePropagation();
        renderCards();
        return;
    }
    if (event.target?.id === "v25InvoiceCardSelect") {
        state.selectedCardId = event.target.value;
        renderCards();
        return;
    }
    if (event.target === elements.transferSource) {
        syncTransferDestination();
        return;
    }
    if (event.target === elements.compareMonth) {
        renderComparison();
        return;
    }
    if (event.target === elements.annualYear) {
        renderAnnual();
        return;
    }
    if (event.target === elements.transactionPaymentMethod || event.target?.name === "transactionType") {
        window.setTimeout(() => { ensureDynamicFields(); populateCardSelectors(); }, 0);
    }
}

function bindEvents() {
    document.addEventListener("click", handleCaptureClick, true);
    document.addEventListener("submit", handleCaptureSubmit, true);
    document.addEventListener("change", handleCaptureChange, true);
    elements.transactionDescription?.addEventListener("input", applyCategorySuggestion);
    window.addEventListener("folego:offline-queue-changed", renderOffline);
    window.addEventListener("folego:data-changed", () => loadSuite({ force: true }));
    window.addEventListener("online", () => {
        updateConnectionState();
        syncOfflineQueue();
    });
    window.addEventListener("offline", () => {
        updateConnectionState();
        renderOffline();
    });
    window.addEventListener("focus", () => window.setTimeout(() => loadSuite({ force: true }), 120));
    supabase?.auth.onAuthStateChange((_event, session) => {
        if (session?.user) window.setTimeout(() => loadSuite({ force: true }), 180);
    });
}

function revealInitialView() {
    if (elements.appShell?.hidden) return false;
    if (requestedArchiveView || window.location.hash === "#archive") showArchive(false);
    return true;
}

async function boot() {
    bindEvents();
    ensureDynamicFields();
    updateConnectionState();
    await loadSuite();
    if (!revealInitialView() && elements.appShell) {
        const observer = new MutationObserver(() => {
            if (revealInitialView()) observer.disconnect();
        });
        observer.observe(elements.appShell, { attributes: true, attributeFilter: ["hidden"] });
    }
}

boot();
