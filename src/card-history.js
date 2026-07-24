import { supabase } from "./supabase-client.js";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const elements = {
    list: document.querySelector("#cardHistoryList"),
    invoiceMonthFilter: document.querySelector("#invoiceMonthFilter"),
    cardsView: document.querySelector("#cardsView")
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

function summarize(rows, month) {
    const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const paid = rows.filter((row) => row.status === "paid");
    const pending = rows.filter((row) => row.status === "pending");
    const status = pending.length ? "Aberta" : "Paga";
    return { month, total, count: rows.length, paid: paid.length, pending: pending.length, status };
}

async function loadCardHistory() {
    if (!elements.list || !supabase) return;
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const { data, error } = await supabase
        .from("transactions")
        .select("amount,status,occurred_on,description,installment_number,installment_total")
        .eq("user_id", user.id)
        .eq("payment_method", "credit_card")
        .order("occurred_on", { ascending: false });

    if (error) {
        elements.list.innerHTML = '<div class="credit-invoice-empty">Não foi possível abrir o histórico agora.</div>';
        return;
    }

    const grouped = new Map();
    (data || []).forEach((row) => {
        const month = String(row.occurred_on || "").slice(0, 7);
        if (!month) return;
        if (!grouped.has(month)) grouped.set(month, []);
        grouped.get(month).push(row);
    });

    if (!grouped.size) {
        elements.list.innerHTML = '<div class="credit-invoice-empty">As faturas aparecerão aqui depois da primeira compra no crédito.</div>';
        return;
    }

    const summaries = [...grouped.entries()]
        .map(([month, rows]) => summarize(rows, month))
        .sort((a, b) => b.month.localeCompare(a.month));

    elements.list.innerHTML = summaries.map((item, index) => `
        <button class="card-history-item ${item.status === "Paga" ? "paid" : "open"}" type="button" data-card-history-month="${escapeHTML(item.month)}">
            <span class="card-history-index">${String(index + 1).padStart(2, "0")}</span>
            <div class="card-history-copy">
                <strong>${escapeHTML(monthLabel(item.month))}</strong>
                <small>${item.count} ${item.count === 1 ? "parcela" : "parcelas"}</small>
            </div>
            <div class="card-history-total">
                <span>TOTAL DA FATURA</span>
                <strong>${escapeHTML(currency.format(item.total))}</strong>
            </div>
            <div class="card-history-breakdown">
                <span>${item.paid} pagas</span>
                <span>${item.pending} abertas</span>
            </div>
            <span class="card-history-stamp">${item.status}</span>
        </button>
    `).join("");
}

function openInvoiceMonth(month) {
    if (!elements.invoiceMonthFilter) return;
    elements.invoiceMonthFilter.value = month;
    elements.invoiceMonthFilter.dispatchEvent(new Event("change", { bubbles: true }));
    elements.cardsView?.scrollIntoView({ behavior: "smooth", block: "start" });
}

elements.list?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-card-history-month]");
    if (button) openInvoiceMonth(button.dataset.cardHistoryMonth);
});

supabase?.auth.onAuthStateChange((_event, session) => {
    if (session?.user) window.setTimeout(loadCardHistory, 300);
});

window.addEventListener("focus", loadCardHistory);
window.setTimeout(loadCardHistory, 900);
