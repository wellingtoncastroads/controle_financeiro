import fs from "node:fs";

const indexPath = "index.html";
const styleMarker = '<link rel="stylesheet" href="/src/folego-pluggy-v26.css">';
const sdkMarker = '<script src="https://cdn.pluggy.ai/pluggy-connect/latest/pluggy-connect.js"></script>';
const scriptMarker = '<script type="module" src="/src/folego-pluggy-v26.js"></script>';
const sectionMarker = "<!-- FÔLEGO V2.8.6 / OPEN FINANCE SOMENTE LEITURA -->";

function replaceRequired(source, search, replacement, label) {
    if (!source.includes(search)) throw new Error(`Não foi possível aplicar a Pluggy V2.6: ${label}.`);
    return source.replace(search, replacement);
}

let source = fs.readFileSync(indexPath, "utf8");

if (!source.includes(styleMarker)) {
    source = replaceRequired(source, "</head>", `    ${styleMarker}\n</head>`, "folha de estilos");
}

if (!source.includes(sectionMarker)) {
    const anchor = '                <section class="v25-section" aria-labelledby="v25RiskTitle">';
    const section = `                ${sectionMarker}
                <section class="v26-bank-section" id="v26BankSection" aria-labelledby="v26BankTitle">
                    <header class="v26-bank-heading">
                        <div>
                            <span class="section-code">00 / OPEN FINANCE</span>
                            <h3 id="v26BankTitle">Seus bancos, sem digitação</h3>
                        </div>
                        <div class="v26-bank-controls">
                            <span class="v26-bank-status" id="v26BankStatus" data-state="online">SOMENTE LEITURA</span>
                            <button class="ink-button" id="v26ConnectBank" type="button">+ AUTORIZAR MEU PLUGGY</button>
                            <button class="paper-button" id="v26SyncBanks" type="button">ATUALIZAR LEITURA</button>
                        </div>
                    </header>
                    <div class="v26-bank-summary">
                        <article><span>SALDO CONECTADO</span><strong id="v26BankBalance">R$ 0,00</strong><small>somente contas bancárias</small></article>
                        <article><span>MOVIMENTOS LIDOS</span><strong id="v26TransactionCount">0</strong><small>em conferência, sem lançar</small></article>
                        <article><span>ÚLTIMA LEITURA</span><strong id="v26LastSync">AINDA NÃO</strong><small>Meu Pluggy / consulta segura</small></article>
                    </div>
                    <div class="v26-bank-list" id="v26BankList"></div>
                    <p class="v26-bank-note" id="v26BankNote">A autorização acontece no Meu Pluggy. O Fôlego nunca recebe sua senha bancária e não inicia pagamentos.</p>
                </section>

`;
    source = replaceRequired(source, anchor, `${section}${anchor}`, "seção de contas conectadas");
}

if (!source.includes(scriptMarker)) {
    source = replaceRequired(
        source,
        '    <script type="module" src="script.js"></script>',
        `    ${sdkMarker}\n    ${scriptMarker}\n    <script type="module" src="script.js"></script>`,
        "módulo principal"
    );
}

source = source.replace(/FÔLEGO \/ V2\.5(?:\.\d+)?/g, "FÔLEGO / V2.6.4");
fs.writeFileSync(indexPath, source, "utf8");

const swPath = "public/sw.js";
let sw = fs.readFileSync(swPath, "utf8");
sw = sw.replace(/const CACHE_NAME = "[^"]+";/, 'const CACHE_NAME = "folego-v2.6.4";');
fs.writeFileSync(swPath, sw, "utf8");

console.log("Fôlego V2.8.6 aplicado: Open Finance Meu Pluggy em modo somente leitura.");
