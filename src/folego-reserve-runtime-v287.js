import { supabase } from "./supabase-client.js";
import {
    ACCOUNT_ASSIGNMENTS_META_KEY,
    ACCOUNT_METHOD_VALUES,
    ACCOUNT_SNAPSHOT_META_KEY,
    accountNameForMethod,
    calculatePatrimony,
    normalizeAccountAssignments,
    normalizeAccountSnapshot
} from "./folego-accounts-v28.js";
import { saveInternalTransferPair } from "./folego-transfer-data-v27.js";
import { getTransferPair } from "./folego-transfer-v27.js";
import {
    RESERVE_DIRECTIONS,
    buildReserveTransfer,
    reserveAccountForPair,
    reserveDirectionForPair,
    validateReserveOperation
} from "./folego-reserve-v287.js";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const $ = (selector) => document.querySelector(selector);

const state = {
    user: null,
    transactions: [],
    assignments: {},
    snapshot: null,
    editingSeriesId: null,
    loading: false,
    toastTimer: null
};

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function todayKey() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

function syncUserMetadata(user) {
    state.user = user || null;
    state.assignments = normalizeAccountAssignments(user?.user_metadata?.[ACCOUNT_ASSIGNMENTS_META_KEY]);
    state.snapshot = normalizeAccountSnapshot(user?.user_metadata?.[ACCOUNT_SNAPSHOT_META_KEY]);
}

function financialState(transactions = state.transactions) {
    return calculatePatrimony(transactions, todayKey(), state.assignments, state.snapshot);
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
    if (status) status.textContent = label || (kind === "busy" ? "Salvando..." : kind === "error" ? "Falha ao sincronizar" : "Sincronizado");
    if (accountButton) accountButton.dataset.sync = kind;
}

function ensurePanel() {
    let panel = $("#reservePanelV287");
    if (panel) return panel;
    const accounts = $("#accountsOverviewV28");
    if (!accounts) return null;

    panel = document.createElement("section");
    panel.id = "reservePanelV287";
    panel.className = "reserve-panel-v287";
    panel.setAttribute("aria-labelledby", "reserveTitleV287");
    panel.innerHTML = `
        <div class="reserve-ledger-mark" aria-hidden="true"><span>R</span><small>01</small></div>
        <div class="reserve-copy-v287">
            <span class="reserve-kicker-v287">RESERVA / FORA DO SALDO</span>
            <h3 id="reserveTitleV287">Dinheiro guardado</h3>
            <p>Separado para você não gastar sem querer.</p>
        </div>
        <div class="reserve-value-v287">
            <span>GUARDADO AGORA</span>
            <strong id="reserveBalanceV287">R$ 0,00</strong>
            <small>continua no seu patrimônio</small>
        </div>
        <div class="reserve-actions-v287">
            <button class="reserve-save-v287" type="button" data-reserve-action="save"><span>+</span> Guardar</button>
            <button class="reserve-redeem-v287" type="button" data-reserve-action="redeem">↙ Resgatar</button>
        </div>
        <div class="reserve-totals-v287">
            <span>DISPONÍVEL <b id="reserveAvailableV287">R$ 0,00</b></span>
            <i aria-hidden="true"></i>
            <span>PATRIMÔNIO <b id="reservePatrimonyV287">R$ 0,00</b></span>
        </div>
    `;
    accounts.insertAdjacentElement("afterend", panel);
    return panel;
}

function ensureDialog() {
    let dialog = $("#reserveDialogV287");
    if (dialog) return dialog;

    dialog = document.createElement("dialog");
    dialog.id = "reserveDialogV287";
    dialog.className = "modal reserve-dialog-v287";
    dialog.innerHTML = `
        <form class="modal-sheet compact-sheet reserve-sheet-v287" id="reserveFormV287">
            <div class="modal-header">
                <div>
                    <span id="reserveDialogKickerV287">RESERVA / MOVIMENTO NEUTRO</span>
                    <h2 id="reserveDialogTitleV287">Guardar dinheiro</h2>
                </div>
                <button class="modal-close" type="button" data-reserve-close aria-label="Fechar">×</button>
            </div>
            <input type="hidden" id="reserveDirectionV287" value="save">
            <input type="hidden" id="reserveSeriesIdV287">
            <div class="reserve-direction-v287" aria-live="polite">
                <span id="reserveDirectionFromV287">CONTA</span>
                <i aria-hidden="true">→</i>
                <strong id="reserveDirectionToV287">RESERVA</strong>
            </div>
            <div class="form-grid">
                <label class="form-field form-field-wide">
                    <span id="reserveAccountLabelV287">DE QUAL CONTA</span>
                    <select id="reserveAccountV287" required></select>
                </label>
                <label class="form-field">
                    <span>VALOR</span>
                    <span class="money-field"><b>R$</b><input type="number" id="reserveAmountV287" min="0.01" step="0.01" inputmode="decimal" placeholder="0,00" required></span>
                </label>
                <label class="form-field">
                    <span>DATA</span>
                    <input type="date" id="reserveDateV287" required>
                </label>
                <label class="form-field form-field-wide">
                    <span>NOTA / OPCIONAL</span>
                    <input type="text" id="reserveDescriptionV287" maxlength="80" placeholder="Ex.: segurança do mês">
                </label>
                <p class="reserve-notice-v287"><strong>Não é entrada nem saída.</strong> Guardar tira do saldo disponível; resgatar devolve. O patrimônio e o resultado do mês não mudam.</p>
                <p class="reserve-error-v287" id="reserveErrorV287" role="alert" hidden></p>
            </div>
            <div class="modal-actions">
                <button class="paper-button" type="button" data-reserve-close>Cancelar</button>
                <button class="ink-button" id="reserveSubmitV287" type="submit">Guardar na Reserva →</button>
            </div>
        </form>
    `;
    document.body.appendChild(dialog);

    dialog.querySelectorAll("[data-reserve-close]").forEach((button) => {
        button.addEventListener("click", () => dialog.close());
    });
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
        state.editingSeriesId = null;
        setError("");
    });
    $("#reserveFormV287")?.addEventListener("submit", handleSubmit);
    return dialog;
}

function setError(message) {
    const target = $("#reserveErrorV287");
    if (!target) return;
    target.textContent = message;
    target.hidden = !message;
}

function setBusy(busy) {
    const button = $("#reserveSubmitV287");
    if (!button) return;
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? "MOVENDO O VALOR..." : button.dataset.label;
}

function renderPanel() {
    const panel = ensurePanel();
    if (!panel) return;
    const totals = financialState();
    $("#reserveBalanceV287").textContent = currency.format(totals.reserve);
    $("#reserveAvailableV287").textContent = currency.format(totals.available);
    $("#reservePatrimonyV287").textContent = currency.format(totals.total);
    const redeem = panel.querySelector('[data-reserve-action="redeem"]');
    if (redeem) {
        redeem.disabled = totals.reserve <= 0;
        redeem.title = totals.reserve <= 0 ? "Guarde um valor antes de resgatar." : "Trazer dinheiro de volta ao saldo disponível";
    }
}

function transactionsWithoutEditing() {
    if (!state.editingSeriesId) return state.transactions;
    return state.transactions.filter((transaction) => transaction.seriesId !== state.editingSeriesId);
}

function renderAccountOptions(direction, selectedMethod) {
    const select = $("#reserveAccountV287");
    if (!select) return;
    const totals = financialState(transactionsWithoutEditing());
    select.innerHTML = ACCOUNT_METHOD_VALUES.map((method) => {
        const detail = direction === RESERVE_DIRECTIONS.SAVE
            ? ` — ${currency.format(totals.balances[method] || 0)} disponível`
            : "";
        return `<option value="${escapeHTML(method)}">${escapeHTML(accountNameForMethod(method))}${escapeHTML(detail)}</option>`;
    }).join("");
    select.value = ACCOUNT_METHOD_VALUES.includes(selectedMethod) ? selectedMethod : ACCOUNT_METHOD_VALUES[0];
}

function pairForSeries(seriesId) {
    return seriesId ? getTransferPair(state.transactions, seriesId) : null;
}

function configureDialog(direction, pair = null) {
    const editingDirection = reserveDirectionForPair(pair);
    const finalDirection = editingDirection || direction;
    const accountMethod = reserveAccountForPair(pair) || ACCOUNT_METHOD_VALUES[0];
    state.editingSeriesId = pair?.seriesId || null;

    $("#reserveFormV287")?.reset();
    $("#reserveDirectionV287").value = finalDirection;
    $("#reserveSeriesIdV287").value = pair?.seriesId || "";
    $("#reserveDialogTitleV287").textContent = pair?.complete
        ? (finalDirection === RESERVE_DIRECTIONS.SAVE ? "Editar valor guardado" : "Editar resgate")
        : (finalDirection === RESERVE_DIRECTIONS.SAVE ? "Guardar dinheiro" : "Resgatar dinheiro");
    $("#reserveDialogKickerV287").textContent = finalDirection === RESERVE_DIRECTIONS.SAVE
        ? "RESERVA / TIRAR DO SALDO"
        : "RESERVA / VOLTAR AO SALDO";
    $("#reserveDirectionFromV287").textContent = finalDirection === RESERVE_DIRECTIONS.SAVE ? "CONTA" : "RESERVA";
    $("#reserveDirectionToV287").textContent = finalDirection === RESERVE_DIRECTIONS.SAVE ? "RESERVA" : "CONTA";
    $("#reserveAccountLabelV287").textContent = finalDirection === RESERVE_DIRECTIONS.SAVE ? "DE QUAL CONTA" : "PARA QUAL CONTA";
    renderAccountOptions(finalDirection, accountMethod);
    $("#reserveAmountV287").value = pair?.outgoing?.amount || "";
    $("#reserveDateV287").value = pair?.outgoing?.date || todayKey();
    $("#reserveDescriptionV287").value = pair?.outgoing?.description || "";
    const submit = $("#reserveSubmitV287");
    submit.textContent = finalDirection === RESERVE_DIRECTIONS.SAVE ? "Guardar na Reserva →" : "Resgatar para o saldo →";
    submit.dataset.label = submit.textContent;
    setError("");
}

function openDialog(direction, seriesId = null, pairOverride = null) {
    const dialog = ensureDialog();
    const pair = pairOverride || pairForSeries(seriesId);
    configureDialog(direction, pair?.complete ? pair : null);
    dialog.showModal();
    window.setTimeout(() => $("#reserveAmountV287")?.focus(), 80);
}

function validationMessage(validation, direction, accountMethod, amount, totals) {
    if (validation.code === "insufficient_account") {
        return `Você tentou guardar ${currency.format(amount)}, mas ${accountNameForMethod(accountMethod)} tem ${currency.format(totals.balances[accountMethod] || 0)} disponível.`;
    }
    if (validation.code === "insufficient_reserve") {
        return `Você tentou resgatar ${currency.format(amount)}, mas há ${currency.format(totals.reserve)} na Reserva.`;
    }
    return validation.message;
}

async function handleSubmit(event) {
    event.preventDefault();
    if (!state.user?.id) return;

    const direction = $("#reserveDirectionV287").value;
    const accountMethod = $("#reserveAccountV287").value;
    const amount = Number($("#reserveAmountV287").value);
    const baseTransactions = transactionsWithoutEditing();
    const totals = financialState(baseTransactions);
    const validation = validateReserveOperation({ direction, accountMethod, amount }, totals);
    if (!validation.valid) {
        setError(validationMessage(validation, direction, accountMethod, amount, totals));
        $("#reserveAmountV287")?.focus();
        return;
    }

    const existing = pairForSeries(state.editingSeriesId);
    const pair = buildReserveTransfer({
        seriesId: state.editingSeriesId,
        outgoingId: existing?.outgoing?.id,
        incomingId: existing?.incoming?.id,
        direction,
        accountMethod,
        amount: validation.amount,
        date: $("#reserveDateV287").value,
        description: $("#reserveDescriptionV287").value
    });
    if (!pair) {
        setError("Revise conta, valor e data.");
        return;
    }

    setBusy(true);
    setSyncState("busy");
    try {
        const saved = await saveInternalTransferPair(state.user.id, pair);
        state.transactions = [
            ...baseTransactions,
            ...saved.map(toTransaction)
        ];
        renderPanel();
        $("#reserveDialogV287")?.close();
        setSyncState("ok");
        showToast(direction === RESERVE_DIRECTIONS.SAVE
            ? `${currency.format(validation.amount)} saiu do saldo disponível e foi para a Reserva.`
            : `${currency.format(validation.amount)} voltou da Reserva para ${accountNameForMethod(accountMethod)}.`);
        window.dispatchEvent(new CustomEvent("folego:transactions-updated", { detail: { source: "reserve" } }));
    } catch (error) {
        console.error("Fôlego não conseguiu movimentar a Reserva:", error);
        setSyncState("error");
        setError(error?.message || "Não foi possível movimentar a Reserva.");
        showToast("A Reserva não foi atualizada. Tente novamente.", "error");
    } finally {
        setBusy(false);
    }
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
        renderPanel();
    } catch (error) {
        console.error("Fôlego não conseguiu carregar a Reserva:", error);
    } finally {
        state.loading = false;
    }
}

document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-reserve-action]");
    if (!button) return;
    openDialog(button.dataset.reserveAction === "redeem" ? RESERVE_DIRECTIONS.REDEEM : RESERVE_DIRECTIONS.SAVE);
});

window.addEventListener("folego:open-reserve-dialog", (event) => {
    openDialog(RESERVE_DIRECTIONS.SAVE, event.detail?.seriesId || null, event.detail?.pair || null);
});
window.addEventListener("folego:transactions-updated", loadTransactions);
window.addEventListener("focus", loadTransactions);

const observer = new MutationObserver(() => {
    if (!$("#accountsOverviewV28")) return;
    observer.disconnect();
    renderPanel();
});
if (!ensurePanel()) observer.observe(document.documentElement, { childList: true, subtree: true });

supabase?.auth.onAuthStateChange((_event, session) => {
    syncUserMetadata(session?.user || null);
    if (session?.user) window.setTimeout(loadTransactions, 0);
    else {
        state.transactions = [];
        renderPanel();
    }
});

supabase?.auth.getSession().then(({ data }) => {
    syncUserMetadata(data.session?.user || null);
    if (data.session?.user) loadTransactions();
});
