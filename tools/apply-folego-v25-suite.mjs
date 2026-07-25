import fs from "node:fs";

const INDEX_MARKER = "<!-- FÔLEGO V2.5 SUITE -->";
const STYLE_MARKER = '<link rel="stylesheet" href="/src/folego-v25-suite.css">';
const SCRIPT_MARKER = '<script type="module" src="/src/folego-v25-suite.js"></script>';

function read(path) {
    return fs.readFileSync(path, "utf8");
}

function write(path, content) {
    fs.writeFileSync(path, content, "utf8");
}

function replaceRequired(source, search, replacement, label) {
    if (!source.includes(search)) throw new Error(`Não foi possível aplicar Fôlego V2.5: ${label}.`);
    return source.replace(search, replacement);
}

function appendBeforeLast(source, anchor, content, label) {
    const index = source.lastIndexOf(anchor);
    if (index < 0) throw new Error(`Não foi possível aplicar Fôlego V2.5: ${label}.`);
    return `${source.slice(0, index)}${content}${source.slice(index)}`;
}

const indexPath = "index.html";
let source = read(indexPath);

if (!source.includes(STYLE_MARKER)) {
    source = replaceRequired(source, "</head>", `    ${STYLE_MARKER}\n</head>`, "folha de estilos");
}

if (!source.includes(INDEX_MARKER)) {
    const planningNav = `            <button class="rail-link" type="button" data-view="planning">
                <span>06</span>
                <strong>Rota</strong>
            </button>`;
    const archiveNav = `${planningNav}
            <button class="rail-link" type="button" data-view="archive">
                <span>07</span>
                <strong>Arquivo</strong>
            </button>`;
    source = replaceRequired(source, planningNav, archiveNav, "item Arquivo no carrossel");

    const archiveView = `
            ${INDEX_MARKER}
            <!-- =====================================================
                 07 — ARQUIVO, RISCO E INTELIGÊNCIA
            ====================================================== -->
            <section class="view" id="archiveView" data-view-section="archive">
                <div class="view-index" aria-hidden="true">
                    <span>07</span>
                    <i></i>
                    <b>ARQUIVO</b>
                </div>

                <header class="page-intro archive-intro">
                    <div>
                        <span class="section-code">LEITURA AMPLA / DECISÃO CURTA</span>
                        <h2>O passado compara.<br>O futuro avisa.</h2>
                    </div>
                    <span class="v25-edition-stamp">FÔLEGO / V2.5</span>
                </header>

                <section class="v25-action-strip" aria-label="Ações rápidas do caixa">
                    <div class="v25-connection-copy">
                        <span>ESTADO DA SINCRONIZAÇÃO</span>
                        <strong id="v25ConnectionBadge">ABRINDO O ARQUIVO</strong>
                    </div>
                    <button class="ink-button" id="v25TransferButton" type="button"><span>↔</span> Transferir saldo</button>
                    <button class="paper-button" id="v25TrashButton" type="button">LIXEIRA / RECUPERAR</button>
                </section>

                <section class="v25-section" aria-labelledby="v25RiskTitle">
                    <header class="v25-section-heading">
                        <div><span class="section-code">01 / PREVISÃO DE RISCO</span><h3 id="v25RiskTitle">O aperto antes de chegar</h3></div>
                        <p>O Fôlego cruza saldo, pendências, orçamentos e cartões para mostrar onde a margem pode desaparecer.</p>
                    </header>
                    <div class="v25-risk-list" id="v25RiskList"></div>
                </section>

                <section class="v25-section" aria-labelledby="v25CompareTitle">
                    <header class="v25-section-heading">
                        <div><span class="section-code">02 / MÊS CONTRA MÊS</span><h3 id="v25CompareTitle">O que mudou de verdade</h3></div>
                        <label class="v25-control-label"><span>MÊS EM COMPARAÇÃO</span><input type="month" id="v25CompareMonth"></label>
                    </header>
                    <div class="v25-compare-grid">
                        <article><span>RESULTADO ATUAL</span><strong id="v25CompareCurrent">R$ 0,00</strong><small>entradas menos saídas</small></article>
                        <article><span>RESULTADO ANTERIOR</span><strong id="v25ComparePrevious">R$ 0,00</strong><small>mês imediatamente anterior</small></article>
                        <article><span>DIFERENÇA</span><strong id="v25CompareDelta">R$ 0,00</strong><small>contra o mês anterior</small></article>
                        <article class="category" id="v25CompareCategory"><span>MAIOR ALTA</span><strong>—</strong><small>sem leitura ainda</small></article>
                    </div>
                </section>

                <section class="v25-section" id="v25AnnualSection" aria-labelledby="v25AnnualTitle">
                    <header class="v25-section-heading">
                        <div><span class="section-code">03 / FECHAMENTO ANUAL</span><h3 id="v25AnnualTitle">Doze meses em uma página</h3></div>
                        <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
                            <label class="v25-control-label"><span>ANO</span><select id="v25AnnualYear"></select></label>
                            <button class="paper-button" id="v25AnnualPrint" type="button">IMPRIMIR / SALVAR PDF</button>
                        </div>
                    </header>
                    <div class="v25-annual-summary">
                        <article><span>TOTAL RECEBIDO</span><strong id="v25AnnualIncome">R$ 0,00</strong><small>somente confirmados</small></article>
                        <article><span>TOTAL GASTO</span><strong id="v25AnnualExpense">R$ 0,00</strong><small>transferências não entram</small></article>
                        <article><span>RESULTADO DO ANO</span><strong id="v25AnnualResult">R$ 0,00</strong><small>saldo produzido no período</small></article>
                        <article><span>MÉDIA MENSAL</span><strong id="v25AnnualAverage">R$ 0,00</strong><small>média das despesas ativas</small></article>
                    </div>
                    <div class="v25-annual-highlights" id="v25AnnualHighlights"></div>
                    <div class="v25-annual-layout">
                        <div class="v25-annual-months" id="v25AnnualMonths"></div>
                        <div class="v25-annual-categories" id="v25AnnualCategories"></div>
                    </div>
                </section>

                <section class="v25-section" aria-labelledby="v25RulesTitle">
                    <header class="v25-section-heading">
                        <div><span class="section-code">04 / REGRAS DE CATEGORIA</span><h3 id="v25RulesTitle">O Fôlego aprende o nome</h3></div>
                        <p>Palavras como Uber, mercado ou Netflix podem preencher a categoria automaticamente antes de salvar.</p>
                    </header>
                    <div class="v25-rules-layout">
                        <form class="v25-rule-form" id="v25RuleForm">
                            <label><span>PALAVRA OU NOME</span><input type="text" id="v25RuleKeyword" maxlength="40" placeholder="Ex.: padaria" required></label>
                            <label><span>CATEGORIA</span><select id="v25RuleCategory" required>
                                <option>Moradia</option><option>Alimentação</option><option>Transporte</option><option>Saúde</option><option>Educação</option><option>Lazer</option><option>Assinaturas</option><option>Contas</option><option>Outras despesas</option><option>Salário</option><option>Freelance</option><option>Vendas</option><option>Investimentos</option><option>Outras receitas</option>
                            </select></label>
                            <button class="ink-button" type="submit">GRAVAR REGRA →</button>
                        </form>
                        <div class="v25-rule-list" id="v25RuleList"></div>
                    </div>
                </section>

                <section class="v25-section" aria-labelledby="v25OfflineTitle">
                    <header class="v25-section-heading">
                        <div><span class="section-code">05 / FILA OFFLINE</span><h3 id="v25OfflineTitle">Anote agora. Envie depois.</h3></div>
                        <p>Movimentações registradas sem internet ficam neste aparelho e são sincronizadas automaticamente ao reconectar.</p>
                    </header>
                    <div class="v25-offline-board">
                        <div class="v25-offline-head"><span id="v25OfflineCount">0 ITENS</span><button class="paper-button" id="v25OfflineSyncButton" type="button">SINCRONIZAR AGORA</button></div>
                        <div id="v25OfflineList"></div>
                    </div>
                </section>
            </section>
`;
    source = appendBeforeLast(source, "        </main>", archiveView, "fim do conteúdo principal");

    const dialogs = `
    <!-- FÔLEGO V2.5 / TRANSFERÊNCIA ENTRE SALDOS -->
    <dialog class="modal" id="v25TransferDialog">
        <form class="modal-sheet v25-transfer-sheet" id="v25TransferForm">
            <div class="modal-header"><div><span>CAIXA / TRANSFERÊNCIA</span><h2>Mover sem gastar</h2></div><button class="modal-close" type="button" data-close-dialog="v25TransferDialog" aria-label="Fechar">×</button></div>
            <p class="modal-lead">O saldo total permanece igual. Apenas a divisão entre Pix e espécie muda.</p>
            <div class="v25-transfer-direction">
                <label class="form-field"><span>SAI DE</span><select id="v25TransferSource"><option value="pix">Pix</option><option value="cash">Espécie</option></select></label>
                <span class="v25-transfer-arrow">→</span>
                <label class="form-field"><span>ENTRA EM</span><select id="v25TransferDestination"><option value="cash">Espécie</option><option value="pix">Pix</option></select></label>
            </div>
            <div class="form-grid" style="margin-top:16px">
                <label class="form-field"><span>VALOR</span><span class="money-field"><b>R$</b><input type="number" id="v25TransferAmount" min="0.01" step="0.01" required></span></label>
                <label class="form-field"><span>DATA</span><input type="date" id="v25TransferDate" required></label>
                <label class="form-field form-field-wide"><span>NOTA / OPCIONAL</span><input type="text" id="v25TransferNote" maxlength="60" placeholder="Ex.: saque para a semana"></label>
            </div>
            <div class="modal-actions"><button class="paper-button" type="button" data-close-dialog="v25TransferDialog">Cancelar</button><button class="ink-button" type="submit">Registrar transferência →</button></div>
        </form>
    </dialog>

    <!-- FÔLEGO V2.5 / ORIGEM DO PAGAMENTO DA FATURA -->
    <dialog class="modal" id="v25InvoicePaymentDialog">
        <form class="modal-sheet v25-invoice-sheet" id="v25InvoicePaymentForm">
            <div class="modal-header"><div><span>CRÉDITO / PAGAMENTO</span><h2>De onde sai o dinheiro?</h2></div><button class="modal-close" type="button" data-close-dialog="v25InvoicePaymentDialog" aria-label="Fechar">×</button></div>
            <div class="v25-invoice-ticket">
                <div><span>CARTÃO</span><strong id="v25InvoicePaymentCard">—</strong></div>
                <div><span>FATURA</span><strong id="v25InvoicePaymentMonth">—</strong></div>
                <div><span>TOTAL</span><strong id="v25InvoicePaymentTotal">R$ 0,00</strong></div>
            </div>
            <label class="form-field"><span>ORIGEM DO PAGAMENTO</span><select id="v25InvoicePaymentSource"><option value="pix">Pix</option><option value="cash">Espécie</option></select></label>
            <p class="form-notice">As parcelas continuam no histórico do cartão, mas o valor é retirado do saldo escolhido.</p>
            <div class="modal-actions"><button class="paper-button" type="button" data-close-dialog="v25InvoicePaymentDialog">Voltar</button><button class="ink-button" type="submit">Confirmar pagamento →</button></div>
        </form>
    </dialog>

    <!-- FÔLEGO V2.5 / LIXEIRA -->
    <dialog class="modal" id="v25TrashDialog">
        <div class="modal-sheet v25-trash-sheet">
            <div class="modal-header"><div><span>SEGURANÇA / 30 DIAS</span><h2>Lixeira de movimentos</h2></div><button class="modal-close" type="button" data-close-dialog="v25TrashDialog" aria-label="Fechar">×</button></div>
            <p class="modal-lead">Restaure uma movimentação ou remova sua cópia de recuperação definitivamente.</p>
            <div class="v25-trash-list" id="v25TrashList"></div>
            <div class="modal-actions"><button class="paper-button" type="button" data-close-dialog="v25TrashDialog">Fechar</button></div>
        </div>
    </dialog>

    <div class="v25-undo-bar" id="v25UndoBar" hidden><span id="v25UndoCopy">Movimentação excluída.</span><button type="button" data-v25-undo>DESFAZER</button></div>
    <div class="v25-global-connection" id="v25GlobalConnection" role="status" aria-live="polite">ABRINDO</div>
`;
    source = replaceRequired(source, "    <!-- =============================================================\n         FORMULÁRIO DE MOVIMENTAÇÃO", `${dialogs}\n    <!-- =============================================================\n         FORMULÁRIO DE MOVIMENTAÇÃO`, "diálogos da evolução");
}

if (!source.includes(SCRIPT_MARKER)) {
    source = replaceRequired(source, '    <script type="module" src="script.js"></script>', `    ${SCRIPT_MARKER}\n    <script type="module" src="script.js"></script>`, "módulo principal");
}

["FÔLEGO / V2.4.3", "FÔLEGO / V2.4.2", "FÔLEGO / V2.4.1", "FÔLEGO / V2.4"].forEach((version) => {
    source = source.replaceAll(version, "FÔLEGO / V2.5");
});
write(indexPath, source);

const scriptPath = "script.js";
let appScript = read(scriptPath);
const originalTotal = `function totalByType(transactions, type) {
    return transactions
        .filter((transaction) => transaction.type === type)
        .reduce((total, transaction) => total + Number(transaction.amount), 0);
}`;
const transferAwareTotal = `function totalByType(transactions, type) {
    return transactions
        .filter((transaction) => transaction.type === type && transaction.category !== "Transferência")
        .reduce((total, transaction) => total + Number(transaction.amount), 0);
}`;
if (appScript.includes(originalTotal)) appScript = appScript.replace(originalTotal, transferAwareTotal);
write(scriptPath, appScript);

const domainPath = "src/domain.js";
let domain = read(domainPath);
const originalPeriod = `export function getPeriodTransactions(transactions, range, { paidOnly = true } = {}) {
    return transactions.filter((transaction) => (
        (!paidOnly || transaction.status === "paid")
        && transaction.date >= range.start
        && transaction.date <= range.end
    ));
}`;
const transferAwarePeriod = `export function getPeriodTransactions(transactions, range, { paidOnly = true } = {}) {
    return transactions.filter((transaction) => (
        transaction.category !== "Transferência"
        && (!paidOnly || transaction.status === "paid")
        && transaction.date >= range.start
        && transaction.date <= range.end
    ));
}`;
if (domain.includes(originalPeriod)) domain = domain.replace(originalPeriod, transferAwarePeriod);
domain = domain.replace(
    `transaction.type === "expense"\n            && transaction.status === "paid"`,
    `transaction.type === "expense"\n            && transaction.category !== "Transferência"\n            && transaction.status === "paid"`
);
write(domainPath, domain);

const monthlyHistoryPath = "src/monthly-history.js";
let monthlyHistory = read(monthlyHistoryPath);
monthlyHistory = monthlyHistory.replace(
    `const confirmed = rows.filter((row) => row.status === "paid");`,
    `const confirmed = rows.filter((row) => row.status === "paid" && row.category !== "Transferência");`
);
monthlyHistory = monthlyHistory.replace(
    `.select("amount,type,status,occurred_on")`,
    `.select("amount,type,status,occurred_on,category")`
);
write(monthlyHistoryPath, monthlyHistory);

const planningPath = "src/monthly-planning.js";
let planning = read(planningPath);
planning = planning.replace(
    `const monthRows = transactions.filter((row) => row.date >= start && row.date <= end);`,
    `const monthRows = transactions.filter((row) => row.date >= start && row.date <= end && row.category !== "Transferência");`
);
write(planningPath, planning);

const dataServicePath = "src/data-service.js";
let dataService = read(dataServicePath);
const originalLoader = `export async function loadUserData(userId) {
    const client = requireClient();
    const [transactionsResult, goalsResult, profileResult, budgetsResult, contributionsResult] = await Promise.all([
        client.from("transactions").select("*").eq("user_id", userId).order("occurred_on", { ascending: false }),
        client.from("goals").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
        client.from("profiles").select("*").eq("id", userId).maybeSingle(),
        client.from("category_budgets").select("*").eq("user_id", userId).order("month_start", { ascending: false }),
        client.from("goal_contributions").select("*").eq("user_id", userId).order("contributed_on", { ascending: false })
    ]);

    throwIfError(transactionsResult.error);
    throwIfError(goalsResult.error);
    throwIfError(profileResult.error);
    throwIfError(budgetsResult.error);
    throwIfError(contributionsResult.error);

    return {
        transactions: transactionsResult.data.map(transactionFromRow),
        goals: goalsResult.data.map(goalFromRow),
        profile: profileResult.data,
        budgets: budgetsResult.data.map(budgetFromRow),
        contributions: contributionsResult.data.map(contributionFromRow)
    };
}`;
const offlineLoader = `export async function loadUserData(userId) {
    const cacheKey = \`folego-cloud-cache-v25-\${userId}\`;
    try {
        const client = requireClient();
        const [transactionsResult, goalsResult, profileResult, budgetsResult, contributionsResult] = await Promise.all([
            client.from("transactions").select("*").eq("user_id", userId).order("occurred_on", { ascending: false }),
            client.from("goals").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
            client.from("profiles").select("*").eq("id", userId).maybeSingle(),
            client.from("category_budgets").select("*").eq("user_id", userId).order("month_start", { ascending: false }),
            client.from("goal_contributions").select("*").eq("user_id", userId).order("contributed_on", { ascending: false })
        ]);

        throwIfError(transactionsResult.error);
        throwIfError(goalsResult.error);
        throwIfError(profileResult.error);
        throwIfError(budgetsResult.error);
        throwIfError(contributionsResult.error);

        const snapshot = {
            transactions: transactionsResult.data.map(transactionFromRow),
            goals: goalsResult.data.map(goalFromRow),
            profile: profileResult.data,
            budgets: budgetsResult.data.map(budgetFromRow),
            contributions: contributionsResult.data.map(contributionFromRow)
        };
        if (typeof localStorage !== "undefined") localStorage.setItem(cacheKey, JSON.stringify(snapshot));
        return snapshot;
    } catch (error) {
        if (typeof localStorage !== "undefined") {
            try {
                const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
                if (cached?.transactions && cached?.goals) return cached;
            } catch (cacheError) {
                console.warn("O cache offline do Fôlego ficou ilegível:", cacheError);
            }
        }
        throw error;
    }
}`;
if (dataService.includes(originalLoader)) dataService = dataService.replace(originalLoader, offlineLoader);
write(dataServicePath, dataService);

const swPath = "public/sw.js";
let sw = read(swPath);
sw = sw.replace(/const CACHE_NAME = "[^"]+";/, 'const CACHE_NAME = "folego-v2.5.0";');
write(swPath, sw);

console.log("Fôlego V2.5 integrado: cartões, transferências, lixeira, análises, risco e offline.");
