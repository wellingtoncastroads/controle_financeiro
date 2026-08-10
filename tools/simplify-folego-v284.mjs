import fs from "node:fs";
import path from "node:path";

const VERSION = "2.8.4";
const COMMAND = "node tools/simplify-folego-v284.mjs";
const STYLE = '<link rel="stylesheet" href="/src/folego-v284.css">';

const read = (file) => fs.readFileSync(file, "utf8");
const write = (file, content) => fs.writeFileSync(file, content, "utf8");

function removeElementById(source, tag, id) {
    const opening = new RegExp(`<${tag}\\b[^>]*\\bid=["']${id}["'][^>]*>`, "i");
    const match = opening.exec(source);
    if (!match) return source;

    const start = match.index;
    const tags = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
    tags.lastIndex = start;
    let depth = 0;
    let current;

    while ((current = tags.exec(source))) {
        if (current[0].startsWith("</")) depth -= 1;
        else if (!current[0].endsWith("/>")) depth += 1;
        if (depth === 0) return `${source.slice(0, start)}${source.slice(tags.lastIndex)}`;
    }

    throw new Error(`Não foi possível fechar <${tag} id="${id}">.`);
}

function removeLineContaining(source, marker) {
    return source
        .split(/\r?\n/)
        .filter((line) => !line.includes(marker))
        .join("\n");
}

function patchPackage() {
    const file = "package.json";
    const pkg = JSON.parse(read(file));
    pkg.version = VERSION;
    for (const script of ["predev", "prebuild"]) {
        if (!pkg.scripts?.[script]) throw new Error(`Script ${script} não encontrado.`);
        if (!pkg.scripts[script].includes(COMMAND)) pkg.scripts[script] += ` && ${COMMAND}`;
    }
    write(file, `${JSON.stringify(pkg, null, 2)}\n`);

    const lockFile = "package-lock.json";
    const lock = JSON.parse(read(lockFile));
    lock.version = VERSION;
    if (lock.packages?.[""]) lock.packages[""].version = VERSION;
    write(lockFile, `${JSON.stringify(lock, null, 2)}\n`);
}

function patchIndex() {
    const file = "index.html";
    let source = read(file);

    if (!source.includes(STYLE)) {
        const anchor = '<link rel="stylesheet" href="/src/folego-accounts-v28.css">';
        if (!source.includes(anchor)) throw new Error("Folha de contas V2.8 não encontrada.");
        source = source.replace(anchor, `${anchor}\n    ${STYLE}`);
    }

    for (const href of [
        "/src/credit-card-feature.css",
        "/src/card-history.css",
        "/src/monthly-planning.css",
        "/src/route-number-font-v243.css",
        "/src/route-number-font-v251.css"
    ]) source = removeLineContaining(source, `href="${href}"`);

    for (const src of [
        "/src/credit-card-feature.js",
        "/src/card-history.js",
        "/src/monthly-planning.js"
    ]) source = removeLineContaining(source, `src="${src}"`);

    source = removeElementById(source, "section", "cardsView");
    source = removeElementById(source, "section", "planningView");
    source = removeElementById(source, "dialog", "creditCardDialog");
    source = removeElementById(source, "dialog", "v25InvoicePaymentDialog");
    source = removeElementById(source, "div", "creditPurchaseFields");

    source = source.replace(/\s*<button class="rail-link" type="button" data-view="cards">[\s\S]*?<\/button>/, "");
    source = source.replace(/\s*<button class="rail-link" type="button" data-view="planning">[\s\S]*?<\/button>/, "");
    source = source.replace(
        /(<button class="rail-link" type="button" data-view="reports">[\s\S]*?<span>)[^<]*(<\/span>)/,
        "$1" + "04" + "$2"
    );
    source = source.replace(
        /(<button class="rail-link" type="button" data-view="archive">[\s\S]*?<span>)[^<]*(<\/span>)/,
        "$1" + "05" + "$2"
    );
    source = source.replace(
        /(<section class="view" id="reportsView"[\s\S]*?<div class="view-index"[^>]*>[\s\S]*?<span>)[^<]*(<\/span>)/,
        "$1" + "04" + "$2"
    );
    source = source.replace(
        /(<section class="view" id="archiveView"[\s\S]*?<div class="view-index"[^>]*>[\s\S]*?<span>)[^<]*(<\/span>)/,
        "$1" + "05" + "$2"
    );
    source = source.replaceAll("F / ROTA PROVÁVEL", "F / PROJEÇÃO DE CAIXA");
    source = source.replace(/\s*<option value="credit_card">[^<]*<\/option>/g, "");
    source = source.replace('<meta name="theme-color" content="#eeebe2">', '<meta name="theme-color" content="#f7f5ee">');
    source = source.replace(
        '<div class="daily-movements-summary" aria-label="Resumo confirmado do dia">',
        '<div class="daily-movements-summary" role="group" aria-label="Resumo confirmado do dia">'
    );
    source = source.replace(
        '<div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">',
        '<div class="v25-annual-actions">'
    );
    source = source.replace(
        '<div class="form-grid" style="margin-top:16px">',
        '<div class="form-grid v25-transfer-form-grid">'
    );
    source = source.replace(/FÔLEGO \/ V2\.\d+(?:\.\d+)?/g, `FÔLEGO / V${VERSION}`);
    source = source.replace(
        /<small class="account-version">[^<]+<\/small>/,
        `<small class="account-version">FÔLEGO / V${VERSION}</small>`
    );

    source = source.split(/\r?\n/).map((line) => line.trimEnd()).join("\n");
    write(file, `${source.trimEnd()}\n`);
}

function patchNavigation() {
    const file = "script.js";
    let source = read(file);
    source = source
        .replace(
            'switchView(["dashboard", "transactions", "goals", "reports", "planning"].includes(initialView) ? initialView : "dashboard", false);',
            'switchView(["dashboard", "transactions", "goals", "reports"].includes(initialView) ? initialView : "dashboard", false);'
        )
        .replace(
            'const validViews = ["dashboard", "transactions", "goals", "reports", "planning"];',
            'const validViews = ["dashboard", "transactions", "goals", "reports"];'
        )
        .replace(
            'const titles = { dashboard: "Pulso atual", transactions: "Extrato completo", goals: "Planos futuros", reports: "Raio-X financeiro", planning: "Rota do mês" };',
            'const titles = { dashboard: "Pulso atual", transactions: "Extrato completo", goals: "Planos futuros", reports: "Raio-X financeiro" };'
        )
        .replace(
            'const SPECTRUM_COLORS = ["#c8ff3d", "#ff4e1a", "#2456d8", "#164b3a", "#e2b93b"];',
            'const SPECTRUM_COLORS = ["#62b995", "#e64a35", "#1647d8", "#c8d8f2", "#7c8079"];'
        );
    write(file, source);
}

function patchAccountsPlacement() {
    const file = "src/folego-accounts-runtime-v28.js";
    let source = read(file);
    const oldPlacement = `    const oldPockets = $(".balance-pockets");
    if (oldPockets) oldPockets.replaceWith(overview);
    else {
        const hero = $("#currentBalance");
        hero?.insertAdjacentElement("afterend", overview);
    }`;
    const newPlacement = `    /* V2.8.4: as contas formam uma faixa própria sob o resumo, sem sufocar o saldo. */
    const oldPockets = $(".balance-pockets");
    oldPockets?.remove();
    const stage = $(".balance-stage");
    const receipt = stage?.querySelector(".month-receipt");
    if (stage) stage.insertBefore(overview, receipt || null);
    else $("#currentBalance")?.insertAdjacentElement("afterend", overview);`;

    if (source.includes(oldPlacement)) source = source.replace(oldPlacement, newPlacement);
    if (!source.includes("V2.8.4: as contas formam uma faixa própria")) {
        throw new Error("Posicionamento das contas V2.8.4 não aplicado.");
    }
    write(file, source);
}

function stampVersion() {
    const swFile = "public/sw.js";
    let sw = read(swFile).replace(/const CACHE_NAME = "[^"]+";/, `const CACHE_NAME = "folego-v${VERSION}";`);
    write(swFile, sw);

    for (const name of fs.readdirSync("src")) {
        if (!name.endsWith(".test.js")) continue;
        const file = path.join("src", name);
        const source = read(file)
            .replace(/folego-v2\.\d+(?:\.\d+)?/g, `folego-v${VERSION}`)
            .replace(/FÔLEGO \/ V2\.\d+(?:\.\d+)?/g, `FÔLEGO / V${VERSION}`)
            .replace(/"version": "2\.\d+(?:\.\d+)?"/g, `"version": "${VERSION}"`);
        write(file, source);
    }
}

function validate() {
    const index = read("index.html");
    const app = read("script.js");
    const runtime = read("src/folego-accounts-runtime-v28.js");
    const forbidden = [
        'data-view="cards"',
        'data-view="planning"',
        'id="cardsView"',
        'id="planningView"',
        'id="creditCardDialog"',
        'src="/src/credit-card-feature.js"',
        'src="/src/monthly-planning.js"'
    ];

    forbidden.forEach((marker) => {
        if (index.includes(marker)) throw new Error(`Interface removida ainda presente: ${marker}`);
    });
    if (!index.includes(STYLE)) throw new Error("Identidade visual V2.8.4 ausente.");
    if (!index.includes('data-view="archive"') || !index.includes("<span>05</span>")) {
        throw new Error("Navegação compacta de cinco áreas não encontrada.");
    }
    if (app.includes('planning: "Rota do mês"') || !app.includes('const validViews = ["dashboard", "transactions", "goals", "reports"]')) {
        throw new Error("Rota ainda participa da navegação principal.");
    }
    if (!runtime.includes("V2.8.4: as contas formam uma faixa própria")) {
        throw new Error("Faixa compacta de contas não posicionada.");
    }
    if (!read("public/sw.js").includes(`folego-v${VERSION}`)) throw new Error("Cache da V2.8.4 não renovado.");
}

patchPackage();
patchIndex();
patchNavigation();
patchAccountsPlacement();
stampVersion();
validate();

console.log("Fôlego V2.8.4 aplicado: Cartão e Rota removidos, navegação e dashboard refinadas.");
