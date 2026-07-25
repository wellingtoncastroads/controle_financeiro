export const TRANSFER_CATEGORY = "Transferência";

const currencyRound = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const rowDate = (row) => String(row?.date ?? row?.occurred_on ?? "");
const rowAmount = (row) => Number(row?.amount || 0);
const rowMethod = (row) => row?.paymentMethod ?? row?.payment_method ?? "other";
const rowSeriesId = (row) => row?.seriesId ?? row?.series_id ?? null;

export function monthKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
}

export function todayKey(date = new Date()) {
    return `${monthKey(date)}-${String(date.getDate()).padStart(2, "0")}`;
}

export function monthWithOffset(value, offset) {
    const [year, month] = String(value).split("-").map(Number);
    const date = new Date(year, month - 1 + offset, 1, 12);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function dateAtMonthDay(value, day) {
    const [year, month] = String(value).split("-").map(Number);
    const lastDay = new Date(year, month, 0, 12).getDate();
    return `${value}-${String(Math.min(lastDay, Math.max(1, Number(day) || 1))).padStart(2, "0")}`;
}

export function addDays(value, amount) {
    const date = new Date(`${value}T12:00:00`);
    date.setDate(date.getDate() + amount);
    return todayKey(date);
}

export function splitMoney(total, count) {
    const safeCount = Math.max(1, Math.min(120, Number.parseInt(count, 10) || 1));
    const cents = Math.round(Number(total || 0) * 100);
    const base = Math.floor(cents / safeCount);
    const remainder = cents % safeCount;
    return Array.from({ length: safeCount }, (_, index) => (base + (index < remainder ? 1 : 0)) / 100);
}

export function cleanCard(value, uuid = () => crypto.randomUUID()) {
    if (!value || typeof value !== "object") return null;
    const name = String(value.name || "").trim().replace(/\s+/g, " ").slice(0, 40);
    const limit = currencyRound(value.limit);
    const closingDay = Math.min(28, Math.max(1, Number.parseInt(value.closingDay, 10) || 10));
    const dueDay = Math.min(28, Math.max(1, Number.parseInt(value.dueDay, 10) || 17));
    const id = typeof value.id === "string" && value.id ? value.id : uuid();
    if (!name || limit <= 0) return null;
    return {
        id,
        name,
        limit,
        closingDay,
        dueDay,
        archived: Boolean(value.archived),
        createdAt: value.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

export function cleanCards(value, legacyCard = null, uuid = () => crypto.randomUUID()) {
    const cards = Array.isArray(value) ? value.map((card) => cleanCard(card, uuid)).filter(Boolean) : [];
    if (cards.length) return cards;
    const legacy = cleanCard(legacyCard, uuid);
    return legacy ? [legacy] : [];
}

export function firstInvoiceMonth(purchaseDate, card) {
    let invoiceMonth = String(purchaseDate).slice(0, 7);
    if (Number(String(purchaseDate).slice(8, 10)) > card.closingDay) {
        invoiceMonth = monthWithOffset(invoiceMonth, 1);
    }
    if (dateAtMonthDay(invoiceMonth, card.dueDay) < purchaseDate) {
        invoiceMonth = monthWithOffset(invoiceMonth, 1);
    }
    return invoiceMonth;
}

export function buildCreditRows({ userId, description, amount, category, purchaseDate, count, card, seriesId }) {
    const invoiceMonth = firstInvoiceMonth(purchaseDate, card);
    const parts = splitMoney(amount, count);
    return parts.map((installmentAmount, index) => ({
        user_id: userId,
        description: String(description).trim().replace(/\s+/g, " ").slice(0, 80),
        amount: installmentAmount,
        type: "expense",
        category,
        occurred_on: dateAtMonthDay(monthWithOffset(invoiceMonth, index), card.dueDay),
        status: "pending",
        payment_method: "credit_card",
        series_id: seriesId,
        series_kind: parts.length > 1 ? "installment" : null,
        installment_number: parts.length > 1 ? index + 1 : null,
        installment_total: parts.length > 1 ? parts.length : null
    }));
}

export function buildTransferRows({ userId, amount, source, destination, date, note = "", seriesId }) {
    const labels = { pix: "Pix", cash: "Espécie" };
    const cleanNote = String(note || "").trim().replace(/\s+/g, " ").slice(0, 60);
    const suffix = cleanNote ? ` • ${cleanNote}` : "";
    const shared = {
        user_id: userId,
        amount: currencyRound(amount),
        category: TRANSFER_CATEGORY,
        occurred_on: date,
        status: "paid",
        series_id: seriesId,
        series_kind: null,
        installment_number: null,
        installment_total: null
    };
    return [
        {
            ...shared,
            description: `Transferência para ${labels[destination] || destination}${suffix}`,
            type: "expense",
            payment_method: source
        },
        {
            ...shared,
            description: `Transferência de ${labels[source] || source}${suffix}`,
            type: "income",
            payment_method: destination
        }
    ];
}

export function normalizeKeyword(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function keywordCandidate(description) {
    const ignored = new Set(["compra", "pagamento", "conta", "parcela", "mensalidade", "pedido", "recebimento"]);
    return normalizeKeyword(description)
        .split(" ")
        .filter((word) => word.length >= 3 && !ignored.has(word))
        .slice(0, 2)
        .join(" ");
}

export function suggestCategory(description, rules = []) {
    const normalized = normalizeKeyword(description);
    if (!normalized) return null;
    const ordered = [...rules]
        .filter((rule) => rule?.keyword && rule?.category)
        .sort((a, b) => normalizeKeyword(b.keyword).length - normalizeKeyword(a.keyword).length);
    return ordered.find((rule) => normalized.includes(normalizeKeyword(rule.keyword))) || null;
}

export function isTransfer(row) {
    return String(row?.category || "") === TRANSFER_CATEGORY;
}

export function signedValue(row) {
    return row?.type === "income" ? rowAmount(row) : -rowAmount(row);
}

export function monthSummary(rows, month) {
    const paid = rows.filter((row) => (
        row?.status === "paid"
        && rowDate(row).slice(0, 7) === month
        && !isTransfer(row)
    ));
    const incomeRows = paid.filter((row) => row.type === "income");
    const expenseRows = paid.filter((row) => row.type === "expense");
    const income = currencyRound(incomeRows.reduce((sum, row) => sum + rowAmount(row), 0));
    const expense = currencyRound(expenseRows.reduce((sum, row) => sum + rowAmount(row), 0));
    const categoryMap = new Map();
    expenseRows.forEach((row) => categoryMap.set(row.category, (categoryMap.get(row.category) || 0) + rowAmount(row)));
    return {
        month,
        income,
        expense,
        result: currencyRound(income - expense),
        count: paid.length,
        categories: [...categoryMap.entries()]
            .map(([category, amount]) => ({ category, amount: currencyRound(amount) }))
            .sort((a, b) => b.amount - a.amount)
    };
}

export function compareMonths(rows, month) {
    const current = monthSummary(rows, month);
    const previous = monthSummary(rows, monthWithOffset(month, -1));
    const categories = new Set([...current.categories, ...previous.categories].map((item) => item.category));
    const changes = [...categories].map((category) => {
        const currentAmount = current.categories.find((item) => item.category === category)?.amount || 0;
        const previousAmount = previous.categories.find((item) => item.category === category)?.amount || 0;
        return { category, current: currentAmount, previous: previousAmount, delta: currencyRound(currentAmount - previousAmount) };
    }).sort((a, b) => b.delta - a.delta);
    return { current, previous, changes, biggestIncrease: changes.find((item) => item.delta > 0) || null };
}

export function annualSummary(rows, year) {
    const safeYear = Number.parseInt(year, 10) || new Date().getFullYear();
    const months = Array.from({ length: 12 }, (_, index) => monthSummary(rows, `${safeYear}-${String(index + 1).padStart(2, "0")}`));
    const income = currencyRound(months.reduce((sum, item) => sum + item.income, 0));
    const expense = currencyRound(months.reduce((sum, item) => sum + item.expense, 0));
    const activeMonths = months.filter((item) => item.count > 0);
    const bestMonth = [...activeMonths].sort((a, b) => b.result - a.result)[0] || null;
    const worstMonth = [...activeMonths].sort((a, b) => a.result - b.result)[0] || null;
    const categoryMap = new Map();
    months.forEach((item) => item.categories.forEach(({ category, amount }) => {
        categoryMap.set(category, (categoryMap.get(category) || 0) + amount);
    }));
    const categories = [...categoryMap.entries()]
        .map(([category, amount]) => ({ category, amount: currencyRound(amount) }))
        .sort((a, b) => b.amount - a.amount);
    return {
        year: safeYear,
        income,
        expense,
        result: currencyRound(income - expense),
        averageExpense: activeMonths.length ? currencyRound(expense / activeMonths.length) : 0,
        bestMonth,
        worstMonth,
        categories,
        months
    };
}

export function cardIdForRow(row, seriesMap = {}, fallbackCardId = null) {
    const seriesId = rowSeriesId(row);
    return (seriesId && seriesMap[seriesId]) || fallbackCardId || null;
}

export function cardUsage(rows, cards, seriesMap = {}) {
    const activeCards = cards.filter((card) => !card.archived);
    const fallback = cards[0]?.id || null;
    return activeCards.map((card) => {
        const cardRows = rows.filter((row) => (
            row?.type === "expense"
            && (rowMethod(row) === "credit_card" || Boolean(rowSeriesId(row) && seriesMap[rowSeriesId(row)]))
            && cardIdForRow(row, seriesMap, fallback) === card.id
        ));
        const pending = currencyRound(cardRows.filter((row) => row.status === "pending").reduce((sum, row) => sum + rowAmount(row), 0));
        return {
            ...card,
            pending,
            available: currencyRound(card.limit - pending),
            ratio: card.limit > 0 ? pending / card.limit : 0,
            rows: cardRows
        };
    });
}

export function riskSnapshot({ rows, budgets = [], cards = [], seriesMap = {}, today = todayKey() }) {
    const paidUntilToday = rows.filter((row) => row.status === "paid" && rowDate(row) <= today);
    let balance = currencyRound(paidUntilToday.reduce((sum, row) => sum + signedValue(row), 0));
    const future = rows
        .filter((row) => rowDate(row) > today && (row.status === "pending" || row.status === "paid"))
        .sort((a, b) => rowDate(a).localeCompare(rowDate(b)));
    let negativeDate = null;
    future.forEach((row) => {
        balance = currencyRound(balance + signedValue(row));
        if (!negativeDate && balance < 0) negativeDate = rowDate(row);
    });

    const currentMonth = today.slice(0, 7);
    const monthRows = rows.filter((row) => rowDate(row).slice(0, 7) === currentMonth && !isTransfer(row));
    const budgetAlerts = budgets
        .filter((budget) => String(budget.month ?? budget.month_start ?? "").slice(0, 7) === currentMonth)
        .map((budget) => {
            const projected = monthRows
                .filter((row) => row.type === "expense" && row.category === budget.category)
                .reduce((sum, row) => sum + rowAmount(row), 0);
            const amount = Number(budget.amount || 0);
            return { category: budget.category, amount, projected: currencyRound(projected), ratio: amount > 0 ? projected / amount : 0 };
        })
        .filter((item) => item.ratio >= 0.8)
        .sort((a, b) => b.ratio - a.ratio);

    const cardAlerts = cardUsage(rows, cards, seriesMap)
        .filter((card) => card.ratio >= 0.8)
        .sort((a, b) => b.ratio - a.ratio);

    const nextMonth = monthWithOffset(currentMonth, 1);
    const nextRows = rows.filter((row) => rowDate(row).slice(0, 7) === nextMonth && row.status === "pending" && !isTransfer(row));
    const nextIncome = nextRows.filter((row) => row.type === "income").reduce((sum, row) => sum + rowAmount(row), 0);
    const nextExpense = nextRows.filter((row) => row.type === "expense").reduce((sum, row) => sum + rowAmount(row), 0);

    return {
        balanceToday: currencyRound(paidUntilToday.reduce((sum, row) => sum + signedValue(row), 0)),
        projectedBalance: balance,
        negativeDate,
        budgetAlerts,
        cardAlerts,
        nextIncome: currencyRound(nextIncome),
        nextExpense: currencyRound(nextExpense),
        commitmentRatio: nextIncome > 0 ? nextExpense / nextIncome : nextExpense > 0 ? Infinity : 0
    };
}
