import fs from "node:fs";

const indexPath = "index.html";
const styleMarker = '<link rel="stylesheet" href="/src/folego-pluggy-v26.css">';
const sdkMarker = '<script src="https://cdn.pluggy.ai/pluggy-connect/v2.13.0/pluggy-connect.js"></script>';
const scriptMarker = '<script type="module" src="/src/folego-pluggy-v26.js"></script>';
const sectionMarker = "<!-- FÔLEGO V2.6 / CONTAS CONECTADAS -->";

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
                            <span class="section-code">00 / CONTAS CONECTADAS</span>
                            <h3 id="v26BankTitle">O banco escreve o caixa</h3>
                        </div>
                        <div class="v26-bank-controls">
                            <span class="v26-bank-status" id="v26BankStatus" data-state="online">PRONTO PARA CONECTAR</span>
                            <button class="ink-button" id="v26ConnectBank" type="button">+ CONECTAR BANCO</button>
                            <button class="paper-button" id="v26SyncBanks" type="button">SINCRONIZAR AGORA</button>
                        </div>
                    </header>
                    <div class="v26-bank-summary">
                        <article><span>SALDO NAS CONTAS</span><strong id="v26BankBalance">R$ 0,00</strong><small>contas bancárias conectadas</small></article>
                        <article><span>ABERTO NO CRÉDITO</span><strong id="v26CreditOpen">R$ 0,00</strong><small>faturas e cartões encontrados</small></article>
                        <article><span>ÚLTIMA LEITURA</span><strong id="v26LastSync">AINDA NÃO</strong><small>importação automática</small></article>
                    </div>
                    <div class="v26-bank-list" id="v26BankList"></div>
                    <p class="v26-bank-note" id="v26BankNote">A autorização acontece no ambiente seguro da Pluggy. O Fôlego nunca recebe sua senha bancária.</p>
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

source = source.replace(/FÔLEGO \/ V2\.5(?:\.\d+)?/g, "FÔLEGO / V2.6");
fs.writeFileSync(indexPath, source, "utf8");

const swPath = "public/sw.js";
let sw = fs.readFileSync(swPath, "utf8");
sw = sw.replace(/const CACHE_NAME = "[^"]+";/, 'const CACHE_NAME = "folego-v2.6.0";');
fs.writeFileSync(swPath, sw, "utf8");

console.log("Fôlego V2.6 aplicado: Pluggy Connect, sincronização e importação automática.");
