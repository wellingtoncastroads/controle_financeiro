import fs from "node:fs";

const MARKER = "<!-- FÔLEGO HISTÓRICO MENSAL V2.3 -->";
const path = "index.html";
let source = fs.readFileSync(path, "utf8");

function replaceRequired(search, replacement, label) {
    if (!source.includes(search)) throw new Error(`Não foi possível aplicar Histórico V2.3: ${label}.`);
    source = source.replace(search, replacement);
}

if (!source.includes(MARKER)) {
    replaceRequired(
        '<link rel="stylesheet" href="/src/credit-card-feature.css">',
        '<link rel="stylesheet" href="/src/credit-card-feature.css">\n    <link rel="stylesheet" href="/src/monthly-history.css">',
        "folha de estilos"
    );

    const history = `
                ${MARKER}
                <section class="monthly-history-board" aria-label="Histórico financeiro mensal">
                    <header class="monthly-history-heading">
                        <div>
                            <span class="section-code">05 / ARQUIVO MENSAL</span>
                            <h3>O mês vira página.<br>O histórico fica.</h3>
                        </div>
                        <p>O mês atual permanece em aberto. Os anteriores são fechados automaticamente e continuam disponíveis no Raio-X.</p>
                    </header>
                    <div class="monthly-history-list" id="monthlyHistoryList">
                        <div class="monthly-history-empty">Abrindo o arquivo mensal...</div>
                    </div>
                </section>

`;

    replaceRequired(
        '                <section class="budget-board">',
        `${history}                <section class="budget-board">`,
        "histórico dentro do Raio-X"
    );

    replaceRequired(
        '<script type="module" src="/src/credit-card-feature.js"></script>',
        '<script type="module" src="/src/credit-card-feature.js"></script>\n    <script type="module" src="/src/monthly-history.js"></script>',
        "módulo do histórico"
    );

    source = source.replace("FÔLEGO / V2.2", "FÔLEGO / V2.3");
    fs.writeFileSync(path, source, "utf8");
}

console.log("Histórico mensal V2.3 aplicado com sucesso.");
