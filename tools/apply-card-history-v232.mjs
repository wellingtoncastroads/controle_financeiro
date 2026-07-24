import fs from "node:fs";

const MARKER = "<!-- FÔLEGO HISTÓRICO DE FATURAS V2.3.2 -->";
const path = "index.html";
let source = fs.readFileSync(path, "utf8");

function replaceRequired(search, replacement, label) {
    if (!source.includes(search)) throw new Error(`Não foi possível aplicar Histórico do Cartão V2.3.2: ${label}.`);
    source = source.replace(search, replacement);
}

if (!source.includes(MARKER)) {
    replaceRequired(
        '<link rel="stylesheet" href="/src/daily-report-movements.css">',
        '<link rel="stylesheet" href="/src/daily-report-movements.css">\n    <link rel="stylesheet" href="/src/card-history.css">',
        "folha de estilos"
    );

    const history = `
                    ${MARKER}
                    <article class="card-history-board">
                        <header class="board-heading card-history-heading">
                            <div>
                                <span class="section-code">03 / ARQUIVO DE FATURAS</span>
                                <h3>O crédito passa.<br>O histórico fica.</h3>
                            </div>
                            <p>Faturas abertas e pagas, organizadas por mês.</p>
                        </header>
                        <div class="card-history-list" id="cardHistoryList">
                            <div class="credit-invoice-empty">Abrindo o histórico do cartão...</div>
                        </div>
                    </article>
`;

    replaceRequired(
        '                </section>\n            </section>\n\n            <!-- =====================================================\n                 05 — RAIO-X E RELATÓRIOS',
        `                </section>\n${history}            </section>\n\n            <!-- =====================================================\n                 05 — RAIO-X E RELATÓRIOS`,
        "histórico na aba Cartão"
    );

    replaceRequired(
        '<script type="module" src="/src/daily-report-movements.js"></script>',
        '<script type="module" src="/src/daily-report-movements.js"></script>\n    <script type="module" src="/src/card-history.js"></script>',
        "módulo do histórico"
    );

    source = source.replace("FÔLEGO / V2.3.1", "FÔLEGO / V2.3.2");
    fs.writeFileSync(path, source, "utf8");
}

console.log("Histórico de faturas V2.3.2 aplicado com sucesso.");
