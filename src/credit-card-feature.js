import { supabase } from "./supabase-client.js";

const CARD_META_KEY = "folego_credit_card_v1";
const RETURN_VIEW_KEY = "folego-credit-return-view";
const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const requestedCardsView = window.location.hash === "#cards";

const elements = {
    appShell: document.querySelector("#appShell"),
    cardsView: document.querySelector("#cardsView"),
    pageTitle: document.querySelector("#pageTitle"),
    transactionDialog: document.querySelector("#transactionDialog"),
    transactionForm: document.querySelector("#transactionForm"),
    transactionId: document.querySelector("#transactionId"),
    transactionDescription: document.querySelector("#transactionDescription"),
    transactionAmount: document.querySelector("#transactionAmount"),
    transactionCategory: document.querySelector("#transactionCategory"),
    transactionDate: document.querySelector("#transactionDate"),
    transactionStatus: document.querySelector("#transactionStatus"),
    transactionPaymentMethod: document.querySelector("#transactionPaymentMethod"),
    transactionModeField: document.querySelector("#transactionModeField"),
    recurringFields: document.querySelector("#recurringFields"),
    installmentFields: document.querySelector("#installmentFields"),
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
    toast: document.querySelector("#toast"),
    toastMessage: document.querySelector("#toastMessage")
};

let toastTimer = null;
let activeUser = null;
let currentCard = null;
let currentTransactions = [];

function formatCurrency(value) {
    return currencyFormatter.format(Number(value) || 0);
}

function monthKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
}

function formatMonth(value) {
    const [year, month] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
        .format(new Date(year, month - 1, 1));
}

function formatDate(value) {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
        .format(new Date(`${value}T12:00:00`))
        .replace(" de ", " ");
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
    if (!elements.toast || !elements.toastMessage) return;
    window.clearTimeout(toastTimer);
    elements.toastMessage.textContent = message;
    elements.toast.dataset.type = type;
    elements.toast.querySelector(".toast-icon").textContent = type === "error" ? "×" : type === "warning" ? "!" : "✓";
    elements.toast.classList.add("show");
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 3600);
}

function cleanCard(value) {
    if (!value || typeof value !== "object") return null;
    const name = String(value.name || "").trim().replace(/\s+/g, " ").slice(0, 40);
    const limit = Math.round((Number(value.limit) || 0) * 100) / 100;
    const closingDay = Math.min(28, Math.max(1, Number.parseInt(value.closingDay, 10) || 10));
    const dueDay = Math.min(28, Math.max(1, Number.parseInt(value.dueDay, 10) || 17));
    if (!name || limit <= 0) return null;
    return { name, limit, closingDay, dueDay, updatedAt: new Date().toISOString() };
}

async function loadUser() {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    activeUser = data.user;
    currentCard = cleanCard(activeUser?.user_metadata?.[CARD_META_KEY]);
    return activeUser;
}

async function saveCard(card) {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data, error } = await supabase.auth.updateUser({ data: { [CARD_META_KEY]: card } });
    if (error) throw error;
    activeUser = data.user;
    currentCard = cleanCard(data.user?.user_metadata?.[CARD_META_KEY]);
}

async function loadCreditTransactions() {
    if (!supabase || !activeUser) return [];
    const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", activeUser.id)
        .eq("payment_method", "credit_card")
        .order("occurred_on", { ascending: true });
    if (error) throw error;
    currentTransactions = data || [];
    return currentTransactions;
}

function sum(rows) {
    return rows.reduce((total, row) => total + Number(row.amount || 0), 0);
}

function monthWithOffset(value, offset) {
    const [year, month] = value.split("-").map(Number);
    const date = new Date(year, month - 1 + offset, 1, 12);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dateAtMonthDay(value, day) {
    const [year, month] = value.split("-").map(Number);
    const lastDay = new Date(year, month, 0, 12).getDate();
    return `${value}-${String(Math.min(lastDay, Math.max(1, day))).padStart(2, "0")}`;
}

function firstInvoiceMonth(purchaseDate, card) {
    let invoiceMonth = purchaseDate.slice(0, 7);
    if (Number(purchaseDate.slice(8, 10)) > card.closingDay) {
        invoiceMonth = monthWithOffset(invoiceMonth, 1);
    }
    if (dateAtMonthDay(invoiceMonth, card.dueDay) < purchaseDate) {
        invoiceMonth = monthWithOffset(invoiceMonth, 1);
    }
    return invoiceMonth;
}

function splitInstallments(total, count) {
    const totalCents = Math.round(Number(total) * 100);
    const base = Math.floor(totalCents / count);
    const remainder = totalCents % count;
    return Array.from({ length: count }, (_, index) => (base + (index < remainder ? 1 : 0)) / 100);
}

function populatePaymentMethods() {
    if (!elements.transactionPaymentMethod || !elements.transactionForm) return;
    const type = elements.transactionForm.querySelector('input[name="transactionType"]:checked')?.value || "expense";
    const previous = elements.transactionPaymentMethod.value;
    const methods = type === "income"
        ? [["pix", "Pix"], ["cash", "Espécie"]]
        : [
            ["pix", "Pix"],
            ["cash", "Espécie"],
            ["debit_card", "Cartão de débito"],
            ["credit_card", "Cartão de crédito (parcela)"]
        ];

    elements.transactionPaymentMethod.innerHTML = methods
        .map(([value, label]) => `<option value="${value}">${label}</option>`)
        .join("");
    elements.transactionPaymentMethod.value = methods.some(([value]) => value === previous)
        ? previous
        : methods[0][0];
}

function syncCreditPurchaseFields() {
    if (!elements.transactionForm) return;
    const type = elements.transactionForm.querySelector('input[name="transactionType"]:checked')?.value || "expense";
    const editing = Boolean(elements.transactionId?.value);
    const isCredit = type === "expense"
        && elements.transactionPaymentMethod?.value === "credit_card"
        && !editing;

    if (elements.creditPurchaseFields) elements.creditPurchaseFields.hidden = !isCredit;
    if (elements.transactionModeField) elements.transactionModeField.hidden = isCredit;
    const statusField = elements.transactionStatus?.closest(".form-field");
    if (statusField) statusField.hidden = isCredit;

    if (isCredit) {
        if (elements.recurringFields) elements.recurringFields.hidden = true;
        if (elements.installmentFields) elements.installmentFields.hidden = true;
        if (elements.creditInstallmentCount) elements.creditInstallmentCount.required = true;
    } else if (elements.creditInstallmentCount) {
        elements.creditInstallmentCount.required = false;
    }
}

async function restoreEditedPaymentMethod() {
    const id = elements.transactionId?.value;
    if (!id || !supabase || !activeUser) return;
    const { data, error } = await supabase
        .from("transactions")
        .select("payment_method")
        .eq("id", id)
        .eq("user_id", activeUser.id)
        .maybeSingle();
    if (error || !data) return;
    populatePaymentMethods();
    const optionExists = [...elements.transactionPaymentMethod.options]
        .some((option) => option.value === data.payment_method);
    if (optionExists) elements.transactionPaymentMethod.value = data.payment_method;
    syncCreditPurchaseFields();
}

function openCardDialog() {
    if (!elements.creditCardDialog) return;
    elements.creditCardForm.reset();
    elements.creditCardModalTitle.textContent = currentCard ? "Editar cartão" : "Adicionar cartão";
    elements.creditCardName.value = currentCard?.name || "";
    elements.creditCardLimit.value = currentCard?.limit || "";
    elements.creditCardClosingDay.value = currentCard?.closingDay || 10;
    elements.creditCardDueDay.value = currentCard?.dueDay || 17;
    elements.creditCardDialog.showModal();
    window.setTimeout(() => elements.creditCardName.focus(), 80);
}

async function handleCardSubmit(event) {
    event.preventDefault();
    const card = cleanCard({
        name: elements.creditCardName.value,
        limit: elements.creditCardLimit.value,
        closingDay: elements.creditCardClosingDay.value,
        dueDay: elements.creditCardDueDay.value
    });
    if (!card) {
        showToast("Revise o nome, o limite e as datas do cartão.", "warning");
        return;
    }

    const button = elements.creditCardForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
        await saveCard(card);
        elements.creditCardDialog.close();
        await renderCards();
        showToast("Cartão e limite atualizados.");
    } catch (error) {
        showToast(error?.message || "Não foi possível salvar o cartão.", "error");
    } finally {
        button.disabled = false;
    }
}

async function deleteCard() {
    if (!currentCard || !supabase) return;
    const pending = currentTransactions.filter((row) => row.status === "pending");
    if (pending.length) {
        showToast("Pague ou exclua as parcelas abertas antes de remover o cartão.", "warning");
        return;
    }
    if (!window.confirm(`Remover o cartão “${currentCard.name}”? O histórico pago continuará no extrato.`)) return;
    try {
        const { data, error } = await supabase.auth.updateUser({ data: { [CARD_META_KEY]: null } });
        if (error) throw error;
        activeUser = data.user;
        currentCard = null;
        await renderCards();
        showToast("Cartão removido.");
    } catch (error) {
        showToast(error?.message || "Não foi possível remover o cartão.", "error");
    }
}

async function handleCreditPurchase(event) {
    if (event.target !== elements.transactionForm) return;
    const type = elements.transactionForm.querySelector('input[name="transactionType"]:checked')?.value;
    const method = elements.transactionPaymentMethod?.value;
    const editing = Boolean(elements.transactionId?.value);
    if (type !== "expense" || method !== "credit_card" || editing) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (!currentCard) {
        showToast("Adicione o cartão e o limite antes da primeira compra.", "warning");
        openCardDialog();
        return;
    }

    const description = elements.transactionDescription.value.trim().replace(/\s+/g, " ").slice(0, 80);
    const amount = Number(elements.transactionAmount.value);
    const category = elements.transactionCategory.value;
    const purchaseDate = elements.transactionDate.value;
    const count = Math.min(120, Math.max(1, Number.parseInt(elements.creditInstallmentCount.value, 10) || 1));

    if (!description || !Number.isFinite(amount) || amount <= 0 || !category || !purchaseDate) {
        showToast("Revise descrição, valor, grupo e data.", "warning");
        return;
    }

    const button = elements.transactionForm.querySelector('button[type="submit"]');
    button.disabled = true;

    try {
        const values = splitInstallments(amount, count);
        const invoiceMonth = firstInvoiceMonth(purchaseDate, currentCard);
        const seriesId = count > 1 ? crypto.randomUUID() : null;
        const rows = values.map((installmentAmount, index) => ({
            user_id: activeUser.id,
            description,
            amount: installmentAmount,
            type: "expense",
            category,
            occurred_on: dateAtMonthDay(monthWithOffset(invoiceMonth, index), currentCard.dueDay),
            status: "pending",
            payment_method: "credit_card",
            series_id: seriesId,
            series_kind: count > 1 ? "installment" : null,
            installment_number: count > 1 ? index + 1 : null,
            installment_total: count > 1 ? count : null
        }));

        const { error } = await supabase.from("transactions").insert(rows);
        if (error) throw error;

        sessionStorage.setItem(RETURN_VIEW_KEY, window.location.hash || "#dashboard");
        elements.transactionDialog.close();
        showToast(count > 1 ? `Compra registrada em ${count} parcelas.` : "Compra adicionada à fatura.");
        window.setTimeout(() => window.location.reload(), 550);
    } catch (error) {
        showToast(error?.message || "Não foi possível registrar a compra.", "error");
        button.disabled = false;
    }
}

function showCardsView(updateHistory = true) {
    document.querySelectorAll("[data-view-section]").forEach((section) => {
        section.classList.toggle("active", section.dataset.viewSection === "cards");
    });
    document.querySelectorAll(".rail-link[data-view]").forEach((button) => {
        const active = button.dataset.view === "cards";
        button.classList.toggle("active", active);
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
    });
    if (elements.pageTitle) elements.pageTitle.textContent = "Cartão e faturas";
    if (updateHistory) history.replaceState(null, "", "#cards");
    window.scrollTo({ top: 0, behavior: "smooth" });
    renderCards();
}

function renderEmptyCard() {
    elements.cardTotalLimit.textContent = formatCurrency(0);
    elements.cardUsedLimit.textContent = formatCurrency(0);
    elements.cardAvailableLimit.textContent = formatCurrency(0);
    elements.cardCurrentInvoice.textContent = formatCurrency(0);
    elements.cardInvoiceCaption.textContent = "adicione o cartão";
    elements.creditCardPanel.innerHTML = `
        <div class="credit-card-empty">
            <span>04</span>
            <strong>Crédito ainda sem página</strong>
            <p>Adicione o cartão, informe o limite, o fechamento e o vencimento.</p>
            <button class="ink-button" type="button" data-card-create><span>+</span> Adicionar cartão</button>
        </div>
    `;
    elements.invoiceOpenTotal.textContent = formatCurrency(0);
    elements.invoicePurchaseCount.textContent = "0 parcelas";
    elements.invoiceList.innerHTML = '<div class="credit-invoice-empty">Nenhuma fatura para mostrar.</div>';
    elements.payInvoiceButton.disabled = true;
}

async function renderCards() {
    if (!elements.cardsView) return;
    if (!activeUser) await loadUser();
    if (!activeUser) return;

    if (!elements.invoiceMonthFilter.value) {
        elements.invoiceMonthFilter.value = monthKey();
    }

    try {
        await loadCreditTransactions();
    } catch (error) {
        showToast("Não foi possível carregar as faturas.", "error");
        return;
    }

    if (!currentCard) {
        renderEmptyCard();
        return;
    }

    const selectedMonth = elements.invoiceMonthFilter.value || monthKey();
    const pending = currentTransactions.filter((row) => row.status === "pending");
    const used = sum(pending);
    const available = currentCard.limit - used;
    const invoiceRows = pending.filter((row) => String(row.occurred_on).slice(0, 7) === selectedMonth);
    const invoiceTotal = sum(invoiceRows);
    const ratio = currentCard.limit > 0 ? used / currentCard.limit : 0;
    const status = ratio > 1 ? "exceeded" : ratio >= 0.8 ? "warning" : "safe";

    elements.cardTotalLimit.textContent = formatCurrency(currentCard.limit);
    elements.cardUsedLimit.textContent = formatCurrency(used);
    elements.cardAvailableLimit.textContent = formatCurrency(available);
    elements.cardAvailableLimit.classList.toggle("negative", available < 0);
    elements.cardCurrentInvoice.textContent = formatCurrency(invoiceTotal);
    elements.cardInvoiceCaption.textContent = `${formatMonth(selectedMonth)} / em aberto`;

    elements.creditCardPanel.innerHTML = `
        <article class="credit-card-sheet ${status}">
            <header>
                <span>CRÉDITO / ${escapeHTML(currentCard.name.toUpperCase())}</span>
                <b>FÔLEGO®</b>
            </header>
            <div class="credit-card-available">
                <span>LIMITE DISPONÍVEL</span>
                <strong class="${available < 0 ? "negative" : ""}">${escapeHTML(formatCurrency(available))}</strong>
            </div>
            <div class="credit-limit-track"><i style="width:${Math.min(100, Math.max(0, ratio * 100))}%"></i></div>
            <dl>
                <div><dt>LIMITE</dt><dd>${escapeHTML(formatCurrency(currentCard.limit))}</dd></div>
                <div><dt>USADO</dt><dd>${escapeHTML(formatCurrency(used))}</dd></div>
                <div><dt>FATURA ATUAL</dt><dd>${escapeHTML(formatCurrency(invoiceTotal))}</dd></div>
            </dl>
            <footer>
                <span>FECHA DIA ${String(currentCard.closingDay).padStart(2, "0")} / VENCE DIA ${String(currentCard.dueDay).padStart(2, "0")}</span>
                <div>
                    <button type="button" data-card-edit>EDITAR</button>
                    <button type="button" data-card-delete>REMOVER</button>
                </div>
            </footer>
        </article>
    `;

    elements.invoiceOpenTotal.textContent = formatCurrency(invoiceTotal);
    elements.invoicePurchaseCount.textContent = `${invoiceRows.length} ${invoiceRows.length === 1 ? "parcela" : "parcelas"}`;
    elements.payInvoiceButton.disabled = invoiceRows.length === 0;
    elements.invoiceList.innerHTML = invoiceRows.length
        ? invoiceRows.map((row) => `
            <div class="credit-invoice-row">
                <span>${escapeHTML(formatDate(row.occurred_on))}</span>
                <div>
                    <strong>${escapeHTML(row.description)}</strong>
                    <small>${escapeHTML(row.category)}${row.installment_total ? ` • ${row.installment_number}/${row.installment_total}` : ""}</small>
                </div>
                <b>${escapeHTML(formatCurrency(row.amount))}</b>
            </div>
        `).join("")
        : '<div class="credit-invoice-empty">Nenhuma parcela aberta nesta fatura.</div>';
}

async function payInvoice() {
    if (!currentCard || !activeUser) return;
    const selectedMonth = elements.invoiceMonthFilter.value || monthKey();
    const rows = currentTransactions.filter((row) => (
        row.status === "pending"
        && String(row.occurred_on).slice(0, 7) === selectedMonth
    ));
    if (!rows.length) return;
    const total = sum(rows);

    if (!window.confirm(
        `Marcar a fatura de ${formatMonth(selectedMonth)} no valor de ${formatCurrency(total)} como paga? O valor será descontado do saldo digital.`
    )) return;

    elements.payInvoiceButton.disabled = true;
    try {
        const { error } = await supabase
            .from("transactions")
            .update({ status: "paid" })
            .in("id", rows.map((row) => row.id))
            .eq("user_id", activeUser.id);
        if (error) throw error;
        sessionStorage.setItem(RETURN_VIEW_KEY, "#cards");
        showToast("Fatura paga e descontada do saldo digital.");
        window.setTimeout(() => window.location.reload(), 550);
    } catch (error) {
        showToast(error?.message || "Não foi possível pagar a fatura.", "error");
        elements.payInvoiceButton.disabled = false;
    }
}

function bindEvents() {
    document.querySelectorAll('[data-view="cards"]').forEach((button) => {
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            showCardsView();
        }, true);
    });

    elements.newCreditCardButton?.addEventListener("click", openCardDialog);
    elements.creditCardForm?.addEventListener("submit", handleCardSubmit);
    elements.creditCardDialog?.addEventListener("click", (event) => {
        if (event.target === elements.creditCardDialog) elements.creditCardDialog.close();
    });

    elements.creditCardPanel?.addEventListener("click", (event) => {
        if (event.target.closest("[data-card-create], [data-card-edit]")) openCardDialog();
        if (event.target.closest("[data-card-delete]")) deleteCard();
    });

    elements.invoiceMonthFilter?.addEventListener("change", renderCards);
    elements.payInvoiceButton?.addEventListener("click", payInvoice);

    elements.transactionForm?.addEventListener("submit", handleCreditPurchase, true);
    elements.transactionPaymentMethod?.addEventListener("change", syncCreditPurchaseFields);
    elements.transactionForm?.querySelectorAll('input[name="transactionType"]').forEach((input) => {
        input.addEventListener("change", () => {
            window.setTimeout(() => {
                populatePaymentMethods();
                syncCreditPurchaseFields();
            }, 0);
        });
    });

    if (elements.transactionDialog) {
        const observer = new MutationObserver(() => {
            if (!elements.transactionDialog.open) return;
            populatePaymentMethods();
            syncCreditPurchaseFields();
            restoreEditedPaymentMethod();
        });
        observer.observe(elements.transactionDialog, { attributes: true, attributeFilter: ["open"] });
    }

    document.addEventListener("click", (event) => {
        const opener = event.target.closest("#topbarNewTransaction, #bannerNewTransaction, #pageNewTransaction");
        if (!opener) return;
        window.setTimeout(() => {
            populatePaymentMethods();
            syncCreditPurchaseFields();
        }, 100);
    });
}

async function boot() {
    bindEvents();
    await loadUser();

    const returnView = sessionStorage.getItem(RETURN_VIEW_KEY);
    if (returnView) {
        sessionStorage.removeItem(RETURN_VIEW_KEY);
        history.replaceState(null, "", returnView);
    }

    const revealCards = () => {
        if (elements.appShell?.hidden) return false;
        if (requestedCardsView || window.location.hash === "#cards") showCardsView(false);
        return true;
    };

    if (!revealCards() && elements.appShell) {
        const observer = new MutationObserver(() => {
            if (revealCards()) observer.disconnect();
        });
        observer.observe(elements.appShell, { attributes: true, attributeFilter: ["hidden"] });
    }
}

boot();