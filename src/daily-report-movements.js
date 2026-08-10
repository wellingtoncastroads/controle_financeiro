import { supabase } from "./supabase-client.js";
import {
    collapseInternalTransfers,
    isInternalTransfer,
    POCKET_LABELS,
    summarizeFinancialMovements
} from "./folego-transfer-v27.js";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });

const methodLabels = {
    ...POCKET_LABELS,
    debit_card: "Cartão de débito",
    credit_card: "Cartão de crédito",
    boleto: "Boleto",
    other: "Não informado"
};

const elements = {
    board: document.querySelector("#dailyMovementsBoard"),
    list: document.querySelector("#dailyMovementsList"),
    date: document.querySelector("#dailyMovementsDate"),
    count: document.querySelector("#dailyMovementsCount"),
    income: document.querySelector("#dailyMovementsIncome"),
    expense: document.querySelector("#dailyMovementsExpense"),
    result: document.querySelector("#dailyMovementsResult"),
    referenceDate: document.querySelector("#reportReferenceDate")
};

let requestId = 0;

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function activeMode() {
    return document.querySelector('[data-report-period].active')?.dataset.reportPeriod || "month";
}

function formatDate(value, formatter = dateFormatter) {
    return formatter.format(new Date(`${value}T12:00:00`)).replaceAll(" de ", " ");
}

function paymentMethodOf(row) {
    return row.paymentMethod ?? row.payment_method ?? "other";
}

function seriesKindOf(row) {
    return row.seriesKind ?? row.series_kind ?? null;
}

function installmentNumberOf(row) {
    return row.installmentNumber ?? row.installment_number ?? null;
}

function installmentTotalOf(row) {
    return row.installmentTotal ?? row.installment_total ?? null;
}

function occurredOnOf(row) {
    return row.date ?? row.occurred_on;
}

function movementType(row) {
    return isInternalTransfer(row) ? "transfer" : row.type;
}

function signedValue(row) {
    const type = movementType(row);
    if (type === "transfer") return `↔ ${currency.format(Number(row.amount) || 0)}`;
    return `${type === "income" ? "+" : "−"} ${currency.format(Number(row.amount) || 0)}`;
}

function movementDetails(row) {
    if (movementType(row) === "transfer") {
        const from = methodLabels[row.transferFrom] || methodLabels[paymentMethodOf(row)] || methodLabels.other;
        const to = methodLabels[row.transferTo];
        return to ? `Transferência entre contas • ${from} → ${to}` : `Transferência entre contas • ${from}`;
    }

    const installmentNumber = installmentNumberOf(row);
    const installmentTotal = installmentTotalOf(row);
    const installment = seriesKindOf(row) === "installment" && installmentNumber && installmentTotal
        ? ` • parcela ${installmentNumber}/${installmentTotal}`
        : "";
    return `${row.category} • ${methodLabels[paymentMethodOf(row)] || methodLabels.other}${installment}`;
}

function setVisible(visible) {
    if (elements.board) elements.board.hidden = !visible;
}

function renderEmpty(date) {
    elements.list.innerHTML = `
        <div class="daily-movements-empty">
            <span>—</span>
            <strong>Nenhum movimento neste dia</strong>
            <p>Não há entradas, saídas ou parcelas registradas em ${escapeHTML(formatDate(date))}.</p>
        </div>
    `;
}

function renderRows(rows) {
    elements.list.innerHTML = rows.map((row, index) => {
        const pending = row.status !== "paid";
        const type = movementType(row);
        return `
            <article class="daily-movement-item ${type} ${pending ? "pending" : ""}">
                <span class="daily-movement-index">${String(index + 1).padStart(2, "0")}</span>
                <div class="daily-movement-copy">
                    <strong>${escapeHTML(row.description)}</strong>
                    <small>${escapeHTML(movementDetails(row))}</small>
                </div>
                <div class="daily-movement-status">
                    <span>${escapeHTML(formatDate(occurredOnOf(row), shortDateFormatter).toUpperCase())}</span>
                    <small>${pending ? "PENDENTE" : "CONFIRMADO"}</small>
                </div>
                <strong class="daily-movement-value">${escapeHTML(signedValue(row))}</strong>
            </article>
        `;
    }).join("");
}

async function loadDay() {
    if (!elements.board || !elements.referenceDate || activeMode() !== "day") {
        setVisible(false);
        return;
    }

    const selectedDate = elements.referenceDate.value;
    if (!selectedDate || !supabase) {
        setVisible(false);
        return;
    }

    setVisible(true);
    elements.date.textContent = formatDate(selectedDate).toUpperCase();
    elements.list.innerHTML = '<div class="daily-movements-empty">Abrindo os movimentos do dia...</div>';

    const currentRequest = ++requestId;
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user || currentRequest !== requestId) return;

    const { data, error } = await supabase
        .from("transactions")
        .select("id,description,amount,type,category,occurred_on,status,payment_method,series_id,series_kind,installment_number,installment_total,created_at")
        .eq("user_id", user.id)
        .eq("occurred_on", selectedDate)
        .order("created_at", { ascending: false });

    if (currentRequest !== requestId) return;
    if (error) {
        elements.list.innerHTML = '<div class="daily-movements-empty">Não foi possível abrir os movimentos agora.</div>';
        return;
    }

    const rows = data || [];
    const displayRows = collapseInternalTransfers(rows);
    const { income, expense, result } = summarizeFinancialMovements(rows);

    elements.count.textContent = `${displayRows.length} ${displayRows.length === 1 ? "movimento" : "movimentos"}`;
    elements.income.textContent = currency.format(income);
    elements.expense.textContent = currency.format(expense);
    elements.result.textContent = currency.format(result);
    elements.result.classList.toggle("negative", result < 0);

    if (!displayRows.length) renderEmpty(selectedDate);
    else renderRows(displayRows);
}

function scheduleLoad() {
    window.setTimeout(loadDay, 0);
}

document.querySelectorAll("[data-report-period]").forEach((button) => {
    button.addEventListener("click", scheduleLoad);
});

elements.referenceDate?.addEventListener("change", loadDay);
supabase?.auth.onAuthStateChange((_event, session) => {
    if (session?.user) window.setTimeout(loadDay, 300);
});
window.addEventListener("folego:data-changed", loadDay);
window.setTimeout(loadDay, 800);
