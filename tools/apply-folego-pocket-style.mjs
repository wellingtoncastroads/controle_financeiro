import fs from "node:fs";

const HTML_MARKER = "<!-- FÔLEGO POCKETS EDITORIAL V2 -->";
const STYLE_MARKER = "/* FÔLEGO POCKETS EDITORIAL V2 */";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content, "utf8");
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Não foi possível aplicar o estilo editorial: ${label}.`);
  }
  return source.replace(search, replacement);
}

function patchHtml() {
  const path = "index.html";
  let source = read(path);
  if (source.includes(HTML_MARKER)) return;

  source = replaceRequired(
    source,
    `                        <section class="balance-pockets" aria-label="Saldo separado entre Pix e espécie">\n                            <article class="money-pocket pix-pocket">\n                                <span>PIX</span>\n                                <strong id="pixBalance">R$ 0,00</strong>\n                                <small>dinheiro digital</small>\n                            </article>\n                            <article class="money-pocket cash-pocket">\n                                <span>ESPÉCIE</span>\n                                <strong id="cashBalance">R$ 0,00</strong>\n                                <small>dinheiro em mãos</small>\n                            </article>\n                        </section>`,
    `                        ${HTML_MARKER}\n                        <section class="balance-pockets" aria-label="Saldo separado entre Pix e espécie">\n                            <header class="balance-pocket-head">\n                                <span>DIVISÃO DO CAIXA / 02 PARTES</span>\n                                <i>CONFIRMADO ATÉ HOJE</i>\n                            </header>\n                            <article class="money-pocket pix-pocket">\n                                <span>01 / PIX</span>\n                                <strong id="pixBalance">R$ 0,00</strong>\n                                <small>saldo digital</small>\n                            </article>\n                            <article class="money-pocket cash-pocket">\n                                <span>02 / ESPÉCIE</span>\n                                <strong id="cashBalance">R$ 0,00</strong>\n                                <small>dinheiro em mãos</small>\n                            </article>\n                        </section>`,
    "faixa Pix e espécie do painel"
  );

  source = replaceRequired(
    source,
    `                <section class="report-pocket-grid" aria-label="Resultado separado entre Pix e espécie no período">\n                    <article class="report-pocket pix-pocket">\n                        <span>PIX NO PERÍODO</span>\n                        <strong id="reportPixBalance">R$ 0,00</strong>\n                    </article>\n                    <article class="report-pocket cash-pocket">\n                        <span>ESPÉCIE NO PERÍODO</span>\n                        <strong id="reportCashBalance">R$ 0,00</strong>\n                    </article>\n                </section>`,
    `                <section class="report-pocket-grid" aria-label="Resultado separado entre Pix e espécie no período">\n                    <header class="report-pocket-head">\n                        <span>04 / POSSE DO DINHEIRO</span>\n                        <strong>Onde o resultado ficou</strong>\n                    </header>\n                    <article class="report-pocket pix-pocket">\n                        <span>01 / PIX NO PERÍODO</span>\n                        <strong id="reportPixBalance">R$ 0,00</strong>\n                        <small>SALDO LÍQUIDO</small>\n                    </article>\n                    <article class="report-pocket cash-pocket">\n                        <span>02 / ESPÉCIE NO PERÍODO</span>\n                        <strong id="reportCashBalance">R$ 0,00</strong>\n                        <small>SALDO LÍQUIDO</small>\n                    </article>\n                </section>`,
    "faixa Pix e espécie do Raio-X"
  );

  write(path, source);
}

function patchStyles() {
  const path = "style.css";
  let source = read(path);
  if (source.includes(STYLE_MARKER)) return;

  source += `\n\n${STYLE_MARKER}\n/* A divisão do caixa segue a linguagem de livro-caixa impresso do Fôlego. */\n.balance-pockets {\n    display: grid;\n    width: min(100%, 720px);\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n    gap: 0;\n    margin: -12px 0 30px;\n    overflow: hidden;\n    border: 1px solid color-mix(in srgb, var(--paper) 38%, transparent);\n    background: color-mix(in srgb, var(--paper) 5%, transparent);\n}\n\n.balance-pocket-head {\n    grid-column: 1 / -1;\n    display: flex;\n    min-height: 34px;\n    align-items: center;\n    justify-content: space-between;\n    padding: 7px 12px;\n    border-bottom: 1px solid color-mix(in srgb, var(--paper) 38%, transparent);\n    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;\n    font-size: 0.5rem;\n    font-weight: 900;\n    letter-spacing: 0.11em;\n}\n\n.balance-pocket-head span {\n    color: var(--acid);\n}\n\n.balance-pocket-head i {\n    color: color-mix(in srgb, var(--paper) 58%, transparent);\n    font-style: normal;\n}\n\n.balance-pockets .money-pocket {\n    position: relative;\n    min-width: 0;\n    min-height: 94px;\n    padding: 19px 20px 16px;\n    overflow: hidden;\n    border: 0;\n    background: transparent;\n    color: var(--paper);\n}\n\n.balance-pockets .money-pocket + .money-pocket {\n    border-left: 1px solid color-mix(in srgb, var(--paper) 38%, transparent);\n}\n\n.balance-pockets .money-pocket::before {\n    position: absolute;\n    inset: 0 0 auto;\n    width: auto;\n    height: 5px;\n    background: var(--pocket-accent);\n    content: \"\";\n}\n\n.pix-pocket { --pocket-accent: var(--acid); }\n.cash-pocket { --pocket-accent: var(--orange); }\n\n.balance-pockets .money-pocket span,\n.balance-pockets .money-pocket small {\n    display: block;\n    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;\n    font-weight: 900;\n    letter-spacing: 0.11em;\n    text-transform: uppercase;\n}\n\n.balance-pockets .money-pocket span {\n    color: color-mix(in srgb, var(--paper) 68%, transparent);\n    font-size: 0.5rem;\n}\n\n.balance-pockets .money-pocket strong {\n    display: block;\n    margin: 10px 0 7px;\n    overflow-wrap: anywhere;\n    color: var(--paper);\n    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;\n    font-size: clamp(1.15rem, 2.2vw, 1.65rem);\n    font-weight: 700;\n    letter-spacing: -0.055em;\n    line-height: 1;\n}\n\n.balance-pockets .money-pocket strong.negative,\n.report-pocket-grid .report-pocket strong.negative {\n    color: var(--orange);\n}\n\n.balance-pockets .money-pocket small {\n    color: color-mix(in srgb, var(--paper) 48%, transparent);\n    font-size: 0.45rem;\n}\n\n/* No Raio-X, a divisão funciona como mais um quadro editorial do relatório. */\n.report-pocket-grid {\n    display: grid;\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n    gap: 0;\n    margin: -4px 0 28px;\n    border: 2px solid var(--ink);\n    background: var(--paper-light);\n    box-shadow: 7px 7px 0 var(--acid);\n}\n\n.report-pocket-head {\n    grid-column: 1 / -1;\n    display: flex;\n    min-height: 58px;\n    gap: 20px;\n    align-items: center;\n    justify-content: space-between;\n    padding: 13px 20px;\n    border-bottom: 2px solid var(--ink);\n    background: var(--ink);\n    color: var(--paper);\n}\n\n.report-pocket-head span {\n    color: var(--acid);\n    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;\n    font-size: max(0.64rem, 10px);\n    font-weight: 900;\n    letter-spacing: 0.1em;\n}\n\n.report-pocket-head strong {\n    font-family: Georgia, \"Times New Roman\", serif;\n    font-size: clamp(1rem, 2vw, 1.35rem);\n    font-style: italic;\n    font-weight: 400;\n}\n\n.report-pocket-grid .report-pocket {\n    position: relative;\n    min-width: 0;\n    min-height: 126px;\n    padding: 27px 24px 20px;\n    overflow: hidden;\n    border: 0;\n    background: var(--paper-light);\n}\n\n.report-pocket-grid .report-pocket + .report-pocket {\n    border-left: 1px solid var(--ink);\n}\n\n.report-pocket-grid .report-pocket::before {\n    position: absolute;\n    inset: 0 0 auto;\n    width: auto;\n    height: 7px;\n    background: var(--pocket-accent);\n    content: \"\";\n}\n\n.report-pocket-grid .report-pocket span,\n.report-pocket-grid .report-pocket small {\n    display: block;\n    color: var(--muted);\n    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;\n    font-size: max(0.64rem, 10px);\n    font-weight: 900;\n    letter-spacing: 0.08em;\n}\n\n.report-pocket-grid .report-pocket strong {\n    display: block;\n    margin: 18px 0 10px;\n    overflow-wrap: anywhere;\n    color: var(--ink);\n    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;\n    font-size: clamp(1.45rem, 3.4vw, 2.45rem);\n    letter-spacing: -0.075em;\n    line-height: 0.95;\n}\n\n.report-pocket-grid .report-pocket small {\n    font-size: 0.48rem;\n}\n\n@media (max-width: 620px) {\n    .balance-pockets {\n        margin-top: -18px;\n    }\n\n    .balance-pocket-head {\n        gap: 6px;\n        align-items: flex-start;\n        flex-direction: column;\n        padding-block: 9px;\n    }\n\n    .balance-pockets .money-pocket {\n        min-height: 88px;\n        padding: 17px 12px 14px;\n    }\n\n    .balance-pockets .money-pocket strong {\n        font-size: clamp(0.98rem, 5vw, 1.3rem);\n    }\n\n    .report-pocket-grid {\n        grid-template-columns: 1fr;\n        box-shadow: 5px 5px 0 var(--acid);\n    }\n\n    .report-pocket-head {\n        gap: 5px;\n        align-items: flex-start;\n        flex-direction: column;\n    }\n\n    .report-pocket-grid .report-pocket + .report-pocket {\n        border-top: 1px solid var(--ink);\n        border-left: 0;\n    }\n}\n`;

  write(path, source);
}

patchHtml();
patchStyles();
console.log("Estilo editorial Pix/Espécie aplicado com sucesso.");
