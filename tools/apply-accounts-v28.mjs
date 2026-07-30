import fs from "node:fs";

const VERSION = "2.8.0";
const STYLE = '<link rel="stylesheet" href="/src/folego-accounts-v28.css">';
const SCRIPT = '<script type="module" src="/src/folego-accounts-runtime-v28.js"></script>';

const read = (path) => fs.readFileSync(path, "utf8");
const write = (path, content) => fs.writeFileSync(path, content, "utf8");

function patchIndex() {
    const path = "index.html";
    let source = read(path);
    if (!source.includes(STYLE)) source = source.replace("</head>", `    ${STYLE}\n</head>`);
    if (!source.includes(SCRIPT)) source = source.replace("</body>", `    ${SCRIPT}\n</body>`);
    source = source.replace(/FÔLEGO \/ V2\.\d+(?:\.\d+)?/g, `FÔLEGO / V${VERSION}`);
    source = source.replace(/<small class="account-version">[^<]+<\/small>/, `<small class="account-version">FÔLEGO / V${VERSION}</small>`);
    write(path, source);
}

function patchTransferDomain() {
    const path = "src/folego-transfer-v27.js";
    let source = read(path);
    source = source.replace(
        `export const POCKET_LABELS = Object.freeze({
    pix: "Pix",
    cash: "Espécie"
});`,
        `export const POCKET_LABELS = Object.freeze({
    pix: "Inter",
    bank_transfer: "Banco do Brasil",
    cash: "Espécie"
});`
    );
    write(path, source);

    const legacyPath = "src/folego-v25-domain.js";
    let legacy = read(legacyPath);
    legacy = legacy.replace(
        `const labels = { pix: "Pix", cash: "Espécie" };`,
        `const labels = { pix: "Inter", bank_transfer: "Banco do Brasil", cash: "Espécie" };`
    );
    write(legacyPath, legacy);
}

function patchRuntime() {
    const path = "src/folego-accounts-runtime-v28.js";
    let source = read(path);
    source = source.replace(
        `function render() {
    if (!state.user) return;
    renderOverview();
    ensureAccountFilter();
    updateTransactionForm();
    updateTransferForms();
    renderRecent();
    applyAccountFilter();
    renderReportAccounts();
    renderForecastOpeningBalance();
}`,
        `function render() {
    if (!state.user) return;
    observer.disconnect();
    try {
        renderOverview();
        ensureAccountFilter();
        updateTransactionForm();
        updateTransferForms();
        renderRecent();
        applyAccountFilter();
        renderReportAccounts();
        renderForecastOpeningBalance();
    } finally {
        observer.observe(document.documentElement, { childList: true, subtree: true, characterData: false });
    }
}`
    );
    write(path, source);
}

function stamp() {
    const packagePath = "package.json";
    const pkg = JSON.parse(read(packagePath));
    pkg.version = VERSION;
    const command = "node tools/apply-accounts-v28.mjs";
    for (const name of ["predev", "prebuild"]) {
        if (!pkg.scripts[name].includes(command)) pkg.scripts[name] += ` && ${command}`;
    }
    write(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

    const swPath = "public/sw.js";
    let sw = read(swPath);
    sw = sw.replace(/const CACHE_NAME = "[^"]+";/, `const CACHE_NAME = "folego-v${VERSION}";`);
    write(swPath, sw);

    for (const path of [
        "src/folego-pluggy-loader.test.js",
        "src/folego-transfer-mobile-v271.test.js",
        "src/folego-new-record-mobile-v272.test.js",
        "src/folego-transfer-neutrality-v273.test.js"
    ]) {
        if (!fs.existsSync(path)) continue;
        let test = read(path);
        test = test.replace(/2\.7\.\d+/g, VERSION);
        write(path, test);
    }
}

patchIndex();
patchTransferDomain();
patchRuntime();
stamp();

if (!read("index.html").includes(SCRIPT)) throw new Error("O módulo de contas não foi carregado.");
if (!read("src/folego-transfer-v27.js").includes("bank_transfer")) throw new Error("Banco do Brasil não entrou nas transferências.");
if (!read("src/folego-accounts-runtime-v28.js").includes("observer.disconnect()")) throw new Error("A renderização das contas pode entrar em repetição.");
if (!read("public/sw.js").includes(`folego-v${VERSION}`)) throw new Error("O cache da V2.8 não foi renovado.");

console.log("Fôlego V2.8.0 aplicado: contas financeiras, logos e origem/destino dos movimentos.");
