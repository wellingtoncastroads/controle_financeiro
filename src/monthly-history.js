import { supabase } from "./supabase-client.js";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const currentMonth = new Date().toISOString().slice(0, 7);

const elements = {
    list: document.querySelector("#monthlyHistoryList"),
    reportReferenceDate: document.querySelector("#reportReferenceDate"),
    monthFilter: document.querySelector("#monthFilter"),
    reportsView: document.querySelector("#reportsView")
};

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function monthLabel(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
        .format(new Date(year, month - 1, 1))
        .replace(/^./, (letter) => letter.toUpperCase());
}

function monthEnd(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    const day = new Date(year, month, 0).getDate();
    return `${monthKey}-${String(day).padStart(2, "0")}`;
}

function summarize(rows, monthKey) {
    const confirmed = rows.filter((row) => row.status === "paid" && row.category !== "Transferência");
    const income = confirmed
        .filter((row) => row.type === "income")
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const expense = confirmed
        .filter((row) => row.type === "expense")
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return {
        month: monthKey,
        income,
        expense,
        result: income - expense,
        count: confirmed.length,
        closed: monthKey < currentMonth
    };
}

async function loadMonthlyHistory() {
    if (!elements.list || !supabase) return;
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const { data, error } = await supabase
        .from("transactions")
        .select("amount,type,status,occurred_on,category")
        .eq("user_id", user.id)
        .order("occurred_on", { ascending: false });

    if (error) {
        elements.list.innerHTML = '<div class="monthly-history-empty">Não foi possível abrir o histórico agora.</div>';
        return;
    }

    const rows = data || [];
    const grouped = new Map();
    rows.forEach((row) => {
        const month = row.occurred_on?.slice(0, 7);
        if (!month) return;
        if (!grouped.has(month)) grouped.set(month, []);
        grouped.get(month).push(row);
    });
    if (!grouped.has(currentMonth)) grouped.set(currentMonth, []);

    const months = [...grouped.keys()].sort((a, b) => b.localeCompare(a));
    const summaries = months.map((month) => summarize(grouped.get(month), month));

    elements.list.innerHTML = summaries.map((item, index) => `
        <button class="monthly-history-item ${item.closed ? "closed" : "current"}" type="button" data-history-month="${escapeHTML(item.month)}">
            <span class="monthly-history-index">${String(index + 1).padStart(2, "0")}</span>
            <div class="monthly-history-copy">
                <strong>${escapeHTML(monthLabel(item.month))}</strong>
                <small>${item.count} ${item.count === 1 ? "registro confirmado" : "registros confirmados"}</small>
            </div>
            <div class="monthly-history-stat"><strong>${escapeHTML(currency.format(item.income))}</strong><span>Entrou</span></div>
            <div class="monthly-history-stat"><strong>${escapeHTML(currency.format(item.expense))}</strong><span>Saiu</span></div>
            <div class="monthly-history-stat result"><strong class="${item.result < 0 ? "negative" : ""}">${escapeHTML(currency.format(item.result))}</strong><span>Resultado</span></div>
            <span class="monthly-history-stamp"><b>${item.closed ? "Fechado" : "Em aberto"}</b><small>${item.closed ? escapeHTML(monthEnd(item.month).split("-").reverse().join("/")) : "mês atual"}</small></span>
        </button>
    `).join("");
}

function openMonth(month) {
    if (elements.reportReferenceDate) {
        elements.reportReferenceDate.value = `${month}-01`;
        elements.reportReferenceDate.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const monthButton = document.querySelector('[data-report-period="month"]');
    monthButton?.click();
    if (elements.monthFilter) {
        elements.monthFilter.value = month;
        elements.monthFilter.dispatchEvent(new Event("change", { bubbles: true }));
    }
    elements.reportsView?.scrollIntoView({ behavior: "smooth", block: "start" });
}

elements.list?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-history-month]");
    if (button) openMonth(button.dataset.historyMonth);
});

supabase?.auth.onAuthStateChange((_event, session) => {
    if (session?.user) window.setTimeout(loadMonthlyHistory, 250);
});

window.addEventListener("folego:data-changed", loadMonthlyHistory);
window.setTimeout(loadMonthlyHistory, 700);

