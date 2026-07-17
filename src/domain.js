export const BACKUP_VERSION = 2;
export const LEGACY_STORAGE_KEY = "nexo-financas-v1";
export const THEME_STORAGE_KEY = "folego-theme-v2";

export const INCOME_CATEGORIES = ["Salário", "Freelance", "Vendas", "Investimentos", "Outras receitas"];
export const EXPENSE_CATEGORIES = ["Moradia", "Alimentação", "Transporte", "Saúde", "Educação", "Lazer", "Assinaturas", "Contas", "Outras despesas"];

const VALID_TYPES = new Set(["income", "expense"]);
const VALID_STATUSES = new Set(["paid", "pending"]);
const VALID_ICONS = new Set(["🛡️", "🏠", "✈️", "🚗", "💻", "🎓", "✨"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;
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

export function normalizeTransaction(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;

    const description = cleanText(value.description, 80);
    const category = cleanText(value.category, 40);
    const amount = cleanAmount(value.amount);
    const date = value.date ?? value.occurred_on;
    const createdAt = typeof value.createdAt === "string"
        ? value.createdAt
        : typeof value.created_at === "string" ? value.created_at : null;

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
        createdAt
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

export function normalizeSnapshot(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { valid: false, transactions: [], goals: [], rejected: 0, settings: {} };
    }

    const rawTransactions = Array.isArray(value.transactions) ? value.transactions : [];
    const rawGoals = Array.isArray(value.goals) ? value.goals : [];
    const transactions = rawTransactions.map(normalizeTransaction).filter(Boolean);
    const goals = rawGoals.map(normalizeGoal).filter(Boolean);
    const rejected = (rawTransactions.length - transactions.length) + (rawGoals.length - goals.length);
    const theme = value.settings?.theme === "dark" ? "dark" : "light";
    const selectedMonth = isValidMonth(value.settings?.selectedMonth)
        ? value.settings.selectedMonth
        : currentMonthKey();

    return {
        valid: Array.isArray(value.transactions) && Array.isArray(value.goals),
        transactions,
        goals,
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

export function createBackup({ transactions, goals, settings }) {
    return {
        app: "Fôlego",
        schemaVersion: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        transactions: transactions.map(({ id, description, amount, type, category, date, status, createdAt }) => ({
            id, description, amount, type, category, date, status, createdAt
        })),
        goals: goals.map(({ id, name, current, target, deadline, icon, createdAt }) => ({
            id, name, current, target, deadline, icon, createdAt
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

export function getBalanceAsOf(transactions, isoDate = toISODate()) {
    return transactions
        .filter((transaction) => transaction.status === "paid" && transaction.date <= isoDate)
        .reduce((total, transaction) => (
            total + (transaction.type === "income" ? Number(transaction.amount) : -Number(transaction.amount))
        ), 0);
}

export function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
