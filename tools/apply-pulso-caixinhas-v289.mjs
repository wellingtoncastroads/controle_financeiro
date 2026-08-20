import fs from "node:fs";
import path from "node:path";

const VERSION = "2.8.9";
const CACHE_VERSION = VERSION + "-pulso-caixinhas";
const NUBANK_COMMAND = "node tools/add-nubank-v288.mjs";
const COMMAND = "node tools/apply-pulso-caixinhas-v289.mjs";
const PREPARE_COMMAND = NUBANK_COMMAND + " && " + COMMAND;
const STYLE = '<link rel="stylesheet" href="/src/folego-pulso-v289.css">';
const RUNTIME = '<script type="module" src="/src/folego-caixinhas-runtime-v289.js"></script>';

const read = (file) => fs.readFileSync(file, "utf8");
const write = (file, content) => fs.writeFileSync(file, content, "utf8");

function replaceRequired(source, search, replacement, label) {
    if (source.includes(replacement)) return source;
    if (!source.includes(search)) throw new Error("Não foi possível aplicar V2.8.9: " + label + ".");
    return source.replace(search, replacement);
}

function patchPackage() {
    const file = "package.json";
    const pkg = JSON.parse(read(file));
    pkg.version = VERSION;
    pkg.engines = { ...(pkg.engines || {}), node: "24.x" };
    pkg.scripts.predev = PREPARE_COMMAND;
    pkg.scripts.prebuild = PREPARE_COMMAND;
    write(file, JSON.stringify(pkg, null, 2) + "\n");

    const lockFile = "package-lock.json";
    const lock = JSON.parse(read(lockFile));
    lock.version = VERSION;
    if (lock.packages?.[""]) {
        lock.packages[""].version = VERSION;
        lock.packages[""].engines = { ...(lock.packages[""].engines || {}), node: "24.x" };
    }
    write(lockFile, JSON.stringify(lock, null, 2) + "\n");
}

function patchIndex() {
    const file = "index.html";
    let html = read(file);
    html = html.replace(
        '<html lang="pt-BR">',
        '<html lang="pt-BR" class="pulso-v289" data-theme="dark">'
    );
    if (!html.includes('localStorage.getItem("folego-theme-v2") === "light"')) {
        html = replaceRequired(
            html,
            '    <meta name="viewport" content="width=device-width, initial-scale=1.0">',
            '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <script>try { document.documentElement.dataset.theme = localStorage.getItem("folego-theme-v2") === "light" ? "light" : "dark"; } catch { /* dark permanece como padrão seguro */ }</script>',
            "tema Pulso antes da primeira pintura"
        );
    }
    html = html.replace(/FÔLEGO \/ V2\.8\.\d+/g, "FÔLEGO / V" + VERSION);
    html = html.replace('<meta name="theme-color" content="#eeebe2">', '<meta name="theme-color" content="#071011">');

    if (html.includes('<link rel="stylesheet" href="/src/folego-reserve-v287.css">')) {
        html = html.replace('<link rel="stylesheet" href="/src/folego-reserve-v287.css">', STYLE);
    } else if (!html.includes(STYLE)) {
        html = replaceRequired(
            html,
            '<link rel="stylesheet" href="/src/folego-v284.css">',
            '<link rel="stylesheet" href="/src/folego-v284.css">\n    ' + STYLE,
            "folha visual Pulso"
        );
    }

    if (html.includes('<script type="module" src="/src/folego-reserve-runtime-v287.js"></script>')) {
        html = html.replace('<script type="module" src="/src/folego-reserve-runtime-v287.js"></script>', RUNTIME);
    } else if (!html.includes(RUNTIME)) {
        html = replaceRequired(
            html,
            '<script type="module" src="/src/folego-accounts-runtime-v28.js"></script>',
            '<script type="module" src="/src/folego-accounts-runtime-v28.js"></script>\n    ' + RUNTIME,
            "runtime das caixinhas"
        );
    }

    if (!html.includes('data-view="accounts"')) {
        const reportsMarker = '            <button class="rail-link" type="button" data-view="reports">';
        const accountsButton = [
            '            <button class="rail-link" type="button" data-view="accounts">',
            "                <span>04</span>",
            "                <strong>Contas</strong>",
            "            </button>",
            ""
        ].join("\n");
        html = replaceRequired(html, reportsMarker, accountsButton + reportsMarker, "destino Contas");
    }
    html = html
        .replace(/(<button class="rail-link" type="button" data-view="reports">\s*<span>)04(<\/span>)/, "$105$2")
        .replace(/(<button class="rail-link" type="button" data-view="archive">\s*<span>)05(<\/span>)/, "$106$2");

    const archiveStart = html.indexOf('id="archiveView"');
    if (archiveStart >= 0) {
        const archiveTail = html.slice(archiveStart);
        html = html.slice(0, archiveStart) + archiveTail.replace("<span>05</span>", "<span>06</span>");
    }
    write(file, html);
}

function patchMainRuntime() {
    const file = "script.js";
    let source = read(file);
    source = source.replace(
        'theme: localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light",',
        'theme: localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark",'
    );
    source = source.replace(
        'switchView(["dashboard", "transactions", "goals", "reports"].includes(initialView) ? initialView : "dashboard", false);',
        'switchView(["dashboard", "transactions", "goals", "accounts", "reports"].includes(initialView) ? initialView : "dashboard", false);'
    );
    source = source.replace(
        'const validViews = ["dashboard", "transactions", "goals", "reports"];',
        'const validViews = ["dashboard", "transactions", "goals", "accounts", "reports"];'
    );
    source = source.replace(
        'const titles = { dashboard: "Pulso atual", transactions: "Extrato completo", goals: "Planos futuros", reports: "Raio-X financeiro" };',
        'const titles = { dashboard: "Pulso atual", transactions: "Extrato completo", goals: "Planos futuros", accounts: "Contas e caixinhas", reports: "Raio-X financeiro" };'
    );

    if (!source.includes("backup.savingsBoxes = savingsBoxes")) {
        source = replaceRequired(
            source,
            "    const backup = createBackup(state);\n    const timestamp = new Date().toISOString()",
            "    const backup = createBackup(state);\n    const savingsBoxes = window.folegoSavingsBoxesBackup?.exportData?.();\n    if (savingsBoxes) backup.savingsBoxes = savingsBoxes;\n    const timestamp = new Date().toISOString()",
            "caixinhas no backup"
        );
    }
    if (!source.includes("folegoSavingsBoxesBackup?.importData")) {
        source = replaceRequired(
            source,
            "        await replaceUserSnapshot(normalized.transactions, normalized.goals, normalized.budgets, normalized.contributions);\n        state.settings = normalized.settings;",
            "        await replaceUserSnapshot(normalized.transactions, normalized.goals, normalized.budgets, normalized.contributions);\n        if (window.folegoSavingsBoxesBackup?.importData) {\n            await window.folegoSavingsBoxesBackup.importData(parsed.savingsBoxes || {});\n        }\n        state.settings = normalized.settings;",
            "restauração das caixinhas"
        );
    }
    write(file, source);
}

function patchBackupVersion() {
    const file = "src/domain.js";
    const source = read(file).replace("export const BACKUP_VERSION = 3;", "export const BACKUP_VERSION = 4;");
    write(file, source);
}

function patchAccountsRuntime() {
    const file = "src/folego-accounts-runtime-v28.js";
    let source = read(file);
    if (!source.includes('new CustomEvent("folego:accounts-rendered")')) {
        source = replaceRequired(
            source,
            "    renderReportAccounts();\n    renderForecastOpeningBalance();",
            "    renderReportAccounts();\n    renderForecastOpeningBalance();\n    window.dispatchEvent(new CustomEvent(\"folego:accounts-rendered\"));",
            "sincronização visual das contas"
        );
    }
    const oldClick = [
        '    const card = event.target.closest("[data-account-method]");',
        "    if (!card) return;",
        "    state.selectedAccount = card.dataset.accountMethod;",
        "    document.querySelector('[data-view=\"transactions\"]')?.click();",
        "    window.setTimeout(() => {",
        '        const filter = $("#accountFilterV28");',
        "        if (filter) filter.value = state.selectedAccount;",
        "        applyAccountFilter();",
        "    }, 80);"
    ].join("\n");
    const newClick = [
        '    const card = event.target.closest(".account-card-v28[data-account-method]");',
        "    if (!card) return;",
        "    state.selectedAccount = card.dataset.accountMethod;",
        '    window.dispatchEvent(new CustomEvent("folego:open-accounts", {',
        "        detail: { accountMethod: state.selectedAccount }",
        "    }));"
    ].join("\n");
    if (source.includes(oldClick)) source = source.replace(oldClick, newClick);

    const oldObserver = [
        "const observer = new MutationObserver(scheduleRender);",
        "observer.observe(document.documentElement, { childList: true, subtree: true, characterData: false });"
    ].join("\n");
    const pausedObserver = [
        "const observer = new MutationObserver(scheduleRender);",
        "const observeApp = () => observer.observe(document.documentElement, {",
        "    childList: true,",
        "    subtree: true,",
        "    characterData: false",
        "});",
        'window.addEventListener("folego:savings-render-start", () => observer.disconnect());',
        'window.addEventListener("folego:savings-render-end", observeApp);',
        "observeApp();"
    ].join("\n");
    if (source.includes(oldObserver)) source = source.replace(oldObserver, pausedObserver);
    write(file, source);
}

function patchLegacyVisualTests() {
    const file = "src/folego-v284.test.js";
    let source = read(file);
    source = source
        .replace('describe("Fôlego V2.8.5", () => {', 'describe("Fôlego V2.8.9", () => {')
        .replace('it("mantém somente cinco áreas na navegação", () => {', 'it("mantém as seis áreas na navegação", () => {')
        .replace(
            'expect(views).toEqual(["dashboard", "transactions", "goals", "reports", "archive"]);',
            'expect(views).toEqual(["dashboard", "transactions", "goals", "accounts", "reports", "archive"]);'
        )
        .replace(
            'expect(index).toContain(\'<meta name="theme-color" content="#eeebe2">\');',
            'expect(index).toContain(\'<meta name="theme-color" content="#071011">\');'
        );
    write(file, source);
}

function stampCache() {
    const file = "public/sw.js";
    let source = read(file).replace(/const CACHE_NAME = "[^"]+";/, 'const CACHE_NAME = "folego-v' + CACHE_VERSION + '";');
    const currentShell = source.match(/const APP_SHELL = \[[^\]]+\];/)?.[0];
    if (!currentShell) throw new Error("Não foi possível aplicar V2.8.9: cache offline.");
    const assets = [
        '"/"',
        '"/index.html"',
        '"/manifest.webmanifest"',
        '"/assets/folego-mark.svg"',
        '"/banks/itau.svg"',
        '"/banks/nubank.svg"',
        '"/src/folego-pulso-v289.css"',
        '"/src/folego-caixinhas-v289.js"',
        '"/src/folego-caixinhas-runtime-v289.js"'
    ];
    source = source.replace(currentShell, "const APP_SHELL = [" + assets.join(", ") + "];");
    write(file, source);
}

function stampTests() {
    for (const name of fs.readdirSync("src")) {
        if (!name.endsWith(".test.js")) continue;
        const file = path.join("src", name);
        const source = read(file)
            .replace(/folego-v2\.8\.\d+(?:-[a-z-]+)?/g, "folego-v" + VERSION)
            .replace(/FÔLEGO \/ V2\.8\.\d+/g, "FÔLEGO / V" + VERSION)
            .replace(/"version": "2\.8\.\d+"/g, '"version": "' + VERSION + '"');
        write(file, source);
    }
}

function validate() {
    const index = read("index.html");
    const main = read("script.js");
    const accountsRuntime = read("src/folego-accounts-runtime-v28.js");
    const pkg = JSON.parse(read("package.json"));
    const sw = read("public/sw.js");
    const domain = read("src/folego-caixinhas-v289.js");
    const runtime = read("src/folego-caixinhas-runtime-v289.js");
    const style = read("src/folego-pulso-v289.css");

    if (
        !index.includes(STYLE)
        || !index.includes(RUNTIME)
        || !index.includes('class="pulso-v289" data-theme="dark"')
        || !index.includes('localStorage.getItem("folego-theme-v2") === "light"')
    ) throw new Error("Pulso e caixinhas não foram ligados à interface.");
    if (index.includes("folego-reserve-runtime-v287.js")) throw new Error("O runtime antigo da Reserva ainda está ativo.");
    if (!index.includes('data-view="accounts"')) throw new Error("A área Contas não entrou na navegação.");
    if (!main.includes('"accounts", "reports"') || !main.includes("backup.savingsBoxes = savingsBoxes")) {
        throw new Error("Navegação ou backup das caixinhas ficou incompleto.");
    }
    if (
        !accountsRuntime.includes("folego:accounts-rendered")
        || !accountsRuntime.includes("folego:open-accounts")
        || !accountsRuntime.includes("folego:savings-render-start")
        || !accountsRuntime.includes("folego:savings-render-end")
    ) {
        throw new Error("As contas não abrem a nova área de caixinhas.");
    }
    if (!domain.includes("calculateSavingsFinancialState") || !runtime.includes("validateSavingsMovement")) {
        throw new Error("O fluxo Guardar, Resgatar e Mover ficou incompleto.");
    }
    if (!style.includes(".savings-ledger-v289") || !style.includes("--pulso-yellow")) {
        throw new Error("A identidade Pulso não foi aplicada.");
    }
    if (pkg.version !== VERSION || pkg.scripts.prebuild !== PREPARE_COMMAND || pkg.scripts.predev !== PREPARE_COMMAND) {
        throw new Error("A preparação V2.8.9 não ficou repetível.");
    }
    if (!sw.includes("folego-v" + CACHE_VERSION) || !sw.includes("/src/folego-caixinhas-runtime-v289.js")) {
        throw new Error("O cache offline da V2.8.9 não foi renovado.");
    }
}

patchPackage();
patchIndex();
patchMainRuntime();
patchBackupVersion();
patchAccountsRuntime();
patchLegacyVisualTests();
stampCache();
stampTests();
validate();

console.log("Fôlego V2.8.9 aplicado: visual Pulso e caixinhas por conta, sem alteração de schema.");
