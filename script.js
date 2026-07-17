"use strict";

import { isSupabaseConfigured, supabase } from "./src/supabase-client.js";
import {
    importLegacySnapshot,
    loadUserData,
    removeGoal,
    removeTransaction,
    replaceUserSnapshot,
    saveGoal,
    saveProfile,
    saveTransaction
} from "./src/data-service.js";
import {
    createBackup,
    currentMonthKey,
    EXPENSE_CATEGORIES,
    getBalanceAsOf,
    INCOME_CATEGORIES,
    isValidMonth,
    normalizeGoal,
    normalizeSnapshot,
    normalizeTransaction,
    prefersReducedMotion,
    readLegacySnapshot,
    sanitizeCsvCell,
    THEME_STORAGE_KEY,
    toISODate
} from "./src/domain.js";

/* ================================================================
   FÔLEGO V2 — INTERFACE E ORQUESTRAÇÃO
   O estado visual fica em memória; os registros reais vivem no Supabase.
================================================================ */

const CATEGORY_DETAILS = {
    "Salário": { icon: "💼", color: "#c8ff3d" },
    "Freelance": { icon: "💻", color: "#2456d8" },
    "Vendas": { icon: "🏷️", color: "#ff4e1a" },
    "Investimentos": { icon: "📈", color: "#164b3a" },
    "Outras receitas": { icon: "✨", color: "#e2b93b" },
    "Moradia": { icon: "🏠", color: "#c8ff3d" },
    "Alimentação": { icon: "🛒", color: "#ff4e1a" },
    "Transporte": { icon: "🚗", color: "#2456d8" },
    "Saúde": { icon: "💊", color: "#164b3a" },
    "Educação": { icon: "🎓", color: "#e2b93b" },
    "Lazer": { icon: "🎮", color: "#ff4e1a" },
    "Assinaturas": { icon: "📺", color: "#2456d8" },
    "Contas": { icon: "🧾", color: "#164b3a" },
    "Outras despesas": { icon: "📦", color: "#747168" }
};

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

    transactionDialog: $("#transactionDialog"),
    transactionForm: $("#transactionForm"),
    transactionModalTitle: $("#transactionModalTitle"),
    transactionId: $("#transactionId"),
    transactionDescription: $("#transactionDescription"),
    transactionAmount: $("#transactionAmount"),
    transactionCategory: $("#transactionCategory"),
    transactionDate: $("#transactionDate"),
    transactionStatus: $("#transactionStatus"),

    goalDialog: $("#goalDialog"),
    goalForm: $("#goalForm"),
    goalModalTitle: $("#goalModalTitle"),
    goalId: $("#goalId"),
    goalName: $("#goalName"),
    goalCurrent: $("#goalCurrent"),
    goalTarget: $("#goalTarget"),
    goalDeadline: $("#goalDeadline"),
    goalIcon: $("#goalIcon"),

    confirmDialog: $("#confirmDialog"),
    confirmTitle: $("#confirmTitle"),
    confirmMessage: $("#confirmMessage"),
    cancelConfirmButton: $("#cancelConfirmButton"),
    confirmDeleteButton: $("#confirmDeleteButton"),

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

let state = {
    transactions: [],
    goals: [],
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
    return CATEGORY_DETAILS[category] || { icon: "✨", color: "#8a8ea3" };
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
        return "O banco ainda não foi preparado. Execute o arquivo supabase/schema.sql no projeto.";
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
        switchView(["dashboard", "transactions", "goals"].includes(initialView) ? initialView : "dashboard", false);
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
            <div class="empty-state"><span>🧾</span><strong>Seu caixa começa vazio</strong><p>Registre sua primeira receita ou despesa. Nenhum exemplo foi misturado aos seus dados.</p></div>
        `;
        return;
    }

    elements.recentTransactions.innerHTML = recent.map((transaction) => {
        const details = categoryDetails(transaction.category);
        const valueClass = transaction.type === "income" ? "income-value" : "expense-value";
        const pendingText = transaction.status === "pending" ? " • pendente" : "";
        return `
            <div class="recent-item">
                <span class="transaction-icon">${details.icon}</span>
                <div class="transaction-main"><strong>${escapeHTML(transaction.description)}</strong><span>${escapeHTML(transaction.category)}${pendingText}</span></div>
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
            <tr class="empty-table-row"><td colspan="6"><div class="empty-state"><span>🔎</span><strong>Nada encontrado</strong><p>Altere os filtros ou registre um movimento em ${escapeHTML(formatMonthLabel(state.settings.selectedMonth))}.</p></div></td></tr>
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
                            <span class="transaction-icon">${details.icon}</span>
                            <div class="transaction-description">
                                <strong>${escapeHTML(transaction.description)}</strong>
                                <small>${isIncome ? "Receita" : "Despesa"}</small>
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
        elements.goalsGrid.innerHTML = '<div class="panel empty-state"><span>🎯</span><strong>Seu próximo plano começa aqui</strong><p>Crie uma meta e atualize manualmente o valor que já separou.</p></div>';
        return;
    }

    elements.goalsGrid.innerHTML = state.goals.map((goal) => {
        const rawPercent = Number(goal.target) > 0 ? (Number(goal.current) / Number(goal.target)) * 100 : 0;
        const percent = clamp(rawPercent, 0, 100);
        const completed = rawPercent >= 100;
        return `
            <article class="goal-card ${completed ? "completed" : ""}">
                <div class="goal-card-header">
                    <span class="goal-icon">${escapeHTML(goal.icon)}</span>
                    <div class="goal-title-wrap"><h3>${escapeHTML(goal.name)}</h3><span>Prazo: ${escapeHTML(formatDate(goal.deadline, { month: "long", year: "numeric" }))}</span></div>
                    <div class="goal-actions">
                        <button class="row-action" type="button" data-action="edit-goal" data-id="${escapeHTML(goal.id)}" aria-label="Editar ${escapeHTML(goal.name)}" title="Editar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button>
                        <button class="row-action delete" type="button" data-action="delete-goal" data-id="${escapeHTML(goal.id)}" aria-label="Excluir ${escapeHTML(goal.name)}" title="Excluir"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5"/></svg></button>
                    </div>
                </div>
                <div class="goal-values"><div><span>Você informou</span><strong>${escapeHTML(formatCurrency(goal.current))}</strong><small>de ${escapeHTML(formatCurrency(goal.target))} • ajuste manual</small></div><b class="goal-percent">${percent.toFixed(0)}%</b></div>
                <div class="goal-progress"><i style="width:${percent}%"></i></div>
                ${completed ? '<span class="completed-label">✓ Meta conquistada!</span>' : ""}
            </article>
        `;
    }).join("");
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
}

/* ================================================================
   NAVEGAÇÃO E FORMULÁRIOS
================================================================ */

function switchView(viewName, scroll = true) {
    const validViews = ["dashboard", "transactions", "goals"];
    const selectedView = validViews.includes(viewName) ? viewName : "dashboard";
    const titles = { dashboard: "Pulso atual", transactions: "Extrato completo", goals: "Planos futuros" };
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
        .map((category) => `<option value="${escapeHTML(category)}">${categoryDetails(category).icon} ${escapeHTML(category)}</option>`)
        .join("");
    elements.transactionCategory.value = preferredCategory && categories.includes(preferredCategory) ? preferredCategory : categories[0];
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
    elements.transactionDialog.showModal();
    window.setTimeout(() => elements.transactionDescription.focus(), 80);
}

async function handleTransactionSubmit(event) {
    event.preventDefault();
    if (!session?.user) return;
    const data = normalizeTransaction({
        id: elements.transactionId.value,
        description: elements.transactionDescription.value,
        amount: elements.transactionAmount.value,
        type: elements.transactionForm.querySelector('input[name="transactionType"]:checked')?.value,
        category: elements.transactionCategory.value,
        date: elements.transactionDate.value,
        status: elements.transactionStatus.value
    });
    if (!data) {
        showToast("Revise descrição, valor, categoria e data.", "warning");
        return;
    }

    const editing = Boolean(data.id);
    setButtonBusy(elements.transactionForm, true, "SALVANDO");
    setSyncState("busy");
    try {
        const saved = await saveTransaction(session.user.id, data);
        if (editing) state.transactions = state.transactions.map((item) => item.id === saved.id ? saved : item);
        else state.transactions.push(saved);
        renderAll();
        elements.transactionDialog.close();
        setSyncState("ok");
        showToast(editing ? "Movimentação atualizada." : "Movimentação registrada.");
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

function requestDeletion(kind, id) {
    const item = kind === "transaction"
        ? state.transactions.find((transaction) => transaction.id === id)
        : state.goals.find((goal) => goal.id === id);
    if (!item) return;
    elements.confirmTitle.textContent = kind === "transaction" ? "Excluir movimentação?" : "Excluir plano?";
    elements.confirmMessage.textContent = `“${kind === "transaction" ? item.description : item.name}” será removido do seu caixa sincronizado.`;
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
        } else {
            await removeGoal(session.user.id, deletion.id);
            state.goals = state.goals.filter((item) => item.id !== deletion.id);
        }
        pendingDeletion = null;
        elements.confirmDialog.close();
        renderAll();
        setSyncState("ok");
        showToast(deletion.kind === "transaction" ? "Movimentação excluída." : "Plano excluído.");
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
        ["Descrição", "Tipo", "Categoria", "Data", "Status", "Valor"],
        ...transactions.map((transaction) => [
            transaction.description,
            transaction.type === "income" ? "Receita" : "Despesa",
            transaction.category,
            transaction.date.split("-").reverse().join("/"),
            transaction.status === "paid" ? "Confirmada" : "Pendente",
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
            `Este backup possui ${normalized.transactions.length} movimentações e ${normalized.goals.length} planos.\n\nEle substituirá os dados atuais desta conta. Uma cópia dos dados atuais será baixada antes. Deseja continuar?`
        );
        if (!confirmed) return;

        exportBackup("folego-antes-da-restauracao");
        setSyncOverlay(true, "Restaurando o backup com segurança...");
        await replaceUserSnapshot(normalized.transactions, normalized.goals);
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
    renderAll();
});

[$("#topbarNewTransaction"), $("#bannerNewTransaction"), $("#pageNewTransaction")]
    .forEach((button) => button?.addEventListener("click", () => openTransactionDialog()));
$("#newGoalButton")?.addEventListener("click", () => openGoalDialog());
elements.transactionForm.addEventListener("submit", handleTransactionSubmit);
elements.goalForm.addEventListener("submit", handleGoalSubmit);
elements.transactionForm.querySelectorAll('input[name="transactionType"]').forEach((input) => {
    input.addEventListener("change", () => updateTransactionCategoryOptions(input.value));
});

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
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => document.querySelector(`#${button.dataset.closeDialog}`)?.close());
});

[elements.transactionDialog, elements.goalDialog, elements.confirmDialog].forEach((dialog) => dialog.addEventListener("click", closeDialogOnBackdrop));
elements.cancelConfirmButton.addEventListener("click", () => { pendingDeletion = null; elements.confirmDialog.close(); });
elements.confirmDeleteButton.addEventListener("click", confirmDeletion);

elements.accountButton.addEventListener("click", (event) => { event.stopPropagation(); toggleAccountMenu(); });
elements.accountMenu.addEventListener("click", (event) => event.stopPropagation());
document.addEventListener("click", closeAccountMenu);
elements.signOutButton.addEventListener("click", handleSignOut);
elements.exportBackupButton.addEventListener("click", () => { exportBackup(); closeAccountMenu(); showToast("Backup completo exportado."); });
elements.importBackupButton.addEventListener("click", () => { closeAccountMenu(); elements.backupFileInput.click(); });
elements.backupFileInput.addEventListener("change", () => importBackupFile(elements.backupFileInput.files?.[0]));

elements.migrateDataButton.addEventListener("click", migrateLegacyData);
elements.skipMigrationButton.addEventListener("click", skipLegacyMigration);
elements.downloadLegacyButton.addEventListener("click", downloadLegacyCopy);

window.addEventListener("online", () => { setSyncState("ok", "Reconectando..."); refreshFromCloud(); });
window.addEventListener("offline", () => setSyncState("error", "Sem conexão"));
window.addEventListener("focus", refreshFromCloud);

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
