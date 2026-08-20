import { supabase } from "./supabase-client.js";
import {
    ACCOUNT_ASSIGNMENTS_META_KEY,
    ACCOUNT_METHOD_VALUES,
    ACCOUNT_SNAPSHOT_META_KEY,
    accountForMethod,
    accountNameForMethod,
    calculateAccountBalances,
    normalizeAccountAssignments,
    normalizeAccountSnapshot
} from "./folego-accounts-v28.js";
import {
    removeInternalTransferPair,
    saveInternalTransferPair
} from "./folego-transfer-data-v27.js";
import { getTransferPair } from "./folego-transfer-v27.js";
import {
    SAVINGS_BOXES_META_KEY,
    SAVINGS_MOVEMENT_KINDS,
    applySavingsAccountAdjustments,
    archiveSavingsBox,
    assignSavingsMovement,
    buildSavingsBox,
    buildSavingsTransfer,
    calculateSavingsBoxes,
    calculateSavingsFinancialState,
    inferSavingsMovementForPair,
    normalizeSavingsBoxesMetadata,
    pruneSavingsMovementAssignments,
    savingsBoxForId,
    upsertSavingsBox,
    validateSavingsMovement
} from "./folego-caixinhas-v289.js";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const $ = (selector) => document.querySelector(selector);

const ICON_LABELS = Object.freeze({
    shield: "Proteção",
    plane: "Viagem",
    home: "Casa",
    person: "Pessoa",
    target: "Objetivo",
    bag: "Compra",
    heart: "Cuidado",
    spark: "Outro"
});

const ICON_DRAWINGS = Object.freeze({
    shield: '<path d="M12 2 20 5v6c0 5-3.4 9.1-8 11-4.6-1.9-8-6-8-11V5Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
    plane: '<path d="m22 2-8.5 20-2.4-8.6L2 10Z"/><path d="M11.1 13.4 22 2"/>',
    home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10M9 21v-7h6v7"/>',
    person: '<circle cx="12" cy="7" r="4"/><path d="M4 22c.7-5.3 3.4-8 8-8s7.3 2.7 8 8"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    bag: '<path d="M5 8h14l1 13H4Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
    heart: '<path d="M20.8 5.8a5.2 5.2 0 0 0-7.4 0L12 7.2l-1.4-1.4a5.2 5.2 0 0 0-7.4 7.4L12 22l8.8-8.8a5.2 5.2 0 0 0 0-7.4Z"/>',
    spark: '<path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8ZM19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7Z"/>'
});

const state = {
    user: null,
    transactions: [],
    assignments: {},
    snapshot: null,
    metadata: normalizeSavingsBoxesMetadata(null),
    selectedAccount: null,
    editingSeriesId: null,
    loading: false,
    saving: false,
    toastTimer: null,
    renderTimer: null
};

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function iconSVG(name, className = "savings-icon-v289") {
    return '<svg class="' + className + '" viewBox="0 0 24 24" aria-hidden="true">'
        + (ICON_DRAWINGS[name] || ICON_DRAWINGS.target)
        + "</svg>";
}

function todayKey() {
    const date = new Date();
    return date.getFullYear() + "-"
        + String(date.getMonth() + 1).padStart(2, "0") + "-"
        + String(date.getDate()).padStart(2, "0");
}

function toTransaction(row) {
    return {
        id: row.id,
        description: row.description,
        amount: Number(row.amount),
        type: row.type,
        category: row.category,
        date: row.date ?? row.occurred_on,
        status: row.status,
        paymentMethod: row.paymentMethod ?? row.payment_method,
        seriesId: row.seriesId ?? row.series_id,
        seriesKind: row.seriesKind ?? row.series_kind,
        installmentNumber: row.installmentNumber ?? row.installment_number,
        installmentTotal: row.installmentTotal ?? row.installment_total,
        createdAt: row.createdAt ?? row.created_at
    };
}

function syncUser(user) {
    state.user = user || null;
    state.assignments = normalizeAccountAssignments(user?.user_metadata?.[ACCOUNT_ASSIGNMENTS_META_KEY]);
    state.snapshot = normalizeAccountSnapshot(user?.user_metadata?.[ACCOUNT_SNAPSHOT_META_KEY]);
    state.metadata = normalizeSavingsBoxesMetadata(user?.user_metadata?.[SAVINGS_BOXES_META_KEY]);
}

function baseAccounts(transactions = state.transactions, throughDate = todayKey()) {
    return calculateAccountBalances(
        transactions,
        throughDate,
        state.assignments,
        state.snapshot
    );
}

function financialState(transactions = state.transactions, metadata = state.metadata, throughDate = todayKey()) {
    return calculateSavingsFinancialState(
        baseAccounts(transactions, throughDate),
        transactions,
        metadata,
        throughDate
    );
}

function showToast(message, type = "success") {
    const toast = $("#toast");
    const copy = $("#toastMessage");
    if (!toast || !copy) return;
    window.clearTimeout(state.toastTimer);
    copy.textContent = message;
    toast.dataset.type = type;
    const icon = toast.querySelector(".toast-icon");
    if (icon) icon.textContent = type === "warning" ? "!" : type === "error" ? "×" : "✓";
    toast.classList.add("show");
    state.toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3600);
}

function setSyncState(kind, label) {
    const status = $("#syncStatus");
    const accountButton = $("#accountButton");
    if (status) {
        status.textContent = label || (
            kind === "busy" ? "Salvando..."
                : kind === "error" ? "Falha ao sincronizar"
                    : "Sincronizado"
        );
    }
    if (accountButton) accountButton.dataset.sync = kind;
}

function bankLogo(method, className = "savings-bank-logo-v289") {
    const account = accountForMethod(method);
    if (account.logo) {
        return '<span class="' + className + '"><img src="' + escapeHTML(account.logo) + '" alt=""></span>';
    }
    return '<span class="' + className + ' cash" aria-hidden="true">R$</span>';
}

function ensureNavigation() {
    if ($('.rail-link[data-view="accounts"]')) return;
    const reports = $('.rail-link[data-view="reports"]');
    if (!reports) return;
    const button = document.createElement("button");
    button.className = "rail-link";
    button.type = "button";
    button.dataset.view = "accounts";
    button.innerHTML = "<span>04</span><strong>Contas</strong>";
    reports.insertAdjacentElement("beforebegin", button);
}

function ensureView() {
    let view = $("#accountsBoxesViewV289");
    if (view) return view;
    const main = $(".main-content");
    if (!main) return null;

    view = document.createElement("section");
    view.className = "view accounts-boxes-view-v289";
    view.id = "accountsBoxesViewV289";
    view.dataset.viewSection = "accounts";
    view.innerHTML = [
        '<div class="view-index" aria-hidden="true"><span>04</span><i></i><b>CONTAS</b></div>',
        '<header class="savings-page-head-v289">',
        '  <div><span>DINHEIRO ORGANIZADO / SEM DUPLICAR SALDO</span><h2>Contas e caixinhas</h2><p>Separe objetivos dentro de cada conta sem transformar guardar em despesa.</p></div>',
        '  <button class="savings-new-box-v289" type="button" data-savings-new-box><span>+</span> Nova caixinha</button>',
        "</header>",
        '<section class="savings-summary-v289" aria-label="Resumo das caixinhas">',
        '  <article class="free"><span>SALDO LIVRE</span><strong id="savingsFreeV289">R$ 0,00</strong><small>Disponível para usar</small></article>',
        '  <article class="protected"><span>EM CAIXINHAS</span><strong id="savingsProtectedV289">R$ 0,00</strong><small>Separado por objetivo</small></article>',
        '  <article class="total"><span>PATRIMÔNIO</span><strong id="savingsPatrimonyV289">R$ 0,00</strong><small>Seu dinheiro por inteiro</small></article>',
        "</section>",
        '<section class="savings-ledger-v289">',
        '  <div class="savings-accounts-column-v289">',
        '    <header><div><span>MINHAS CONTAS</span><small>Selecione uma conta para ver as caixinhas</small></div></header>',
        '    <div class="savings-account-table-head-v289" aria-hidden="true"><span>CONTA</span><span>LIVRE</span><span>CAIXINHAS</span><span>TOTAL</span></div>',
        '    <div class="savings-account-list-v289" id="savingsAccountListV289"></div>',
        "  </div>",
        '  <div class="savings-boxes-column-v289">',
        '    <header class="savings-boxes-head-v289" id="savingsBoxesHeadV289"></header>',
        '    <div class="savings-box-list-v289" id="savingsBoxListV289"></div>',
        '    <button class="savings-inline-new-v289" type="button" data-savings-new-box><span>+</span> Nova caixinha nesta conta</button>',
        '    <div class="savings-rules-v289"><p><i>i</i> O dinheiro continua na conta real escolhida.</p><p><i>i</i> Guardar, resgatar e mover não alteram Entrou ou Saiu.</p></div>',
        "  </div>",
        "</section>"
    ].join("");

    const reports = $("#reportsView");
    if (reports) reports.insertAdjacentElement("beforebegin", view);
    else main.appendChild(view);
    return view;
}

function ensureHomeSummary() {
    let panel = $("#homeSavingsSummaryV289");
    if (panel) return panel;
    const accounts = $("#accountsOverviewV28");
    if (!accounts) return null;
    panel = document.createElement("section");
    panel.id = "homeSavingsSummaryV289";
    panel.className = "home-savings-summary-v289";
    panel.innerHTML = [
        '<header><div><span>CAIXINHAS / PROTEGIDO</span><h3>Dinheiro com destino</h3></div><button type="button" data-open-savings-view>ABRIR CONTAS <span>→</span></button></header>',
        '<div class="home-savings-body-v289">',
        '  <strong id="homeSavingsTotalV289">R$ 0,00</strong>',
        '  <div id="homeSavingsAccountsV289"></div>',
        "</div>"
    ].join("");
    accounts.insertAdjacentElement("afterend", panel);
    return panel;
}

function selectInitialAccount(savings) {
    if (ACCOUNT_METHOD_VALUES.includes(state.selectedAccount)) return;
    state.selectedAccount = [...ACCOUNT_METHOD_VALUES]
        .sort((left, right) => savings.byAccount[right].total - savings.byAccount[left].total)[0]
        || ACCOUNT_METHOD_VALUES[0];
}

function progressForBox(box) {
    if (!box.target) return { percent: null, label: "Sem meta definida" };
    const percent = Math.max(0, Math.min(100, Math.round((box.balance / box.target) * 100)));
    return { percent, label: "Meta " + currency.format(box.target) + " · " + percent + "%" };
}

function renderAccountList(financial) {
    const target = $("#savingsAccountListV289");
    if (!target) return;
    target.innerHTML = ACCOUNT_METHOD_VALUES.map((method) => {
        const account = accountForMethod(method);
        const free = financial.balances[method] || 0;
        const protectedAmount = financial.savings.byAccount[method].total;
        const total = free + protectedAmount;
        const active = state.selectedAccount === method;
        return [
            '<button class="savings-account-row-v289' + (active ? " active" : "") + '" type="button" data-savings-account="' + escapeHTML(method) + '" aria-pressed="' + String(active) + '">',
            '  <span class="savings-account-name-v289">' + bankLogo(method) + '<span><strong>' + escapeHTML(account.name) + '</strong><small>' + escapeHTML(account.subtitle) + "</small></span></span>",
            '  <strong class="savings-account-free-v289">' + escapeHTML(currency.format(free)) + "</strong>",
            '  <strong class="savings-account-protected-v289">' + escapeHTML(currency.format(protectedAmount)) + "</strong>",
            '  <strong class="savings-account-total-v289">' + escapeHTML(currency.format(total)) + "</strong>",
            '  <span class="savings-row-arrow-v289" aria-hidden="true">›</span>',
            "</button>"
        ].join("");
    }).join("");
}

function renderBoxList(financial) {
    const method = state.selectedAccount;
    const account = accountForMethod(method);
    const accountState = financial.savings.byAccount[method];
    const free = financial.balances[method] || 0;
    const boxes = accountState.boxes.filter((box) => !box.archived || box.balance !== 0);
    const activeBoxes = accountState.boxes.filter((box) => !box.archived);
    const head = $("#savingsBoxesHeadV289");
    const list = $("#savingsBoxListV289");
    if (!head || !list) return;

    head.innerHTML = [
        "<div>",
        '  <span>' + escapeHTML(account.name.toUpperCase()) + " / CAIXINHAS</span>",
        "  <strong>" + boxes.length + (boxes.length === 1 ? " caixinha" : " caixinhas") + "</strong>",
        "</div>",
        '<div class="savings-account-balance-v289"><span>LIVRE NESTA CONTA</span><strong>' + escapeHTML(currency.format(free)) + "</strong></div>"
    ].join("");

    if (!boxes.length) {
        list.innerHTML = [
            '<div class="savings-empty-v289">',
            '  <span aria-hidden="true">◇</span>',
            "  <h3>Esta conta ainda não tem caixinha.</h3>",
            "  <p>Crie uma categoria para reserva, viagem, casa, dívida ou qualquer outro objetivo.</p>",
            '  <button type="button" data-savings-new-box>CRIAR A PRIMEIRA →</button>',
            "</div>"
        ].join("");
        return;
    }

    list.innerHTML = boxes.map((box) => {
        const progress = progressForBox(box);
        const canMove = box.balance > 0 && activeBoxes.filter((item) => item.id !== box.id).length > 0;
        const deadline = box.deadline
            ? "Prazo " + shortDate.format(new Date(box.deadline + "T12:00:00")).replace(".", "")
            : "";
        return [
            '<article class="savings-box-card-v289" data-box-color="' + escapeHTML(box.color) + '" data-box-id="' + escapeHTML(box.id) + '">',
            '  <div class="savings-box-icon-v289">' + iconSVG(box.icon) + "</div>",
            '  <div class="savings-box-copy-v289">',
            "    <span>" + (box.legacy ? "RESERVA TRAZIDA DA VERSÃO ANTERIOR" : "OBJETIVO / " + escapeHTML(account.name.toUpperCase())) + "</span>",
            "    <h3>" + escapeHTML(box.name) + "</h3>",
            "    <strong>" + escapeHTML(currency.format(box.balance)) + "</strong>",
            '    <div class="savings-box-progress-copy-v289"><small>' + escapeHTML(progress.label) + "</small><small>" + escapeHTML(deadline) + "</small></div>",
            '    <div class="savings-box-track-v289"><i style="--box-progress:' + (progress.percent ?? (box.balance > 0 ? 100 : 0)) + '%"></i></div>',
            "  </div>",
            '  <div class="savings-box-actions-v289">',
            '    <button type="button" data-savings-action="save" data-box-id="' + escapeHTML(box.id) + '"' + (free <= 0 || box.archived ? " disabled" : "") + "><span>↓</span> Guardar <i>›</i></button>",
            '    <button type="button" data-savings-action="redeem" data-box-id="' + escapeHTML(box.id) + '"' + (box.balance <= 0 ? " disabled" : "") + "><span>↑</span> Resgatar <i>›</i></button>",
            '    <button type="button" data-savings-action="move" data-box-id="' + escapeHTML(box.id) + '"' + (!canMove ? " disabled" : "") + "><span>↔</span> Mover <i>›</i></button>",
            box.legacy ? "" : '    <button class="edit" type="button" data-savings-edit-box="' + escapeHTML(box.id) + '"><span>···</span> Editar <i>›</i></button>',
            "  </div>",
            "</article>"
        ].join("");
    }).join("");
}

function renderView(financial) {
    const view = ensureView();
    if (!view) return;
    selectInitialAccount(financial.savings);
    $("#savingsFreeV289").textContent = currency.format(financial.available);
    $("#savingsProtectedV289").textContent = currency.format(financial.reserve);
    $("#savingsPatrimonyV289").textContent = currency.format(financial.total);
    renderAccountList(financial);
    renderBoxList(financial);
}

function decorateAccountOverview(financial) {
    const overview = $("#accountsOverviewV28");
    if (!overview) return;
    const cards = [...overview.querySelectorAll(".account-card-v28[data-account-method]")];
    for (const card of cards) {
        const method = card.dataset.accountMethod;
        const value = card.querySelector(".account-value-v28");
        if (value) value.textContent = currency.format(financial.balances[method] || 0);
        let saved = card.querySelector(".account-box-total-v289");
        if (!saved) {
            saved = document.createElement("span");
            saved.className = "account-box-total-v289";
            card.appendChild(saved);
        }
        const protectedAmount = financial.savings.byAccount[method]?.total || 0;
        saved.textContent = protectedAmount > 0 ? currency.format(protectedAmount) + " em caixinhas" : "Sem caixinha";
    }

    const total = $("#accountsTotalV28");
    if (total) total.textContent = currency.format(financial.available);
    const hero = $("#currentBalance");
    if (hero) {
        hero.textContent = currency.format(financial.available);
        hero.classList.toggle("long-value", hero.textContent.length > 17);
    }

    let detail = overview.querySelector(".accounts-protected-total-v289");
    if (!detail) {
        detail = document.createElement("span");
        detail.className = "accounts-protected-total-v289";
        overview.querySelector(".accounts-total-v28")?.appendChild(detail);
    }
    if (detail) detail.textContent = currency.format(financial.reserve) + " guardados · " + currency.format(financial.total) + " de patrimônio";
}

function renderHomeSummary(financial) {
    const panel = ensureHomeSummary();
    if (!panel) return;
    $("#homeSavingsTotalV289").textContent = currency.format(financial.reserve);
    const target = $("#homeSavingsAccountsV289");
    const used = ACCOUNT_METHOD_VALUES
        .map((method) => ({
            method,
            total: financial.savings.byAccount[method].total,
            count: financial.savings.byAccount[method].boxes.length
        }))
        .filter((item) => item.total !== 0)
        .sort((left, right) => right.total - left.total);
    target.innerHTML = used.length
        ? used.map((item) => [
            '<button type="button" data-open-savings-account="' + escapeHTML(item.method) + '">',
            bankLogo(item.method, "home-savings-bank-logo-v289"),
            "<span><strong>" + escapeHTML(accountNameForMethod(item.method)) + "</strong><small>" + item.count + (item.count === 1 ? " caixinha" : " caixinhas") + "</small></span>",
            "<b>" + escapeHTML(currency.format(item.total)) + "</b><i>›</i>",
            "</button>"
        ].join("")).join("")
        : '<p class="home-savings-empty-v289">Crie uma caixinha para separar dinheiro sem perder a visão do total.</p>';
}

function decorateReportAccounts() {
    const target = $("#reportAccountsV28");
    if (!target) return;
    const throughDate = $("#reportReferenceDate")?.value || todayKey();
    const adjusted = applySavingsAccountAdjustments(
        baseAccounts(state.transactions, throughDate),
        state.transactions,
        state.metadata,
        throughDate
    );
    [...target.querySelectorAll(".report-pocket")].forEach((card, index) => {
        const method = ACCOUNT_METHOD_VALUES[index];
        const value = card.querySelector("strong");
        if (method && value) value.textContent = currency.format(adjusted.balances[method] || 0);
    });
}

function renderAll() {
    if (!state.user) return;
    window.dispatchEvent(new CustomEvent("folego:savings-render-start"));
    try {
        const financial = financialState();
        renderView(financial);
        decorateAccountOverview(financial);
        renderHomeSummary(financial);
        decorateReportAccounts();
    } finally {
        window.dispatchEvent(new CustomEvent("folego:savings-render-end"));
    }
}

function scheduleRender(delay = 0) {
    window.clearTimeout(state.renderTimer);
    state.renderTimer = window.setTimeout(renderAll, delay);
}

function ensureBoxDialog() {
    let dialog = $("#savingsBoxDialogV289");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "savingsBoxDialogV289";
    dialog.className = "modal savings-dialog-v289";
    dialog.innerHTML = [
        '<form class="modal-sheet savings-sheet-v289" id="savingsBoxFormV289">',
        '  <div class="modal-header"><div><span>CAIXINHA / CATEGORIA</span><h2 id="savingsBoxDialogTitleV289">Nova caixinha</h2></div><button class="modal-close" type="button" data-savings-close aria-label="Fechar">×</button></div>',
        '  <input type="hidden" id="savingsBoxIdV289">',
        '  <div class="form-grid">',
        '    <label class="form-field"><span>EM QUAL CONTA</span><select id="savingsBoxAccountV289" required></select></label>',
        '    <label class="form-field"><span>CATEGORIA</span><select id="savingsBoxIconV289" required></select></label>',
        '    <label class="form-field form-field-wide"><span>NOME DA CAIXINHA</span><input type="text" id="savingsBoxNameV289" maxlength="48" placeholder="Ex.: Reserva emergencial" required></label>',
        '    <label class="form-field"><span>META / OPCIONAL</span><span class="money-field"><b>R$</b><input type="number" id="savingsBoxTargetV289" min="0.01" step="0.01" placeholder="0,00"></span></label>',
        '    <label class="form-field"><span>PRAZO / OPCIONAL</span><input type="date" id="savingsBoxDeadlineV289"></label>',
        '    <fieldset class="savings-color-field-v289 form-field-wide"><legend>COR</legend><div id="savingsBoxColorsV289"></div></fieldset>',
        '    <p class="savings-form-note-v289"><strong>Organização, não banco.</strong> O Fôlego registra onde você separou o dinheiro, mas não faz movimentações na sua conta real.</p>',
        '    <p class="savings-form-error-v289" id="savingsBoxErrorV289" role="alert" hidden></p>',
        "  </div>",
        '  <div class="modal-actions savings-box-modal-actions-v289"><button class="paper-button savings-archive-button-v289" id="savingsArchiveBoxV289" type="button" hidden>Arquivar</button><span></span><button class="paper-button" type="button" data-savings-close>Cancelar</button><button class="ink-button" type="submit">Salvar caixinha →</button></div>',
        "</form>"
    ].join("");
    document.body.appendChild(dialog);

    const accountSelect = $("#savingsBoxAccountV289");
    accountSelect.innerHTML = ACCOUNT_METHOD_VALUES.map((method) => (
        '<option value="' + escapeHTML(method) + '">' + escapeHTML(accountNameForMethod(method)) + "</option>"
    )).join("");
    $("#savingsBoxIconV289").innerHTML = Object.entries(ICON_LABELS).map(([value, label]) => (
        '<option value="' + escapeHTML(value) + '">' + escapeHTML(label) + "</option>"
    )).join("");
    $("#savingsBoxColorsV289").innerHTML = ["green", "yellow", "orange", "purple", "blue"].map((color, index) => (
        '<label><input type="radio" name="savingsBoxColorV289" value="' + color + '"' + (index === 0 ? " checked" : "") + '><span data-color="' + color + '">' + color + "</span></label>"
    )).join("");

    dialog.querySelectorAll("[data-savings-close]").forEach((button) => {
        button.addEventListener("click", () => dialog.close());
    });
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
    });
    $("#savingsBoxFormV289").addEventListener("submit", handleBoxSubmit);
    $("#savingsArchiveBoxV289").addEventListener("click", handleArchiveBox);
    return dialog;
}

function setBoxError(message) {
    const target = $("#savingsBoxErrorV289");
    if (!target) return;
    target.textContent = message;
    target.hidden = !message;
}

function openBoxDialog(boxId = null, accountMethod = state.selectedAccount) {
    const dialog = ensureBoxDialog();
    const box = boxId ? state.metadata.boxes.find((item) => item.id === boxId) : null;
    $("#savingsBoxFormV289").reset();
    $("#savingsBoxIdV289").value = box?.id || "";
    $("#savingsBoxDialogTitleV289").textContent = box ? "Editar caixinha" : "Nova caixinha";
    $("#savingsBoxAccountV289").value = box?.accountMethod || (
        ACCOUNT_METHOD_VALUES.includes(accountMethod) ? accountMethod : ACCOUNT_METHOD_VALUES[0]
    );
    $("#savingsBoxAccountV289").disabled = Boolean(box);
    $("#savingsBoxNameV289").value = box?.name || "";
    $("#savingsBoxIconV289").value = box?.icon || "target";
    $("#savingsBoxTargetV289").value = box?.target || "";
    $("#savingsBoxDeadlineV289").value = box?.deadline || "";
    const color = box?.color || "green";
    const colorInput = dialog.querySelector('input[name="savingsBoxColorV289"][value="' + color + '"]');
    if (colorInput) colorInput.checked = true;
    $("#savingsArchiveBoxV289").hidden = !box;
    setBoxError("");
    if (dialog.open) dialog.close();
    dialog.showModal();
    window.setTimeout(() => $("#savingsBoxNameV289")?.focus(), 60);
}

async function saveMetadata(nextMetadata) {
    if (!state.user?.id || !supabase) throw new Error("Conta não identificada.");
    const normalized = normalizeSavingsBoxesMetadata(nextMetadata);
    const { data, error } = await supabase.auth.updateUser({
        data: { [SAVINGS_BOXES_META_KEY]: normalized }
    });
    if (error) throw error;
    state.metadata = normalized;
    if (data.user) state.user = data.user;
    return normalized;
}

function setFormBusy(form, busy, busyLabel) {
    const submit = form?.querySelector('button[type="submit"]');
    if (!submit) return;
    if (!submit.dataset.originalLabel) submit.dataset.originalLabel = submit.textContent;
    submit.disabled = busy;
    submit.textContent = busy ? busyLabel : submit.dataset.originalLabel;
}

async function handleBoxSubmit(event) {
    event.preventDefault();
    if (state.saving) return;
    const existingId = $("#savingsBoxIdV289").value;
    const existing = state.metadata.boxes.find((box) => box.id === existingId);
    const box = buildSavingsBox({
        id: existing?.id,
        createdAt: existing?.createdAt,
        archived: existing?.archived,
        accountMethod: existing?.accountMethod || $("#savingsBoxAccountV289").value,
        name: $("#savingsBoxNameV289").value,
        icon: $("#savingsBoxIconV289").value,
        target: $("#savingsBoxTargetV289").value,
        deadline: $("#savingsBoxDeadlineV289").value,
        color: document.querySelector('input[name="savingsBoxColorV289"]:checked')?.value
    });
    if (!box) {
        setBoxError("Revise a conta e informe um nome para a caixinha.");
        return;
    }

    state.saving = true;
    setSyncState("busy");
    setFormBusy(event.currentTarget, true, "SALVANDO...");
    try {
        await saveMetadata(upsertSavingsBox(state.metadata, box));
        state.selectedAccount = box.accountMethod;
        renderAll();
        $("#savingsBoxDialogV289").close();
        setSyncState("ok");
        showToast(existing ? "Caixinha atualizada." : "Caixinha criada em " + accountNameForMethod(box.accountMethod) + ".");
        window.dispatchEvent(new CustomEvent("folego:savings-updated"));
    } catch (error) {
        console.error("Fôlego não conseguiu salvar a caixinha:", error);
        setSyncState("error");
        setBoxError(error?.message || "Não foi possível salvar a caixinha.");
    } finally {
        state.saving = false;
        setFormBusy(event.currentTarget, false, "");
    }
}

async function handleArchiveBox() {
    const boxId = $("#savingsBoxIdV289").value;
    const savings = calculateSavingsBoxes(state.transactions, state.metadata, todayKey());
    const box = savings.boxes.find((item) => item.id === boxId);
    if (!box) return;
    if (Math.abs(box.balance) > 0.001) {
        setBoxError("Resgate ou mova todo o saldo antes de arquivar esta caixinha.");
        return;
    }
    if (!window.confirm('Arquivar a caixinha "' + box.name + '"? O histórico continuará preservado.')) return;
    try {
        setSyncState("busy");
        await saveMetadata(archiveSavingsBox(state.metadata, boxId, true));
        renderAll();
        $("#savingsBoxDialogV289").close();
        setSyncState("ok");
        showToast("Caixinha arquivada; o histórico foi preservado.");
    } catch (error) {
        setSyncState("error");
        setBoxError(error?.message || "Não foi possível arquivar.");
    }
}

function ensureMovementDialog() {
    let dialog = $("#savingsMovementDialogV289");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "savingsMovementDialogV289";
    dialog.className = "modal savings-dialog-v289";
    dialog.innerHTML = [
        '<form class="modal-sheet compact-sheet savings-sheet-v289" id="savingsMovementFormV289">',
        '  <div class="modal-header"><div><span id="savingsMovementKickerV289">CAIXINHA / MOVIMENTO NEUTRO</span><h2 id="savingsMovementTitleV289">Guardar dinheiro</h2></div><button class="modal-close" type="button" data-savings-close aria-label="Fechar">×</button></div>',
        '  <input type="hidden" id="savingsMovementKindV289">',
        '  <input type="hidden" id="savingsMovementSeriesV289">',
        '  <div class="savings-direction-v289"><span id="savingsDirectionFromV289">CONTA</span><i>→</i><strong id="savingsDirectionToV289">CAIXINHA</strong></div>',
        '  <div class="form-grid">',
        '    <label class="form-field form-field-wide" id="savingsSingleBoxFieldV289"><span id="savingsSingleBoxLabelV289">EM QUAL CAIXINHA</span><select id="savingsSingleBoxV289" required></select></label>',
        '    <div class="savings-move-fields-v289 form-field-wide" id="savingsMoveFieldsV289" hidden>',
        '      <label class="form-field"><span>DE QUAL CAIXINHA</span><select id="savingsFromBoxV289"></select></label>',
        '      <i aria-hidden="true">→</i>',
        '      <label class="form-field"><span>PARA QUAL CAIXINHA</span><select id="savingsToBoxV289"></select></label>',
        "    </div>",
        '    <label class="form-field"><span>VALOR</span><span class="money-field"><b>R$</b><input type="number" id="savingsMovementAmountV289" min="0.01" step="0.01" inputmode="decimal" placeholder="0,00" required></span></label>',
        '    <label class="form-field"><span>DATA</span><input type="date" id="savingsMovementDateV289" required></label>',
        '    <label class="form-field form-field-wide"><span>NOTA / OPCIONAL</span><input type="text" id="savingsMovementDescriptionV289" maxlength="80" placeholder="Ex.: parte do pagamento recebido"></label>',
        '    <p class="savings-form-note-v289" id="savingsMovementNoticeV289"><strong>Movimento neutro.</strong> O valor muda de lugar, mas Entrou, Saiu e o patrimônio não mudam.</p>',
        '    <p class="savings-form-error-v289" id="savingsMovementErrorV289" role="alert" hidden></p>',
        "  </div>",
        '  <div class="modal-actions"><button class="paper-button" type="button" data-savings-close>Cancelar</button><button class="ink-button" id="savingsMovementSubmitV289" type="submit">Confirmar →</button></div>',
        "</form>"
    ].join("");
    document.body.appendChild(dialog);
    dialog.querySelectorAll("[data-savings-close]").forEach((button) => {
        button.addEventListener("click", () => dialog.close());
    });
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
        state.editingSeriesId = null;
        setMovementError("");
    });
    $("#savingsMovementFormV289").addEventListener("submit", handleMovementSubmit);
    $("#savingsFromBoxV289").addEventListener("change", renderMoveDestinationOptions);
    return dialog;
}

function setMovementError(message) {
    const target = $("#savingsMovementErrorV289");
    if (!target) return;
    target.textContent = message;
    target.hidden = !message;
}

function availableBoxes() {
    return calculateSavingsBoxes(state.transactions, state.metadata, todayKey()).boxes
        .filter((box) => !box.archived);
}

function optionForBox(box) {
    return '<option value="' + escapeHTML(box.id) + '">'
        + escapeHTML(accountNameForMethod(box.accountMethod)) + " · "
        + escapeHTML(box.name) + " · " + escapeHTML(currency.format(box.balance))
        + "</option>";
}

function renderMoveDestinationOptions(preferredId = null) {
    const fromId = $("#savingsFromBoxV289")?.value;
    const boxes = availableBoxes();
    const fromBox = boxes.find((box) => box.id === fromId);
    const destinations = boxes.filter((box) => (
        fromBox && box.accountMethod === fromBox.accountMethod && box.id !== fromBox.id
    ));
    const select = $("#savingsToBoxV289");
    if (!select) return;
    select.innerHTML = destinations.map(optionForBox).join("");
    if (destinations.some((box) => box.id === preferredId)) select.value = preferredId;
}

function configureMovementDialog(kind, movement = null, pair = null, preferredBoxId = null) {
    const boxes = availableBoxes();
    const finalKind = movement?.kind || kind;
    state.editingSeriesId = pair?.seriesId || null;
    $("#savingsMovementFormV289").reset();
    $("#savingsMovementKindV289").value = finalKind;
    $("#savingsMovementSeriesV289").value = pair?.seriesId || "";
    $("#savingsMovementDateV289").value = pair?.outgoing?.date || todayKey();
    $("#savingsMovementAmountV289").value = pair?.outgoing?.amount || "";
    $("#savingsMovementDescriptionV289").value = pair?.outgoing?.description || "";

    const moving = finalKind === SAVINGS_MOVEMENT_KINDS.MOVE;
    $("#savingsSingleBoxFieldV289").hidden = moving;
    $("#savingsMoveFieldsV289").hidden = !moving;
    $("#savingsSingleBoxV289").required = !moving;
    $("#savingsFromBoxV289").required = moving;
    $("#savingsToBoxV289").required = moving;
    $("#savingsSingleBoxV289").innerHTML = boxes.map(optionForBox).join("");
    $("#savingsFromBoxV289").innerHTML = boxes.filter((box) => box.balance > 0).map(optionForBox).join("");

    if (moving) {
        $("#savingsMovementTitleV289").textContent = pair ? "Editar movimento" : "Mover entre caixinhas";
        $("#savingsMovementKickerV289").textContent = "CAIXINHAS / MESMA CONTA";
        $("#savingsDirectionFromV289").textContent = "CAIXINHA";
        $("#savingsDirectionToV289").textContent = "CAIXINHA";
        $("#savingsMovementSubmitV289").textContent = "Mover valor →";
        const fromId = movement?.fromBoxId || preferredBoxId;
        if (boxes.some((box) => box.id === fromId)) $("#savingsFromBoxV289").value = fromId;
        renderMoveDestinationOptions(movement?.toBoxId);
    } else {
        const saving = finalKind === SAVINGS_MOVEMENT_KINDS.SAVE;
        $("#savingsMovementTitleV289").textContent = pair
            ? (saving ? "Editar valor guardado" : "Editar resgate")
            : (saving ? "Guardar dinheiro" : "Resgatar dinheiro");
        $("#savingsMovementKickerV289").textContent = saving ? "CAIXINHA / TIRAR DO LIVRE" : "CAIXINHA / VOLTAR AO LIVRE";
        $("#savingsDirectionFromV289").textContent = saving ? "CONTA" : "CAIXINHA";
        $("#savingsDirectionToV289").textContent = saving ? "CAIXINHA" : "CONTA";
        $("#savingsSingleBoxLabelV289").textContent = saving ? "EM QUAL CAIXINHA" : "DE QUAL CAIXINHA";
        $("#savingsMovementSubmitV289").textContent = saving ? "Guardar valor →" : "Resgatar valor →";
        const boxId = movement?.boxId || preferredBoxId;
        if (boxes.some((box) => box.id === boxId)) $("#savingsSingleBoxV289").value = boxId;
    }
    $("#savingsMovementSubmitV289").dataset.originalLabel = $("#savingsMovementSubmitV289").textContent;
    setMovementError("");
}

function openMovementDialog(kind, preferredBoxId = null, pair = null) {
    const dialog = ensureMovementDialog();
    const movement = pair ? inferSavingsMovementForPair(pair, state.metadata) : null;
    const boxes = availableBoxes();
    if (!boxes.length) {
        showToast("Crie uma caixinha antes de guardar dinheiro.", "warning");
        openBoxDialog(null, state.selectedAccount);
        return;
    }
    configureMovementDialog(kind, movement, pair, preferredBoxId);
    if (dialog.open) dialog.close();
    dialog.showModal();
    window.setTimeout(() => $("#savingsMovementAmountV289")?.focus(), 60);
}

function pairForSeries(seriesId) {
    return seriesId ? getTransferPair(state.transactions, seriesId) : null;
}

function transactionsWithoutEditing() {
    if (!state.editingSeriesId) return state.transactions;
    return state.transactions.filter((transaction) => transaction.seriesId !== state.editingSeriesId);
}

function movementValues() {
    const kind = $("#savingsMovementKindV289").value;
    return {
        kind,
        boxId: $("#savingsSingleBoxV289").value,
        fromBoxId: $("#savingsFromBoxV289").value,
        toBoxId: $("#savingsToBoxV289").value,
        amount: $("#savingsMovementAmountV289").value,
        date: $("#savingsMovementDateV289").value,
        description: $("#savingsMovementDescriptionV289").value
    };
}

async function rollbackMovement(existingPair, seriesId) {
    try {
        if (existingPair?.complete) await saveInternalTransferPair(state.user.id, existingPair);
        else await removeInternalTransferPair(state.user.id, seriesId);
    } catch (rollbackError) {
        console.error("Fôlego não conseguiu reverter o movimento incompleto:", rollbackError);
    }
}

async function handleMovementSubmit(event) {
    event.preventDefault();
    if (!state.user?.id || state.saving) return;
    const values = movementValues();
    const baseTransactionsValue = transactionsWithoutEditing();
    const baseFinancial = financialState(baseTransactionsValue, state.metadata);
    const baseSavings = calculateSavingsBoxes(baseTransactionsValue, state.metadata, todayKey());
    const validation = validateSavingsMovement(values, baseFinancial, baseSavings, state.metadata);
    if (!validation.valid) {
        const friendly = validation.code === "insufficient_account"
            ? "Saldo livre insuficiente nesta conta."
            : validation.code === "insufficient_box"
                ? "A caixinha não tem esse valor disponível."
                : validation.message;
        setMovementError(friendly + (validation.message && !friendly.includes(validation.message) ? " " + validation.message : ""));
        return;
    }

    const existingPair = pairForSeries(state.editingSeriesId);
    const pair = buildSavingsTransfer({
        ...values,
        amount: validation.amount,
        seriesId: state.editingSeriesId,
        outgoingId: existingPair?.outgoing?.id,
        incomingId: existingPair?.incoming?.id
    }, state.metadata);
    if (!pair) {
        setMovementError("Revise as caixinhas, o valor e a data.");
        return;
    }

    state.saving = true;
    setSyncState("busy");
    setFormBusy(event.currentTarget, true, "MOVENDO...");
    let saved = null;
    try {
        saved = await saveInternalTransferPair(state.user.id, pair);
        const nextTransactions = [...baseTransactionsValue, ...saved.map(toTransaction)];
        const assigned = assignSavingsMovement(state.metadata, pair.seriesId, pair.movement);
        const nextMetadata = pruneSavingsMovementAssignments(assigned, nextTransactions);
        try {
            await saveMetadata(nextMetadata);
        } catch (metadataError) {
            await rollbackMovement(existingPair, pair.seriesId);
            throw metadataError;
        }
        state.transactions = nextTransactions;
        renderAll();
        $("#savingsMovementDialogV289").close();
        setSyncState("ok");
        const message = pair.kind === SAVINGS_MOVEMENT_KINDS.SAVE
            ? currency.format(validation.amount) + " foi guardado sem virar despesa."
            : pair.kind === SAVINGS_MOVEMENT_KINDS.REDEEM
                ? currency.format(validation.amount) + " voltou ao saldo livre."
                : currency.format(validation.amount) + " mudou de caixinha.";
        showToast(message);
        window.dispatchEvent(new CustomEvent("folego:transactions-updated", {
            detail: { source: "reserve", feature: "caixinhas" }
        }));
        window.dispatchEvent(new CustomEvent("folego:savings-updated"));
    } catch (error) {
        console.error("Fôlego não conseguiu movimentar a caixinha:", error);
        setSyncState("error");
        setMovementError(error?.message || "Não foi possível movimentar a caixinha.");
        showToast("A caixinha não foi atualizada.", "error");
    } finally {
        state.saving = false;
        setFormBusy(event.currentTarget, false, "");
    }
}

function openAccountsView(accountMethod = null) {
    if (ACCOUNT_METHOD_VALUES.includes(accountMethod)) state.selectedAccount = accountMethod;
    const button = $('.rail-link[data-view="accounts"]');
    if (button) button.click();
    else {
        document.querySelectorAll("[data-view-section]").forEach((section) => {
            section.classList.toggle("active", section.dataset.viewSection === "accounts");
        });
    }
    renderAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadTransactions() {
    if (!state.user?.id || state.loading || !supabase) return;
    state.loading = true;
    try {
        const { data, error } = await supabase
            .from("transactions")
            .select("*")
            .eq("user_id", state.user.id)
            .order("occurred_on", { ascending: false });
        if (error) throw error;
        state.transactions = (data || []).map(toTransaction);
        renderAll();
        scheduleRender(120);
    } catch (error) {
        console.error("Fôlego não conseguiu carregar as caixinhas:", error);
    } finally {
        state.loading = false;
    }
}

document.addEventListener("click", (event) => {
    const account = event.target.closest("[data-savings-account]");
    if (account) {
        state.selectedAccount = account.dataset.savingsAccount;
        renderAll();
        return;
    }
    const newBox = event.target.closest("[data-savings-new-box]");
    if (newBox) {
        openBoxDialog(null, state.selectedAccount);
        return;
    }
    const editBox = event.target.closest("[data-savings-edit-box]");
    if (editBox) {
        openBoxDialog(editBox.dataset.savingsEditBox);
        return;
    }
    const action = event.target.closest("[data-savings-action]");
    if (action && !action.disabled) {
        openMovementDialog(action.dataset.savingsAction, action.dataset.boxId);
        return;
    }
    const open = event.target.closest("[data-open-savings-view]");
    if (open) {
        openAccountsView();
        return;
    }
    const openAccount = event.target.closest("[data-open-savings-account]");
    if (openAccount) {
        openAccountsView(openAccount.dataset.openSavingsAccount);
    }
});

window.addEventListener("folego:open-reserve-dialog", (event) => {
    const pair = event.detail?.pair || pairForSeries(event.detail?.seriesId);
    if (!pair?.complete) return;
    openMovementDialog(SAVINGS_MOVEMENT_KINDS.SAVE, null, pair);
});
window.addEventListener("folego:open-accounts", (event) => {
    openAccountsView(event.detail?.accountMethod);
});
window.addEventListener("folego:transactions-updated", loadTransactions);
window.addEventListener("folego:accounts-rendered", () => scheduleRender(0));
window.addEventListener("focus", loadTransactions);

window.folegoSavingsBoxesBackup = {
    exportData() {
        return normalizeSavingsBoxesMetadata(state.metadata);
    },
    async importData(value) {
        const normalized = normalizeSavingsBoxesMetadata(value);
        await saveMetadata(normalized);
        renderAll();
        return normalized;
    }
};

document.documentElement.classList.add("pulso-v289");
ensureNavigation();
ensureView();
ensureBoxDialog();
ensureMovementDialog();
if (window.location.hash === "#accounts") window.setTimeout(() => openAccountsView(), 0);

supabase?.auth.onAuthStateChange((_event, session) => {
    syncUser(session?.user || null);
    if (session?.user) window.setTimeout(loadTransactions, 0);
    else {
        state.transactions = [];
        renderAll();
    }
});

supabase?.auth.getSession().then(({ data }) => {
    syncUser(data.session?.user || null);
    if (data.session?.user) loadTransactions();
});
