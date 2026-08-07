"use strict";

import { isSupabaseConfigured, supabase } from "./src/supabase-client.js";
import {
    addGoalContribution,
    deleteAccount,
    importLegacySnapshot,
    loadUserData,
    removeBudget,
    removeGoal,
    removeTransaction,
    replaceUserSnapshot,
    saveBudget,
    saveGoal,
    saveProfile,
    saveTransaction,
    saveTransactions
} from "./src/data-service.js";
import {
    buildTransactionSeries,
    createBackup,
    currentMonthKey,
    EXPENSE_CATEGORIES,
    getBalanceAsOf,
    getBalanceProjection,
    getBreathingDays,
    getBudgetProgress,
    getPeriodRange,
    getPeriodTransactions,
    getUpcomingTransactions,
    INCOME_CATEGORIES,
    isValidMonth,
    normalizeBudget,
    normalizeContribution,
    normalizeGoal,
    normalizeSnapshot,
    normalizeTransaction,
    PAYMENT_METHOD_LABELS,
    prefersReducedMotion,
    rankExpenses,
    readLegacySnapshot,
    sanitizeCsvCell,
    THEME_STORAGE_KEY,
    toISODate
} from "./src/domain.js";
import { generateFinancialReportPdf } from "./src/report-pdf.js";

/* ================================================================
   FÔLEGO V2 — INTERFACE E ORQUESTRAÇÃO
   O estado visual fica em memória; os registros reais vivem no Supabase.
================================================================ */

const CATEGORY_DETAILS = {
    "Salário": { icon: "briefcase", color: "#c8ff3d" },
    "Freelance": { icon: "terminal", color: "#2456d8" },
    "Vendas": { icon: "tag", color: "#ff4e1a" },
    "Investimentos": { icon: "trend", color: "#164b3a" },
    "Outras receitas": { icon: "spark", color: "#e2b93b" },
    "Moradia": { icon: "home", color: "#c8ff3d" },
    "Alimentação": { icon: "basket", color: "#ff4e1a" },
    "Transporte": { icon: "car", color: "#2456d8" },
    "Saúde": { icon: "heart", color: "#164b3a" },
    "Educação": { icon: "book", color: "#e2b93b" },
    "Lazer": { icon: "ticket", color: "#ff4e1a" },
    "Assinaturas": { icon: "repeat", color: "#2456d8" },
    "Contas": { icon: "receipt", color: "#164b3a" },
    "Outras despesas": { icon: "box", color: "#747168" }
};

const ICON_DRAWINGS = {
    briefcase: '<rect x="3" y="7" width="18" height="12" rx="1"/><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2"/>',
    terminal: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="m7 9 3 3-3 3M12 15h5"/>',
    tag: '<path d="M20 13 13 20 4 11V4h7Z"/><circle cx="8.5" cy="8.5" r="1.2"/>',
    trend: '<path d="M4 18V6M4 18h17M7 15l4-5 3 3 6-7M16 6h4v4"/>',
    spark: '<path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8ZM19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7Z"/>',
    home: '<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',
    basket: '<path d="m5 10 2 10h10l2-10ZM3 10h18M8 10l4-7 4 7M9 14v3M15 14v3"/>',
    car: '<path d="m5 10 2-5h10l2 5M4 10h16l1 4v4h-3v-2H6v2H3v-4Z"/><circle cx="7" cy="13" r="1"/><circle cx="17" cy="13" r="1"/>',
    heart: '<path d="M20.8 5.8a5.2 5.2 0 0 0-7.4 0L12 7.2l-1.4-1.4a5.2 5.2 0 0 0-7.4 7.4L12 22l8.8-8.8a5.2 5.2 0 0 0 0-7.4Z"/><path d="M7 12h3l1.2-3 2 6 1.2-3H18"/>',
    book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4ZM20 4h-4a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h4Z"/>',
    ticket: '<path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4Z"/><path d="M13 8v2M13 14v2"/>',
    repeat: '<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>',
    receipt: '<path d="M6 3h12v19l-3-2-3 2-3-2-3 2ZM9 8h6M9 12h6M9 16h4"/>',
    box: '<path d="m4 7 8-4 8 4v10l-8 4-8-4ZM4 7l8 4 8-4M12 11v10"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M8 3v4M16 3v4M3 10h18"/>'
};

const GOAL_ICON_NAMES = { "🛡️": "target", "🏠": "home", "✈️": "trend", "🚗": "car", "💻": "terminal", "🎓": "book", "✨": "spark" };

function renderIcon(name, className = "folego-icon") {
    const drawing = ICON_DRAWINGS[name] || ICON_DRAWINGS.spark;
    return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${drawing}</svg>`;
}

const SPECTRUM_COLORS = ["#c8ff3d", "#ff4e1a", "#2456d8", "#164b3a", "#e2b93b"];
const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const compactCurrencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1
});

const $ = (selector) => document.querySelector(selector);

const elements = {
    body: document.body,
    bootScreen: $("#bootScreen"),
    authShell: $("#authShell"),
    appShell: $("#appShell"),
    authToday: $("#authToday"),
    authConfigWarning: $("#authConfigWarning"),
    authStatus: $("#authStatus"),
    signInForm: $("#signInForm"),
    signUpForm: $("#signUpForm"),
    forgotPasswordForm: $("#forgotPasswordForm"),
    updatePasswordForm: $("#updatePasswordForm"),
    signInEmail: $("#signInEmail"),
    signInPassword: $("#signInPassword"),
    signUpName: $("#signUpName"),
    signUpEmail: $("#signUpEmail"),
    signUpPassword: $("#signUpPassword"),
    forgotEmail: $("#forgotEmail"),
    newPassword: $("#newPassword"),

    accountButton: $("#accountButton"),
    accountMenu: $("#accountMenu"),
    accountInitials: $("#accountInitials"),
    accountName: $("#accountName"),
    accountEmail: $("#accountEmail"),
    syncStatus: $("#syncStatus"),
    signOutButton: $("#signOutButton"),
    exportBackupButton: $("#exportBackupButton"),
    importBackupButton: $("#importBackupButton"),
    backupFileInput: $("#backupFileInput"),
    installAppButton: $("#installAppButton"),
    deleteAccountButton: $("#deleteAccountButton"),

    pageTitle: $("#pageTitle"),
    todayLabel: $("#todayLabel"),
    monthFilter: $("#monthFilter"),
    themeToggle: $("#themeToggle"),
    greetingTitle: $("#greetingTitle"),
    bannerBalance: $("#bannerBalance"),
    currentBalance: $("#currentBalance"),
    balanceCaption: $("#balanceCaption"),
    monthlyIncome: $("#monthlyIncome"),
    monthlyExpense: $("#monthlyExpense"),
    monthlySavings: $("#monthlySavings"),
    incomeTrend: $("#incomeTrend"),
    expenseTrend: $("#expenseTrend"),
    savingsCaption: $("#savingsCaption"),
    cashFlowChart: $("#cashFlowChart"),
    cashFlowSummary: $("#cashFlowSummary"),
    expenseDonut: $("#expenseDonut"),
    expenseSummary: $("#expenseSummary"),
    donutTotal: $("#donutTotal"),
    categoryLegend: $("#categoryLegend"),
    recentTransactions: $("#recentTransactions"),
    healthBadge: $("#healthBadge"),
    healthRing: $("#healthRing"),
    healthScore: $("#healthScore"),
    healthMessage: $("#healthMessage"),
    incomeCommitment: $("#incomeCommitment"),
    incomeCommitmentBar: $("#incomeCommitmentBar"),
    breathingDays: $("#breathingDays"),
    breathingCaption: $("#breathingCaption"),
    projection30: $("#projection30"),
    projection60: $("#projection60"),
    projection90: $("#projection90"),
    projection30Date: $("#projection30Date"),
    projection60Date: $("#projection60Date"),
    projection90Date: $("#projection90Date"),
    agendaCount: $("#agendaCount"),
    agendaList: $("#agendaList"),

    transactionSearch: $("#transactionSearch"),
    typeFilter: $("#typeFilter"),
    categoryFilter: $("#categoryFilter"),
    exportCsvButton: $("#exportCsvButton"),
    transactionRows: $("#transactionRows"),
    transactionCount: $("#transactionCount"),
    filteredTotal: $("#filteredTotal"),

    goalsSavedTotal: $("#goalsSavedTotal"),
    goalsTargetTotal: $("#goalsTargetTotal"),
    goalsOverallPercent: $("#goalsOverallPercent"),
    goalsOverallBar: $("#goalsOverallBar"),
    goalsGrid: $("#goalsGrid"),

    exportPdfButton: $("#exportPdfButton"),
    reportReferenceDate: $("#reportReferenceDate"),
    reportPeriodLabel: $("#reportPeriodLabel"),
    reportIncome: $("#reportIncome"),
    reportExpense: $("#reportExpense"),
    reportResult: $("#reportResult"),
    reportIncomeCount: $("#reportIncomeCount"),
    reportExpenseCount: $("#reportExpenseCount"),
    categoryRanking: $("#categoryRanking"),
    descriptionRanking: $("#descriptionRanking"),
    methodRanking: $("#methodRanking"),
    newBudgetButton: $("#newBudgetButton"),
    budgetList: $("#budgetList"),

    transactionDialog: $("#transactionDialog"),
    transactionForm: $("#transactionForm"),
    transactionModalTitle: $("#transactionModalTitle"),
    transactionId: $("#transactionId"),
    transactionDescription: $("#transactionDescription"),
    transactionAmount: $("#transactionAmount"),
    transactionCategory: $("#transactionCategory"),
    transactionDate: $("#transactionDate"),
    transactionStatus: $("#transactionStatus"),
    transactionPaymentMethod: $("#transactionPaymentMethod"),
    transactionMethodLabel: $("#transactionMethodLabel"),
    transactionMode: $("#transactionMode"),
    recurringFields: $("#recurringFields"),
    recurrenceFrequency: $("#recurrenceFrequency"),
    recurrenceCount: $("#recurrenceCount"),
    installmentFields: $("#installmentFields"),
    installmentCount: $("#installmentCount"),
    seriesEditHint: $("#seriesEditHint"),

    goalDialog: $("#goalDialog"),
    goalForm: $("#goalForm"),
    goalModalTitle: $("#goalModalTitle"),
    goalId: $("#goalId"),
    goalName: $("#goalName"),
    goalCurrent: $("#goalCurrent"),
    goalTarget: $("#goalTarget"),
    goalDeadline: $("#goalDeadline"),
    goalIcon: $("#goalIcon"),

    contributionDialog: $("#contributionDialog"),
    contributionForm: $("#contributionForm"),
    contributionModalTitle: $("#contributionModalTitle"),
    contributionGoalId: $("#contributionGoalId"),
    contributionGoalName: $("#contributionGoalName"),
    contributionAmount: $("#contributionAmount"),
    contributionDate: $("#contributionDate"),
    contributionNote: $("#contributionNote"),

    budgetDialog: $("#budgetDialog"),
    budgetForm: $("#budgetForm"),
    budgetId: $("#budgetId"),
    budgetMonth: $("#budgetMonth"),
    budgetCategory: $("#budgetCategory"),
    budgetAmount: $("#budgetAmount"),

    confirmDialog: $("#confirmDialog"),
    confirmTitle: $("#confirmTitle"),
    confirmMessage: $("#confirmMessage"),
    cancelConfirmButton: $("#cancelConfirmButton"),
    confirmDeleteButton: $("#confirmDeleteButton"),

    deleteAccountDialog: $("#deleteAccountDialog"),
    deleteAccountForm: $("#deleteAccountForm"),
    deleteAccountConfirmation: $("#deleteAccountConfirmation"),
    deleteAccountBackupButton: $("#deleteAccountBackupButton"),

    migrationDialog: $("#migrationDialog"),
    migrationMessage: $("#migrationMessage"),
    migrateDataButton: $("#migrateDataButton"),
    skipMigrationButton: $("#skipMigrationButton"),
    downloadLegacyButton: $("#downloadLegacyButton"),
    syncOverlay: $("#syncOverlay"),
    syncOverlayMessage: $("#syncOverlayMessage"),
    toast: $("#toast"),
    toastMessage: $("#toastMessage"),
    celebrationLayer: $("#celebrationLayer")
};

let session = null;
let activeUserId = null;
let activationCounter = 0;
let recoveryMode = false;
let pendingDeletion = null;
let legacySnapshot = null;
let toastTimer = null;
let lastCloudLoad = 0;
let filters = { search: "", type: "all", category: "all" };
let reportState = { mode: "month", referenceDate: toISODate() };
let deferredInstallPrompt = null;

let state = {
    transactions: [],
    goals: [],
    budgets: [],
    contributions: [],
    profile: null,
    settings: {
        theme: localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light",
        selectedMonth: currentMonthKey()
    }
};

/* ================================================================
   FUNÇÕES GERAIS E FORMATAÇÃO
================================================================ */

function escapeHTML(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
}

function formatCurrency(value) {
    return currencyFormatter.format(Number(value) || 0);
}

function formatCompactCurrency(value) {
    return compactCurrencyFormatter.format(Number(value) || 0);
}

function parseLocalDate(isoDate) {
    return new Date(`${isoDate}T12:00:00`);
}

function formatDate(isoDate, options = {}) {
    const defaultOptions = { day: "2-digit", month: "short", year: "numeric" };
    return new Intl.DateTimeFormat("pt-BR", { ...defaultOptions, ...options })
        .format(parseLocalDate(isoDate))
        .replace(" de ", " ");
}

function formatMonthLabel(monthKey, style = "long") {
    const [year, month] = monthKey.split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR", {
        month: style,
        year: style === "long" ? "numeric" : undefined
    }).format(new Date(year, month - 1, 1));
}

function getMonthKeyFromOffset(baseMonthKey, offset) {
    const [year, month] = baseMonthKey.split("-").map(Number);
    const date = new Date(year, month - 1 + offset, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dateWithMonthOffset(offset, preferredDay) {
    const today = new Date();
    const target = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(preferredDay, lastDay));
    return toISODate(target);
}

function categoryDetails(category) {
    return CATEGORY_DETAILS[category] || { icon: "spark", color: "#8a8ea3" };
}

function totalByType(transactions, type) {
    return transactions
        .filter((transaction) => transaction.type === type)
        .reduce((total, transaction) => total + Number(transaction.amount), 0);
}

function signedCurrency(transaction) {
    const signal = transaction.type === "income" ? "+" : "−";
    return `${signal} ${formatCurrency(transaction.amount)}`;
}

function transactionContext(transaction) {
    const parts = [transaction.type === "income" ? "Receita" : "Despesa"];
    parts.push(PAYMENT_METHOD_LABELS[transaction.paymentMethod] ?? PAYMENT_METHOD_LABELS.other);
    if (transaction.seriesKind === "installment" && transaction.installmentNumber && transaction.installmentTotal) {
        parts.push(`parcela ${transaction.installmentNumber}/${transaction.installmentTotal}`);
    } else if (transaction.seriesKind === "recurring") {
        parts.push("recorrente");
    }
    return parts.join(" • ");
}

function transactionsForMonth(monthKey, { onlyConfirmed = false, throughToday = false } = {}) {
    const today = toISODate();
    return state.transactions.filter((transaction) => {
        if (transaction.date.slice(0, 7) !== monthKey) return false;
        if (onlyConfirmed && transaction.status !== "paid") return false;
        if (throughToday && transaction.date > today) return false;
        return true;
    });
}

function getDisplayName() {
    const profileName = state.profile?.display_name?.trim();
    const metadataName = session?.user?.user_metadata?.display_name?.trim();
    return profileName || metadataName || session?.user?.email?.split("@")[0] || "Você";
}

function getInitials(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0]?.slice(0, 2) || "EU").toUpperCase();
}

function downloadText(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadBlob(blob, filename) {
    if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error("O relatório PDF ficou vazio.");
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function setSyncState(kind, label) {
    elements.syncStatus.textContent = label || (kind === "busy" ? "Salvando..." : kind === "error" ? "Falha ao sincronizar" : "Sincronizado");
    elements.accountButton.dataset.sync = kind;
}

function setSyncOverlay(visible, message = "Sincronizando seus dados...") {
    elements.syncOverlay.hidden = !visible;
    elements.syncOverlayMessage.textContent = message;
}

function setButtonBusy(form, busy, busyLabel) {
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;
    if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
    button.disabled = busy;
    button.innerHTML = busy ? `${escapeHTML(busyLabel)} <span>···</span>` : button.dataset.originalHtml;
}

function showToast(message, type = "success") {
    window.clearTimeout(toastTimer);
    elements.toastMessage.textContent = message;
    elements.toast.dataset.type = type;
    elements.toast.querySelector(".toast-icon").textContent = type === "warning" ? "!" : type === "error" ? "×" : "✓";
    elements.toast.classList.add("show");
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 3400);
}

function friendlyError(error) {
    const message = String(error?.message || error || "").toLowerCase();
    if (message.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
    if (message.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
    if (message.includes("user already registered")) return "Já existe uma conta com este e-mail.";
    if (message.includes("password") && message.includes("characters")) return "A senha precisa ter pelo menos 8 caracteres.";
    if (message.includes("rate limit")) return "Muitas tentativas seguidas. Aguarde um pouco e tente novamente.";
    if (message.includes("failed to fetch") || message.includes("network")) return "Não foi possível alcançar o servidor. Confira sua conexão.";
    if (message.includes("relation") || message.includes("schema cache") || message.includes("function public")) {
        return "O banco precisa da atualização V2.1. Execute supabase/migrations/v2_1_additive.sql no SQL Editor do Supabase.";
    }
    return error?.message || "Algo não saiu como esperado. Tente novamente.";
}

/* ================================================================
   AUTENTICAÇÃO E SESSÃO
================================================================ */

function showAuth(view = "signin") {
    elements.bootScreen.hidden = true;
    elements.appShell.hidden = true;
    elements.authShell.hidden = false;
    switchAuthView(view);
}

function showBoot(message = "ABRINDO O LIVRO-CAIXA") {
    elements.bootScreen.querySelector("p").textContent = message;
    elements.bootScreen.hidden = false;
    elements.authShell.hidden = true;
    elements.appShell.hidden = true;
}

function switchAuthView(view) {
    document.querySelectorAll("[data-auth-panel]").forEach((panel) => {
        const active = panel.dataset.authPanel === view;
        panel.hidden = !active;
        panel.classList.toggle("active", active);
    });
    elements.authStatus.textContent = "";
}

function setAuthStatus(message, type = "info") {
    elements.authStatus.textContent = message;
    elements.authStatus.dataset.type = type;
}

function updateAccountIdentity() {
    const name = getDisplayName();
    elements.accountName.textContent = name;
    elements.accountInitials.textContent = getInitials(name);
    elements.accountEmail.textContent = session?.user?.email || "—";
}

async function activateSession(nextSession, { force = false } = {}) {
    if (!nextSession?.user) return;
    if (!force && activeUserId === nextSession.user.id && !elements.appShell.hidden) return;

    const activationId = ++activationCounter;
    session = nextSession;
    showBoot("SINCRONIZANDO SEU LIVRO-CAIXA");

    try {
        let cloud = await loadUserData(nextSession.user.id);
        if (activationId !== activationCounter) return;

        if (!cloud.profile) {
            const displayName = nextSession.user.user_metadata?.display_name || nextSession.user.email?.split("@")[0] || "";
            const profile = await saveProfile(nextSession.user.id, { display_name: displayName, theme: state.settings.theme });
            cloud = { ...cloud, profile };
        }

        state = {
            transactions: cloud.transactions.map(normalizeTransaction).filter(Boolean),
            goals: cloud.goals.map(normalizeGoal).filter(Boolean),
            budgets: cloud.budgets.map(normalizeBudget).filter(Boolean),
            contributions: cloud.contributions.map(normalizeContribution).filter(Boolean),
            profile: cloud.profile,
            settings: {
                theme: cloud.profile?.theme === "dark" ? "dark" : state.settings.theme,
                selectedMonth: currentMonthKey()
            }
        };

        activeUserId = nextSession.user.id;
        lastCloudLoad = Date.now();
        localStorage.setItem(THEME_STORAGE_KEY, state.settings.theme);
        applyTheme(state.settings.theme);
        updateAccountIdentity();
        renderAll();

        elements.bootScreen.hidden = true;
        elements.authShell.hidden = true;
        elements.appShell.hidden = false;
        setSyncState("ok");

        const initialView = window.location.hash.replace("#", "");
        switchView(["dashboard", "transactions", "goals", "reports"].includes(initialView) ? initialView : "dashboard", false);
        window.setTimeout(offerLegacyMigration, 180);
    } catch (error) {
        console.error("Falha ao carregar a conta:", error);
        activeUserId = null;
        showAuth("signin");
        elements.signInEmail.value = nextSession.user.email || "";
        setAuthStatus(friendlyError(error), "error");
    }
}

function clearSessionView() {
    activationCounter += 1;
    session = null;
    activeUserId = null;
    state.transactions = [];
    state.goals = [];
    state.budgets = [];
    state.contributions = [];
    state.profile = null;
    closeAccountMenu();
    showAuth("signin");
}

async function handleSignIn(event) {
    event.preventDefault();
    if (!supabase) return;
    setButtonBusy(elements.signInForm, true, "ENTRANDO");
    setAuthStatus("Conferindo seus dados...");

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: elements.signInEmail.value.trim(),
            password: elements.signInPassword.value
        });
        if (error) throw error;
        await activateSession(data.session, { force: true });
    } catch (error) {
        setAuthStatus(friendlyError(error), "error");
    } finally {
        setButtonBusy(elements.signInForm, false);
    }
}

async function handleSignUp(event) {
    event.preventDefault();
    if (!supabase) return;
    const displayName = elements.signUpName.value.trim().replace(/\s+/g, " ").slice(0, 60);
    setButtonBusy(elements.signUpForm, true, "CRIANDO");
    setAuthStatus("Preparando sua primeira página...");

    try {
        const { data, error } = await supabase.auth.signUp({
            email: elements.signUpEmail.value.trim(),
            password: elements.signUpPassword.value,
            options: {
                data: { display_name: displayName },
                emailRedirectTo: window.location.origin
            }
        });
        if (error) throw error;

        if (data.session) {
            await activateSession(data.session, { force: true });
        } else {
            elements.signInEmail.value = elements.signUpEmail.value.trim();
            switchAuthView("signin");
            setAuthStatus("Conta criada. Abra o e-mail de confirmação e depois entre aqui.", "success");
        }
    } catch (error) {
        setAuthStatus(friendlyError(error), "error");
    } finally {
        setButtonBusy(elements.signUpForm, false);
    }
}

async function handleForgotPassword(event) {
    event.preventDefault();
    if (!supabase) return;
    setButtonBusy(elements.forgotPasswordForm, true, "ENVIANDO");

    try {
        const redirectTo = `${window.location.origin}${window.location.pathname}?recovery=1`;
        const { error } = await supabase.auth.resetPasswordForEmail(elements.forgotEmail.value.trim(), { redirectTo });
        if (error) throw error;
        setAuthStatus("Se esse e-mail estiver cadastrado, o link de recuperação chegará em instantes.", "success");
    } catch (error) {
        setAuthStatus(friendlyError(error), "error");
    } finally {
        setButtonBusy(elements.forgotPasswordForm, false);
    }
}

async function handleUpdatePassword(event) {
    event.preventDefault();
    if (!supabase) return;
    setButtonBusy(elements.updatePasswordForm, true, "ATUALIZANDO");

    try {
        const { error } = await supabase.auth.updateUser({ password: elements.newPassword.value });
        if (error) throw error;
        recoveryMode = false;
        await supabase.auth.signOut();
        showAuth("signin");
        setAuthStatus("Senha atualizada. Agora você já pode entrar.", "success");
    } catch (error) {
        setAuthStatus(friendlyError(error), "error");
    } finally {
        setButtonBusy(elements.updatePasswordForm, false);
    }
}

async function handleSignOut() {
    if (!supabase) return;
    elements.signOutButton.disabled = true;
    setSyncState("busy", "Encerrando...");
    const { error } = await supabase.auth.signOut();
    elements.signOutButton.disabled = false;
    if (error) {
        showToast(friendlyError(error), "error");
        return;
    }
    clearSessionView();
}

/* ================================================================
   PAINEL E LEITURAS FINANCEIRAS
================================================================ */

function renderGreeting() {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
    const firstName = getDisplayName().split(/\s+/)[0];
    elements.greetingTitle.textContent = `${greeting}, ${firstName}!`;
    elements.todayLabel.textContent = new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long"
    }).format(new Date());
}

function renderSummary() {
    const today = toISODate();
    const selectedMonth = state.settings.selectedMonth;
    const previousMonth = getMonthKeyFromOffset(selectedMonth, -1);
    const confirmed = state.transactions.filter((transaction) => transaction.status === "paid");
    const currentConfirmed = confirmed.filter((transaction) => transaction.date.slice(0, 7) === selectedMonth);
    const previousConfirmed = confirmed.filter((transaction) => transaction.date.slice(0, 7) === previousMonth);

    const balanceToday = getBalanceAsOf(state.transactions, today);
    const projectedBalance = totalByType(confirmed, "income") - totalByType(confirmed, "expense");
    const income = totalByType(currentConfirmed, "income");
    const expense = totalByType(currentConfirmed, "expense");
    const savings = income - expense;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;

    elements.currentBalance.textContent = formatCurrency(balanceToday);
    elements.currentBalance.classList.toggle("long-value", elements.currentBalance.textContent.length > 17);
    elements.bannerBalance.textContent = formatCurrency(projectedBalance);
    elements.monthlyIncome.textContent = formatCurrency(income);
    elements.monthlyExpense.textContent = formatCurrency(expense);
    elements.monthlySavings.textContent = formatCurrency(savings);
    elements.monthlySavings.style.color = savings < 0 ? "var(--orange)" : "";

    const pending = transactionsForMonth(selectedMonth).filter((transaction) => transaction.status === "pending");
    const pendingIncome = totalByType(pending, "income");
    const pendingExpense = totalByType(pending, "expense");
    const pendingParts = [];
    if (pendingIncome > 0) pendingParts.push(`${formatCurrency(pendingIncome)} a receber`);
    if (pendingExpense > 0) pendingParts.push(`${formatCurrency(pendingExpense)} a pagar`);
    elements.balanceCaption.textContent = pendingParts.length
        ? pendingParts.join(" • ")
        : "Nenhuma pendência registrada neste mês";

    elements.savingsCaption.textContent = income > 0
        ? `${Math.abs(savingsRate).toFixed(1).replace(".", ",")}% da receita ${savings >= 0 ? "permanece no mês" : "foi ultrapassada"}`
        : "Cadastre uma receita confirmada para calcular";

    renderTrend(elements.incomeTrend, income, totalByType(previousConfirmed, "income"), false);
    renderTrend(elements.expenseTrend, expense, totalByType(previousConfirmed, "expense"), true);
    renderHealth(income, expense);
}

function renderTrend(target, currentValue, previousValue, lowerIsBetter) {
    if (previousValue <= 0) {
        target.innerHTML = "<b>—</b> sem comparação no mês anterior";
        return;
    }

    const percentage = ((currentValue - previousValue) / previousValue) * 100;
    const favorable = lowerIsBetter ? percentage <= 0 : percentage >= 0;
    const signal = percentage >= 0 ? "+" : "";
    target.innerHTML = `<b class="${favorable ? "" : "negative"}">${signal}${percentage.toFixed(1).replace(".", ",")}%</b> comparado ao mês anterior`;
}

function renderCashFlowChart() {
    const months = Array.from({ length: 6 }, (_, index) => getMonthKeyFromOffset(state.settings.selectedMonth, index - 5));
    const confirmed = state.transactions.filter((transaction) => transaction.status === "paid");
    const values = months.map((monthKey) => {
        const monthly = confirmed.filter((transaction) => transaction.date.slice(0, 7) === monthKey);
        return {
            monthKey,
            income: totalByType(monthly, "income"),
            expense: totalByType(monthly, "expense")
        };
    });
    const highestValue = Math.max(0, ...values.flatMap((value) => [value.income, value.expense]));
    elements.cashFlowChart.classList.toggle("empty", highestValue === 0);

    elements.cashFlowChart.innerHTML = values.map((value, index) => {
        const incomeHeight = highestValue > 0 && value.income > 0 ? (value.income / highestValue) * 100 : 0;
        const expenseHeight = highestValue > 0 && value.expense > 0 ? (value.expense / highestValue) * 100 : 0;
        const monthName = formatMonthLabel(value.monthKey, "short").replace(".", "");
        return `
            <div class="chart-column">
                <i class="chart-bar income-bar ${value.income === 0 ? "zero" : ""}" style="height:${incomeHeight}%; animation-delay:${index * 55}ms" title="Receitas: ${escapeHTML(formatCurrency(value.income))}"></i>
                <i class="chart-bar expense-bar ${value.expense === 0 ? "zero" : ""}" style="height:${expenseHeight}%; animation-delay:${index * 55 + 80}ms" title="Despesas: ${escapeHTML(formatCurrency(value.expense))}"></i>
                <span class="chart-month">${escapeHTML(monthName)}</span>
            </div>
        `;
    }).join("");

    elements.cashFlowSummary.textContent = highestValue === 0
        ? "Não há receitas ou despesas confirmadas nos seis meses exibidos."
        : values.map((value) => `${formatMonthLabel(value.monthKey)}: entrou ${formatCurrency(value.income)} e saiu ${formatCurrency(value.expense)}.`).join(" ");
}

function renderExpenseSpectrum() {
    const paidExpenses = transactionsForMonth(state.settings.selectedMonth, { onlyConfirmed: true })
        .filter((transaction) => transaction.type === "expense");
    const grouped = paidExpenses.reduce((result, transaction) => {
        result[transaction.category] = (result[transaction.category] || 0) + Number(transaction.amount);
        return result;
    }, {});
    let categories = Object.entries(grouped)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    if (categories.length > 5) {
        const others = categories.slice(4).reduce((total, category) => total + category.value, 0);
        categories = [...categories.slice(0, 4), { name: "Outros", value: others }];
    }

    const total = categories.reduce((sum, category) => sum + category.value, 0);
    elements.donutTotal.textContent = formatCompactCurrency(total);
    if (total <= 0) {
        elements.expenseDonut.style.background = "var(--line-soft)";
        elements.categoryLegend.innerHTML = '<p class="empty-mini">Nenhuma despesa confirmada neste mês.</p>';
        elements.expenseSummary.textContent = "Nenhuma despesa confirmada no mês selecionado.";
        return;
    }

    let accumulated = 0;
    const gradients = categories.map((category, index) => {
        const start = accumulated;
        const end = accumulated + (category.value / total) * 100;
        accumulated = end;
        return `${SPECTRUM_COLORS[index]} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    });
    elements.expenseDonut.style.background = `linear-gradient(to right, ${gradients.join(", ")})`;
    elements.categoryLegend.innerHTML = categories.map((category, index) => {
        const percentage = (category.value / total) * 100;
        return `
            <div class="category-item" title="${escapeHTML(formatCurrency(category.value))}">
                <i class="category-color" style="background:${SPECTRUM_COLORS[index]}"></i>
                <span class="category-name">${escapeHTML(category.name)}</span>
                <strong class="category-percent">${percentage.toFixed(0)}%</strong>
            </div>
        `;
    }).join("");
    elements.expenseSummary.textContent = categories
        .map((category) => `${category.name}: ${formatCurrency(category.value)}, ${((category.value / total) * 100).toFixed(0)}%.`)
        .join(" ");
}

function renderRecentTransactions() {
    const recent = [...state.transactions]
        .sort((a, b) => String(b.createdAt || `${b.date}T00:00:00`).localeCompare(String(a.createdAt || `${a.date}T00:00:00`)))
        .slice(0, 5);

    if (!recent.length) {
        elements.recentTransactions.innerHTML = `
            <div class="empty-state"><span class="empty-icon">${renderIcon("receipt")}</span><strong>Seu caixa começa vazio</strong><p>Registre sua primeira receita ou despesa. Nenhum exemplo foi misturado aos seus dados.</p></div>
        `;
        return;
    }

    elements.recentTransactions.innerHTML = recent.map((transaction) => {
        const details = categoryDetails(transaction.category);
        const valueClass = transaction.type === "income" ? "income-value" : "expense-value";
        const pendingText = transaction.status === "pending" ? " • pendente" : "";
        return `
            <div class="recent-item">
                <span class="transaction-icon">${renderIcon(details.icon)}</span>
                <div class="transaction-main"><strong>${escapeHTML(transaction.description)}</strong><span>${escapeHTML(transaction.category)} • ${escapeHTML(PAYMENT_METHOD_LABELS[transaction.paymentMethod] ?? PAYMENT_METHOD_LABELS.other)}${pendingText}</span></div>
                <span class="recent-date">${escapeHTML(formatDate(transaction.date, { day: "2-digit", month: "short" }))}</span>
                <strong class="recent-value ${valueClass}">${escapeHTML(signedCurrency(transaction))}</strong>
            </div>
        `;
    }).join("");
}

function renderHealth(income, expense) {
    const commitment = income > 0 ? (expense / income) * 100 : 0;
    const score = income > 0 ? clamp(Math.round(100 - commitment), 0, 100) : 0;
    const progress = clamp(commitment, 0, 100);
    let badge = "Excelente";
    let badgeClass = "";
    let message = "A pontuação é a parcela da receita que permaneceu livre no mês.";

    if (income <= 0) {
        badge = "Sem dados";
        badgeClass = "danger";
        message = "Adicione uma receita confirmada para calcular. Fórmula: 100 menos o percentual gasto.";
    } else if (score < 40 && score >= 15) {
        badge = "Equilibrado";
        badgeClass = "warning";
        message = "Ainda existe margem, mas as despesas já ocupam a maior parte da receita.";
    } else if (score < 15) {
        badge = "Atenção";
        badgeClass = "danger";
        message = "Pouca receita permaneceu livre. Fórmula: 100 menos o percentual gasto no mês.";
    }

    elements.healthScore.textContent = String(score);
    elements.healthRing.style.setProperty("--health-score", `${score}%`);
    elements.healthBadge.textContent = badge;
    elements.healthBadge.className = `health-badge ${badgeClass}`.trim();
    elements.healthMessage.textContent = message;
    elements.incomeCommitment.textContent = `${commitment.toFixed(0)}%`;
    elements.incomeCommitmentBar.style.width = `${progress}%`;
}

/* ================================================================
   EXTRATO E METAS
================================================================ */

function getFilteredTransactions() {
    const search = filters.search.trim().toLocaleLowerCase("pt-BR");
    return state.transactions
        .filter((transaction) => transaction.date.slice(0, 7) === state.settings.selectedMonth)
        .filter((transaction) => filters.type === "all" || transaction.type === filters.type)
        .filter((transaction) => filters.category === "all" || transaction.category === filters.category)
        .filter((transaction) => !search || `${transaction.description} ${transaction.category}`.toLocaleLowerCase("pt-BR").includes(search))
        .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function renderCategoryFilter() {
    const selected = filters.category;
    const usedCategories = [...new Set(state.transactions.map((transaction) => transaction.category))]
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
    elements.categoryFilter.innerHTML = [
        '<option value="all">Todas</option>',
        ...usedCategories.map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`)
    ].join("");
    filters.category = selected === "all" || usedCategories.includes(selected) ? selected : "all";
    elements.categoryFilter.value = filters.category;
}

function renderTransactionTable() {
    const transactions = getFilteredTransactions();
    if (!transactions.length) {
        elements.transactionRows.innerHTML = `
            <tr class="empty-table-row"><td colspan="6"><div class="empty-state"><span class="empty-icon">${renderIcon("search")}</span><strong>Nada encontrado</strong><p>Altere os filtros ou registre um movimento em ${escapeHTML(formatMonthLabel(state.settings.selectedMonth))}.</p></div></td></tr>
        `;
    } else {
        elements.transactionRows.innerHTML = transactions.map((transaction) => {
            const details = categoryDetails(transaction.category);
            const isIncome = transaction.type === "income";
            const statusText = transaction.status === "paid" ? "Confirmado" : "Pendente";
            return `
                <tr class="transaction-row">
                    <td class="movement-cell">
                        <div class="transaction-cell-main">
                            <span class="transaction-icon">${renderIcon(details.icon)}</span>
                            <div class="transaction-description">
                                <strong>${escapeHTML(transaction.description)}</strong>
                                <small>${escapeHTML(transactionContext(transaction))}</small>
                                <span class="mobile-transaction-meta">
                                    <i>${escapeHTML(transaction.category)}</i><i>${escapeHTML(formatDate(transaction.date, { day: "2-digit", month: "short" }))}</i><i class="${transaction.status === "pending" ? "pending" : ""}">${statusText}</i>
                                </span>
                            </div>
                        </div>
                    </td>
                    <td class="category-cell">${escapeHTML(transaction.category)}</td>
                    <td class="date-cell">${escapeHTML(formatDate(transaction.date, { day: "2-digit", month: "short" }))}</td>
                    <td class="status-cell"><i class="status-pill ${transaction.status === "pending" ? "pending" : ""}">${statusText}</i></td>
                    <td class="value-cell ${isIncome ? "income-value" : "expense-value"}"><strong>${escapeHTML(signedCurrency(transaction))}</strong></td>
                    <td class="actions-cell">
                        <div class="row-actions">
                            <button class="row-action" type="button" data-action="edit-transaction" data-id="${escapeHTML(transaction.id)}" aria-label="Editar ${escapeHTML(transaction.description)}" title="Editar">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
                            </button>
                            <button class="row-action delete" type="button" data-action="delete-transaction" data-id="${escapeHTML(transaction.id)}" aria-label="Excluir ${escapeHTML(transaction.description)}" title="Excluir">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5"/></svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    }

    const confirmedFiltered = transactions.filter((transaction) => transaction.status === "paid");
    const result = totalByType(confirmedFiltered, "income") - totalByType(confirmedFiltered, "expense");
    elements.transactionCount.textContent = `${transactions.length} ${transactions.length === 1 ? "movimento" : "movimentos"}`;
    elements.filteredTotal.textContent = `Confirmado: ${formatCurrency(result)}`;
    elements.filteredTotal.style.color = result < 0 ? "var(--orange)" : "";
}

function renderGoals() {
    const totalCurrent = state.goals.reduce((sum, goal) => sum + Number(goal.current), 0);
    const totalTarget = state.goals.reduce((sum, goal) => sum + Number(goal.target), 0);
    const overallPercent = totalTarget > 0 ? clamp((totalCurrent / totalTarget) * 100, 0, 100) : 0;
    elements.goalsSavedTotal.textContent = formatCurrency(totalCurrent);
    elements.goalsTargetTotal.textContent = formatCurrency(totalTarget);
    elements.goalsOverallPercent.textContent = `${overallPercent.toFixed(0)}%`;
    elements.goalsOverallBar.style.width = `${overallPercent}%`;

    if (!state.goals.length) {
        elements.goalsGrid.innerHTML = `<div class="panel empty-state"><span class="empty-icon">${renderIcon("target")}</span><strong>Seu próximo plano começa aqui</strong><p>Crie uma meta e registre aportes para acompanhar o caminho.</p></div>`;
        return;
    }

    elements.goalsGrid.innerHTML = state.goals.map((goal) => {
        const rawPercent = Number(goal.target) > 0 ? (Number(goal.current) / Number(goal.target)) * 100 : 0;
        const percent = clamp(rawPercent, 0, 100);
        const completed = rawPercent >= 100;
        const contributions = state.contributions
            .filter((contribution) => contribution.goalId === goal.id)
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 3);
        return `
            <article class="goal-card ${completed ? "completed" : ""}">
                <div class="goal-card-header">
                    <span class="goal-icon">${renderIcon(GOAL_ICON_NAMES[goal.icon] || "spark")}</span>
                    <div class="goal-title-wrap"><h3>${escapeHTML(goal.name)}</h3><span>Prazo: ${escapeHTML(formatDate(goal.deadline, { month: "long", year: "numeric" }))}</span></div>
                    <div class="goal-actions">
                        <button class="row-action" type="button" data-action="edit-goal" data-id="${escapeHTML(goal.id)}" aria-label="Editar ${escapeHTML(goal.name)}" title="Editar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button>
                        <button class="row-action delete" type="button" data-action="delete-goal" data-id="${escapeHTML(goal.id)}" aria-label="Excluir ${escapeHTML(goal.name)}" title="Excluir"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5"/></svg></button>
                    </div>
                </div>
                <div class="goal-values"><div><span>JÁ SEPARADO</span><strong>${escapeHTML(formatCurrency(goal.current))}</strong><small>de ${escapeHTML(formatCurrency(goal.target))}</small></div><b class="goal-percent">${percent.toFixed(0)}%</b></div>
                <div class="goal-progress"><i style="width:${percent}%"></i></div>
                <div class="goal-contribution-row">
                    <button class="goal-contribution-button" type="button" data-action="contribute-goal" data-id="${escapeHTML(goal.id)}"><span>+</span> REGISTRAR APORTE</button>
                    <small>${contributions.length ? `${contributions.length} aporte(s) recente(s)` : "sem aportes no histórico"}</small>
                </div>
                ${contributions.length ? `<div class="goal-history">${contributions.map((contribution) => `
                    <div><span>${escapeHTML(formatDate(contribution.date, { day: "2-digit", month: "short" }))}</span><strong>+ ${escapeHTML(formatCurrency(contribution.amount))}</strong>${contribution.note ? `<small>${escapeHTML(contribution.note)}</small>` : ""}</div>
                `).join("")}</div>` : ""}
                ${completed ? '<span class="completed-label">✓ Meta conquistada!</span>' : ""}
            </article>
        `;
    }).join("");
}

function renderForecast() {
    const today = toISODate();
    const breathing = getBreathingDays(state.transactions, today, 90);
    if (!breathing) {
        elements.breathingDays.textContent = "—";
        elements.breathingCaption.textContent = "Registre despesas confirmadas para calcular sua média de 90 dias.";
    } else {
        elements.breathingDays.textContent = breathing.days > 999 ? "999+" : String(breathing.days);
        elements.breathingCaption.textContent = `Média recente de ${formatCurrency(breathing.dailyAverage)} por dia. Não é previsão de rendimento.`;
    }

    [30, 60, 90].forEach((days) => {
        const projection = getBalanceProjection(state.transactions, days, today);
        const valueElement = elements[`projection${days}`];
        const dateElement = elements[`projection${days}Date`];
        valueElement.textContent = formatCurrency(projection.projectedBalance);
        valueElement.classList.toggle("negative", projection.projectedBalance < 0);
        dateElement.textContent = `ATÉ ${formatDate(projection.endDate, { day: "2-digit", month: "short" }).toUpperCase()}`;
    });

    const agenda = getUpcomingTransactions(state.transactions, today, 14);
    elements.agendaCount.textContent = `${agenda.length} ${agenda.length === 1 ? "ITEM" : "ITENS"}`;
    if (!agenda.length) {
        elements.agendaList.innerHTML = `<div class="agenda-empty"><span>${renderIcon("calendar")}</span><p>Nenhuma pendência vencida ou prevista para os próximos 14 dias.</p></div>`;
        return;
    }

    elements.agendaList.innerHTML = agenda.slice(0, 7).map((transaction) => {
        const timingLabel = transaction.timing === "overdue"
            ? "ATRASADO"
            : transaction.timing === "today" ? "HOJE" : formatDate(transaction.date, { day: "2-digit", month: "short" }).toUpperCase();
        return `
            <button class="agenda-item ${transaction.timing}" type="button" data-action="edit-agenda" data-id="${escapeHTML(transaction.id)}">
                <span class="agenda-icon">${renderIcon(categoryDetails(transaction.category).icon)}</span>
                <span class="agenda-copy"><strong>${escapeHTML(transaction.description)}</strong><small>${escapeHTML(transaction.category)} • ${escapeHTML(PAYMENT_METHOD_LABELS[transaction.paymentMethod] ?? PAYMENT_METHOD_LABELS.other)}</small></span>
                <i>${escapeHTML(timingLabel)}</i>
                <b class="${transaction.type === "income" ? "income-value" : "expense-value"}">${escapeHTML(signedCurrency(transaction))}</b>
            </button>
        `;
    }).join("");
}

function formatReportPeriod(range, mode) {
    if (mode === "day") {
        return formatDate(range.start, { day: "2-digit", month: "long", year: "numeric" });
    }
    if (mode === "month") return formatMonthLabel(range.start.slice(0, 7));
    const sameMonth = range.start.slice(0, 7) === range.end.slice(0, 7);
    if (sameMonth) {
        return `${range.start.slice(8)} a ${formatDate(range.end, { day: "2-digit", month: "long", year: "numeric" })}`;
    }
    return `${formatDate(range.start)} a ${formatDate(range.end)}`;
}

function getCurrentReport() {
    const range = getPeriodRange(reportState.mode, reportState.referenceDate);
    const transactions = getPeriodTransactions(state.transactions, range)
        .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const incomeTransactions = transactions.filter((transaction) => transaction.type === "income");
    const expenseTransactions = transactions.filter((transaction) => transaction.type === "expense");
    const income = totalByType(incomeTransactions, "income");
    const expense = totalByType(expenseTransactions, "expense");

    return {
        range,
        periodLabel: formatReportPeriod(range, reportState.mode),
        transactions,
        incomeTransactions,
        expenseTransactions,
        income,
        expense,
        result: income - expense,
        categoryRanking: rankExpenses(state.transactions, range, "category"),
        descriptionRanking: rankExpenses(state.transactions, range, "description"),
        methodRanking: rankExpenses(state.transactions, range, "paymentMethod")
    };
}

function renderRanking(target, items, emptyMessage) {
    if (!items.length) {
        target.innerHTML = `<div class="ranking-empty"><span>—</span><p>${escapeHTML(emptyMessage)}</p></div>`;
        return;
    }

    const highest = items[0].amount || 1;
    target.innerHTML = items.slice(0, 8).map((item, index) => `
        <div class="ranking-item ${index === 0 ? "leader" : ""}">
            <span class="ranking-position">${String(index + 1).padStart(2, "0")}</span>
            <div class="ranking-copy"><strong>${escapeHTML(item.label)}</strong><small>${item.count} ${item.count === 1 ? "movimento" : "movimentos"}</small><i><b style="width:${(item.amount / highest) * 100}%"></b></i></div>
            <div class="ranking-value"><strong>${escapeHTML(formatCurrency(item.amount))}</strong><span>${(item.share * 100).toFixed(0)}%</span></div>
        </div>
    `).join("");
}

function renderBudgets(month) {
    const progress = getBudgetProgress(state.transactions, state.budgets, month);
    if (!progress.length) {
        elements.budgetList.innerHTML = `<div class="budget-empty"><span>${renderIcon("target")}</span><p>Nenhum limite definido para ${escapeHTML(formatMonthLabel(month))}.</p></div>`;
        return;
    }

    elements.budgetList.innerHTML = progress.map((budget) => {
        const percent = Math.round(budget.ratio * 100);
        const statusText = budget.status === "exceeded"
            ? `PASSOU ${formatCurrency(Math.abs(budget.remaining))}`
            : budget.status === "warning" ? "ATENÇÃO / 80%+" : `RESTAM ${formatCurrency(budget.remaining)}`;
        return `
            <article class="budget-item ${budget.status}">
                <span class="budget-icon">${renderIcon(categoryDetails(budget.category).icon)}</span>
                <div class="budget-copy">
                    <div><strong>${escapeHTML(budget.category)}</strong><span>${escapeHTML(statusText)}</span></div>
                    <p><b>${escapeHTML(formatCurrency(budget.spent))}</b> de ${escapeHTML(formatCurrency(budget.amount))}</p>
                    <div class="budget-track"><i style="width:${Math.min(100, budget.ratio * 100)}%"></i></div>
                </div>
                <strong class="budget-percent">${percent}%</strong>
                <div class="budget-actions">
                    <button class="row-action" type="button" data-action="edit-budget" data-id="${escapeHTML(budget.id)}" aria-label="Editar limite de ${escapeHTML(budget.category)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button>
                    <button class="row-action delete" type="button" data-action="delete-budget" data-id="${escapeHTML(budget.id)}" aria-label="Excluir limite de ${escapeHTML(budget.category)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5"/></svg></button>
                </div>
            </article>
        `;
    }).join("");
}

function renderReports() {
    const report = getCurrentReport();
    elements.reportReferenceDate.value = reportState.referenceDate;
    document.querySelectorAll("[data-report-period]").forEach((button) => {
        const active = button.dataset.reportPeriod === reportState.mode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    });
    elements.reportPeriodLabel.textContent = report.periodLabel;
    elements.reportIncome.textContent = formatCurrency(report.income);
    elements.reportExpense.textContent = formatCurrency(report.expense);
    elements.reportResult.textContent = formatCurrency(report.result);
    elements.reportResult.classList.toggle("negative", report.result < 0);
    elements.reportIncomeCount.textContent = `${report.incomeTransactions.length} ${report.incomeTransactions.length === 1 ? "registro" : "registros"}`;
    elements.reportExpenseCount.textContent = `${report.expenseTransactions.length} ${report.expenseTransactions.length === 1 ? "registro" : "registros"}`;
    renderRanking(elements.categoryRanking, report.categoryRanking, "Nenhuma despesa confirmada neste período.");
    renderRanking(elements.descriptionRanking, report.descriptionRanking, "Ainda não há saídas para ordenar.");
    renderRanking(elements.methodRanking, report.methodRanking, "As formas de pagamento aparecerão aqui.");
    renderBudgets(reportState.referenceDate.slice(0, 7));
}

function renderAll() {
    elements.monthFilter.value = state.settings.selectedMonth;
    renderGreeting();
    renderSummary();
    renderCashFlowChart();
    renderExpenseSpectrum();
    renderRecentTransactions();
    renderCategoryFilter();
    renderTransactionTable();
    renderGoals();
    renderForecast();
    renderReports();
}

/* ================================================================
   NAVEGAÇÃO E FORMULÁRIOS
================================================================ */

function switchView(viewName, scroll = true) {
    const validViews = ["dashboard", "transactions", "goals", "reports"];
    const selectedView = validViews.includes(viewName) ? viewName : "dashboard";
    const titles = { dashboard: "Pulso atual", transactions: "Extrato completo", goals: "Planos futuros", reports: "Raio-X financeiro" };
    document.querySelectorAll("[data-view-section]").forEach((section) => section.classList.toggle("active", section.dataset.viewSection === selectedView));
    document.querySelectorAll(".rail-link[data-view]").forEach((button) => {
        const active = button.dataset.view === selectedView;
        button.classList.toggle("active", active);
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
    });
    elements.pageTitle.textContent = titles[selectedView];
    history.replaceState(null, "", `#${selectedView}`);
    if (scroll) window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

function defaultDateForSelectedMonth() {
    return state.settings.selectedMonth === currentMonthKey() ? toISODate() : `${state.settings.selectedMonth}-01`;
}

function updateTransactionCategoryOptions(type, preferredCategory = null) {
    const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    elements.transactionCategory.innerHTML = categories
        .map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`)
        .join("");
    elements.transactionCategory.value = preferredCategory && categories.includes(preferredCategory) ? preferredCategory : categories[0];
}

function updateTransactionModeUI() {
    const type = elements.transactionForm.querySelector('input[name="transactionType"]:checked')?.value || "expense";
    const editing = Boolean(elements.transactionId.value);
    const installmentOption = elements.transactionMode.querySelector('option[value="installment"]');
    installmentOption.disabled = type === "income";
    if (type === "income" && elements.transactionMode.value === "installment") elements.transactionMode.value = "single";

    const mode = elements.transactionMode.value;
    elements.transactionMethodLabel.textContent = type === "income" ? "COMO O DINHEIRO ENTROU" : "COMO PAGOU";
    elements.transactionMode.disabled = editing;
    elements.recurringFields.hidden = editing || mode !== "recurring";
    elements.installmentFields.hidden = editing || mode !== "installment";
    elements.seriesEditHint.hidden = !editing || !state.transactions.find((item) => item.id === elements.transactionId.value)?.seriesKind;
    elements.recurrenceFrequency.required = !editing && mode === "recurring";
    elements.recurrenceCount.required = !editing && mode === "recurring";
    elements.installmentCount.required = !editing && mode === "installment";
}

function openTransactionDialog(transactionId = null) {
    const transaction = state.transactions.find((item) => item.id === transactionId);
    elements.transactionForm.reset();
    elements.transactionId.value = transaction?.id || "";
    elements.transactionModalTitle.textContent = transaction ? "Editar movimentação" : "Nova movimentação";
    const type = transaction?.type || "expense";
    const typeInput = elements.transactionForm.querySelector(`input[name="transactionType"][value="${type}"]`);
    if (typeInput) typeInput.checked = true;
    updateTransactionCategoryOptions(type, transaction?.category);
    elements.transactionDescription.value = transaction?.description || "";
    elements.transactionAmount.value = transaction?.amount || "";
    elements.transactionDate.value = transaction?.date || defaultDateForSelectedMonth();
    elements.transactionStatus.value = transaction?.status || "paid";
    elements.transactionPaymentMethod.value = transaction?.paymentMethod || "other";
    elements.transactionMode.value = "single";
    elements.recurrenceFrequency.value = "monthly";
    elements.recurrenceCount.value = "12";
    elements.installmentCount.value = "2";
    updateTransactionModeUI();
    elements.transactionDialog.showModal();
    window.setTimeout(() => elements.transactionDescription.focus(), 80);
}

async function handleTransactionSubmit(event) {
    event.preventDefault();
    if (!session?.user) return;
    const original = state.transactions.find((transaction) => transaction.id === elements.transactionId.value);
    const data = normalizeTransaction({
        id: elements.transactionId.value,
        description: elements.transactionDescription.value,
        amount: elements.transactionAmount.value,
        type: elements.transactionForm.querySelector('input[name="transactionType"]:checked')?.value,
        category: elements.transactionCategory.value,
        date: elements.transactionDate.value,
        status: elements.transactionStatus.value,
        paymentMethod: elements.transactionPaymentMethod.value,
        seriesId: original?.seriesId,
        seriesKind: original?.seriesKind,
        installmentNumber: original?.installmentNumber,
        installmentTotal: original?.installmentTotal
    });
    if (!data) {
        showToast("Revise descrição, valor, categoria e data.", "warning");
        return;
    }

    const editing = Boolean(data.id);
    setButtonBusy(elements.transactionForm, true, "SALVANDO");
    setSyncState("busy");
    try {
        if (editing) {
            const saved = await saveTransaction(session.user.id, data);
            state.transactions = state.transactions.map((item) => item.id === saved.id ? saved : item);
        } else {
            const series = buildTransactionSeries(data, {
                mode: elements.transactionMode.value,
                frequency: elements.recurrenceFrequency.value,
                count: elements.recurrenceCount.value,
                installments: elements.installmentCount.value
            });
            const saved = series.length > 1
                ? await saveTransactions(session.user.id, series)
                : [await saveTransaction(session.user.id, series[0])];
            state.transactions.push(...saved);
        }
        renderAll();
        elements.transactionDialog.close();
        setSyncState("ok");
        const generatedCount = editing ? 1 : elements.transactionMode.value === "single"
            ? 1
            : elements.transactionMode.value === "installment"
                ? Number(elements.installmentCount.value)
                : Number(elements.recurrenceCount.value);
        showToast(editing
            ? "Movimentação atualizada."
            : generatedCount > 1 ? `${generatedCount} lançamentos criados com segurança.` : "Movimentação registrada.");
    } catch (error) {
        setSyncState("error");
        showToast(friendlyError(error), "error");
    } finally {
        setButtonBusy(elements.transactionForm, false);
    }
}

function openGoalDialog(goalId = null) {
    const goal = state.goals.find((item) => item.id === goalId);
    elements.goalForm.reset();
    elements.goalId.value = goal?.id || "";
    elements.goalModalTitle.textContent = goal ? "Editar meta" : "Nova meta";
    elements.goalName.value = goal?.name || "";
    elements.goalCurrent.value = goal?.current ?? "";
    elements.goalTarget.value = goal?.target ?? "";
    elements.goalDeadline.value = goal?.deadline || dateWithMonthOffset(6, new Date().getDate());
    elements.goalIcon.value = goal?.icon || "🛡️";
    elements.goalDialog.showModal();
    window.setTimeout(() => elements.goalName.focus(), 80);
}

async function handleGoalSubmit(event) {
    event.preventDefault();
    if (!session?.user) return;
    const data = normalizeGoal({
        id: elements.goalId.value,
        name: elements.goalName.value,
        current: elements.goalCurrent.value,
        target: elements.goalTarget.value,
        deadline: elements.goalDeadline.value,
        icon: elements.goalIcon.value
    });
    if (!data) {
        showToast("Revise o nome, os valores e o prazo do plano.", "warning");
        return;
    }

    const oldGoal = state.goals.find((goal) => goal.id === data.id);
    const wasCompleted = oldGoal ? Number(oldGoal.current) >= Number(oldGoal.target) : false;
    const editing = Boolean(data.id);
    setButtonBusy(elements.goalForm, true, "SALVANDO");
    setSyncState("busy");
    try {
        const saved = await saveGoal(session.user.id, data);
        if (editing) state.goals = state.goals.map((item) => item.id === saved.id ? saved : item);
        else state.goals.push(saved);
        renderGoals();
        elements.goalDialog.close();
        setSyncState("ok");
        showToast(editing ? "Plano atualizado." : "Novo plano criado.");
        if (saved.current >= saved.target && !wasCompleted) celebrate();
    } catch (error) {
        setSyncState("error");
        showToast(friendlyError(error), "error");
    } finally {
        setButtonBusy(elements.goalForm, false);
    }
}

function openContributionDialog(goalId) {
    const goal = state.goals.find((item) => item.id === goalId);
    if (!goal) return;
    elements.contributionForm.reset();
    elements.contributionGoalId.value = goal.id;
    elements.contributionModalTitle.textContent = "Guardar para a meta";
    elements.contributionGoalName.textContent = `${goal.name} / ${formatCurrency(goal.current)} de ${formatCurrency(goal.target)}`;
    elements.contributionDate.value = toISODate();
    elements.contributionDialog.showModal();
    window.setTimeout(() => elements.contributionAmount.focus(), 80);
}

async function handleContributionSubmit(event) {
    event.preventDefault();
    if (!session?.user) return;
    const goal = state.goals.find((item) => item.id === elements.contributionGoalId.value);
    const amount = Math.round(Number(elements.contributionAmount.value) * 100) / 100;
    const date = elements.contributionDate.value;
    if (!goal || !Number.isFinite(amount) || amount <= 0 || !date) {
        showToast("Revise o valor e a data do aporte.", "warning");
        return;
    }

    const wasCompleted = goal.current >= goal.target;
    setButtonBusy(elements.contributionForm, true, "SALVANDO");
    setSyncState("busy");
    try {
        await addGoalContribution(goal.id, amount, date, elements.contributionNote.value.trim());
        const cloud = await loadUserData(session.user.id);
        state.transactions = cloud.transactions.map(normalizeTransaction).filter(Boolean);
        state.goals = cloud.goals.map(normalizeGoal).filter(Boolean);
        state.budgets = cloud.budgets.map(normalizeBudget).filter(Boolean);
        state.contributions = cloud.contributions.map(normalizeContribution).filter(Boolean);
        state.profile = cloud.profile;
        elements.contributionDialog.close();
        renderAll();
        setSyncState("ok");
        const updated = state.goals.find((item) => item.id === goal.id);
        showToast(`Aporte de ${formatCurrency(amount)} registrado.`);
        if (updated && updated.current >= updated.target && !wasCompleted) celebrate();
    } catch (error) {
        setSyncState("error");
        showToast(friendlyError(error), "error");
    } finally {
        setButtonBusy(elements.contributionForm, false);
    }
}

function openBudgetDialog(budgetId = null) {
    const budget = state.budgets.find((item) => item.id === budgetId);
    elements.budgetForm.reset();
    elements.budgetId.value = budget?.id || "";
    elements.budgetMonth.value = budget?.month || reportState.referenceDate.slice(0, 7);
    elements.budgetCategory.innerHTML = EXPENSE_CATEGORIES
        .map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`)
        .join("");
    elements.budgetCategory.value = budget?.category || EXPENSE_CATEGORIES[0];
    elements.budgetAmount.value = budget?.amount ?? "";
    elements.budgetMonth.disabled = Boolean(budget);
    elements.budgetCategory.disabled = Boolean(budget);
    elements.budgetDialog.showModal();
    window.setTimeout(() => elements.budgetAmount.focus(), 80);
}

async function handleBudgetSubmit(event) {
    event.preventDefault();
    if (!session?.user) return;
    const budget = normalizeBudget({
        id: elements.budgetId.value,
        month: elements.budgetMonth.value,
        category: elements.budgetCategory.value,
        amount: elements.budgetAmount.value
    });
    if (!budget) {
        showToast("Revise mês, categoria e valor do limite.", "warning");
        return;
    }

    setButtonBusy(elements.budgetForm, true, "SALVANDO");
    setSyncState("busy");
    try {
        const saved = await saveBudget(session.user.id, budget);
        state.budgets = state.budgets.filter((item) => (
            item.id !== saved.id && !(item.month === saved.month && item.category === saved.category)
        ));
        state.budgets.push(saved);
        elements.budgetDialog.close();
        renderReports();
        setSyncState("ok");
        showToast("Limite mensal salvo.");
    } catch (error) {
        setSyncState("error");
        showToast(friendlyError(error), "error");
    } finally {
        elements.budgetMonth.disabled = false;
        elements.budgetCategory.disabled = false;
        setButtonBusy(elements.budgetForm, false);
    }
}

function exportReportPdf() {
    const report = getCurrentReport();
    if (!report.transactions.length) {
        showToast("Não há movimentos confirmados neste período para o PDF.", "warning");
        return;
    }

    elements.exportPdfButton.disabled = true;
    try {
        const { blob, filename } = generateFinancialReportPdf({
            profileName: getDisplayName(),
            email: session?.user?.email || "",
            periodLabel: report.periodLabel,
            generatedAt: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date()),
            totals: { income: report.income, expense: report.expense, result: report.result },
            categoryRanking: report.categoryRanking,
            descriptionRanking: report.descriptionRanking,
            methodRanking: report.methodRanking,
            transactions: report.transactions.map((transaction) => ({
                ...transaction,
                methodLabel: PAYMENT_METHOD_LABELS[transaction.paymentMethod] ?? PAYMENT_METHOD_LABELS.other
            }))
        });
        downloadBlob(blob, filename);
        showToast("Relatório PDF baixado.");
    } catch (error) {
        console.error("Falha ao gerar PDF:", error);
        showToast("Não foi possível gerar o PDF neste aparelho.", "error");
    } finally {
        elements.exportPdfButton.disabled = false;
    }
}

async function handleDeleteAccount(event) {
    event.preventDefault();
    if (elements.deleteAccountConfirmation.value.trim().toUpperCase() !== "EXCLUIR") {
        showToast("Digite EXCLUIR para confirmar.", "warning");
        elements.deleteAccountConfirmation.focus();
        return;
    }

    setButtonBusy(elements.deleteAccountForm, true, "EXCLUINDO");
    setSyncOverlay(true, "Excluindo sua conta e os dados vinculados...");
    try {
        await deleteAccount();
        await supabase?.auth.signOut({ scope: "local" });
        elements.deleteAccountDialog.close();
        clearSessionView();
        setAuthStatus("Sua conta e os dados vinculados foram excluídos.", "success");
    } catch (error) {
        showToast(friendlyError(error), "error");
    } finally {
        setSyncOverlay(false);
        setButtonBusy(elements.deleteAccountForm, false);
    }
}

function requestDeletion(kind, id) {
    const item = kind === "transaction"
        ? state.transactions.find((transaction) => transaction.id === id)
        : kind === "goal"
            ? state.goals.find((goal) => goal.id === id)
            : state.budgets.find((budget) => budget.id === id);
    if (!item) return;
    const titles = { transaction: "Excluir movimentação?", goal: "Excluir plano?", budget: "Excluir limite?" };
    const itemName = kind === "transaction" ? item.description : kind === "goal" ? item.name : item.category;
    elements.confirmTitle.textContent = titles[kind];
    elements.confirmMessage.textContent = `“${itemName}” será removido do seu caixa sincronizado.`;
    pendingDeletion = { kind, id };
    elements.confirmDialog.showModal();
}

async function confirmDeletion() {
    if (!pendingDeletion || !session?.user) return;
    const deletion = pendingDeletion;
    elements.confirmDeleteButton.disabled = true;
    setSyncState("busy");
    try {
        if (deletion.kind === "transaction") {
            await removeTransaction(session.user.id, deletion.id);
            state.transactions = state.transactions.filter((item) => item.id !== deletion.id);
        } else if (deletion.kind === "goal") {
            await removeGoal(session.user.id, deletion.id);
            state.goals = state.goals.filter((item) => item.id !== deletion.id);
            state.contributions = state.contributions.filter((item) => item.goalId !== deletion.id);
        } else {
            await removeBudget(session.user.id, deletion.id);
            state.budgets = state.budgets.filter((item) => item.id !== deletion.id);
        }
        pendingDeletion = null;
        elements.confirmDialog.close();
        renderAll();
        setSyncState("ok");
        showToast(deletion.kind === "transaction" ? "Movimentação excluída." : deletion.kind === "goal" ? "Plano excluído." : "Limite excluído.");
    } catch (error) {
        setSyncState("error");
        showToast(friendlyError(error), "error");
    } finally {
        elements.confirmDeleteButton.disabled = false;
    }
}

/* ================================================================
   BACKUPS, MIGRAÇÃO E EXPORTAÇÃO
================================================================ */

function exportTransactionsToCsv() {
    const transactions = getFilteredTransactions();
    if (!transactions.length) {
        showToast("Não existem movimentações para exportar.", "warning");
        return;
    }
    const rows = [
        ["Descrição", "Tipo", "Categoria", "Forma", "Data", "Status", "Série", "Valor"],
        ...transactions.map((transaction) => [
            transaction.description,
            transaction.type === "income" ? "Receita" : "Despesa",
            transaction.category,
            PAYMENT_METHOD_LABELS[transaction.paymentMethod] ?? PAYMENT_METHOD_LABELS.other,
            transaction.date.split("-").reverse().join("/"),
            transaction.status === "paid" ? "Confirmada" : "Pendente",
            transaction.seriesKind === "installment"
                ? `Parcela ${transaction.installmentNumber}/${transaction.installmentTotal}`
                : transaction.seriesKind === "recurring" ? "Recorrente" : "Única",
            Number(transaction.amount).toFixed(2).replace(".", ",")
        ])
    ];
    const csv = rows.map((row) => row
        .map((cell) => `"${sanitizeCsvCell(cell).replaceAll('"', '""')}"`)
        .join(";"))
        .join("\r\n");
    downloadText(`\uFEFF${csv}`, `folego-movimentacoes-${state.settings.selectedMonth}.csv`, "text/csv;charset=utf-8");
    showToast("CSV protegido e exportado.");
}

function exportBackup(filenamePrefix = "folego-backup") {
    const backup = createBackup(state);
    const timestamp = new Date().toISOString().replaceAll(":", "-").slice(0, 19);
    downloadText(JSON.stringify(backup, null, 2), `${filenamePrefix}-${timestamp}.json`, "application/json;charset=utf-8");
}

async function importBackupFile(file) {
    if (!file || !session?.user) return;
    try {
        const parsed = JSON.parse(await file.text());
        const normalized = normalizeSnapshot(parsed);
        if (!normalized.valid) throw new Error("O arquivo não possui a estrutura de um backup do Fôlego.");
        if (normalized.rejected > 0) throw new Error(`${normalized.rejected} registro(s) inválido(s) foram encontrados. Nada foi importado.`);

        const confirmed = window.confirm(
            `Este backup possui ${normalized.transactions.length} movimentações, ${normalized.goals.length} planos, ${normalized.budgets.length} limites e ${normalized.contributions.length} aportes.\n\nEle substituirá os dados atuais desta conta. Uma cópia dos dados atuais será baixada antes. Deseja continuar?`
        );
        if (!confirmed) return;

        exportBackup("folego-antes-da-restauracao");
        setSyncOverlay(true, "Restaurando o backup com segurança...");
        await replaceUserSnapshot(normalized.transactions, normalized.goals, normalized.budgets, normalized.contributions);
        state.settings = normalized.settings;
        await activateSession(session, { force: true });
        applyTheme(state.settings.theme);
        showToast("Backup restaurado com sucesso.");
    } catch (error) {
        showToast(friendlyError(error), "error");
    } finally {
        elements.backupFileInput.value = "";
        setSyncOverlay(false);
    }
}

function offerLegacyMigration() {
    if (state.transactions.length || state.goals.length || state.profile?.legacy_migrated_at) return;
    legacySnapshot = readLegacySnapshot();
    if (!legacySnapshot.found) return;

    if (legacySnapshot.corrupted || !legacySnapshot.valid) {
        elements.migrationMessage.textContent = "A versão antiga existe, mas o arquivo local está corrompido. Ele não será importado nem sobrescrito.";
        elements.migrateDataButton.hidden = true;
    } else {
        elements.migrationMessage.textContent = `Encontramos ${legacySnapshot.transactions.length} movimentações e ${legacySnapshot.goals.length} planos válidos. ${legacySnapshot.rejected ? `${legacySnapshot.rejected} item(ns) inválido(s) seriam ignorados.` : ""}`;
        elements.migrateDataButton.hidden = false;
        elements.migrateDataButton.disabled = legacySnapshot.rejected > 0;
    }
    elements.migrationDialog.showModal();
}

function downloadLegacyCopy() {
    if (!legacySnapshot?.raw) return;
    downloadText(legacySnapshot.raw, `folego-copia-local-v1-${toISODate()}.json`, "application/json;charset=utf-8");
    showToast("Cópia original baixada.");
}

async function migrateLegacyData() {
    if (!legacySnapshot?.valid || legacySnapshot.rejected > 0 || !session?.user) return;
    setSyncOverlay(true, "Levando os registros para sua conta...");
    try {
        try {
            localStorage.setItem(`folego-backup-v1-${Date.now()}`, legacySnapshot.raw);
        } catch (backupError) {
            console.warn("Não foi possível duplicar o backup local:", backupError);
        }
        await importLegacySnapshot(legacySnapshot.transactions, legacySnapshot.goals);
        elements.migrationDialog.close();
        await activateSession(session, { force: true });
        showToast("Livro antigo migrado. A cópia local foi preservada.");
    } catch (error) {
        showToast(friendlyError(error), "error");
    } finally {
        setSyncOverlay(false);
    }
}

async function skipLegacyMigration() {
    if (!session?.user) return;
    setSyncOverlay(true, "Preparando um caixa vazio...");
    try {
        state.profile = await saveProfile(session.user.id, { legacy_migrated_at: new Date().toISOString() });
        elements.migrationDialog.close();
        showToast("Conta iniciada vazia. O arquivo antigo continua neste navegador.");
    } catch (error) {
        showToast(friendlyError(error), "error");
    } finally {
        setSyncOverlay(false);
    }
}

/* ================================================================
   TEMA, CONTA E MOVIMENTO REDUZIDO
================================================================ */

function applyTheme(theme) {
    const dark = theme === "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    elements.themeToggle.setAttribute("aria-label", dark ? "Ativar modo claro" : "Ativar modo escuro");
    $('meta[name="theme-color"]')?.setAttribute("content", dark ? "#11120e" : "#eeebe2");
}

async function toggleTheme() {
    state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
    applyTheme(state.settings.theme);
    localStorage.setItem(THEME_STORAGE_KEY, state.settings.theme);
    if (!session?.user) return;
    try {
        state.profile = await saveProfile(session.user.id, { theme: state.settings.theme });
    } catch (error) {
        showToast("A cor mudou neste aparelho, mas não foi sincronizada.", "warning");
    }
}

function celebrate() {
    if (prefersReducedMotion()) {
        showToast("Parabéns! Você conquistou uma meta! 🎉");
        return;
    }
    const colors = ["#c8ff3d", "#ff4e1a", "#2456d8", "#164b3a", "#ffd23f", "#fffdf5"];
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 55; index += 1) {
        const confetti = document.createElement("i");
        confetti.className = "confetti";
        confetti.style.left = `${Math.random() * 100}%`;
        confetti.style.background = colors[index % colors.length];
        confetti.style.setProperty("--fall-duration", `${2.4 + Math.random() * 2}s`);
        confetti.style.setProperty("--drift", `${-80 + Math.random() * 160}px`);
        confetti.style.animationDelay = `${Math.random() * 0.7}s`;
        fragment.appendChild(confetti);
    }
    elements.celebrationLayer.replaceChildren(fragment);
    window.setTimeout(() => elements.celebrationLayer.replaceChildren(), 5200);
    showToast("Parabéns! Você conquistou uma meta! 🎉");
}

function toggleAccountMenu() {
    const opening = elements.accountMenu.hidden;
    elements.accountMenu.hidden = !opening;
    elements.accountButton.setAttribute("aria-expanded", String(opening));
}

function closeAccountMenu() {
    elements.accountMenu.hidden = true;
    elements.accountButton.setAttribute("aria-expanded", "false");
}

function closeDialogOnBackdrop(event) {
    if (event.target === event.currentTarget && event.currentTarget !== elements.migrationDialog) event.currentTarget.close();
}

async function refreshFromCloud() {
    if (!session?.user || document.hidden || Date.now() - lastCloudLoad < 30000) return;
    try {
        const cloud = await loadUserData(session.user.id);
        state.transactions = cloud.transactions.map(normalizeTransaction).filter(Boolean);
        state.goals = cloud.goals.map(normalizeGoal).filter(Boolean);
        state.budgets = cloud.budgets.map(normalizeBudget).filter(Boolean);
        state.contributions = cloud.contributions.map(normalizeContribution).filter(Boolean);
        state.profile = cloud.profile;
        lastCloudLoad = Date.now();
        renderAll();
        setSyncState("ok");
    } catch (error) {
        setSyncState("error", navigator.onLine ? "Falha ao atualizar" : "Sem conexão");
    }
}

/* ================================================================
   EVENTOS
================================================================ */

document.querySelectorAll("[data-auth-view]").forEach((button) => button.addEventListener("click", () => switchAuthView(button.dataset.authView)));
document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.togglePassword);
        const showing = input.type === "text";
        input.type = showing ? "password" : "text";
        button.textContent = showing ? "VER" : "OCULTAR";
        button.setAttribute("aria-label", showing ? "Mostrar senha" : "Ocultar senha");
    });
});

elements.signInForm.addEventListener("submit", handleSignIn);
elements.signUpForm.addEventListener("submit", handleSignUp);
elements.forgotPasswordForm.addEventListener("submit", handleForgotPassword);
elements.updatePasswordForm.addEventListener("submit", handleUpdatePassword);

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
$(".rail-brand")?.addEventListener("click", (event) => { event.preventDefault(); switchView("dashboard"); });
elements.themeToggle.addEventListener("click", toggleTheme);

elements.monthFilter.addEventListener("change", () => {
    if (!isValidMonth(elements.monthFilter.value)) return;
    state.settings.selectedMonth = elements.monthFilter.value;
    if (reportState.mode === "month") reportState.referenceDate = `${elements.monthFilter.value}-01`;
    renderAll();
});

[$("#topbarNewTransaction"), $("#bannerNewTransaction"), $("#pageNewTransaction")]
    .forEach((button) => button?.addEventListener("click", () => openTransactionDialog()));
$("#newGoalButton")?.addEventListener("click", () => openGoalDialog());
elements.transactionForm.addEventListener("submit", handleTransactionSubmit);
elements.goalForm.addEventListener("submit", handleGoalSubmit);
elements.contributionForm.addEventListener("submit", handleContributionSubmit);
elements.budgetForm.addEventListener("submit", handleBudgetSubmit);
elements.transactionForm.querySelectorAll('input[name="transactionType"]').forEach((input) => {
    input.addEventListener("change", () => {
        updateTransactionCategoryOptions(input.value);
        updateTransactionModeUI();
    });
});
elements.transactionMode.addEventListener("change", updateTransactionModeUI);

elements.transactionSearch.addEventListener("input", () => { filters.search = elements.transactionSearch.value; renderTransactionTable(); });
elements.typeFilter.addEventListener("change", () => { filters.type = elements.typeFilter.value; renderTransactionTable(); });
elements.categoryFilter.addEventListener("change", () => { filters.category = elements.categoryFilter.value; renderTransactionTable(); });
elements.exportCsvButton.addEventListener("click", exportTransactionsToCsv);

elements.transactionRows.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "edit-transaction") openTransactionDialog(button.dataset.id);
    if (button.dataset.action === "delete-transaction") requestDeletion("transaction", button.dataset.id);
});

elements.goalsGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "edit-goal") openGoalDialog(button.dataset.id);
    if (button.dataset.action === "delete-goal") requestDeletion("goal", button.dataset.id);
    if (button.dataset.action === "contribute-goal") openContributionDialog(button.dataset.id);
});

elements.agendaList.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="edit-agenda"]');
    if (button) openTransactionDialog(button.dataset.id);
});

document.querySelectorAll("[data-report-period]").forEach((button) => {
    button.addEventListener("click", () => {
        reportState.mode = button.dataset.reportPeriod;
        renderReports();
    });
});
elements.reportReferenceDate.addEventListener("change", () => {
    if (!elements.reportReferenceDate.value) return;
    reportState.referenceDate = elements.reportReferenceDate.value;
    renderReports();
});
elements.exportPdfButton.addEventListener("click", exportReportPdf);
elements.newBudgetButton.addEventListener("click", () => openBudgetDialog());
elements.budgetList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "edit-budget") openBudgetDialog(button.dataset.id);
    if (button.dataset.action === "delete-budget") requestDeletion("budget", button.dataset.id);
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => document.querySelector(`#${button.dataset.closeDialog}`)?.close());
});

[
    elements.transactionDialog,
    elements.goalDialog,
    elements.contributionDialog,
    elements.budgetDialog,
    elements.confirmDialog,
    elements.deleteAccountDialog
].forEach((dialog) => dialog.addEventListener("click", closeDialogOnBackdrop));
elements.cancelConfirmButton.addEventListener("click", () => { pendingDeletion = null; elements.confirmDialog.close(); });
elements.confirmDeleteButton.addEventListener("click", confirmDeletion);

elements.accountButton.addEventListener("click", (event) => { event.stopPropagation(); toggleAccountMenu(); });
elements.accountMenu.addEventListener("click", (event) => event.stopPropagation());
document.addEventListener("click", closeAccountMenu);
elements.signOutButton.addEventListener("click", handleSignOut);
elements.exportBackupButton.addEventListener("click", () => { exportBackup(); closeAccountMenu(); showToast("Backup completo exportado."); });
elements.importBackupButton.addEventListener("click", () => { closeAccountMenu(); elements.backupFileInput.click(); });
elements.backupFileInput.addEventListener("change", () => importBackupFile(elements.backupFileInput.files?.[0]));
elements.deleteAccountButton.addEventListener("click", () => {
    closeAccountMenu();
    elements.deleteAccountForm.reset();
    elements.deleteAccountDialog.showModal();
});
elements.deleteAccountForm.addEventListener("submit", handleDeleteAccount);
elements.deleteAccountBackupButton.addEventListener("click", () => {
    exportBackup("folego-antes-de-excluir");
    showToast("Backup baixado. Guarde-o em local seguro.");
});
elements.installAppButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    elements.installAppButton.hidden = true;
    closeAccountMenu();
});

elements.migrateDataButton.addEventListener("click", migrateLegacyData);
elements.skipMigrationButton.addEventListener("click", skipLegacyMigration);
elements.downloadLegacyButton.addEventListener("click", downloadLegacyCopy);

window.addEventListener("online", () => { setSyncState("ok", "Reconectando..."); refreshFromCloud(); });
window.addEventListener("offline", () => setSyncState("error", "Sem conexão"));
window.addEventListener("focus", refreshFromCloud);
window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installAppButton.hidden = false;
});
window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    elements.installAppButton.hidden = true;
    showToast("Fôlego instalado neste aparelho.");
});

/* ================================================================
   INICIALIZAÇÃO
================================================================ */

async function initialize() {
    applyTheme(state.settings.theme);
    elements.authToday.textContent = new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric"
    }).format(new Date()).toUpperCase();

    if ("serviceWorker" in navigator && import.meta.env.PROD) {
        navigator.serviceWorker.register("/sw.js").catch((error) => {
            console.warn("O modo instalável não pôde ser ativado:", error);
        });
    }

    if (!isSupabaseConfigured) {
        showAuth("signin");
        elements.authConfigWarning.hidden = false;
        document.querySelectorAll(".auth-form input, .auth-form button").forEach((control) => { control.disabled = true; });
        setAuthStatus("O visual está pronto. Falta informar a URL e a chave pública do Supabase.", "warning");
        return;
    }

    supabase.auth.onAuthStateChange((event, nextSession) => {
        if (event === "PASSWORD_RECOVERY") {
            recoveryMode = true;
            session = nextSession;
            showAuth("recovery");
            return;
        }
        if (event === "SIGNED_OUT") {
            clearSessionView();
            return;
        }
        if (nextSession?.user && !recoveryMode && ["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) {
            window.setTimeout(() => activateSession(nextSession), 0);
        }
    });

    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (data.session) await activateSession(data.session);
        else showAuth("signin");
    } catch (error) {
        showAuth("signin");
        setAuthStatus(friendlyError(error), "error");
    }
}

initialize();
