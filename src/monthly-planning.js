import { supabase } from "./supabase-client.js";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

const elements = {
    appShell: document.querySelector("#appShell"),
    planningView: document.querySelector("#planningView"),
    month: document.querySelector("#planningMonth"),
    monthState: document.querySelector("#planningMonthState"),
    budgetButton: document.querySelector("#planningBudgetButton"),
    openingBalance: document.querySelector("#planningOpeningBalance"),
    actualResult: document.querySelector("#planningActualResult"),
    actualCaption: document.querySelector("#planningActualCaption"),
    commitments: document.querySelector("#planningCommitments"),
    commitmentsCaption: document.querySelector("#planningCommitmentsCaption"),
    closingBalance: document.querySelector("#planningClosingBalance"),
    confidence: document.querySelector("#planningConfidence"),
    routeCount: document.querySelector("#planningRouteCount"),
    routeList: document.querySelector("#planningRouteList"),
    receiptMonth: document.querySelector("#planningReceiptMonth"),
    actualIncome: document.querySelector("#planningActualIncome"),
    remainingIncome: document.querySelector("#planningRemainingIncome"),
    actualExpense: document.querySelector("#planningActualExpense"),
    remainingExpense: document.querySelector("#planningRemainingExpense"),
    projectedResult: document.querySelector("#planningProjectedResult"),
    budgetList: document.querySelector("#planningBudgetList"),
    simulatorForm: document.querySelector("#planningSimulatorForm"),
    simulationType: document.querySelector("#planningSimulationType"),
    simulationAmount: document.querySelector("#planningSimulationAmount"),
    simulationInstallments: document.querySelector("#planningSimulationInstallments"),
    simulationStartMonth: document.querySelector("#planningSimulationStartMonth"),
    simulationBefore: document.querySelector("#planningSimulationBefore"),
    simulationAfter: document.querySelector("#planningSimulationAfter"),
    simulationCaption: document.querySelector("#planningSimulationCaption"),
    simulationSchedule: document.querySelector("#planningSimulationSchedule"),
    globalMonth: document.querySelector("#monthFilter"),
    budgetDialog: document.querySelector("#budgetDialog"),
    budgetMonth: document.querySelector("#budgetMonth"),
    transactionDialog: document.querySelector("#transactionDialog")
};

let activeUserId = null;
let transactions = [];
let budgets = [];
let currentSummary = null;
let loadSequence = 0;

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function localISODate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function currentMonthKey() {
    return localISODate().slice(0, 7);
}

function monthWithOffset(monthKey, offset) {
    const [year, month] = monthKey.split("-").map(Number);
    const date = new Date(year, month - 1 + offset, 1, 12);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthEnd(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    const day = new Date(year, month, 0, 12).getDate();
    return `${monthKey}-${String(day).padStart(2, "0")}`;
}

function monthLabel(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
        .format(new Date(year, month - 1, 1, 12))
        .replace(/^./, (letter) => letter.toUpperCase());
}

function shortMonthLabel(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" })
        .format(new Date(year, month - 1, 1, 12))
        .replace(" de ", " /")
        .toUpperCase();
}

function formatDate(date) {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
        .format(new Date(`${date}T12:00:00`))
        .replace(" de ", " ")
        .toUpperCase();
}

function formatCurrency(value) {
    return currency.format(Number(value) || 0);
}

function signedValue(row) {
    const amount = Number(row.amount) || 0;
    return row.type === "income" ? amount : -amount;
}

function sum(rows, type = null) {
    return rows
        .filter((row) => !type || row.type === type)
        .reduce((total, row) => total + (Number(row.amount) || 0), 0);
}

function splitCurrency(total, count) {
    const safeCount = Math.max(1, Math.min(120, Number.parseInt(count, 10) || 1));
    const cents = Math.max(0, Math.round((Number(total) || 0) * 100));
    const base = Math.floor(cents / safeCount);
    const remainder = cents % safeCount;
    return Array.from({ length: safeCount }, (_, index) => (base + (index < remainder ? 1 : 0)) / 100);
}

function normalizeTransaction(row) {
    return {
        id: row.id,
        description: String(row.description || "Movimentação"),
        amount: Number(row.amount) || 0,
        type: row.type === "income" ? "income" : "expense",
        category: String(row.category || "Sem categoria"),
        date: String(row.occurred_on || ""),
        status: row.status === "paid" ? "paid" : "pending",
        paymentMethod: String(row.payment_method || "other"),
        seriesKind: row.series_kind || null,
        installmentNumber: row.installment_number || null,
        installmentTotal: row.installment_total || null
    };
}

function normalizeBudget(row) {
    return {
        id: row.id,
        month: String(row.month_start || "").slice(0, 7),
        category: String(row.category || "Sem categoria"),
        amount: Number(row.amount) || 0
    };
}

function summarize(month) {
    const today = localISODate();
    const currentMonth = today.slice(0, 7);
    const start = `${month}-01`;
    const end = monthEnd(month);
    const isPast = month < currentMonth;
    const isCurrent = month === currentMonth;

    const balanceToday = transactions
        .filter((row) => row.status === "paid" && row.date <= today)
        .reduce((total, row) => total + signedValue(row), 0);

    const confirmedOpening = transactions
        .filter((row) => row.status === "paid" && row.date < start)
        .reduce((total, row) => total + signedValue(row), 0);

    const bridge = month > currentMonth
        ? transactions.filter((row) => row.date > today && row.date < start)
        : [];
    const openingBalance = month > currentMonth
        ? balanceToday + bridge.reduce((total, row) => total + signedValue(row), 0)
        : confirmedOpening;

    const monthRows = transactions.filter((row) => row.date >= start && row.date <= end && row.category !== "Transferência");
    const realizedRows = monthRows.filter((row) => row.status === "paid" && row.date <= today);
    const remainingRows = isPast ? [] : monthRows.filter((row) => !realizedRows.includes(row));

    const actualIncome = sum(realizedRows, "income");
    const actualExpense = sum(realizedRows, "expense");
    const remainingIncome = sum(remainingRows, "income");
    const remainingExpense = sum(remainingRows, "expense");
    const actualResult = actualIncome - actualExpense;
    const projectedResult = actualResult + remainingIncome - remainingExpense;
    const projectedClosing = openingBalance + projectedResult;

    const budgetProgress = budgets
        .filter((budget) => budget.month === month)
        .map((budget) => {
            const actual = sum(realizedRows.filter((row) => row.type === "expense" && row.category === budget.category));
            const committed = sum(remainingRows.filter((row) => row.type === "expense" && row.category === budget.category));
            const projected = actual + committed;
            const actualRatio = budget.amount > 0 ? actual / budget.amount : 0;
            const projectedRatio = budget.amount > 0 ? projected / budget.amount : 0;
            let status = "safe";
            if (actualRatio > 1) status = "exceeded";
            else if (projectedRatio > 1) status = "forecast-exceeded";
            else if (projectedRatio >= 0.8) status = "warning";
            return {
                ...budget,
                actual,
                committed,
                projected,
                actualRatio,
                projectedRatio,
                remaining: budget.amount - projected,
                status
            };
        })
        .sort((a, b) => b.projectedRatio - a.projectedRatio || b.projected - a.projected);

    const scheduledCount = remainingRows.length;
    const confidence = scheduledCount >= 5 ? "BASE FORTE" : scheduledCount > 0 ? "BASE PARCIAL" : "SEM AGENDA";

    return {
        month,
        isPast,
        isCurrent,
        openingBalance,
        actualIncome,
        actualExpense,
        remainingIncome,
        remainingExpense,
        actualResult,
        projectedResult,
        projectedClosing,
        realizedRows,
        remainingRows: [...remainingRows].sort((a, b) => a.date.localeCompare(b.date)),
        budgets: budgetProgress,
        scheduledCount,
        confidence
    };
}

function methodLabel(row) {
    if (row.paymentMethod === "credit_card") return "CRÉDITO";
    if (row.paymentMethod === "debit_card") return "DÉBITO";
    if (row.paymentMethod === "cash") return "ESPÉCIE";
    if (row.paymentMethod === "pix") return "PIX";
    return "PROGRAMADO";
}

function setMoney(target, value) {
    if (!target) return;
    target.textContent = formatCurrency(value);
    target.classList.toggle("negative", Number(value) < 0);
}

function renderRoute(summary) {
    elements.routeCount.textContent = `${summary.scheduledCount} ${summary.scheduledCount === 1 ? "ITEM" : "ITENS"}`;

    if (!summary.remainingRows.length) {
        const message = summary.isPast
            ? "Este mês já fechou. A página histórica permanece no Raio-X."
            : "Nenhuma entrada, conta, parcela ou pendência foi registrada para o restante deste mês.";
        elements.routeList.innerHTML = `<div class="planning-empty"><span>//</span><p>${escapeHTML(message)}</p></div>`;
        return;
    }

    elements.routeList.innerHTML = summary.remainingRows.slice(0, 12).map((row, index) => {
        const installment = row.installmentTotal
            ? ` • PARCELA ${row.installmentNumber}/${row.installmentTotal}`
            : row.seriesKind === "recurring" ? " • RECORRENTE" : "";
        return `
            <article class="planning-route-item ${row.type}">
                <span class="planning-route-index">${String(index + 1).padStart(2, "0")}</span>
                <time datetime="${escapeHTML(row.date)}">${escapeHTML(formatDate(row.date))}</time>
                <div>
                    <strong>${escapeHTML(row.description)}</strong>
                    <small>${escapeHTML(row.category.toUpperCase())} • ${escapeHTML(methodLabel(row))}${escapeHTML(installment)}</small>
                </div>
                <span class="planning-route-status">${row.type === "income" ? "A RECEBER" : "A PAGAR"}</span>
                <b>${row.type === "income" ? "+" : "−"} ${escapeHTML(formatCurrency(row.amount))}</b>
            </article>
        `;
    }).join("");
}

function budgetStatusCopy(item) {
    if (item.status === "exceeded") return "ESTOUROU";
    if (item.status === "forecast-exceeded") return "PREVISÃO ALTA";
    if (item.status === "warning") return "ATENÇÃO";
    return "DENTRO";
}

function renderBudgets(summary) {
    if (!summary.budgets.length) {
        elements.budgetList.innerHTML = `
            <div class="planning-budget-empty">
                <span>02</span>
                <div><strong>Nenhum orçamento definido</strong><p>Defina limites por categoria para comparar o planejado com o realizado e com o que ainda está por vir.</p></div>
                <button class="paper-button" type="button" data-planning-budget>DEFINIR AGORA →</button>
            </div>
        `;
        return;
    }

    elements.budgetList.innerHTML = summary.budgets.map((item, index) => {
        const actualPercent = Math.round(item.actualRatio * 100);
        const projectedPercent = Math.round(item.projectedRatio * 100);
        const width = Math.min(100, Math.max(0, item.projectedRatio * 100));
        return `
            <article class="planning-budget-item ${item.status}">
                <span class="planning-budget-index">${String(index + 1).padStart(2, "0")}</span>
                <div class="planning-budget-name">
                    <strong>${escapeHTML(item.category)}</strong>
                    <span>${escapeHTML(budgetStatusCopy(item))}</span>
                </div>
                <div class="planning-budget-values">
                    <p><span>PLANEJADO</span><b>${escapeHTML(formatCurrency(item.amount))}</b></p>
                    <p><span>REALIZADO</span><b>${escapeHTML(formatCurrency(item.actual))}</b></p>
                    <p><span>COMPROMETIDO</span><b>${escapeHTML(formatCurrency(item.committed))}</b></p>
                </div>
                <div class="planning-budget-track" aria-label="${projectedPercent}% do orçamento previsto"><i style="width:${width}%"></i><b style="left:${Math.min(100, Math.max(0, item.actualRatio * 100))}%"></b></div>
                <footer><span>REALIZADO ${integer.format(actualPercent)}%</span><strong>PREVISÃO ${integer.format(projectedPercent)}%</strong></footer>
            </article>
        `;
    }).join("");
}

function renderSummary(summary) {
    currentSummary = summary;
    elements.monthState.textContent = summary.isPast
        ? "MÊS FECHADO / HISTÓRICO"
        : summary.isCurrent ? "MÊS ATUAL / EM ABERTO" : "MÊS FUTURO / PROJEÇÃO";
    elements.receiptMonth.textContent = monthLabel(summary.month).toUpperCase();

    setMoney(elements.openingBalance, summary.openingBalance);
    setMoney(elements.actualResult, summary.actualResult);
    setMoney(elements.commitments, summary.remainingExpense);
    setMoney(elements.closingBalance, summary.projectedClosing);
    setMoney(elements.actualIncome, summary.actualIncome);
    setMoney(elements.remainingIncome, summary.remainingIncome);
    setMoney(elements.actualExpense, summary.actualExpense);
    setMoney(elements.remainingExpense, summary.remainingExpense);
    setMoney(elements.projectedResult, summary.projectedResult);

    elements.actualCaption.textContent = `${summary.realizedRows.length} ${summary.realizedRows.length === 1 ? "movimento confirmado" : "movimentos confirmados"}`;
    elements.commitmentsCaption.textContent = summary.remainingExpense > 0
        ? `${summary.remainingRows.filter((row) => row.type === "expense").length} saídas ainda previstas`
        : "nenhuma saída pendente";
    elements.confidence.textContent = `${summary.confidence} / ${summary.scheduledCount} REGISTROS`;

    renderRoute(summary);
    renderBudgets(summary);
    renderSimulation();
}

function renderSimulation() {
    if (!currentSummary) return;
    const total = Number(elements.simulationAmount.value) || 0;
    const count = Math.max(1, Math.min(120, Number.parseInt(elements.simulationInstallments.value, 10) || 1));
    const type = elements.simulationType.value === "income" ? "income" : "expense";
    const startMonth = /^\d{4}-\d{2}$/.test(elements.simulationStartMonth.value)
        ? elements.simulationStartMonth.value
        : currentSummary.month;

    setMoney(elements.simulationBefore, currentSummary.projectedClosing);

    if (total <= 0) {
        setMoney(elements.simulationAfter, currentSummary.projectedClosing);
        elements.simulationCaption.textContent = "Informe um valor para medir o impacto.";
        elements.simulationSchedule.innerHTML = "";
        return;
    }

    const parts = splitCurrency(total, count);
    const entries = parts.map((amount, index) => ({
        month: monthWithOffset(startMonth, index),
        amount,
        index: index + 1
    }));
    const selectedEntries = entries.filter((entry) => entry.month === currentSummary.month);
    const selectedAmount = selectedEntries.reduce((sumValue, entry) => sumValue + entry.amount, 0);
    const impact = type === "income" ? selectedAmount : -selectedAmount;
    const after = currentSummary.projectedClosing + impact;

    setMoney(elements.simulationAfter, after);
    elements.simulationCaption.textContent = selectedEntries.length
        ? `${selectedEntries.length} ${selectedEntries.length === 1 ? "parcela alcança" : "parcelas alcançam"} ${monthLabel(currentSummary.month)} e ${type === "income" ? "acrescenta" : "retira"} ${formatCurrency(selectedAmount)} do fechamento previsto.`
        : `A simulação começa em ${monthLabel(startMonth)} e não altera o fechamento de ${monthLabel(currentSummary.month)}.`;

    const visibleEntries = entries.slice(0, 6);
    elements.simulationSchedule.innerHTML = visibleEntries.map((entry) => `
        <div>
            <span>${escapeHTML(shortMonthLabel(entry.month))}</span>
            <strong>${type === "income" ? "+" : "−"} ${escapeHTML(formatCurrency(entry.amount))}</strong>
            <small>${count > 1 ? `${entry.index}/${count}` : "ÚNICA"}</small>
        </div>
    `).join("") + (entries.length > visibleEntries.length
        ? `<p>+ ${entries.length - visibleEntries.length} parcelas continuam nos meses seguintes.</p>`
        : "");
}

function renderError(message) {
    const safeMessage = escapeHTML(message || "Não foi possível abrir o planejamento agora.");
    elements.routeList.innerHTML = `<div class="planning-empty"><span>!</span><p>${safeMessage}</p></div>`;
    elements.budgetList.innerHTML = `<div class="planning-empty"><p>${safeMessage}</p></div>`;
}

async function loadPlanning() {
    if (!supabase || !elements.planningView) return;
    const sequence = ++loadSequence;
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) return;
    activeUserId = authData.user.id;

    const [transactionsResult, budgetsResult] = await Promise.all([
        supabase
            .from("transactions")
            .select("id,description,amount,type,category,occurred_on,status,payment_method,series_kind,installment_number,installment_total")
            .eq("user_id", activeUserId)
            .order("occurred_on", { ascending: true }),
        supabase
            .from("category_budgets")
            .select("id,month_start,category,amount")
            .eq("user_id", activeUserId)
            .order("month_start", { ascending: true })
    ]);

    if (sequence !== loadSequence) return;
    if (transactionsResult.error || budgetsResult.error) {
        renderError(transactionsResult.error?.message || budgetsResult.error?.message);
        return;
    }

    transactions = (transactionsResult.data || []).map(normalizeTransaction).filter((row) => row.date);
    budgets = (budgetsResult.data || []).map(normalizeBudget).filter((row) => row.month);
    render();
}

function selectedMonth() {
    if (/^\d{4}-\d{2}$/.test(elements.month?.value || "")) return elements.month.value;
    if (/^\d{4}-\d{2}$/.test(elements.globalMonth?.value || "")) return elements.globalMonth.value;
    return currentMonthKey();
}

function render() {
    if (!elements.month) return;
    const month = selectedMonth();
    elements.month.value = month;
    if (!elements.simulationStartMonth.value) elements.simulationStartMonth.value = month;
    renderSummary(summarize(month));
}

function openBudgetDialog() {
    const button = document.querySelector("#newBudgetButton");
    button?.click();
    window.setTimeout(() => {
        if (elements.budgetMonth) elements.budgetMonth.value = selectedMonth();
    }, 40);
}

function bindEvents() {
    elements.month?.addEventListener("change", () => {
        if (!/^\d{4}-\d{2}$/.test(elements.month.value)) return;
        if (elements.globalMonth && elements.globalMonth.value !== elements.month.value) {
            elements.globalMonth.value = elements.month.value;
            elements.globalMonth.dispatchEvent(new Event("change", { bubbles: true }));
        }
        elements.simulationStartMonth.value = elements.month.value;
        render();
    });

    elements.globalMonth?.addEventListener("change", () => {
        if (!/^\d{4}-\d{2}$/.test(elements.globalMonth.value)) return;
        elements.month.value = elements.globalMonth.value;
        elements.simulationStartMonth.value = elements.globalMonth.value;
        render();
    });

    elements.budgetButton?.addEventListener("click", openBudgetDialog);
    elements.budgetList?.addEventListener("click", (event) => {
        if (event.target.closest("[data-planning-budget]")) openBudgetDialog();
    });

    elements.simulatorForm?.addEventListener("submit", (event) => event.preventDefault());
    elements.simulatorForm?.addEventListener("input", renderSimulation);
    elements.simulatorForm?.addEventListener("change", renderSimulation);

    document.querySelectorAll('[data-view="planning"]').forEach((button) => {
        button.addEventListener("click", () => window.setTimeout(loadPlanning, 60));
    });

    elements.budgetDialog?.addEventListener("close", () => window.setTimeout(loadPlanning, 100));
    elements.transactionDialog?.addEventListener("close", () => window.setTimeout(loadPlanning, 100));
    window.addEventListener("folego:data-changed", loadPlanning);
    window.addEventListener("focus", () => {
        if (window.location.hash === "#planning") loadPlanning();
    });
}

async function boot() {
    if (!elements.planningView) return;
    const initialMonth = /^\d{4}-\d{2}$/.test(elements.globalMonth?.value || "")
        ? elements.globalMonth.value
        : currentMonthKey();
    elements.month.value = initialMonth;
    elements.simulationStartMonth.value = initialMonth;
    bindEvents();
    await loadPlanning();

    if (window.location.hash === "#planning" && elements.appShell?.hidden) {
        const observer = new MutationObserver(() => {
            if (!elements.appShell.hidden) {
                observer.disconnect();
                loadPlanning();
            }
        });
        observer.observe(elements.appShell, { attributes: true, attributeFilter: ["hidden"] });
    }
}

supabase?.auth.onAuthStateChange((_event, session) => {
    if (session?.user) window.setTimeout(loadPlanning, 180);
    else {
        activeUserId = null;
        transactions = [];
        budgets = [];
    }
});

boot();

