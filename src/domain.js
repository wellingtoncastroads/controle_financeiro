export const BACKUP_VERSION = 4;
export const LEGACY_STORAGE_KEY = "nexo-financas-v1";
export const THEME_STORAGE_KEY = "folego-theme-v2";

export const INCOME_CATEGORIES = ["Salário", "Freelance", "Vendas", "Investimentos", "Outras receitas"];
export const EXPENSE_CATEGORIES = ["Moradia", "Alimentação", "Transporte", "Saúde", "Educação", "Lazer", "Assinaturas", "Contas", "Outras despesas"];
export const PAYMENT_METHODS = [
    { value: "pix", label: "Pix" },
    { value: "cash", label: "Dinheiro" },
    { value: "debit_card", label: "Cartão de débito" },
    { value: "credit_card", label: "Cartão de crédito" },
    { value: "bank_transfer", label: "Transferência bancária" },
    { value: "boleto", label: "Boleto" },
    { value: "other", label: "Não informado" }
];
export const PAYMENT_METHOD_LABELS = Object.fromEntries(
    PAYMENT_METHODS.map(({ value, label }) => [value, label])
);
export const ACCOUNT_TYPES = [
    { value: "checking", label: "Conta corrente" },
    { value: "savings", label: "Poupança" },
    { value: "payment", label: "Conta de pagamento" },
    { value: "wallet", label: "Carteira digital" },
    { value: "cash", label: "Dinheiro em espécie" },
    { value: "other", label: "Outra conta" }
];
export const ACCOUNT_TYPE_LABELS = Object.fromEntries(
    ACCOUNT_TYPES.map(({ value, label }) => [value, label])
);

const VALID_TYPES = new Set(["income", "expense"]);
const VALID_STATUSES = new Set(["paid", "pending"]);
const VALID_ICONS = new Set(["🛡️", "🏠", "✈️", "🚗", "💻", "🎓", "✨"]);
const VALID_PAYMENT_METHODS = new Set(PAYMENT_METHODS.map(({ value }) => value));
const VALID_ACCOUNT_TYPES = new Set(ACCOUNT_TYPES.map(({ value }) => value));
const VALID_SERIES_KINDS = new Set(["recurring", "installment"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_AMOUNT = 999999999999.99;

export function toISODate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function currentMonthKey() {
    return toISODate().slice(0, 7);
}

function parseISODate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
}

export function addDaysToISO(value, days) {
    if (!isValidDate(value) || !Number.isInteger(days)) return value;
    const date = parseISODate(value);
    date.setDate(date.getDate() + days);
    return toISODate(date);
}

export function addMonthsToISO(value, months) {
    if (!isValidDate(value) || !Number.isInteger(months)) return value;
    const date = parseISODate(value);
    const originalDay = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + months);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12).getDate();
    date.setDate(Math.min(originalDay, lastDay));
    return toISODate(date);
}

export function isValidDate(value) {
    if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year
        && parsed.getUTCMonth() === month - 1
        && parsed.getUTCDate() === day;
}

export function isValidMonth(value) {
    if (typeof value !== "string" || !MONTH_PATTERN.test(value)) return false;
    const month = Number(value.slice(5, 7));
    return month >= 1 && month <= 12;
}

function cleanText(value, maximumLength) {
    if (typeof value !== "string") return "";
    return value.trim().replace(/\s+/g, " ").slice(0, maximumLength);
}

function cleanAmount(value, allowZero = false) {
    if (value === null || value === undefined || value === "") return null;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) return null;
    if (!allowZero && amount === 0) return null;
    return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function cleanSignedAmount(value) {
    if (value === null || value === undefined || value === "") return 0;
    const amount = Number(value);
    if (!Number.isFinite(amount) || Math.abs(amount) > MAX_AMOUNT) return null;
    return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function cleanUuid(value, allowEmpty = true) {
    if ((value === null || value === undefined || value === "") && allowEmpty) return null;
    return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

export function normalizeTransaction(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;

    const description = cleanText(value.description, 80);
    const category = cleanText(value.category, 40);
    const amount = cleanAmount(value.amount);
    const date = value.date ?? value.occurred_on;
    const createdAt = typeof value.createdAt === "string"
        ? value.createdAt
        : typeof value.created_at === "string" ? value.created_at : null;
    const rawPaymentMethod = value.paymentMethod ?? value.payment_method;
    const paymentMethod = VALID_PAYMENT_METHODS.has(rawPaymentMethod) ? rawPaymentMethod : "other";
    const accountId = cleanUuid(value.accountId ?? value.account_id);
    const rawSeriesId = value.seriesId ?? value.series_id;
    const seriesId = typeof rawSeriesId === "string" && UUID_PATTERN.test(rawSeriesId) ? rawSeriesId : null;
    const rawSeriesKind = value.seriesKind ?? value.series_kind;
    let seriesKind = VALID_SERIES_KINDS.has(rawSeriesKind) ? rawSeriesKind : null;
    let installmentNumber = Number(value.installmentNumber ?? value.installment_number);
    let installmentTotal = Number(value.installmentTotal ?? value.installment_total);

    if (
        seriesKind !== "installment"
        || !Number.isInteger(installmentNumber)
        || !Number.isInteger(installmentTotal)
        || installmentNumber < 1
        || installmentTotal < 2
        || installmentNumber > installmentTotal
        || installmentTotal > 120
    ) {
        installmentNumber = null;
        installmentTotal = null;
        if (seriesKind === "installment") seriesKind = null;
    }

    if (!description || !category || amount === null) return null;
    if (!VALID_TYPES.has(value.type) || !VALID_STATUSES.has(value.status)) return null;
    if (!isValidDate(date)) return null;

    return {
        id: typeof value.id === "string" ? value.id : "",
        description,
        amount,
        type: value.type,
        category,
        date,
        status: value.status,
        paymentMethod,
        accountId,
        seriesId: seriesKind ? seriesId : null,
        seriesKind,
        installmentNumber,
        installmentTotal,
        createdAt
    };
}

export function normalizeFinancialAccount(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;

    const bankCode = cleanText(value.bankCode ?? value.bank_code, 40).toLowerCase();
    const institutionName = cleanText(value.institutionName ?? value.institution_name, 60);
    const name = cleanText(value.name, 60);
    const accountType = value.accountType ?? value.account_type;
    const initialBalance = cleanSignedAmount(value.initialBalance ?? value.initial_balance);
    const color = typeof value.color === "string" && /^#[0-9a-f]{6}$/i.test(value.color)
        ? value.color.toLowerCase()
        : "#11120e";

    if (typeof value.id === "string" && value.id && !UUID_PATTERN.test(value.id)) return null;
    if (!bankCode || !institutionName || !name || initialBalance === null) return null;
    if (!VALID_ACCOUNT_TYPES.has(accountType)) return null;

    return {
        id: typeof value.id === "string" ? value.id : "",
        bankCode,
        institutionName,
        name,
        accountType,
        initialBalance,
        color,
        createdAt: typeof value.createdAt === "string"
            ? value.createdAt
            : typeof value.created_at === "string" ? value.created_at : null,
        updatedAt: typeof value.updatedAt === "string"
            ? value.updatedAt
            : typeof value.updated_at === "string" ? value.updated_at : null
    };
}

export function normalizeTransfer(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;

    const fromAccountId = cleanUuid(value.fromAccountId ?? value.from_account_id, false);
    const toAccountId = cleanUuid(value.toAccountId ?? value.to_account_id, false);
    const amount = cleanAmount(value.amount);
    const date = value.date ?? value.occurred_on;
    const status = VALID_STATUSES.has(value.status) ? value.status : "paid";
    const note = cleanText(value.note ?? "", 100);

    if (typeof value.id === "string" && value.id && !UUID_PATTERN.test(value.id)) return null;
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) return null;
    if (amount === null || !isValidDate(date)) return null;

    return {
        id: typeof value.id === "string" ? value.id : "",
        fromAccountId,
        toAccountId,
        amount,
        date,
        status,
        note,
        createdAt: typeof value.createdAt === "string"
            ? value.createdAt
            : typeof value.created_at === "string" ? value.created_at : null,
        updatedAt: typeof value.updatedAt === "string"
            ? value.updatedAt
            : typeof value.updated_at === "string" ? value.updated_at : null
    };
}

export function normalizeGoal(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;

    const name = cleanText(value.name, 60);
    const current = cleanAmount(value.current ?? value.current_amount, true);
    const target = cleanAmount(value.target ?? value.target_amount);
    const deadline = value.deadline;
    const icon = VALID_ICONS.has(value.icon) ? value.icon : "✨";

    if (!name || current === null || target === null || !isValidDate(deadline)) return null;

    return {
        id: typeof value.id === "string" ? value.id : "",
        name,
        current,
        target,
        deadline,
        icon,
        createdAt: typeof value.createdAt === "string"
            ? value.createdAt
            : typeof value.created_at === "string" ? value.created_at : null
    };
}

export function normalizeBudget(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;

    const category = cleanText(value.category, 40);
    const amount = cleanAmount(value.amount);
    const rawMonth = value.month ?? value.month_start;
    const month = typeof rawMonth === "string" ? rawMonth.slice(0, 7) : "";

    if (!category || amount === null || !isValidMonth(month)) return null;

    return {
        id: typeof value.id === "string" ? value.id : "",
        month,
        category,
        amount,
        createdAt: typeof value.createdAt === "string"
            ? value.createdAt
            : typeof value.created_at === "string" ? value.created_at : null
    };
}

export function normalizeContribution(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;

    const goalId = value.goalId ?? value.goal_id;
    const date = value.date ?? value.contributed_on;
    const amount = cleanAmount(value.amount);
    const note = cleanText(value.note ?? "", 100);

    if (typeof goalId !== "string" || !UUID_PATTERN.test(goalId)) return null;
    if (amount === null || !isValidDate(date)) return null;

    return {
        id: typeof value.id === "string" ? value.id : "",
        goalId,
        amount,
        date,
        note,
        createdAt: typeof value.createdAt === "string"
            ? value.createdAt
            : typeof value.created_at === "string" ? value.created_at : null
    };
}

export function normalizeSnapshot(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {
            valid: false,
            transactions: [],
            goals: [],
            budgets: [],
            contributions: [],
            accounts: [],
            transfers: [],
            rejected: 0,
            settings: {}
        };
    }

    const rawTransactions = Array.isArray(value.transactions) ? value.transactions : [];
    const rawGoals = Array.isArray(value.goals) ? value.goals : [];
    const rawBudgets = Array.isArray(value.budgets) ? value.budgets : [];
    const rawContributions = Array.isArray(value.contributions) ? value.contributions : [];
    const rawAccounts = Array.isArray(value.accounts) ? value.accounts : [];
    const rawTransfers = Array.isArray(value.transfers) ? value.transfers : [];
    const transactions = rawTransactions.map(normalizeTransaction).filter(Boolean);
    const goals = rawGoals.map(normalizeGoal).filter(Boolean);
    const budgets = rawBudgets.map(normalizeBudget).filter(Boolean);
    const goalIds = new Set(goals.map(({ id }) => id).filter(Boolean));
    const contributions = rawContributions
        .map(normalizeContribution)
        .filter((contribution) => contribution && goalIds.has(contribution.goalId));
    const accounts = rawAccounts.map(normalizeFinancialAccount).filter(Boolean);
    const accountIds = new Set(accounts.map(({ id }) => id).filter(Boolean));
    transactions.forEach((transaction) => {
        if (transaction.accountId && !accountIds.has(transaction.accountId)) transaction.accountId = null;
    });
    const transfers = rawTransfers
        .map(normalizeTransfer)
        .filter((transfer) => transfer
            && accountIds.has(transfer.fromAccountId)
            && accountIds.has(transfer.toAccountId));
    const rejected = (rawTransactions.length - transactions.length)
        + (rawGoals.length - goals.length)
        + (rawBudgets.length - budgets.length)
        + (rawContributions.length - contributions.length)
        + (rawAccounts.length - accounts.length)
        + (rawTransfers.length - transfers.length);
    const theme = value.settings?.theme === "dark" ? "dark" : "light";
    const selectedMonth = isValidMonth(value.settings?.selectedMonth)
        ? value.settings.selectedMonth
        : currentMonthKey();

    return {
        valid: Array.isArray(value.transactions) && Array.isArray(value.goals),
        transactions,
        goals,
        budgets,
        contributions,
        accounts,
        transfers,
        rejected,
        settings: { theme, selectedMonth }
    };
}

export function readLegacySnapshot(storage = window.localStorage) {
    const raw = storage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return { found: false };

    try {
        const parsed = JSON.parse(raw);
        return { found: true, corrupted: false, raw, ...normalizeSnapshot(parsed) };
    } catch (error) {
        return { found: true, corrupted: true, valid: false, raw, error };
    }
}

export function createBackup({ transactions, goals, budgets = [], contributions = [], accounts = [], transfers = [], settings }) {
    return {
        app: "Fôlego",
        schemaVersion: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        transactions: transactions.map(({
            id, description, amount, type, category, date, status, paymentMethod, accountId,
            seriesId, seriesKind, installmentNumber, installmentTotal, createdAt
        }) => ({
            id, description, amount, type, category, date, status, paymentMethod, accountId,
            seriesId, seriesKind, installmentNumber, installmentTotal, createdAt
        })),
        goals: goals.map(({ id, name, current, target, deadline, icon, createdAt }) => ({
            id, name, current, target, deadline, icon, createdAt
        })),
        budgets: budgets.map(({ id, month, category, amount, createdAt }) => ({
            id, month, category, amount, createdAt
        })),
        contributions: contributions.map(({ id, goalId, amount, date, note, createdAt }) => ({
            id, goalId, amount, date, note, createdAt
        })),
        accounts: accounts.map(({
            id, bankCode, institutionName, name, accountType, initialBalance, color, createdAt
        }) => ({
            id, bankCode, institutionName, name, accountType, initialBalance, color, createdAt
        })),
        transfers: transfers.map(({
            id, fromAccountId, toAccountId, amount, date, status, note, createdAt
        }) => ({
            id, fromAccountId, toAccountId, amount, date, status, note, createdAt
        })),
        settings: {
            theme: settings.theme === "dark" ? "dark" : "light",
            selectedMonth: isValidMonth(settings.selectedMonth) ? settings.selectedMonth : currentMonthKey()
        }
    };
}

export function sanitizeCsvCell(value) {
    const text = String(value ?? "");
    return /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
}

export function getBalanceAsOf(transactions, isoDate = toISODate(), accounts = [], transfers = []) {
    const transactionBalance = transactions
        .filter((transaction) => transaction.status === "paid" && transaction.date <= isoDate)
        .reduce((total, transaction) => (
            total + (transaction.type === "income" ? Number(transaction.amount) : -Number(transaction.amount))
        ), 0);
    const initialBalance = accounts.reduce((total, account) => total + Number(account.initialBalance || 0), 0);
    // Transferências só redistribuem o saldo. Por isso não entram no total geral.
    return transactionBalance + initialBalance;
}

export function getAccountBalances(accounts, transactions, transfers, isoDate = toISODate()) {
    const balances = new Map(accounts.map((account) => [account.id, Number(account.initialBalance || 0)]));
    let undefinedBalance = 0;

    transactions
        .filter((transaction) => transaction.status === "paid" && transaction.date <= isoDate)
        .forEach((transaction) => {
            const change = transaction.type === "income" ? Number(transaction.amount) : -Number(transaction.amount);
            if (transaction.accountId && balances.has(transaction.accountId)) {
                balances.set(transaction.accountId, balances.get(transaction.accountId) + change);
            } else {
                undefinedBalance += change;
            }
        });

    transfers
        .filter((transfer) => transfer.status === "paid" && transfer.date <= isoDate)
        .forEach((transfer) => {
            const amount = Number(transfer.amount);
            if (balances.has(transfer.fromAccountId)) {
                balances.set(transfer.fromAccountId, balances.get(transfer.fromAccountId) - amount);
            }
            if (balances.has(transfer.toAccountId)) {
                balances.set(transfer.toAccountId, balances.get(transfer.toAccountId) + amount);
            }
        });

    return {
        accounts: accounts.map((account) => ({ ...account, balance: balances.get(account.id) ?? 0 })),
        undefinedBalance,
        total: [...balances.values()].reduce((sum, balance) => sum + balance, 0) + undefinedBalance
    };
}

export function getPeriodRange(mode = "month", referenceDate = toISODate()) {
    const safeDate = isValidDate(referenceDate) ? referenceDate : toISODate();

    if (mode === "day") return { start: safeDate, end: safeDate };

    if (mode === "week") {
        const date = parseISODate(safeDate);
        const daysSinceMonday = (date.getDay() + 6) % 7;
        const start = addDaysToISO(safeDate, -daysSinceMonday);
        return { start, end: addDaysToISO(start, 6) };
    }

    const month = safeDate.slice(0, 7);
    const start = `${month}-01`;
    return { start, end: addDaysToISO(addMonthsToISO(start, 1), -1) };
}

export function getPeriodTransactions(transactions, range, { paidOnly = true } = {}) {
    return transactions.filter((transaction) => (
        (!paidOnly || transaction.status === "paid")
        && transaction.date >= range.start
        && transaction.date <= range.end
    ));
}

export function rankExpenses(transactions, range, groupBy = "category") {
    const totals = new Map();
    const expenses = getPeriodTransactions(transactions, range)
        .filter((transaction) => transaction.type === "expense");

    expenses.forEach((transaction) => {
        const key = groupBy === "description"
            ? transaction.description
            : groupBy === "paymentMethod"
                ? PAYMENT_METHOD_LABELS[transaction.paymentMethod] ?? PAYMENT_METHOD_LABELS.other
                : transaction.category;
        const current = totals.get(key) ?? { label: key, amount: 0, count: 0 };
        current.amount += Number(transaction.amount);
        current.count += 1;
        totals.set(key, current);
    });

    const total = expenses.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    return [...totals.values()]
        .map((item) => ({
            ...item,
            amount: Math.round((item.amount + Number.EPSILON) * 100) / 100,
            share: total > 0 ? item.amount / total : 0
        }))
        .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label, "pt-BR"));
}

export function getBalanceProjection(transactions, horizonDays, isoDate = toISODate(), accounts = [], transfers = []) {
    const endDate = addDaysToISO(isoDate, horizonDays);
    const balanceToday = getBalanceAsOf(transactions, isoDate, accounts, transfers);
    const scheduledChange = transactions
        .filter((transaction) => (
            transaction.date <= endDate
            && (
                (transaction.status === "paid" && transaction.date > isoDate)
                || transaction.status === "pending"
            )
        ))
        .reduce((total, transaction) => (
            total + (transaction.type === "income" ? Number(transaction.amount) : -Number(transaction.amount))
        ), 0);

    return {
        days: horizonDays,
        endDate,
        balanceToday,
        scheduledChange,
        projectedBalance: balanceToday + scheduledChange
    };
}

export function getBreathingDays(transactions, isoDate = toISODate(), lookbackDays = 90, accounts = [], transfers = []) {
    const safeLookback = Number.isInteger(lookbackDays) && lookbackDays > 0 ? lookbackDays : 90;
    const startDate = addDaysToISO(isoDate, -(safeLookback - 1));
    const expenses = transactions
        .filter((transaction) => (
            transaction.type === "expense"
            && transaction.status === "paid"
            && transaction.date >= startDate
            && transaction.date <= isoDate
        ))
        .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

    if (expenses <= 0) return null;

    const balance = getBalanceAsOf(transactions, isoDate, accounts, transfers);
    const dailyAverage = expenses / safeLookback;
    return {
        days: Math.max(0, Math.floor(balance / dailyAverage)),
        dailyAverage,
        balance,
        lookbackDays: safeLookback
    };
}

export function getUpcomingTransactions(transactions, isoDate = toISODate(), daysAhead = 14) {
    const endDate = addDaysToISO(isoDate, daysAhead);
    return transactions
        .filter((transaction) => (
            transaction.status === "pending" && transaction.date <= endDate
        ))
        .sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description, "pt-BR"))
        .map((transaction) => ({
            ...transaction,
            timing: transaction.date < isoDate ? "overdue" : transaction.date === isoDate ? "today" : "upcoming"
        }));
}

export function getBudgetProgress(transactions, budgets, month = currentMonthKey()) {
    const range = getPeriodRange("month", `${month}-01`);
    const expensesByCategory = new Map(
        rankExpenses(transactions, range).map(({ label, amount }) => [label, amount])
    );

    return budgets
        .filter((budget) => budget.month === month)
        .map((budget) => {
            const spent = expensesByCategory.get(budget.category) ?? 0;
            return {
                ...budget,
                spent,
                remaining: budget.amount - spent,
                ratio: budget.amount > 0 ? spent / budget.amount : 0,
                status: spent > budget.amount ? "exceeded" : spent >= budget.amount * 0.8 ? "warning" : "safe"
            };
        })
        .sort((a, b) => b.ratio - a.ratio || a.category.localeCompare(b.category, "pt-BR"));
}

export function buildTransactionSeries(transaction, options = {}, uuid = () => crypto.randomUUID()) {
    const normalized = normalizeTransaction(transaction);
    if (!normalized) return [];

    const mode = options.mode ?? "single";
    if (mode === "single") return [{ ...normalized, id: normalized.id || "" }];

    const seriesId = uuid();

    if (mode === "installment") {
        const total = Math.min(120, Math.max(2, Number.parseInt(options.installments, 10) || 2));
        const totalCents = Math.round(normalized.amount * 100);
        const centsPerInstallment = Math.floor(totalCents / total);
        const remainder = totalCents % total;

        return Array.from({ length: total }, (_, index) => ({
            ...normalized,
            id: "",
            amount: (centsPerInstallment + (index < remainder ? 1 : 0)) / 100,
            date: addMonthsToISO(normalized.date, index),
            status: index === 0 ? normalized.status : "pending",
            seriesId,
            seriesKind: "installment",
            installmentNumber: index + 1,
            installmentTotal: total
        }));
    }

    if (mode === "recurring") {
        const count = Math.min(60, Math.max(2, Number.parseInt(options.count, 10) || 12));
        const frequency = ["weekly", "monthly", "yearly"].includes(options.frequency)
            ? options.frequency
            : "monthly";

        return Array.from({ length: count }, (_, index) => ({
            ...normalized,
            id: "",
            date: frequency === "weekly"
                ? addDaysToISO(normalized.date, index * 7)
                : addMonthsToISO(normalized.date, index * (frequency === "yearly" ? 12 : 1)),
            status: index === 0 ? normalized.status : "pending",
            seriesId,
            seriesKind: "recurring",
            installmentNumber: null,
            installmentTotal: null
        }));
    }

    return [{ ...normalized, id: normalized.id || "" }];
}

export function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
