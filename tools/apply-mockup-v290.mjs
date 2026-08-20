import fs from "node:fs";
import path from "node:path";

const VERSION = "2.9.0";
const CACHE_VERSION = VERSION + "-mockup-fiel";
const NUBANK_COMMAND = "node tools/add-nubank-v288.mjs";
const SAVINGS_COMMAND = "node tools/apply-pulso-caixinhas-v289.mjs";
const COMMAND = "node tools/apply-mockup-v290.mjs";
const PREPARE_COMMAND = [NUBANK_COMMAND, SAVINGS_COMMAND, COMMAND].join(" && ");
const STYLE = '<link rel="stylesheet" href="/src/folego-mockup-v290.css">';
const RUNTIME = '<script type="module" src="/src/folego-mockup-runtime-v290.js"></script>';
const VIEW_MODEL_IMPORT = 'import { buildMockupViewModel } from "./src/folego-mockup-view-model-v290.js";';

const read = (file) => fs.readFileSync(file, "utf8");
const write = (file, content) => fs.writeFileSync(file, content, "utf8");

function replaceRequired(source, search, replacement, label) {
    if (source.includes(replacement)) return source;
    if (!source.includes(search)) throw new Error("Não foi possível aplicar V2.9.0: " + label + ".");
    return source.replace(search, replacement);
}

function patchPackage() {
    const file = "package.json";
    const pkg = JSON.parse(read(file));
    pkg.version = VERSION;
    pkg.engines = { ...(pkg.engines || {}), node: "24.x" };
    pkg.scripts.predev = PREPARE_COMMAND;
    pkg.scripts.prebuild = PREPARE_COMMAND;
    pkg.scripts.pretest = PREPARE_COMMAND;
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
        /\n\s*<script>try \{ document\.documentElement\.dataset\.theme = localStorage\.getItem\("folego-theme-v2"\) === "light" \? "light" : "dark"; \} catch \{ \/\* dark permanece como padrão seguro \*\/ \}<\/script>/,
        ""
    );
    html = html.replace(/FÔLEGO \/ V2\.8\.\d+/g, "FÔLEGO / V" + VERSION);
    if (!html.includes(STYLE)) {
        html = replaceRequired(
            html,
            '<link rel="stylesheet" href="/src/folego-pulso-v289.css">',
            '<link rel="stylesheet" href="/src/folego-pulso-v289.css">\n    ' + STYLE,
            "folha visual fiel ao mockup"
        );
    }
    if (!html.includes(RUNTIME)) {
        html = replaceRequired(
            html,
            '<script type="module" src="/src/folego-caixinhas-runtime-v289.js"></script>',
            '<script type="module" src="/src/folego-caixinhas-runtime-v289.js"></script>\n    ' + RUNTIME,
            "runtime da nova composição"
        );
    }
    write(file, html);
}

function patchMainRuntime() {
    const file = "script.js";
    let source = read(file);
    if (!source.includes(VIEW_MODEL_IMPORT)) {
        source = replaceRequired(
            source,
            'import { generateFinancialReportPdf } from "./src/report-pdf.js";',
            'import { generateFinancialReportPdf } from "./src/report-pdf.js";\n' + VIEW_MODEL_IMPORT,
            "modelo de leitura do mockup"
        );
    }

    if (!source.includes('new CustomEvent("folego:core-rendered"')) {
        const marker = [
            "    renderGoals();",
            "    renderForecast();",
            "    renderReports();",
            "}"
        ].join("\n");
        const replacement = [
            "    renderGoals();",
            "    renderForecast();",
            "    renderReports();",
            '    window.dispatchEvent(new CustomEvent("folego:core-rendered", {',
            "        detail: buildMockupViewModel(state, getDisplayName())",
            "    }));",
            "}",
            "",
            'window.addEventListener("folego:request-core-render", renderAll);'
        ].join("\n");
        source = replaceRequired(source, marker, replacement, "sincronização dos dados visuais");
    } else if (!source.includes('window.addEventListener("folego:request-core-render", renderAll)')) {
        source = replaceRequired(
            source,
            "/* ================================================================\n   NAVEGAÇÃO E FORMULÁRIOS",
            'window.addEventListener("folego:request-core-render", renderAll);\n\n/* ================================================================\n   NAVEGAÇÃO E FORMULÁRIOS',
            "atualização manual"
        );
    }
    write(file, source);
}

function patchCompatibilityTests() {
    const file = "src/folego-caixinhas-v289.test.js";
    let source = read(file);
    source = source
        .replace(
            'expect(packageJson).toContain(\'"version": "2.8.9"\');',
            'expect(packageJson).toContain("apply-pulso-caixinhas-v289.mjs");'
        )
        .replace(
            'expect(index).toContain(\'localStorage.getItem("folego-theme-v2") === "light"\');',
            'expect(index).toContain(\'data-theme="dark"\');'
        );
    write(file, source);
}

function stampCache() {
    const file = "public/sw.js";
    let source = read(file).replace(/const CACHE_NAME = "[^"]+";/, 'const CACHE_NAME = "folego-v' + CACHE_VERSION + '";');
    const shell = source.match(/const APP_SHELL = \[([^\]]*)\];/);
    if (!shell) throw new Error("Não foi possível aplicar V2.9.0: cache offline.");
    let assets = shell[1].trim();
    for (const asset of [
        '"/src/folego-mockup-v290.css"',
        '"/src/folego-mockup-view-model-v290.js"',
        '"/src/folego-mockup-runtime-v290.js"'
    ]) {
        if (!assets.includes(asset)) assets += (assets ? ", " : "") + asset;
    }
    source = source.replace(shell[0], "const APP_SHELL = [" + assets + "];");
    write(file, source);
}

function stampTests() {
    for (const name of fs.readdirSync("src")) {
        if (!name.endsWith(".test.js")) continue;
        const file = path.join("src", name);
        const source = read(file)
            .replace(/folego-v2\.8\.9(?:-[a-z-]+)?/g, "folego-v" + VERSION)
            .replace(/FÔLEGO \/ V2\.8\.9/g, "FÔLEGO / V" + VERSION)
            .replace(/"version": "2\.8\.9"/g, '"version": "' + VERSION + '"');
        write(file, source);
    }
}

function validate() {
    const index = read("index.html");
    const main = read("script.js");
    const runtime = read("src/folego-mockup-runtime-v290.js");
    const viewModel = read("src/folego-mockup-view-model-v290.js");
    const style = read("src/folego-mockup-v290.css");
    const pkg = JSON.parse(read("package.json"));
    const sw = read("public/sw.js");

    if (!index.includes(STYLE) || !index.includes(RUNTIME)) {
        throw new Error("A nova composição não foi ligada à interface.");
    }
    if (index.includes("<script>try { document.documentElement.dataset.theme")) {
        throw new Error("O script inline bloqueado pela CSP ainda está presente.");
    }
    if (!main.includes(VIEW_MODEL_IMPORT) || !main.includes("folego:core-rendered")) {
        throw new Error("Os dados reais não foram ligados ao mockup.");
    }
    for (const marker of ["DIAS DE FÔLEGO", "ROTA DO DINHEIRO", "MOVIMENTOS", "CONTAS E CAIXINHAS"]) {
        if (!runtime.includes(marker)) throw new Error("Tela incompleta: " + marker + ".");
    }
    if (!style.includes(".v290-pulse-grid") || !style.includes(".v290-accounts-layout")) {
        throw new Error("A hierarquia visual aprovada ficou incompleta.");
    }
    if (!viewModel.includes("excludeInternalTransfers") || !viewModel.includes("projection")) {
        throw new Error("Resultado ou planejamento não preservam as regras financeiras.");
    }
    if (
        pkg.version !== VERSION
        || pkg.scripts.prebuild !== PREPARE_COMMAND
        || pkg.scripts.predev !== PREPARE_COMMAND
        || pkg.scripts.pretest !== PREPARE_COMMAND
    ) {
        throw new Error("A preparação V2.9.0 não ficou repetível.");
    }
    if (!sw.includes("folego-v" + CACHE_VERSION) || !sw.includes("/src/folego-mockup-runtime-v290.js")) {
        throw new Error("O cache offline da V2.9.0 não foi renovado.");
    }
}

patchPackage();
patchIndex();
patchMainRuntime();
patchCompatibilityTests();
stampCache();
stampTests();
validate();

console.log("Fôlego V2.9.0 aplicado: composição fiel aos mockups, sem alteração de Supabase.");
