import fs from "node:fs";

const MARKER = "<!-- FÔLEGO MOVIMENTOS DO DIA V2.3.1 -->";
const path = "index.html";
let source = fs.readFileSync(path, "utf8");

function replaceRequired(search, replacement, label) {
    if (!source.includes(search)) {
        throw new Error(`Não foi possível aplicar Movimentos do Dia V2.3.1: ${label}.`);
    }
    source = source.replace(search, replacement);
}

if (!source.includes(MARKER)) {
    replaceRequired(
        '<link rel="stylesheet" href="/src/monthly-history.css">',
        '<link rel="stylesheet" href="/src/monthly-history.css">\n    <link rel="stylesheet" href="/src/daily-report-movements.css">',
        "folha de estilos"
    );

    const dailyBoard = `
                ${MARKER}
                <section class="daily-movements-board" id="dailyMovementsBoard" aria-label="Movimentações do dia selecionado" hidden>
                    <header class="daily-movements-heading">
                        <div>
                            <span class="section-code">DIA / MOVIMENTOS</span>
                            <h3>Tudo que passou<br>por este dia.</h3>
                        </div>
                        <div class="daily-movements-reference">
                            <span>DATA SELECIONADA</span>
                            <strong id="dailyMovementsDate">—</strong>
                            <small id="dailyMovementsCount">0 movimentos</small>
                        </div>
                    </header>
                    <div class="daily-movements-summary" aria-label="Resumo confirmado do dia">
                        <div><span>ENTROU</span><strong id="dailyMovementsIncome">R$ 0,00</strong></div>
                        <div><span>SAIU</span><strong id="dailyMovementsExpense">R$ 0,00</strong></div>
                        <div class="result"><span>RESULTADO</span><strong id="dailyMovementsResult">R$ 0,00</strong></div>
                    </div>
                    <div class="daily-movements-list" id="dailyMovementsList">
                        <div class="daily-movements-empty">Escolha um dia para abrir os movimentos.</div>
                    </div>
                </section>

`;

    replaceRequired(
        '                <section class="ranking-layout">',
        `${dailyBoard}                <section class="ranking-layout">`,
        "quadro diário dentro do Raio-X"
    );

    replaceRequired(
        '<script type="module" src="/src/monthly-history.js"></script>',
        '<script type="module" src="/src/monthly-history.js"></script>\n    <script type="module" src="/src/daily-report-movements.js"></script>',
        "módulo diário"
    );

    source = source.replace("FÔLEGO / V2.3", "FÔLEGO / V2.3.1");
    fs.writeFileSync(path, source, "utf8");
}

console.log("Movimentações do dia V2.3.1 aplicadas com sucesso.");
