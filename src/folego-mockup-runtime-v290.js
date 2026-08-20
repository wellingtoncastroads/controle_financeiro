const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const currency = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
});

const compactDate = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short"
});

const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });

const ICONS = Object.freeze({
    pulse: '<path d="M2 13h4l2.2-7 4.1 13 2.4-8H22"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    wallet: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M16 14h2"/>',
    refresh: '<path d="M20 7V3l-2 2a8 8 0 1 0 2 10"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-5 3.5-7.5 8-7.5S19.2 16 20 21"/>',
    arrow: '<path d="m9 5 7 7-7 7"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    home: '<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',
    food: '<path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M16 3v18M16 3c4 2 4 8 0 10"/>',
    transport: '<path d="m5 10 2-5h10l2 5M4 10h16l1 4v4h-3v-2H6v2H3v-4Z"/><circle cx="7" cy="13" r="1"/><circle cx="17" cy="13" r="1"/>',
    money: '<circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.7-.7-1.6-1-3-1-1.8 0-3 .9-3 2.2 0 3.3 6 1.5 6 4.7 0 1.3-1.2 2.1-3 2.1-1.4 0-2.5-.4-3.3-1.2M12 5v14"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>'
});

const ACCOUNT_META = Object.freeze({
    nubank: { name: "Nubank", mark: "N", className: "nubank" },
    inter: { name: "Inter", mark: "I", className: "inter" },
    bank: { name: "Banco do Brasil", mark: "BB", className: "bb" },
    bb: { name: "Banco do Brasil", mark: "BB", className: "bb" },
    itau: { name: "Itaú", mark: "itaú", className: "itau" },
    cash: { name: "Espécie", mark: "$", className: "cash" },
    pix: { name: "Pix", mark: "P", className: "pix" },
    other: { name: "Outra conta", mark: "·", className: "other" }
});

const CATEGORY_ICON = Object.freeze({
    Moradia: "home",
    Casa: "home",
    Alimentação: "food",
    Transporte: "transport",
    Salário: "money",
    Vendas: "money",
    Freelance: "money"
});

const viewState = {
    core: null,
    savings: null,
    activeView: "dashboard",
    movementQuery: "",
    movementType: "all",
    movementCategory: "all"
};

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function icon(name, className = "v290-icon") {
    return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.money}</svg>`;
}

function numberFromCurrency(value) {
    const normalized = String(value ?? "")
        .replace(/[^0-9,.-]/g, "")
        .replaceAll(".", "")
        .replace(",", ".");
    return Number(normalized) || 0;
}

function toLocalDate(value) {
    return new Date(`${value}T12:00:00`);
}

function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function signedValue(transaction) {
    if (transaction.type === "transfer") return currency.format(transaction.amount);
    return `${transaction.type === "income" ? "+ " : "− "}${currency.format(transaction.amount)}`;
}

function categoryIcon(category) {
    return CATEGORY_ICON[category] || "money";
}

function accountMeta(method, fallback = "") {
    const key = String(method || "other").toLocaleLowerCase("pt-BR");
    if (ACCOUNT_META[key]) return ACCOUNT_META[key];
    if (key.includes("nubank")) return ACCOUNT_META.nubank;
    if (key.includes("inter")) return ACCOUNT_META.inter;
    if (key.includes("brasil")) return ACCOUNT_META.bank;
    if (key.includes("ita")) return ACCOUNT_META.itau;
    if (key.includes("esp") || key.includes("dinheiro")) return ACCOUNT_META.cash;
    return { ...ACCOUNT_META.other, name: fallback || ACCOUNT_META.other.name };
}

function accountBadge(method, fallback) {
    const meta = accountMeta(method, fallback);
    return `<span class="v290-bank-badge ${meta.className}">${escapeHTML(meta.mark)}</span>`;
}

function buildShell() {
    const app = $("#appShell");
    if (!app || $("#folegoMockupV290")) return;

    const shell = document.createElement("div");
    shell.id = "folegoMockupV290";
    shell.className = "v290-shell";
    shell.innerHTML = `
        <aside class="v290-sidebar">
            <a class="v290-brand" href="#dashboard" data-v290-view="dashboard">Fôlego</a>
            <nav class="v290-nav" aria-label="Navegação principal">
                <button class="active" type="button" data-v290-view="dashboard">${icon("pulse")}<span>Hoje</span></button>
                <button type="button" data-v290-view="transactions">${icon("list")}<span>Movimentos</span></button>
                <button type="button" data-v290-view="goals">${icon("calendar")}<span>Planejar</span></button>
                <button type="button" data-v290-view="accounts">${icon("wallet")}<span>Contas</span></button>
            </nav>
            <button class="v290-side-action" id="v290SideAction" type="button">${icon("plus")}<span>Registrar<br>movimento</span></button>
            <div class="v290-account-host" id="v290AccountHost"></div>
        </aside>

        <div class="v290-workspace">
            <header class="v290-topbar">
                <div class="v290-month-host" id="v290MonthHost"></div>
                <div class="v290-topbar-meta">
                    <span class="v290-today">${icon("calendar")}<b id="v290Today">HOJE</b></span>
                    <i></i>
                    <button id="v290Refresh" type="button">${icon("refresh")}<span>Atualizar</span></button>
                </div>
            </header>

            <main class="v290-main">
                <section class="v290-page active" data-v290-page="dashboard" aria-label="Hoje">
                    <div class="v290-pulse-grid">
                        <article class="v290-days-card">
                            <strong id="v290BreathingDays">—</strong>
                            <span>DIAS DE FÔLEGO</span>
                        </article>
                        <article class="v290-free-card">
                            <strong id="v290Free">R$ 0,00</strong>
                            <span>LIVRES HOJE</span>
                            <div class="v290-free-meta">
                                <p><small>TOTAL</small><b id="v290Total">R$ 0,00</b></p>
                                <p><small>GUARDADO</small><b id="v290Guarded">R$ 0,00</b></p>
                            </div>
                        </article>
                        <article class="v290-quick-card">
                            <h2>VISÃO RÁPIDA</h2>
                            <dl>
                                <div><dt>Entradas no mês</dt><dd class="positive" id="v290Income">+ R$ 0,00</dd></div>
                                <div><dt>Saídas no mês</dt><dd class="negative" id="v290Expense">− R$ 0,00</dd></div>
                                <div><dt>Saldo previsto (30 dias)</dt><dd id="v290Projected">R$ 0,00</dd></div>
                            </dl>
                            <div class="v290-guarded-meter">
                                <p><span>Guardado</span><strong id="v290GuardedPercent">0%</strong></p>
                                <i><b id="v290GuardedBar"></b></i>
                                <small id="v290GuardedCaption">R$ 0,00 de R$ 0,00</small>
                            </div>
                        </article>
                    </div>

                    <section class="v290-route-section">
                        <h2>ROTA DO DINHEIRO</h2>
                        <div class="v290-route" id="v290Route"></div>
                    </section>

                    <div class="v290-dashboard-bottom">
                        <section class="v290-recent-panel">
                            <h2>MOVIMENTOS RECENTES</h2>
                            <div id="v290Recent"></div>
                            <button type="button" data-v290-view="transactions">Ver todos os movimentos ${icon("arrow")}</button>
                        </section>
                        <section class="v290-reserve-panel">
                            <h2>CONTAS E CAIXINHAS</h2>
                            <div id="v290DashboardAccounts"></div>
                            <p><span>Total guardado</span><strong id="v290DashboardGuarded">R$ 0,00</strong></p>
                        </section>
                    </div>
                </section>

                <section class="v290-page" data-v290-page="transactions" aria-label="Movimentos">
                    <header class="v290-movements-head">
                        <h1>MOVIMENTOS</h1>
                        <label class="v290-search">${icon("search")}<input id="v290MovementSearch" type="search" placeholder="Buscar movimento"></label>
                        <label class="v290-category-filter"><select id="v290MovementCategory"><option value="all">Todos</option></select></label>
                        <div class="v290-type-tabs" id="v290TypeTabs">
                            <button class="active" type="button" data-type="all">Todos</button>
                            <button type="button" data-type="income">Entradas</button>
                            <button type="button" data-type="expense">Saídas</button>
                            <button type="button" data-type="transfer">Transferências</button>
                        </div>
                        <button class="v290-outline-action" type="button" data-v290-register>${icon("plus")} Registrar movimento</button>
                    </header>
                    <div class="v290-movements-layout">
                        <div class="v290-movements-main">
                            <section class="v290-movement-summary">
                                <p><span>ENTROU</span><strong class="positive" id="v290MovementIncome">R$ 0,00</strong></p>
                                <p><span>SAIU</span><strong class="negative" id="v290MovementExpense">R$ 0,00</strong></p>
                                <p><span>RESULTADO</span><strong id="v290MovementResult">R$ 0,00</strong></p>
                            </section>
                            <div class="v290-table-wrap">
                                <table class="v290-movement-table">
                                    <thead><tr><th>DATA</th><th>DESCRIÇÃO</th><th>CONTA</th><th>CATEGORIA</th><th>TIPO</th><th>VALOR</th></tr></thead>
                                    <tbody id="v290MovementRows"></tbody>
                                </table>
                            </div>
                        </div>
                        <aside class="v290-category-aside">
                            <h2>CATEGORIAS</h2>
                            <div id="v290CategoryRanking"></div>
                            <section class="v290-legend">
                                <h2>LEGENDA</h2>
                                <p><i class="positive"></i><span><strong>Entrada</strong><small>Entra no resultado</small></span></p>
                                <p><i class="negative"></i><span><strong>Saída</strong><small>Sai do resultado</small></span></p>
                                <p><i class="neutral"></i><span><strong>Transferência interna</strong><small>Não altera o resultado</small></span></p>
                                <p><i class="saved"></i><span><strong>Guardar</strong><small>Não entra no resultado</small></span></p>
                            </section>
                        </aside>
                    </div>
                </section>

                <section class="v290-page" data-v290-page="goals" aria-label="Planejar">
                    <header class="v290-planning-title"><h1>PLANEJAR</h1><span>PRÓXIMOS 30 DIAS</span></header>
                    <div class="v290-planning-top">
                        <article class="v290-plan-days"><strong id="v290PlanDays">—</strong><span>DIAS DE FÔLEGO</span></article>
                        <article class="v290-plan-balance"><span>SALDO PROJETADO</span><strong id="v290PlanProjected">R$ 0,00</strong><small id="v290PlanProjectedDate">EM 30 DIAS</small></article>
                        <article class="v290-plan-route"><h2>ROTA PREVISTA</h2><div id="v290PlanRoute"></div></article>
                        <article class="v290-commitments"><h2>COMPROMISSOS</h2><div id="v290Commitments"></div></article>
                    </div>
                    <section class="v290-forecast-board">
                        <div class="v290-forecast-days" id="v290ForecastDays"></div>
                        <div class="v290-forecast-chart" id="v290ForecastChart"></div>
                    </section>
                    <section class="v290-goals-panel"><h2>METAS</h2><div id="v290Goals"></div></section>
                </section>

                <section class="v290-page" data-v290-page="accounts" aria-label="Contas e caixinhas">
                    <header class="v290-accounts-title"><h1>CONTAS E CAIXINHAS</h1></header>
                    <section class="v290-accounts-summary">
                        <p><span>SALDO LIVRE</span><strong class="free" id="v290AccountsFree">R$ 0,00</strong><small>Disponível para usar</small></p>
                        <p><span>EM CAIXINHAS</span><strong class="saved" id="v290AccountsSaved">R$ 0,00</strong><small>Protegido nas suas caixinhas</small></p>
                        <p><span>TOTAL</span><strong id="v290AccountsTotal">R$ 0,00</strong><small>Seu dinheiro por inteiro</small></p>
                    </section>
                    <div class="v290-accounts-layout">
                        <section class="v290-accounts-list-panel">
                            <h2>MINHAS CONTAS</h2>
                            <div class="v290-accounts-columns"><span>CONTA</span><span>LIVRE</span><span>CAIXINHAS</span><span>TOTAL</span></div>
                            <div id="v290AccountsList"></div>
                        </section>
                        <section class="v290-boxes-panel">
                            <header id="v290BoxesHead"></header>
                            <div id="v290BoxesList"></div>
                            <button class="v290-new-box" type="button" data-savings-new-box>${icon("plus")} Nova caixinha</button>
                            <div class="v290-box-rules"><p>${icon("info")} O dinheiro continua na conta escolhida</p><p>${icon("info")} Guardar e resgatar não alteram Entrou ou Saiu</p></div>
                        </section>
                    </div>
                </section>
            </main>
        </div>

        <nav class="v290-mobile-nav" aria-label="Navegação móvel">
            <button class="active" type="button" data-v290-view="dashboard">${icon("pulse")}<span>Hoje</span></button>
            <button type="button" data-v290-view="transactions">${icon("list")}<span>Movimentos</span></button>
            <button type="button" data-v290-view="goals">${icon("calendar")}<span>Planejar</span></button>
            <button type="button" data-v290-view="accounts">${icon("wallet")}<span>Contas</span></button>
        </nav>
    `;

    app.appendChild(shell);
    app.classList.add("v290-ready");
    document.documentElement.classList.add("pulso-v290");
    document.documentElement.dataset.theme = "dark";

    const accountControl = $(".masthead .account-control");
    const monthStamp = $(".masthead .month-stamp");
    if (accountControl) $("#v290AccountHost").appendChild(accountControl);
    if (monthStamp) $("#v290MonthHost").appendChild(monthStamp);

    bindShellEvents();
    showView(viewFromHash());
    window.dispatchEvent(new CustomEvent("folego:request-core-render"));
}

function viewFromHash() {
    const value = window.location.hash.replace("#", "");
    return ["dashboard", "transactions", "goals", "accounts"].includes(value) ? value : "dashboard";
}

function legacyViewButton(view) {
    return $(`.index-rail .rail-link[data-view="${view}"]`);
}

function showView(view) {
    const next = ["dashboard", "transactions", "goals", "accounts"].includes(view) ? view : "dashboard";
    viewState.activeView = next;
    $$(`[data-v290-page]`).forEach((page) => page.classList.toggle("active", page.dataset.v290Page === next));
    $$(`[data-v290-view]`).forEach((button) => button.classList.toggle("active", button.dataset.v290View === next));
    const action = $("#v290SideAction");
    if (action) {
        const label = next === "accounts" ? "Nova<br>caixinha"
            : next === "goals" ? "Adicionar<br>compromisso"
                : "Registrar<br>movimento";
        $("span", action).innerHTML = label;
    }
    window.scrollTo({ top: 0, behavior: "auto" });
}

function openView(view) {
    legacyViewButton(view)?.click();
    showView(view);
}

function openRegister() {
    $("#topbarNewTransaction")?.click();
}

function bindShellEvents() {
    $("#folegoMockupV290").addEventListener("click", (event) => {
        const nav = event.target.closest("[data-v290-view]");
        if (nav) {
            event.preventDefault();
            openView(nav.dataset.v290View);
            return;
        }
        if (event.target.closest("[data-v290-register]")) {
            openRegister();
            return;
        }
        const movement = event.target.closest("[data-v290-movement-id]");
        if (movement) {
            proxyMovementAction(movement.dataset.v290MovementType, movement.dataset.v290MovementId);
            return;
        }
        const account = event.target.closest("[data-v290-open-account]");
        if (account) {
            window.dispatchEvent(new CustomEvent("folego:open-accounts", { detail: { accountMethod: account.dataset.v290OpenAccount } }));
            showView("accounts");
        }
    });

    $("#v290SideAction")?.addEventListener("click", () => {
        if (viewState.activeView === "accounts") {
            $("#accountsBoxesViewV289 [data-savings-new-box]")?.click();
        } else {
            openRegister();
        }
    });

    $("#v290Refresh")?.addEventListener("click", (event) => {
        event.currentTarget.classList.add("busy");
        window.dispatchEvent(new Event("focus"));
        window.dispatchEvent(new CustomEvent("folego:request-core-render"));
        window.setTimeout(() => event.currentTarget.classList.remove("busy"), 650);
    });

    $("#v290MovementSearch")?.addEventListener("input", (event) => {
        viewState.movementQuery = event.currentTarget.value.trim().toLocaleLowerCase("pt-BR");
        renderMovements();
    });

    $("#v290MovementCategory")?.addEventListener("change", (event) => {
        viewState.movementCategory = event.currentTarget.value;
        renderMovements();
    });

    $("#v290TypeTabs")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-type]");
        if (!button) return;
        viewState.movementType = button.dataset.type;
        $$("[data-type]", $("#v290TypeTabs")).forEach((item) => item.classList.toggle("active", item === button));
        renderMovements();
    });

    window.addEventListener("hashchange", () => showView(viewFromHash()));
}

function proxyMovementAction(kind, id) {
    const selector = kind === "transfer"
        ? `[data-action="edit-transfer"][data-id="${CSS.escape(id)}"]`
        : `[data-action="edit-transaction"][data-id="${CSS.escape(id)}"]`;
    const original = $(selector, $("#transactionRows"));
    original?.click();
}

function readSavings() {
    const freeText = $("#savingsFreeV289")?.textContent || $("#currentBalance")?.textContent || "R$ 0,00";
    const guardedText = $("#savingsProtectedV289")?.textContent || "R$ 0,00";
    const totalText = $("#savingsPatrimonyV289")?.textContent || $("#currentBalance")?.textContent || "R$ 0,00";
    const accounts = $$("#savingsAccountListV289 .savings-account-row-v289").map((row) => ({
        method: row.dataset.savingsAccount,
        name: $(".savings-account-name-v289 strong", row)?.textContent?.trim() || "Conta",
        freeText: $(".savings-account-free-v289", row)?.textContent?.trim() || "R$ 0,00",
        guardedText: $(".savings-account-protected-v289", row)?.textContent?.trim() || "R$ 0,00",
        totalText: $(".savings-account-total-v289", row)?.textContent?.trim() || "R$ 0,00",
        active: row.classList.contains("active")
    }));
    const boxes = $$("#savingsBoxListV289 .savings-box-card-v289").map((card) => ({
        id: card.dataset.boxId,
        name: $(".savings-box-copy-v289 h3", card)?.textContent?.trim() || "Caixinha",
        valueText: $(".savings-box-copy-v289 > strong", card)?.textContent?.trim() || "R$ 0,00",
        progressText: $(".savings-box-progress-copy-v289 small", card)?.textContent?.trim() || "Sem meta",
        progress: Number($(".savings-box-track-v289 i", card)?.style.getPropertyValue("--box-progress")?.replace("%", "")) || 0
    }));
    return {
        freeText,
        guardedText,
        totalText,
        free: numberFromCurrency(freeText),
        guarded: numberFromCurrency(guardedText),
        total: numberFromCurrency(totalText),
        accounts,
        boxes,
        accountListHTML: $("#savingsAccountListV289")?.innerHTML || "",
        boxesHeadHTML: $("#savingsBoxesHeadV289")?.innerHTML || "",
        boxesListHTML: $("#savingsBoxListV289")?.innerHTML || ""
    };
}

function renderHeader() {
    const core = viewState.core;
    const today = core?.today ? toLocalDate(core.today) : new Date();
    const label = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
        .format(today)
        .replace(" de ", " ")
        .replace(".", "")
        .toUpperCase();
    $("#v290Today").textContent = `HOJE, ${label}`;
}

function renderDashboard() {
    const core = viewState.core;
    const savings = viewState.savings || readSavings();
    const free = savings.free;
    const total = savings.total || core?.balanceToday || 0;
    const guarded = savings.guarded;
    const guardedPercent = total > 0 ? Math.max(0, Math.min(100, (guarded / total) * 100)) : 0;
    const monthly = core?.monthly || { income: 0, expense: 0, result: 0 };

    $("#v290BreathingDays").textContent = core?.breathingDays == null ? "—" : String(Math.min(999, core.breathingDays));
    $("#v290Free").textContent = currency.format(free);
    $("#v290Total").textContent = currency.format(total);
    $("#v290Guarded").textContent = currency.format(guarded);
    $("#v290Income").textContent = `+ ${currency.format(monthly.income)}`;
    $("#v290Expense").textContent = `− ${currency.format(monthly.expense)}`;
    $("#v290Projected").textContent = currency.format(core?.projection30?.projectedBalance || 0);
    $("#v290Projected").classList.toggle("negative", Number(core?.projection30?.projectedBalance) < 0);
    $("#v290GuardedPercent").textContent = `${guardedPercent.toFixed(1).replace(".", ",")}%`;
    $("#v290GuardedBar").style.width = `${guardedPercent}%`;
    $("#v290GuardedCaption").textContent = `${currency.format(guarded)} de ${currency.format(total)}`;
    $("#v290DashboardGuarded").textContent = currency.format(guarded);

    renderRoute();
    renderRecent();
    renderDashboardAccounts();
}

function renderRoute() {
    const target = $("#v290Route");
    const core = viewState.core;
    if (!target) return;
    const today = core?.today ? toLocalDate(core.today) : new Date();
    const agenda = core?.agenda || [];
    const days = Array.from({ length: 12 }, (_, offset) => {
        const date = new Date(today);
        date.setDate(date.getDate() + offset);
        const key = dateKey(date);
        return { date, key, event: agenda.find((item) => item.date === key) };
    });
    target.innerHTML = days.map((item, index) => {
        const event = item.event;
        const kind = index === 0 ? "today" : event?.type === "income" ? "income" : event ? "expense" : "plain";
        const eventCopy = event
            ? `<small>${escapeHTML(event.description)}<b>${escapeHTML(signedValue(event))}</b></small>`
            : "";
        return `<article class="${kind}">
            <span>${item.date.getDate()}</span>
            <em>${index === 0 ? "HOJE" : weekday.format(item.date).replace(".", "").toUpperCase()}</em>
            <i></i>${eventCopy}
        </article>`;
    }).join("");
}

function renderRecent() {
    const target = $("#v290Recent");
    const movements = (viewState.core?.movements || []).slice(0, 3);
    if (!movements.length) {
        target.innerHTML = '<p class="v290-empty">Nenhum movimento neste mês.</p>';
        return;
    }
    target.innerHTML = movements.map((movement) => {
        const id = movement.type === "transfer" ? movement.seriesId : movement.id;
        const time = movement.createdAt
            ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(movement.createdAt))
            : "";
        return `<button type="button" data-v290-movement-type="${escapeHTML(movement.type)}" data-v290-movement-id="${escapeHTML(id)}">
            <span class="v290-recent-date">${escapeHTML(compactDate.format(toLocalDate(movement.date)).replace(".", "").toUpperCase())}<small>${escapeHTML(time)}</small></span>
            <strong>${escapeHTML(movement.description)}</strong>
            <b class="${movement.type === "income" ? "positive" : movement.type === "expense" ? "negative" : "neutral"}">${escapeHTML(signedValue(movement))}</b>
            ${icon("arrow")}
        </button>`;
    }).join("");
}

function renderDashboardAccounts() {
    const target = $("#v290DashboardAccounts");
    const accounts = (viewState.savings?.accounts || [])
        .filter((account) => numberFromCurrency(account.totalText) !== 0)
        .sort((left, right) => numberFromCurrency(right.totalText) - numberFromCurrency(left.totalText))
        .slice(0, 4);
    if (!accounts.length) {
        target.innerHTML = '<p class="v290-empty">Os saldos das contas aparecerão aqui.</p>';
        return;
    }
    target.innerHTML = accounts.map((account) => `<button type="button" data-v290-open-account="${escapeHTML(account.method)}">
        ${accountBadge(account.method, account.name)}
        <span>${escapeHTML(account.name)}</span>
        <strong>${escapeHTML(account.totalText)}</strong>
        ${icon("arrow")}
    </button>`).join("");
}

function filteredMovements() {
    const query = viewState.movementQuery;
    return (viewState.core?.movements || [])
        .filter((movement) => viewState.movementType === "all" || movement.type === viewState.movementType)
        .filter((movement) => viewState.movementCategory === "all" || movement.category === viewState.movementCategory)
        .filter((movement) => !query || `${movement.description} ${movement.category} ${movement.accountLabel}`.toLocaleLowerCase("pt-BR").includes(query));
}

function renderMovements() {
    const core = viewState.core;
    const monthly = core?.monthly || { income: 0, expense: 0, result: 0 };
    $("#v290MovementIncome").textContent = currency.format(monthly.income);
    $("#v290MovementExpense").textContent = currency.format(monthly.expense);
    const result = $("#v290MovementResult");
    result.textContent = `${monthly.result >= 0 ? "+ " : "− "}${currency.format(Math.abs(monthly.result))}`;
    result.classList.toggle("positive", monthly.result >= 0);
    result.classList.toggle("negative", monthly.result < 0);

    const categories = [...new Set((core?.movements || []).map((movement) => movement.category).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, "pt-BR"));
    const select = $("#v290MovementCategory");
    const selected = viewState.movementCategory;
    select.innerHTML = ['<option value="all">Todos</option>', ...categories.map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`)].join("");
    select.value = categories.includes(selected) ? selected : "all";
    viewState.movementCategory = select.value;

    const movements = filteredMovements();
    const target = $("#v290MovementRows");
    if (!movements.length) {
        target.innerHTML = '<tr><td colspan="6" class="v290-table-empty">Nenhum movimento encontrado.</td></tr>';
    } else {
        let lastDate = "";
        target.innerHTML = movements.map((movement) => {
            const id = movement.type === "transfer" ? movement.seriesId : movement.id;
            const date = movement.date !== lastDate
                ? `<tr class="v290-date-group"><td colspan="6">${movement.date === core?.today ? "HOJE · " : ""}${escapeHTML(compactDate.format(toLocalDate(movement.date)).replace(".", "").toUpperCase())}</td></tr>`
                : "";
            lastDate = movement.date;
            const typeLabel = movement.type === "income" ? "Entrada" : movement.type === "expense" ? "Saída" : "Transferência interna";
            const account = movement.type === "transfer" ? "Entre contas" : movement.accountLabel;
            return `${date}<tr class="v290-data-row ${movement.type}" data-v290-movement-type="${escapeHTML(movement.type)}" data-v290-movement-id="${escapeHTML(id)}">
                <td>${escapeHTML(movement.createdAt ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(movement.createdAt)) : "—")}</td>
                <td><strong>${escapeHTML(movement.description)}</strong></td>
                <td><span class="v290-account-cell">${accountBadge(movement.paymentMethod, account)}${escapeHTML(account)}</span></td>
                <td><span class="v290-category-cell">${icon(categoryIcon(movement.category))}${escapeHTML(movement.type === "transfer" ? "—" : movement.category)}</span></td>
                <td><span class="v290-type-label ${movement.type}">${escapeHTML(typeLabel)}</span></td>
                <td><strong class="v290-value ${movement.type}">${escapeHTML(signedValue(movement))}</strong>${movement.type === "transfer" ? "<small>Não entra no resultado</small>" : ""}${icon("arrow")}</td>
            </tr>`;
        }).join("");
    }
    renderCategoryRanking();
}

function renderCategoryRanking() {
    const expenses = (viewState.core?.movements || []).filter((movement) => movement.type === "expense" && movement.status === "paid");
    const grouped = expenses.reduce((result, movement) => {
        result[movement.category] = (result[movement.category] || 0) + movement.amount;
        return result;
    }, {});
    const entries = Object.entries(grouped).sort((left, right) => right[1] - left[1]).slice(0, 5);
    const total = expenses.reduce((sum, movement) => sum + movement.amount, 0);
    const target = $("#v290CategoryRanking");
    target.innerHTML = entries.length ? entries.map(([name, value], index) => {
        const percent = total > 0 ? (value / total) * 100 : 0;
        return `<article style="--rank:${percent}%;--rank-index:${index}">
            <span>${icon(categoryIcon(name))}<strong>${escapeHTML(name)}</strong></span>
            <p><b>${escapeHTML(currency.format(value))}</b><em>${percent.toFixed(1).replace(".", ",")}%</em></p>
            <i><b></b></i>
        </article>`;
    }).join("") : '<p class="v290-empty">Sem saídas confirmadas.</p>';
}

function renderPlanning() {
    const core = viewState.core;
    const days = core?.breathingDays == null ? "—" : String(Math.min(999, core.breathingDays));
    $("#v290PlanDays").textContent = days;
    $("#v290PlanProjected").textContent = currency.format(core?.projection30?.projectedBalance || 0);
    $("#v290PlanProjected").classList.toggle("negative", Number(core?.projection30?.projectedBalance) < 0);
    $("#v290PlanProjectedDate").textContent = core?.projection30?.endDate
        ? `EM ${compactDate.format(toLocalDate(core.projection30.endDate)).replace(".", "").toUpperCase()}`
        : "EM 30 DIAS";

    const agenda = (core?.agenda || []).slice(0, 4);
    $("#v290PlanRoute").innerHTML = [
        `<p class="today"><i></i><span>${core?.today ? toLocalDate(core.today).getDate() : new Date().getDate()}</span><strong>HOJE</strong></p>`,
        ...agenda.slice(0, 3).map((item) => `<p class="${item.type}"><i></i><span>${toLocalDate(item.date).getDate()}</span><strong>${escapeHTML(item.description)}</strong><b>${escapeHTML(signedValue(item))}</b></p>`)
    ].join("");

    $("#v290Commitments").innerHTML = agenda.length
        ? agenda.slice(0, 3).map((item) => `<button type="button" data-v290-movement-type="${escapeHTML(item.type)}" data-v290-movement-id="${escapeHTML(item.id)}">
            ${icon(categoryIcon(item.category))}<span><strong>${escapeHTML(item.description)}</strong><small>${relativeDateLabel(item.date, core.today)}</small></span><b>${escapeHTML(currency.format(item.amount))}</b>${icon("arrow")}
        </button>`).join("")
        : '<p class="v290-empty">Nenhum compromisso nos próximos 30 dias.</p>';

    renderForecast(core);
    renderGoals(core);
}

function relativeDateLabel(value, todayValue) {
    if (!value || !todayValue) return "";
    const days = Math.round((toLocalDate(value) - toLocalDate(todayValue)) / 86400000);
    if (days <= 0) return days === 0 ? "Hoje" : "Atrasado";
    return `Em ${days} ${days === 1 ? "dia" : "dias"}`;
}

function renderForecast(core) {
    const points = core?.projection || [];
    const daysTarget = $("#v290ForecastDays");
    const firstDays = points.slice(0, 18);
    daysTarget.innerHTML = firstDays.map((point, index) => {
        const date = toLocalDate(point.date);
        const event = (core?.agenda || []).find((item) => item.date === point.date);
        return `<span class="${index === 0 ? "today" : event?.type || ""}"><b>${date.getDate()}</b><small>${weekday.format(date).replace(".", "").toUpperCase()}</small></span>`;
    }).join("");

    const target = $("#v290ForecastChart");
    if (!points.length) {
        target.innerHTML = '<p class="v290-empty">A projeção aparecerá aqui.</p>';
        return;
    }
    const width = 1200;
    const height = 170;
    const values = points.map((point) => point.balance);
    const min = Math.min(0, ...values);
    const max = Math.max(1, ...values);
    const range = Math.max(1, max - min);
    const coords = points.map((point, index) => ({
        x: 18 + (index / Math.max(1, points.length - 1)) * (width - 36),
        y: 18 + ((max - point.balance) / range) * (height - 42)
    }));
    const line = coords.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const area = `18,${height - 18} ${line} ${width - 18},${height - 18}`;
    target.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Projeção do saldo para os próximos 30 dias">
        <line class="zero" x1="18" y1="${(18 + (max / range) * (height - 42)).toFixed(1)}" x2="${width - 18}" y2="${(18 + (max / range) * (height - 42)).toFixed(1)}"/>
        <polygon class="area" points="${area}"/>
        <polyline class="line" points="${line}"/>
    </svg>`;
}

function renderGoals(core) {
    const target = $("#v290Goals");
    const boxes = viewState.savings?.boxes || [];
    const goals = boxes.length
        ? boxes.slice(0, 3).map((box) => ({ name: box.name, valueText: box.valueText, percent: box.progress, caption: box.progressText }))
        : (core?.goals || []).slice(0, 3).map((goal) => ({
            name: goal.name,
            valueText: currency.format(goal.current),
            percent: goal.target > 0 ? Math.min(100, (goal.current / goal.target) * 100) : 0,
            caption: goal.target > 0 ? `de ${currency.format(goal.target)}` : "Sem meta definida"
        }));
    target.innerHTML = goals.length ? goals.map((goal) => `<article>
        <span>${accountBadge("cash", goal.name)}<strong>${escapeHTML(goal.name)}</strong></span>
        <p><b>${escapeHTML(goal.valueText)}</b><em>${Math.round(goal.percent)}%</em></p>
        <i><b style="width:${Math.max(0, Math.min(100, goal.percent))}%"></b></i>
        <small>${escapeHTML(goal.caption)}</small>
    </article>`).join("") : '<p class="v290-empty">Crie uma caixinha ou meta para acompanhar o caminho.</p>';
}

function renderAccounts() {
    const savings = viewState.savings || readSavings();
    $("#v290AccountsFree").textContent = savings.freeText;
    $("#v290AccountsSaved").textContent = savings.guardedText;
    $("#v290AccountsTotal").textContent = savings.totalText;
    $("#v290AccountsList").innerHTML = savings.accountListHTML || '<p class="v290-empty">Carregando contas...</p>';
    $("#v290BoxesHead").innerHTML = savings.boxesHeadHTML || "<h2>CAIXINHAS</h2>";
    $("#v290BoxesList").innerHTML = savings.boxesListHTML || '<p class="v290-empty">Selecione uma conta para ver as caixinhas.</p>';
}

function renderAll() {
    viewState.savings = readSavings();
    renderHeader();
    renderDashboard();
    renderMovements();
    renderPlanning();
    renderAccounts();
}

window.addEventListener("folego:core-rendered", (event) => {
    viewState.core = event.detail || null;
    renderAll();
});

window.addEventListener("folego:savings-render-end", () => window.setTimeout(renderAll, 0));
window.addEventListener("folego:savings-updated", () => window.setTimeout(renderAll, 0));
window.addEventListener("folego:accounts-rendered", () => window.setTimeout(renderAll, 0));

buildShell();
renderAll();
