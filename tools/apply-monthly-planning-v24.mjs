import fs from "node:fs";

const INDEX_MARKER = "<!-- FÔLEGO PLANEJAMENTO MENSAL V2.4 -->";
const SCRIPT_MARKER = "/* FÔLEGO PLANEJAMENTO MENSAL V2.4 */";

function read(path) {
    return fs.readFileSync(path, "utf8");
}

function write(path, content) {
    fs.writeFileSync(path, content, "utf8");
}

function replaceRequired(source, search, replacement, label) {
    if (!source.includes(search)) {
        throw new Error(`Não foi possível aplicar Planejamento V2.4: ${label}.`);
    }
    return source.replace(search, replacement);
}

const indexPath = "index.html";
let source = read(indexPath);

if (!source.includes(INDEX_MARKER)) {
    source = replaceRequired(
        source,
        '<link rel="stylesheet" href="/src/card-history.css">',
        '<link rel="stylesheet" href="/src/card-history.css">\n    <link rel="stylesheet" href="/src/monthly-planning.css">',
        "folha de estilos"
    );

    source = replaceRequired(
        source,
        `            <button class="rail-link" type="button" data-view="reports">
                <span>05</span>
                <strong>Raio-X</strong>
            </button>`,
        `            <button class="rail-link" type="button" data-view="reports">
                <span>05</span>
                <strong>Raio-X</strong>
            </button>
            <button class="rail-link" type="button" data-view="planning">
                <span>06</span>
                <strong>Rota</strong>
            </button>`,
        "item Rota no índice"
    );

    const planningView = `
            ${INDEX_MARKER}
            <!-- =====================================================
                 06 — ROTA E PLANEJAMENTO MENSAL
            ====================================================== -->
            <section class="view" id="planningView" data-view-section="planning">
                <div class="view-index" aria-hidden="true">
                    <span>06</span>
                    <i></i>
                    <b>ROTA</b>
                </div>

                <header class="page-intro planning-intro">
                    <div>
                        <span class="section-code">O MÊS ANTES DO FIM</span>
                        <h2>Veja o aperto antes.<br>Escolha o próximo passo.</h2>
                    </div>
                    <span class="planning-edition-stamp">FÔLEGO / V2.4</span>
                </header>

                <section class="planning-control" aria-label="Mês do planejamento">
                    <label>
                        <span>MÊS EM LEITURA /</span>
                        <input type="month" id="planningMonth">
                    </label>
                    <div class="planning-control-copy">
                        <span>ESTADO DO RECORTE</span>
                        <strong id="planningMonthState">MÊS ATUAL / EM ABERTO</strong>
                    </div>
                    <button class="paper-button" id="planningBudgetButton" type="button">+ DEFINIR ORÇAMENTO</button>
                </section>

                <section class="planning-summary" aria-label="Resumo da previsão mensal">
                    <article>
                        <span>SALDO DE ABERTURA</span>
                        <strong id="planningOpeningBalance">R$ 0,00</strong>
                        <small>antes do primeiro movimento</small>
                    </article>
                    <article>
                        <span>REALIZADO NO MÊS</span>
                        <strong id="planningActualResult">R$ 0,00</strong>
                        <small id="planningActualCaption">entradas menos saídas</small>
                    </article>
                    <article class="commitments">
                        <span>AINDA COMPROMETIDO</span>
                        <strong id="planningCommitments">R$ 0,00</strong>
                        <small id="planningCommitmentsCaption">a pagar neste recorte</small>
                    </article>
                    <article class="closing">
                        <span>FECHAMENTO PREVISTO</span>
                        <strong id="planningClosingBalance">R$ 0,00</strong>
                        <small id="planningConfidence">SEM AGENDA</small>
                    </article>
                </section>

                <section class="planning-route-layout">
                    <article class="planning-route-board">
                        <header class="board-heading">
                            <div>
                                <span class="section-code">01 / LINHA DO CAIXA</span>
                                <h3>O que ainda vai passar</h3>
                            </div>
                            <span class="planning-route-count" id="planningRouteCount">0 ITENS</span>
                        </header>
                        <div class="planning-route-list" id="planningRouteList">
                            <div class="planning-empty">Abrindo a rota do mês...</div>
                        </div>
                    </article>

                    <article class="planning-receipt">
                        <header>
                            <span>PREVISÃO / FECHAMENTO</span>
                            <b>FÔLEGO®</b>
                        </header>
                        <div class="planning-receipt-month" id="planningReceiptMonth">—</div>
                        <dl>
                            <div><dt>ENTROU ATÉ AGORA</dt><dd id="planningActualIncome">R$ 0,00</dd></div>
                            <div><dt>AINDA VAI ENTRAR</dt><dd id="planningRemainingIncome">R$ 0,00</dd></div>
                            <div><dt>SAIU ATÉ AGORA</dt><dd id="planningActualExpense">R$ 0,00</dd></div>
                            <div><dt>AINDA VAI SAIR</dt><dd id="planningRemainingExpense">R$ 0,00</dd></div>
                        </dl>
                        <div class="planning-receipt-result">
                            <span>RESULTADO PROVÁVEL DO MÊS</span>
                            <strong id="planningProjectedResult">R$ 0,00</strong>
                        </div>
                        <footer>REGISTROS PENDENTES FORMAM A PREVISÃO</footer>
                    </article>
                </section>

                <section class="planning-budget-board">
                    <header class="board-heading planning-budget-heading">
                        <div>
                            <span class="section-code">02 / PLANEJADO × REALIZADO</span>
                            <h3>Quanto da margem já ganhou destino</h3>
                        </div>
                        <p>O realizado mostra o que já saiu. A previsão também considera pendências e parcelas cadastradas.</p>
                    </header>
                    <div class="planning-budget-list" id="planningBudgetList">
                        <div class="planning-empty">Carregando os orçamentos...</div>
                    </div>
                </section>

                <section class="planning-simulator-board">
                    <header class="planning-simulator-heading">
                        <div>
                            <span class="section-code">03 / E SE?</span>
                            <h3>Teste uma decisão.<br>Sem mexer no caixa.</h3>
                        </div>
                        <span class="planning-dry-stamp">SIMULAÇÃO</span>
                    </header>

                    <form class="planning-simulator-form" id="planningSimulatorForm">
                        <label>
                            <span>MOVIMENTO</span>
                            <select id="planningSimulationType">
                                <option value="expense">Uma nova saída</option>
                                <option value="income">Uma nova entrada</option>
                            </select>
                        </label>
                        <label>
                            <span>VALOR TOTAL</span>
                            <span class="planning-money-field"><b>R$</b><input type="number" id="planningSimulationAmount" min="0.01" step="0.01" placeholder="0,00"></span>
                        </label>
                        <label>
                            <span>PARCELAS</span>
                            <input type="number" id="planningSimulationInstallments" min="1" max="120" value="1">
                        </label>
                        <label>
                            <span>COMEÇA EM</span>
                            <input type="month" id="planningSimulationStartMonth">
                        </label>
                    </form>

                    <div class="planning-simulator-result" id="planningSimulatorResult">
                        <div>
                            <span>FECHAMENTO SEM SIMULAÇÃO</span>
                            <strong id="planningSimulationBefore">R$ 0,00</strong>
                        </div>
                        <div class="after">
                            <span>FECHAMENTO COM SIMULAÇÃO</span>
                            <strong id="planningSimulationAfter">R$ 0,00</strong>
                        </div>
                        <p id="planningSimulationCaption">Informe um valor para medir o impacto.</p>
                    </div>
                    <div class="planning-simulation-schedule" id="planningSimulationSchedule"></div>
                    <footer>ESTE TESTE NÃO CRIA, EDITA OU SALVA MOVIMENTAÇÕES.</footer>
                </section>
            </section>

`;

    const mainClose = source.lastIndexOf("        </main>");
    if (mainClose < 0) throw new Error("Não foi possível aplicar Planejamento V2.4: fim do conteúdo principal.");
    source = `${source.slice(0, mainClose)}${planningView}${source.slice(mainClose)}`;

    source = replaceRequired(
        source,
        '<script type="module" src="/src/card-history.js"></script>',
        '<script type="module" src="/src/card-history.js"></script>\n    <script type="module" src="/src/monthly-planning.js"></script>',
        "módulo do planejamento"
    );

    source = source.replace("FÔLEGO / V2.3.2", "FÔLEGO / V2.4");
    write(indexPath, source);
}

const scriptPath = "script.js";
let appScript = read(scriptPath);

if (!appScript.includes(SCRIPT_MARKER)) {
    appScript = replaceRequired(
        appScript,
        'const initialView = window.location.hash.replace("#", "");\n        switchView(["dashboard", "transactions", "goals", "reports"].includes(initialView) ? initialView : "dashboard", false);',
        `const initialView = window.location.hash.replace("#", "");
        ${SCRIPT_MARKER}
        switchView(["dashboard", "transactions", "goals", "reports", "planning"].includes(initialView) ? initialView : "dashboard", false);`,
        "abertura direta da Rota"
    );

    appScript = replaceRequired(
        appScript,
        'const validViews = ["dashboard", "transactions", "goals", "reports"];\n    const selectedView = validViews.includes(viewName) ? viewName : "dashboard";\n    const titles = { dashboard: "Pulso atual", transactions: "Extrato completo", goals: "Planos futuros", reports: "Raio-X financeiro" };',
        'const validViews = ["dashboard", "transactions", "goals", "reports", "planning"];\n    const selectedView = validViews.includes(viewName) ? viewName : "dashboard";\n    const titles = { dashboard: "Pulso atual", transactions: "Extrato completo", goals: "Planos futuros", reports: "Raio-X financeiro", planning: "Rota do mês" };',
        "navegação da Rota"
    );

    write(scriptPath, appScript);
}

console.log("Planejamento mensal V2.4 aplicado com sucesso.");
