import fs from "node:fs";
import path from "node:path";

const VERSION = "2.8.8";
const CACHE_VERSION = `${VERSION}-nubank`;
const COMMAND = "node tools/add-nubank-v288.mjs";
const RUNTIME = "src/folego-accounts-runtime-v28.js";

const read = (file) => fs.readFileSync(file, "utf8");
const write = (file, content) => fs.writeFileSync(file, content, "utf8");

function patchAccountsDomain() {
    const file = "src/folego-accounts-v28.js";
    let source = read(file);

    if (!source.includes('logo: "/banks/nubank.svg"')) {
        const marker = `    cash: {
        id: "cash",`;
        if (!source.includes(marker)) throw new Error("Conta Espécie não encontrada no domínio.");
        source = source.replace(
            marker,
            `    nubank: {
        id: "nubank",
        name: "Nubank",
        subtitle: "Conta corrente",
        logo: "/banks/nubank.svg",
        accent: "#820ad1",
        openingBalance: 0
    },
    cash: {
        id: "cash",`
        );
    }

    const snapshotBlock = source.match(/balances: Object\.freeze\(\{[\s\S]*?\}\)/)?.[0] || "";
    if (snapshotBlock && !snapshotBlock.includes("nubank: 0")) {
        source = source.replace(
            /(^\s*itau:\s*0,?\r?\n)(\s*cash:\s*0)/m,
            "$1        nubank: 0,\n$2"
        );
    }

    write(file, source);
}

function patchSnapshotTests() {
    const file = "src/folego-account-snapshot-v282.test.js";
    let source = read(file);
    const opening = source.indexOf("expect(result.balances).toEqual({");
    const closing = opening >= 0 ? source.indexOf("});", opening) : -1;
    const expected = opening >= 0 && closing >= 0 ? source.slice(opening, closing) : "";

    if (expected && !expected.includes("nubank: 0")) {
        const cash = source.indexOf("cash: 0", opening);
        if (cash >= 0 && cash < closing) {
            const indent = source.slice(source.lastIndexOf("\n", cash) + 1, cash);
            source = `${source.slice(0, cash)}nubank: 0,\n${indent}${source.slice(cash)}`;
        }
    }

    write(file, source);

    const integrationFile = "src/folego-account-snapshot-v282-integration.test.js";
    let integration = read(integrationFile);
    integration = integration.replace(
        'expect(pkg).toContain("node tools/fix-account-snapshot-v282.mjs");',
        'expect(fs.existsSync("tools/fix-account-snapshot-v282.mjs")).toBe(true);\n        expect(pkg).toContain("node tools/add-nubank-v288.mjs");'
    );
    write(integrationFile, integration);
}

function patchRuntime() {
    let source = read(RUNTIME).replaceAll("04 CONTAS", "05 CONTAS");

    source = source.replace(
        /(^[ \t]*<option value="itau">Itaú<\/option>\r?\n)([ \t]*)(<option value="cash">Espécie<\/option>)/gm,
        (_match, itau, indent, cash) => `${itau}${indent}<option value="nubank">Nubank</option>\n${indent}${cash}`
    );

    write(RUNTIME, source);
}

function patchTransferDomains() {
    const transferFile = "src/folego-transfer-v27.js";
    let transfer = read(transferFile);
    if (!transfer.includes('nubank: "Nubank"')) {
        transfer = transfer.replace(
            `    itau: "Itaú",
    cash: "Espécie"`,
            `    itau: "Itaú",
    nubank: "Nubank",
    cash: "Espécie"`
        );
    }
    write(transferFile, transfer);

    const legacyFile = "src/folego-v25-domain.js";
    let legacy = read(legacyFile);
    if (!legacy.includes('nubank: "Nubank"')) {
        legacy = legacy.replace(
            `const labels = { pix: "Inter", bank_transfer: "Banco do Brasil", itau: "Itaú", cash: "Espécie" };`,
            `const labels = { pix: "Inter", bank_transfer: "Banco do Brasil", itau: "Itaú", nubank: "Nubank", cash: "Espécie" };`
        );
    }
    write(legacyFile, legacy);

    const mainDomainFile = "src/domain.js";
    let mainDomain = read(mainDomainFile);
    if (!mainDomain.includes('{ value: "nubank", label: "Nubank" }')) {
        mainDomain = mainDomain.replace(
            '    { value: "itau", label: "Itaú" },',
            '    { value: "itau", label: "Itaú" },\n    { value: "nubank", label: "Nubank" },'
        );
    }
    write(mainDomainFile, mainDomain);
}

function patchAccountStyles() {
    const file = "src/folego-accounts-v28.css";
    let source = read(file);

    if (!source.includes('.account-card-v28[data-account-method="nubank"]::before')) {
        source = source.replace(
            `.account-card-v28[data-account-method="cash"]::before {`,
            `.account-card-v28[data-account-method="nubank"]::before {
    background: #820ad1;
}

.account-card-v28[data-account-method="cash"]::before {`
        );
    }

    source = source
        .replace(
            /.report-accounts-v28 \{\s*grid-template-columns: repeat\(4,/,
            `.report-accounts-v28 {
    grid-template-columns: repeat(5,`
        )
        .replace(
            /(@media \(min-width: 1040px\) \{\s*\.accounts-list-v28 \{\s*grid-template-columns:) repeat\(4,/,
            "$1 repeat(5,"
        );

    write(file, source);
}

function patchCompactLayout() {
    const file = "src/folego-v284.css";
    let source = read(file);
    source = source.replace(
        /(\.accounts-list-v28 \{\s*grid-template-columns:) repeat\(4,/,
        "$1 repeat(5,"
    );

    const oldLastRow = `    .account-card-v28:nth-last-child(-n + 2) {
        border-bottom: 0;
    }`;
    const newLastRow = `    .account-card-v28:nth-last-child(-n + 2) {
        border-bottom: 1px solid var(--accounts-line);
    }

    .account-card-v28:last-child {
        grid-column: 1 / -1;
        border-right: 0;
        border-bottom: 0;
    }`;
    if (source.includes(oldLastRow)) source = source.replace(oldLastRow, newLastRow);

    write(file, source);
}

function stampPackage() {
    const file = "package.json";
    const pkg = JSON.parse(read(file));
    pkg.version = VERSION;
    pkg.engines = { ...(pkg.engines || {}), node: "24.x" };
    if (!pkg.scripts?.predev || !pkg.scripts?.prebuild) throw new Error("Scripts de preparação não encontrados.");
    // A árvore já contém todas as versões anteriores. Reexecutar a cadeia histórica
    // recria módulos removidos e tornou o build não idempotente após a V2.8.5.
    pkg.scripts.predev = COMMAND;
    pkg.scripts.prebuild = COMMAND;
    write(file, `${JSON.stringify(pkg, null, 2)}\n`);

    const lockFile = "package-lock.json";
    const lock = JSON.parse(read(lockFile));
    lock.version = VERSION;
    if (lock.packages?.[""]) {
        lock.packages[""].version = VERSION;
        lock.packages[""].engines = { ...(lock.packages[""].engines || {}), node: "24.x" };
    }
    write(lockFile, `${JSON.stringify(lock, null, 2)}\n`);
}

function stampInterface() {
    const indexFile = "index.html";
    let index = read(indexFile)
        .replace(/FÔLEGO \/ V2\.8\.\d+/g, `FÔLEGO / V${VERSION}`);
    index = index.replace(
        /<small class="account-version">[^<]+<\/small>/,
        `<small class="account-version">FÔLEGO / V${VERSION}</small>`
    );
    write(indexFile, index);

    const swFile = "public/sw.js";
    let sw = read(swFile)
        .replace(/const CACHE_NAME = "[^"]+";/, `const CACHE_NAME = "folego-v${CACHE_VERSION}";`);
    if (!sw.includes('"/banks/nubank.svg"')) {
        sw = sw.replace('"/banks/itau.svg"]', '"/banks/itau.svg", "/banks/nubank.svg"]');
    }
    write(swFile, sw);
}

function stampTests() {
    for (const name of fs.readdirSync("src")) {
        if (!name.endsWith(".test.js")) continue;
        const file = path.join("src", name);
        const source = read(file)
            .replace(/folego-v2\.8\.\d+(?:-[a-z-]+)?/g, `folego-v${VERSION}`)
            .replace(/FÔLEGO \/ V2\.8\.\d+/g, `FÔLEGO / V${VERSION}`)
            .replace(/"version": "2\.8\.\d+"/g, `"version": "${VERSION}"`)
            .replaceAll("04 CONTAS", "05 CONTAS");
        write(file, source);
    }
}

function validate() {
    const domain = read("src/folego-accounts-v28.js");
    const runtime = read(RUNTIME);
    const transfer = read("src/folego-transfer-v27.js");
    const mainDomain = read("src/domain.js");
    const migration = read("src/folego-accounts-migration-v28.js");
    const optionCount = runtime.match(/<option value="nubank">Nubank<\/option>/g)?.length || 0;

    for (const marker of [
        'id: "nubank"',
        'name: "Nubank"',
        'logo: "/banks/nubank.svg"',
        'accent: "#820ad1"',
        "openingBalance: 0"
    ]) {
        if (!domain.includes(marker)) throw new Error(`Conta Nubank incompleta: ${marker}`);
    }
    if (!runtime.includes("05 CONTAS") || optionCount < 3) {
        throw new Error("O Nubank não entrou em todos os seletores de conta.");
    }
    if (!transfer.includes('nubank: "Nubank"')) {
        throw new Error("O Nubank não entrou nas transferências internas.");
    }
    if (!mainDomain.includes('{ value: "nubank", label: "Nubank" }')) {
        throw new Error("O normalizador principal não reconhece movimentações do Nubank.");
    }
    if (migration.includes('.from("transactions")') || migration.includes("payment_method:")) {
        throw new Error("A inclusão do Nubank não pode migrar dados do Supabase.");
    }
    if (!fs.existsSync("public/banks/nubank.svg")) throw new Error("Logo do Nubank não encontrada.");
    if (!read("src/folego-accounts-v28.css").includes('data-account-method="nubank"')) {
        throw new Error("Identidade visual do Nubank ausente.");
    }
    if (!read("src/folego-v284.css").includes("grid-template-columns: repeat(5, minmax(0, 1fr))")) {
        throw new Error("A faixa de cinco contas não foi aplicada.");
    }
    if (!read("public/sw.js").includes(`folego-v${CACHE_VERSION}`)) {
        throw new Error("Cache da V2.8.8 não renovado.");
    }
}

patchAccountsDomain();
patchSnapshotTests();
patchRuntime();
patchTransferDomains();
patchAccountStyles();
patchCompactLayout();
stampPackage();
stampInterface();
stampTests();
validate();

console.log("Fôlego V2.8.8 aplicado: Nubank adicionado como quinta conta, com saldo inicial zerado.");
