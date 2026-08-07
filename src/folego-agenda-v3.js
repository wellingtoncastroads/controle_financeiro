import { getBalanceAsOf, toISODate } from "./domain.js";
import { isInternalTransfer } from "./folego-transfer-v27.js";

const currency = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
});

const compactCurrency = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1
});

const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric"
});

const weekdayFormatter = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });

let latestAccountTotal = null;
let lastRenderPayload = null;

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function parseDate(value) {
    return new Date(`${value}T12:00:00`);
}

function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(value, amount) {
    const date = typeof value === "string" ? parseDate(value) : new Date(value);
    date.setDate(date.getDate() + amount);
    return dateKey(date);
}

function monthRange(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return {
        start: `${monthKey}-01`,
        end: `${monthKey}-${String(lastDay).padStart(2, "0")}`,
        days: Array.from({ length: lastDay }, (_, index) => `${monthKey}-${String(index + 1).padStart(2, "0")}`)
    };
}

function weekRange(reference) {
    const date = parseDate(reference);
    const daysSinceMonday = (date.getDay() + 6) % 7;
    const start = addDays(reference, -daysSinceMonday);
    return { start, end: addDays(start, 6) };
}

function isFinancialMovement(transaction) {
    return transaction && !isInternalTransfer(transaction);
}

function signedAmount(transaction) {
    return transaction.type === "income" ? Number(transaction.amount) : -Number(transaction.amount);
}

function projectedBalanceAt(transactions, targetDate, today, adjustment = 0) {
    if (targetDate <= today) return getBalanceAsOf(transactions, targetDate) + adjustment;
    const futureChange = transactions
        .filter((transaction) => (
            isFinancialMovement(transaction)
            && transaction.date > today
            && transaction.date <= targetDate
            && (transaction.status === "pending" || transaction.status === "paid")
        ))
        .reduce((total, transaction) => total + signedAmount(transaction), 0);
    return getBalanceAsOf(transactions, today) + adjustment + futureChange;
}

function sumByType(transactions, type) {
    return transactions
        .filter((transaction) => transaction.type === type && isFinancialMovement(transaction))
        .reduce((total, transaction) => total + Number(transaction.amount), 0);
}

function transactionBlock(transaction) {
    const pending = transaction.status === "pending";
    return `
        <button
            class="agenda-v3-movement ${transaction.type} ${pending ? "pending" : ""}"
            type="button"
            data-agenda-edit="${escapeHTML(transaction.id)}"
            title="${escapeHTML(transaction.description)} — ${escapeHTML(currency.format(transaction.amount))}"
        >
            <span>${escapeHTML(transaction.description)}</span>
            <strong>${escapeHTML(currency.format(transaction.amount))}</strong>
            ${pending ? "<small>previsto</small>" : ""}
        </button>
    `;
}

function movementStack(items, type) {
    const selected = items.filter((item) => item.type === type).slice(0, 2);
    const hidden = items.filter((item) => item.type === type).length - selected.length;
    if (!selected.length) return '<span class="agenda-v3-empty-day">—</span>';
    return `${selected.map(transactionBlock).join("")}${hidden > 0 ? `<span class="agenda-v3-more">+${hidden}</span>` : ""}`;
}

function recentItem(transaction) {
    const signal = transaction.type === "income" ? "+" : "−";
    const category = transaction.category || (transaction.type === "income" ? "Entrada" : "Saída");
    return `
        <button class="agenda-v3-recent-item" type="button" data-agenda-edit="${escapeHTML(transaction.id)}">
            <span class="agenda-v3-recent-icon ${transaction.type}" aria-hidden="true">${transaction.type === "income" ? "↙" : "↗"}</span>
            <span class="agenda-v3-recent-copy">
                <strong>${escapeHTML(transaction.description)}</strong>
                <small>${escapeHTML(category)} · ${escapeHTML(shortDateFormatter.format(parseDate(transaction.date)).replace(".", ""))}</small>
            </span>
            <strong class="agenda-v3-recent-value ${transaction.type}">${signal} ${escapeHTML(currency.format(transaction.amount))}</strong>
        </button>
    `;
}

function updateAccountAwareTotals() {
    if (!lastRenderPayload || latestAccountTotal === null) return;
    const { transactions, today, monthEnd, rawTodayBalance } = lastRenderPayload;
    const adjustment = latestAccountTotal - rawTodayBalance;
    const endBalance = projectedBalanceAt(transactions, monthEnd, today, adjustment);

    const patrimony = document.querySelector("#agendaV3Patrimony");
    const accountTotal = document.querySelector("#agendaV3AccountTotal");
    const monthEndTarget = document.querySelector("#agendaV3MonthEnd");
    const canSpend = document.querySelector("#agendaV3CanSpend");

    if (patrimony) patrimony.textContent = currency.format(latestAccountTotal);
    if (accountTotal) accountTotal.textContent = currency.format(latestAccountTotal);
    if (monthEndTarget) {
        monthEndTarget.textContent = `${endBalance >= latestAccountTotal ? "+" : ""}${currency.format(endBalance - latestAccountTotal)}`;
        monthEndTarget.classList.toggle("negative", endBalance < latestAccountTotal);
    }
    if (canSpend) canSpend.textContent = currency.format(Math.max(0, endBalance));

    document.querySelectorAll("[data-agenda-date]").forEach((column) => {
        const target = column.querySelector(".agenda-v3-balance-value");
        if (!target) return;
        const value = projectedBalanceAt(transactions, column.dataset.agendaDate, today, adjustment);
        target.textContent = compactCurrency.format(value);
        column.classList.toggle("negative-balance", value < 0);
    });
}

export function renderAgendaV3({ transactions = [], selectedMonth, profile = null }) {
    const root = document.querySelector("#agendaV3");
    const calendar = document.querySelector("#agendaV3Calendar");
    if (!root || !calendar || !selectedMonth) return;

    const today = toISODate();
    const range = monthRange(selectedMonth);
    const selectedIsCurrentMonth = today.startsWith(selectedMonth);
    const referenceDay = selectedIsCurrentMonth ? today : range.start;
    const week = weekRange(referenceDay);
    const cleanTransactions = transactions.filter(isFinancialMovement);
    const monthTransactions = cleanTransactions.filter((transaction) => (
        transaction.date >= range.start && transaction.date <= range.end
    ));
    const weekTransactions = cleanTransactions.filter((transaction) => (
        transaction.date >= week.start && transaction.date <= week.end
    ));
    const rawTodayBalance = getBalanceAsOf(cleanTransactions, today);
    const adjustment = latestAccountTotal === null ? 0 : latestAccountTotal - rawTodayBalance;
    const monthEndBalance = projectedBalanceAt(cleanTransactions, range.end, today, adjustment);
    const weeklyIncome = sumByType(weekTransactions, "income");
    const weeklyExpense = sumByType(weekTransactions, "expense");
    const pendingBills = weekTransactions.filter((transaction) => transaction.type === "expense" && transaction.status === "pending");
    const recent = [...cleanTransactions]
        .filter((transaction) => transaction.status === "paid")
        .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
        .slice(0, 4);

    lastRenderPayload = {
        transactions: cleanTransactions,
        today,
        monthEnd: range.end,
        rawTodayBalance
    };

    const firstName = String(profile?.display_name || profile?.fullName || profile?.name || "Você").trim().split(/\s+/)[0];
    const monthLabel = monthFormatter.format(parseDate(range.start));
    const normalizedMonthLabel = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
    const todayDate = parseDate(referenceDay);

    const monthTitle = document.querySelector("#agendaV3Month");
    const greeting = document.querySelector("#agendaV3Greeting");
    const patrimony = document.querySelector("#agendaV3Patrimony");
    const monthEnd = document.querySelector("#agendaV3MonthEnd");
    const weekLabel = document.querySelector("#agendaV3WeekLabel");
    const weekIncome = document.querySelector("#agendaV3WeekIncome");
    const weekExpense = document.querySelector("#agendaV3WeekExpense");
    const bills = document.querySelector("#agendaV3Bills");
    const canSpend = document.querySelector("#agendaV3CanSpend");
    const accountTotal = document.querySelector("#agendaV3AccountTotal");
    const recentTarget = document.querySelector("#agendaV3Recent");

    if (monthTitle) monthTitle.textContent = normalizedMonthLabel;
    if (greeting) greeting.textContent = `${firstName}, este é o ritmo do seu mês.`;
    if (patrimony) patrimony.textContent = currency.format(latestAccountTotal ?? rawTodayBalance);
    if (monthEnd) {
        const base = latestAccountTotal ?? rawTodayBalance;
        monthEnd.textContent = `${monthEndBalance >= base ? "+" : ""}${currency.format(monthEndBalance - base)}`;
        monthEnd.classList.toggle("negative", monthEndBalance < base);
    }
    if (weekLabel) {
        weekLabel.textContent = `${shortDateFormatter.format(parseDate(week.start)).replace(".", "")} — ${shortDateFormatter.format(parseDate(week.end)).replace(".", "")}`;
    }
    if (weekIncome) weekIncome.textContent = currency.format(weeklyIncome);
    if (weekExpense) weekExpense.textContent = currency.format(weeklyExpense);
    if (bills) bills.textContent = `${currency.format(sumByType(pendingBills, "expense"))} · ${pendingBills.length} ${pendingBills.length === 1 ? "conta" : "contas"}`;
    if (canSpend) canSpend.textContent = currency.format(Math.max(0, monthEndBalance));
    if (accountTotal) accountTotal.textContent = currency.format(latestAccountTotal ?? rawTodayBalance);
    if (recentTarget) {
        recentTarget.innerHTML = recent.length
            ? recent.map(recentItem).join("")
            : '<p class="agenda-v3-empty-recent">Seus movimentos confirmados aparecerão aqui.</p>';
    }

    const balances = range.days.map((day) => projectedBalanceAt(cleanTransactions, day, today, adjustment));
    const minBalance = Math.min(...balances, 0);
    const maxBalance = Math.max(...balances, 1);
    const amplitude = Math.max(1, maxBalance - minBalance);

    calendar.innerHTML = range.days.map((day, index) => {
        const date = parseDate(day);
        const dayTransactions = monthTransactions
            .filter((transaction) => transaction.date === day)
            .sort((a, b) => b.type.localeCompare(a.type) || Number(b.amount) - Number(a.amount));
        const balance = balances[index];
        const level = 42 + ((balance - minBalance) / amplitude) * 32;
        const isToday = day === today;
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        const pending = dayTransactions.filter((transaction) => transaction.status === "pending");
        return `
            <article
                class="agenda-v3-day ${isToday ? "today" : ""} ${isWeekend ? "weekend" : ""} ${balance < 0 ? "negative-balance" : ""}"
                data-agenda-date="${day}"
                style="--balance-level:${level.toFixed(2)}%"
            >
                <header>
                    <strong>${String(date.getDate()).padStart(2, "0")}</strong>
                    <span>${escapeHTML(weekdayFormatter.format(date).replace(".", "").toUpperCase())}</span>
                    ${isToday ? '<i>HOJE</i>' : ""}
                </header>
                <div class="agenda-v3-stack income-stack">${movementStack(dayTransactions, "income")}</div>
                <div class="agenda-v3-balance-track">
                    <div class="agenda-v3-balance-wave">
                        <span class="agenda-v3-balance-value">${escapeHTML(compactCurrency.format(balance))}</span>
                    </div>
                </div>
                <div class="agenda-v3-stack expense-stack">${movementStack(dayTransactions, "expense")}</div>
                <div class="agenda-v3-due">
                    ${pending.length
                        ? `<span>${pending.length} ${pending.length === 1 ? "previsto" : "previstos"}</span>`
                        : "<span>—</span>"}
                </div>
            </article>
        `;
    }).join("");

    const todayBadge = document.querySelector("#agendaV3TodayBadge");
    if (todayBadge) {
        todayBadge.textContent = selectedIsCurrentMonth
            ? `Hoje · ${String(todayDate.getDate()).padStart(2, "0")} ${weekdayFormatter.format(todayDate).replace(".", "").toUpperCase()}`
            : normalizedMonthLabel;
    }

    window.requestAnimationFrame(() => {
        const current = calendar.querySelector(".agenda-v3-day.today");
        if (current) current.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    });
}

window.addEventListener("folego:accounts-snapshot", (event) => {
    const total = Number(event.detail?.total);
    if (!Number.isFinite(total)) return;
    latestAccountTotal = total;
    updateAccountAwareTotals();
});
