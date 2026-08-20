import { supabase } from "./supabase-client.js";
import {
    ACCOUNT_ASSIGNMENTS_META_KEY,
    ACCOUNT_SNAPSHOT_META_KEY,
    ACCOUNT_METHODS,
    DEFAULT_ACCOUNT_SNAPSHOT_V282,
    ACCOUNT_METHOD_VALUES,
    RESERVE_STORAGE_METHOD,
    accountContext,
    accountExpenseRanking,
    accountForMethod,
    accountMethodForTransaction,
    calculateAccountBalances,
    isAccountTransfer,
    normalizeAccountAssignments,
    normalizeAccountSnapshot,
    transactionMatchesAccount
} from "./folego-accounts-v28.js";
import {
    ACCOUNT_MIGRATION_META_KEY,
    migrateExistingTransactionsToInter
} from "./folego-accounts-migration-v28.js";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateShort = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const $ = (selector) => document.querySelector(selector);

const state = {
    user: null,
    transactions: [],
    selectedAccount: "all",
    assignments: {},
    snapshot: null,
    pendingAssignment: null,
    loading: false,
    scheduled: false
};

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function toTransaction(row) {
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
        createdAt: row.created_at
    };
}

function todayKey() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(value, amount) {
    const date = new Date(`${value}T12:00:00`);
    date.setDate(date.getDate() + amount);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function accountLogo(method, className = "account-logo-v28") {
    if (method === RESERVE_STORAGE_METHOD) {
        return `<span class="${className} reserve" aria-label="Reserva">◆</span>`;
    }
    const account = accountForMethod(method);
    if (account.logo) {
        return `<span class="${className}"><img src="${escapeHTML(account.logo)}" alt="${escapeHTML(account.name)}"></span>`;
    }
    return `<span class="${className} cash" aria-label="Espécie">R$</span>`;
}

function ensureOverview() {
    let overview = $("#accountsOverviewV28");
    if (overview) return overview;

    overview = document.createElement("section");
    overview.id = "accountsOverviewV28";
    overview.className = "accounts-overview-v28";
    overview.setAttribute("aria-label", "Onde o dinheiro está");
    overview.innerHTML = `
        <header class="accounts-overview-head"><span>ONDE O DINHEIRO ESTÁ</span><b>05 CONTAS</b></header>
        <div class="accounts-list-v28" id="accountsListV28"></div>
        <footer class="accounts-total-v28"><span>SALDO TOTAL DISPONÍVEL</span><strong id="accountsTotalV28">R$ 0,00</strong></footer>
    `;

    /* V2.8.4: as contas formam uma faixa própria sob o resumo, sem sufocar o saldo. */
    const oldPockets = $(".balance-pockets");
    oldPockets?.remove();
    const stage = $(".balance-stage");
    const receipt = stage?.querySelector(".month-receipt");
    if (stage) stage.insertBefore(overview, receipt || null);
    else $("#currentBalance")?.insertAdjacentElement("afterend", overview);
    return overview;
}

function renderOverview() {
    ensureOverview();
    const snapshot = calculateAccountBalances(state.transactions, todayKey(), state.assignments, state.snapshot);
    const list = $("#accountsListV28");
    if (!list) return;

    list.innerHTML = ACCOUNT_METHOD_VALUES.map((method) => {
        const account = accountForMethod(method);
        return `
            <button class="account-card-v28" type="button" data-account-method="${escapeHTML(method)}" style="--account-accent:${escapeHTML(account.accent)}" aria-label="Ver movimentos da conta ${escapeHTML(account.name)}">
                ${accountLogo(method)}
                <span class="account-copy-v28"><strong>${escapeHTML(account.name)}</strong><small>${escapeHTML(account.subtitle)}</small></span>
                <strong class="account-value-v28">${escapeHTML(currency.format(snapshot.balances[method]))}</strong>
            </button>
        `;
    }).join("");

    const total = $("#accountsTotalV28");
    if (total) total.textContent = currency.format(snapshot.total);

    const hero = $("#currentBalance");
    if (hero) {
        hero.textContent = currency.format(snapshot.total);
        hero.classList.toggle("long-value", hero.textContent.length > 17);
    }

    const projected = calculateAccountBalances(
        state.transactions.filter((transaction) => transaction.status === "paid"),
        "9999-12-31",
        state.assignments
    );
    const banner = $("#bannerBalance");
    if (banner) banner.textContent = currency.format(projected.total);
}

function ensureAccountFilter() {
    if ($("#accountFilterV28")) return;
    const strip = $(".filter-strip");
    const exportButton = $("#exportCsvButton");
    if (!strip || !exportButton) return;

    const label = document.createElement("label");
    label.className = "filter-field account-filter-field";
    label.innerHTML = `
        <span>CONTA /</span>
        <select id="accountFilterV28" aria-label="Filtrar por conta">
            <option value="all">Todas as contas</option>
            <option value="pix">Inter</option>
            <option value="bank_transfer">Banco do Brasil</option>
            <option value="itau">Itaú</option>
            <option value="nubank">Nubank</option>
            <option value="cash">Espécie</option>
        </select>
    `;
    strip.insertBefore(label, exportButton);
    label.querySelector("select").addEventListener("change", (event) => {
        state.selectedAccount = event.target.value;
        applyAccountFilter();
    });
}

function transferPair(seriesId) {
    const rows = state.transactions.filter((transaction) => (
        isAccountTransfer(transaction) && transaction.seriesId === seriesId
    ));
    return {
        outgoing: rows.find((row) => row.type === "expense"),
        incoming: rows.find((row) => row.type === "income")
    };
}

function movementForRow(row) {
    const transferButton = row.querySelector('[data-action="edit-transfer"],[data-action="delete-transfer"]');
    if (transferButton) {
        const pair = transferPair(transferButton.dataset.id);
        if (!pair.outgoing || !pair.incoming) return null;
        return {
            ...pair.outgoing,
            type: "transfer",
            transferFrom: pair.outgoing.paymentMethod,
            transferTo: pair.incoming.paymentMethod
        };
    }

    const button = row.querySelector('[data-action="edit-transaction"],[data-action="delete-transaction"]');
    return state.transactions.find((transaction) => transaction.id === button?.dataset.id) || null;
}

function decorateTransactionRows() {
    document.querySelectorAll("#transactionRows .transaction-row").forEach((row) => {
        const transaction = movementForRow(row);
        if (!transaction) return;
        const context = row.querySelector(".transaction-description small");
        if (context) {
            context.textContent = transaction.type === "transfer"
                ? `${accountContext(transaction, state.assignments, state.snapshot)} • transferência interna`
                : accountContext(transaction, state.assignments);
            context.classList.add("account-context-v28");
        }
        row.dataset.accountMethod = transaction.type === "transfer"
            ? `${transaction.transferFrom},${transaction.transferTo}`
            : accountMethodForTransaction(transaction, state.assignments);
    });
}

function applyAccountFilter() {
    decorateTransactionRows();
    document.querySelectorAll("#transactionRows .transaction-row").forEach((row) => {
        const transaction = movementForRow(row);
        row.hidden = Boolean(transaction && !transactionMatchesAccount(transaction, state.selectedAccount, state.assignments));
    });
}

function collapsedTransactions() {
    const transferIds = new Set();
    const collapsed = [];

    for (const transaction of state.transactions) {
        if (!isAccountTransfer(transaction) || !transaction.seriesId) {
            collapsed.push(transaction);
            continue;
        }
        if (transferIds.has(transaction.seriesId)) continue;
        transferIds.add(transaction.seriesId);
        const pair = transferPair(transaction.seriesId);
        if (!pair.outgoing || !pair.incoming) {
            collapsed.push(transaction);
            continue;
        }
        collapsed.push({
            ...pair.outgoing,
            type: "transfer",
            transferFrom: pair.outgoing.paymentMethod,
            transferTo: pair.incoming.paymentMethod,
            createdAt: [pair.outgoing.createdAt, pair.incoming.createdAt].filter(Boolean).sort().at(-1)
        });
    }

    return collapsed;
}

function renderRecent() {
    const target = $("#recentTransactions");
    if (!target) return;
    const recent = collapsedTransactions()
        .sort((a, b) => String(b.createdAt || `${b.date}T00:00:00`).localeCompare(String(a.createdAt || `${a.date}T00:00:00`)))
        .slice(0, 5);

    if (!recent.length) return;

    target.innerHTML = recent.map((transaction) => {
        const transfer = transaction.type === "transfer";
        const method = transfer ? transaction.transferFrom : accountMethodForTransaction(transaction, state.assignments);
        const signal = transfer ? "↔" : transaction.type === "income" ? "+" : "−";
        const valueClass = transfer ? "transfer-value" : transaction.type === "income" ? "income-value" : "expense-value";
        return `
            <div class="recent-item ${transfer ? "transfer-item" : ""}">
                ${accountLogo(method, "account-mini-logo-v28")}
                <div class="transaction-main">
                    <strong>${escapeHTML(transaction.description)}</strong>
                    <span class="account-context-v28">${escapeHTML(accountContext(transaction, state.assignments))}${transaction.status === "pending" ? " • pendente" : ""}</span>
                </div>
                <span class="recent-date">${escapeHTML(dateShort.format(new Date(`${transaction.date}T12:00:00`)).replace(".", ""))}</span>
                <strong class="recent-value ${valueClass}">${signal} ${escapeHTML(currency.format(transaction.amount))}</strong>
            </div>
        `;
    }).join("");
}

function replaceOptions(select, selectedValue) {
    if (!select) return;
    const safeValue = ACCOUNT_METHOD_VALUES.includes(selectedValue) ? selectedValue : "pix";
    select.innerHTML = `
        <option value="pix">Inter</option>
        <option value="bank_transfer">Banco do Brasil</option>
        <option value="itau">Itaú</option>
        <option value="nubank">Nubank</option>
        <option value="cash">Espécie</option>
    `;
    select.value = safeValue;
}

function ensureTransactionAccountField() {
    let field = $("#transactionAccountFieldV28");
    const paymentSelect = $("#transactionPaymentMethod");
    if (field || !paymentSelect) return field;

    field = document.createElement("label");
    field.className = "form-field account-form-field-v28";
    field.id = "transactionAccountFieldV28";
    field.innerHTML = `
        <span id="transactionAccountLabelV28">SAIU DE QUAL CONTA</span>
        <select id="transactionAccountV28" required>
            <option value="pix">Inter</option>
            <option value="bank_transfer">Banco do Brasil</option>
            <option value="itau">Itaú</option>
            <option value="nubank">Nubank</option>
            <option value="cash">Espécie</option>
        </select>
    `;
    paymentSelect.closest(".form-field")?.insertAdjacentElement("afterend", field);
    return field;
}

function updateTransactionForm() {
    const field = ensureTransactionAccountField();
    const type = document.querySelector('#transactionForm input[name="transactionType"]:checked')?.value || "expense";
    const accountLabel = $("#transactionAccountLabelV28");
    if (accountLabel) accountLabel.textContent = type === "income" ? "ENTROU EM QUAL CONTA" : "SAIU DE QUAL CONTA";

    const methodLabel = $("#transactionMethodLabel");
    if (methodLabel) methodLabel.textContent = "FORMA DE MOVIMENTAÇÃO";

    const transactionId = $("#transactionId")?.value || "";
    const accountSelect = $("#transactionAccountV28");
    if (field && accountSelect && document.activeElement !== accountSelect) {
        accountSelect.value = transactionId && state.assignments[transactionId]
            ? state.assignments[transactionId]
            : "pix";
    }
}

function updateTransferForms() {
    for (const [fromSelector, toSelector] of [
        ["#transferFrom", "#transferTo"],
        ["#v25TransferSource", "#v25TransferDestination"]
    ]) {
        const from = $(fromSelector);
        const to = $(toSelector);
        if (!from || !to) continue;
        const fromValue = from.value;
        const toValue = to.value;
        if (!from.dataset.accountsV28) {
            replaceOptions(from, fromValue);
            replaceOptions(to, toValue);
            from.dataset.accountsV28 = "true";
            to.dataset.accountsV28 = "true";
        }
    }

    document.querySelectorAll(".transfer-notice").forEach((notice) => {
        notice.innerHTML = "<strong>Não é receita nem despesa.</strong> O valor apenas muda de conta e não altera Entrou, Saiu ou o resultado do mês.";
    });
}

function keepTransferDifferent(event) {
    const select = event.target.closest("#transferFrom,#transferTo,#v25TransferSource,#v25TransferDestination");
    if (!select) return;
    const group = select.id.startsWith("v25")
        ? [$("#v25TransferSource"), $("#v25TransferDestination")]
        : [$("#transferFrom"), $("#transferTo")];
    if (!group[0] || !group[1] || group[0].value !== group[1].value) return;
    const other = group[0] === select ? group[1] : group[0];
    other.value = ACCOUNT_METHOD_VALUES.find((value) => value !== select.value) || "pix";
}

function reportRange() {
    const reference = $("#reportReferenceDate")?.value || todayKey();
    const mode = document.querySelector("[data-report-period].active")?.dataset.reportPeriod || "month";
    if (mode === "day") return { start: reference, end: reference };
    if (mode === "week") {
        const date = new Date(`${reference}T12:00:00`);
        const offset = (date.getDay() + 6) % 7;
        return { start: addDays(reference, -offset), end: addDays(reference, 6 - offset) };
    }
    return { start: `${reference.slice(0, 7)}-01`, end: addDays(`${addDays(`${reference.slice(0, 7)}-28`, 7).slice(0, 7)}-01`, -1) };
}

function ensureReportAccounts() {
    let section = $("#reportAccountsV28");
    if (section) return section;
    const totals = $(".report-totals");
    if (!totals) return null;
    section = document.createElement("section");
    section.id = "reportAccountsV28";
    section.className = "report-pocket-grid report-accounts-v28";
    totals.insertAdjacentElement("afterend", section);

    const heading = $(".method-board .section-code");
    const title = $(".method-board h3");
    if (heading) heading.textContent = "03 / POR CONTA";
    if (title) title.textContent = "De onde saiu";
    return section;
}

function renderReportAccounts() {
    const section = ensureReportAccounts();
    if (!section) return;
    const end = reportRange().end;
    const snapshot = calculateAccountBalances(state.transactions, end, state.assignments, state.snapshot);
    section.innerHTML = ACCOUNT_METHOD_VALUES.map((method) => {
        const account = accountForMethod(method);
        return `
            <article class="report-pocket" style="--pocket-accent:${escapeHTML(account.accent)}">
                <span>${escapeHTML(account.name.toUpperCase())}</span>
                <strong>${escapeHTML(currency.format(snapshot.balances[method]))}</strong>
            </article>
        `;
    }).join("");

    const rankingTarget = $("#methodRanking");
    if (!rankingTarget) return;
    const ranking = accountExpenseRanking(state.transactions, reportRange(), state.assignments);
    if (!ranking.length) {
        rankingTarget.innerHTML = '<div class="ranking-empty"><span>—</span><p>As contas utilizadas aparecerão aqui.</p></div>';
        return;
    }
    const highest = ranking[0].amount || 1;
    rankingTarget.innerHTML = ranking.map((item, index) => `
        <div class="ranking-item ${index === 0 ? "leader" : ""}">
            <span class="ranking-position">${String(index + 1).padStart(2, "0")}</span>
            <div class="ranking-copy"><strong>${escapeHTML(item.label)}</strong><small>${item.count} ${item.count === 1 ? "movimento" : "movimentos"}</small><i><b style="width:${(item.amount / highest) * 100}%"></b></i></div>
            <div class="ranking-value"><strong>${escapeHTML(currency.format(item.amount))}</strong><span>${(item.share * 100).toFixed(0)}%</span></div>
        </div>
    `).join("");
}

function renderForecastOpeningBalance() {
    const opening = ACCOUNT_METHOD_VALUES.reduce((sum, method) => sum + Number(ACCOUNT_METHODS[method].openingBalance || 0), 0);
    const today = todayKey();
    const paidUntilToday = state.transactions.filter((transaction) => transaction.status === "paid" && transaction.date <= today && !isAccountTransfer(transaction));
    const baseToday = paidUntilToday.reduce((sum, transaction) => sum + (transaction.type === "income" ? transaction.amount : -transaction.amount), 0) + opening;

    for (const days of [30, 60, 90]) {
        const end = addDays(today, days);
        const scheduled = state.transactions
            .filter((transaction) => !isAccountTransfer(transaction) && transaction.date <= end && (
                (transaction.status === "paid" && transaction.date > today) || transaction.status === "pending"
            ))
            .reduce((sum, transaction) => sum + (transaction.type === "income" ? transaction.amount : -transaction.amount), 0);
        const target = $(`#projection${days}`);
        if (target) {
            const value = baseToday + scheduled;
            target.textContent = currency.format(value);
            target.classList.toggle("negative", value < 0);
        }
    }

    const start = addDays(today, -89);
    const recentExpense = state.transactions
        .filter((transaction) => transaction.type === "expense" && !isAccountTransfer(transaction) && transaction.status === "paid" && transaction.date >= start && transaction.date <= today)
        .reduce((sum, transaction) => sum + transaction.amount, 0);
    if (recentExpense > 0) {
        const dailyAverage = recentExpense / 90;
        const days = Math.max(0, Math.floor(baseToday / dailyAverage));
        const target = $("#breathingDays");
        if (target) target.textContent = days > 999 ? "999+" : String(days);
    }
}

function render() {
    if (!state.user) return;
    observer.disconnect();
    try {
        renderOverview();
    ensureAccountFilter();
    updateTransactionForm();
    updateTransferForms();
    renderRecent();
    applyAccountFilter();
    renderReportAccounts();
    renderForecastOpeningBalance();
    } finally {
        observer.observe(document.documentElement, { childList: true, subtree: true, characterData: false });
    }
}

function scheduleRender() {
    if (state.scheduled) return;
    state.scheduled = true;
    window.setTimeout(() => {
        state.scheduled = false;
        render();
    }, 40);
}

async function ensureAccountSnapshotV282() {
    const existing = normalizeAccountSnapshot(
        state.user?.user_metadata?.[ACCOUNT_SNAPSHOT_META_KEY]
    );
    if (existing) return existing;

    const initial = normalizeAccountSnapshot(DEFAULT_ACCOUNT_SNAPSHOT_V282);
    const { data, error } = await supabase.auth.updateUser({
        data: { [ACCOUNT_SNAPSHOT_META_KEY]: initial }
    });
    if (error) throw error;
    if (data.user) state.user = data.user;
    return initial;
}

async function saveAssignments(assignments) {
    const normalized = normalizeAccountAssignments(assignments);
    const { data, error } = await supabase.auth.updateUser({
        data: { [ACCOUNT_ASSIGNMENTS_META_KEY]: normalized }
    });
    if (error) throw error;
    state.assignments = normalized;
    if (data.user) state.user = data.user;
}

function capturePendingAssignment() {
    const account = $("#transactionAccountV28")?.value || "pix";
    const transactionId = $("#transactionId")?.value || "";
    const type = document.querySelector('#transactionForm input[name="transactionType"]:checked')?.value || "expense";
    state.pendingAssignment = {
        account,
        transactionId,
        type,
        description: $("#transactionDescription")?.value.trim() || "",
        beforeIds: new Set(state.transactions.map((transaction) => transaction.id)),
        attempts: 0
    };
    window.setTimeout(loadTransactions, 450);
}

async function resolvePendingAssignment() {
    const pending = state.pendingAssignment;
    if (!pending) return;

    const targets = pending.transactionId
        ? state.transactions.filter((transaction) => transaction.id === pending.transactionId)
        : state.transactions.filter((transaction) => (
            !pending.beforeIds.has(transaction.id)
            && transaction.type === pending.type
            && transaction.description === pending.description
            && !isAccountTransfer(transaction)
        ));

    if (!targets.length) {
        pending.attempts += 1;
        if (pending.attempts < 8) window.setTimeout(loadTransactions, 450);
        else state.pendingAssignment = null;
        return;
    }

    const next = { ...state.assignments };
    targets.forEach((transaction) => { next[transaction.id] = pending.account; });
    state.pendingAssignment = null;
    await saveAssignments(next);
}

async function loadTransactions() {
    if (!state.user || state.loading) return;
    state.loading = true;
    try {
        const { data, error } = await supabase
            .from("transactions")
            .select("*")
            .eq("user_id", state.user.id)
            .order("occurred_on", { ascending: false });
        if (error) throw error;
        state.transactions = (data || []).map(toTransaction);
        await resolvePendingAssignment();
        render();
    } catch (error) {
        console.error("Fôlego V2.8 não conseguiu carregar as contas:", error);
    } finally {
        state.loading = false;
    }
}

async function activate(user) {
    if (!user?.id) return;
    state.user = user;
    try {
        const migratedUser = await migrateExistingTransactionsToInter(user);
        state.user = migratedUser || user;
    } catch (error) {
        console.error("Fôlego V2.8 não conseguiu preparar as contas:", error);
    }
    state.assignments = normalizeAccountAssignments(
        state.user?.user_metadata?.[ACCOUNT_ASSIGNMENTS_META_KEY]
    );
    state.snapshot = await ensureAccountSnapshotV282();
    await loadTransactions();
}

$("#transactionForm")?.addEventListener("submit", capturePendingAssignment, true);

document.addEventListener("change", (event) => {
    if (event.target.matches('#transactionForm input[name="transactionType"]')) window.setTimeout(updateTransactionForm, 0);
}, true);
document.addEventListener("change", keepTransferDifferent, true);
document.addEventListener("click", (event) => {
    const card = event.target.closest("[data-account-method]");
    if (!card) return;
    state.selectedAccount = card.dataset.accountMethod;
    document.querySelector('[data-view="transactions"]')?.click();
    window.setTimeout(() => {
        const filter = $("#accountFilterV28");
        if (filter) filter.value = state.selectedAccount;
        applyAccountFilter();
    }, 80);
});
window.addEventListener("focus", loadTransactions);
window.addEventListener("folego:transactions-updated", loadTransactions);

const observer = new MutationObserver(scheduleRender);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: false });

supabase?.auth.onAuthStateChange((_event, session) => {
    if (session?.user) window.setTimeout(() => activate(session.user), 0);
});

const { data } = await supabase?.auth.getSession() || { data: null };
if (data?.session?.user) await activate(data.session.user);
