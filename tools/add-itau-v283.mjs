import fs from "node:fs";
import path from "node:path";

const VERSION = "2.8.3";
const COMMAND = "node tools/add-itau-v283.mjs";
const RUNTIME = "src/folego-accounts-runtime-v28.js";

const read = (file) => fs.readFileSync(file, "utf8");
const write = (file, content) => fs.writeFileSync(file, content, "utf8");

function patchDomain() {
    const file = "src/folego-accounts-v28.js";
    let source = read(file);

    if (!source.includes('logo: "/banks/itau.svg"')) {
        source = source.replace(
            `    cash: {`,
            `    itau: {
        id: "itau",
        name: "Itaú",
        subtitle: "Conta corrente",
        logo: "/banks/itau.svg",
        accent: "#ec7000",
        openingBalance: 0
    },
    cash: {`
        );
    }

    write(file, source);
}

function patchSnapshotTest() {
    const file = "src/folego-account-snapshot-v282.test.js";
    let source = read(file);
    const opening = source.indexOf("expect(result.balances).toEqual({");
    const closing = opening >= 0 ? source.indexOf("});", opening) : -1;
    const expected = opening >= 0 && closing >= 0 ? source.slice(opening, closing) : "";

    if (expected && !expected.includes("itau: 0")) {
        const cash = source.indexOf("cash: 0", opening);
        if (cash >= 0 && cash < closing) {
            const indent = source.slice(source.lastIndexOf("\n", cash) + 1, cash);
            source = `${source.slice(0, cash)}itau: 0,\n${indent}${source.slice(cash)}`;
        }
    }

    write(file, source);
}

function patchRuntime() {
    let source = read(RUNTIME).replaceAll("03 CONTAS", "04 CONTAS");

    source = source.replace(
        /(^[ \t]*<option value="bank_transfer">Banco do Brasil<\/option>\r?\n)([ \t]*)(<option value="cash">Espécie<\/option>)/gm,
        (_match, bank, indent, cash) => `${bank}${indent}<option value="itau">Itaú</option>\n${indent}${cash}`
    );

    write(RUNTIME, source);
}

function patchTransferDomains() {
    const transferFile = "src/folego-transfer-v27.js";
    let transfer = read(transferFile);
    if (!transfer.includes('itau: "Itaú"')) {
        transfer = transfer.replace(
            `    bank_transfer: "Banco do Brasil",
    cash: "Espécie"`,
            `    bank_transfer: "Banco do Brasil",
    itau: "Itaú",
    cash: "Espécie"`
        );
    }
    write(transferFile, transfer);

    const legacyFile = "src/folego-v25-domain.js";
    let legacy = read(legacyFile);
    legacy = legacy.replace(
        `const labels = { pix: "Inter", bank_transfer: "Banco do Brasil", cash: "Espécie" };`,
        `const labels = { pix: "Inter", bank_transfer: "Banco do Brasil", itau: "Itaú", cash: "Espécie" };`
    );
    write(legacyFile, legacy);

    const mainDomainFile = "src/domain.js";
    let mainDomain = read(mainDomainFile);
    if (!mainDomain.includes('{ value: "itau", label: "Itaú" }')) {
        mainDomain = mainDomain.replace(
            '    { value: "bank_transfer", label: "Transferência bancária" },',
            '    { value: "bank_transfer", label: "Transferência bancária" },\n    { value: "itau", label: "Itaú" },'
        );
    }
    write(mainDomainFile, mainDomain);
}

function patchLayout() {
    const file = "src/folego-accounts-v28.css";
    let source = read(file);

    if (!source.includes('.account-card-v28[data-account-method="itau"]::before')) {
        source = source.replace(
            `.account-card-v28[data-account-method="cash"]::before {`,
            `.account-card-v28[data-account-method="itau"]::before {
    background: #082b5c;
}

.account-card-v28[data-account-method="cash"]::before {`
        );
    }

    source = source.replace(
        /\.report-accounts-v28 \{\s*grid-template-columns: repeat\(3,/,
        `.report-accounts-v28 {
    grid-template-columns: repeat(4,`
    );
    source = source.replace(
        /(@media \(min-width: 1040px\) \{\s*\.accounts-list-v28 \{\s*grid-template-columns:) repeat\(3,/,
        "$1 repeat(4,"
    );

    write(file, source);
}

function stampPackage() {
    const file = "package.json";
    const pkg = JSON.parse(read(file));
    pkg.version = VERSION;
    for (const script of ["predev", "prebuild"]) {
        if (!pkg.scripts?.[script]) throw new Error(`Script ${script} não encontrado.`);
        if (!pkg.scripts[script].includes(COMMAND)) pkg.scripts[script] += ` && ${COMMAND}`;
    }
    write(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

function stampInterface() {
    const indexFile = "index.html";
    let index = read(indexFile);
    index = index.replace(/FÔLEGO \/ V2\.\d+(?:\.\d+)?/g, `FÔLEGO / V${VERSION}`);
    index = index.replace(
        /<small class="account-version">[^<]+<\/small>/,
        `<small class="account-version">FÔLEGO / V${VERSION}</small>`
    );
    write(indexFile, index);

    const swFile = "public/sw.js";
    let sw = read(swFile);
    sw = sw.replace(/const CACHE_NAME = "[^"]+";/, `const CACHE_NAME = "folego-v${VERSION}";`);
    if (!sw.includes('"/banks/itau.svg"')) {
        sw = sw.replace(
            '"/assets/folego-mark.svg"]',
            '"/assets/folego-mark.svg", "/banks/itau.svg"]'
        );
    }
    write(swFile, sw);
}

function stampTests() {
    for (const name of fs.readdirSync("src")) {
        if (!name.endsWith(".test.js")) continue;
        const file = path.join("src", name);
        const source = read(file)
            .replace(/folego-v2\.\d+(?:\.\d+)?/g, `folego-v${VERSION}`)
            .replace(/FÔLEGO \/ V2\.\d+(?:\.\d+)?/g, `FÔLEGO / V${VERSION}`)
            .replace(/"version": "2\.\d+(?:\.\d+)?"/g, `"version": "${VERSION}"`)
            .replaceAll("V2.8.2", `V${VERSION}`);
        write(file, source);
    }
}

function validate() {
    const domain = read("src/folego-accounts-v28.js");
    const runtime = read(RUNTIME);
    const transfer = read("src/folego-transfer-v27.js");
    const mainDomain = read("src/domain.js");
    const migration = read("src/folego-accounts-migration-v28.js");
    const optionCount = runtime.match(/<option value="itau">Itaú<\/option>/g)?.length || 0;

    for (const marker of [
        'name: "Itaú"',
        'logo: "/banks/itau.svg"',
        "openingBalance: 0"
    ]) {
        if (!domain.includes(marker)) throw new Error(`Conta Itaú incompleta: ${marker}`);
    }
    if (!runtime.includes("04 CONTAS") || optionCount < 2) {
        throw new Error("O Itaú não entrou em todos os seletores de conta.");
    }
    if (!transfer.includes('itau: "Itaú"')) {
        throw new Error("O Itaú não entrou nas transferências internas.");
    }
    if (!mainDomain.includes('{ value: "itau", label: "Itaú" }')) {
        throw new Error("O normalizador principal não reconhece movimentações do Itaú.");
    }
    if (migration.includes('.from("transactions")') || migration.includes("payment_method:")) {
        throw new Error("A inclusão do Itaú não pode migrar dados do Supabase.");
    }
    if (!fs.existsSync("public/banks/itau.svg")) throw new Error("Logo do Itaú não encontrada.");
    if (!read("public/sw.js").includes(`folego-v${VERSION}`)) throw new Error("Cache da V2.8.3 não renovado.");
}

patchDomain();
patchSnapshotTest();
patchRuntime();
patchTransferDomains();
patchLayout();
stampPackage();
stampInterface();
stampTests();
validate();

console.log("Fôlego V2.8.3 aplicado: Itaú adicionado como quarta conta, com saldo inicial zerado.");
