import fs from "node:fs";

const VERSION = "2.8.7";
const COMMAND = "node tools/apply-reserve-v287.mjs";
const STYLE = '<link rel="stylesheet" href="/src/folego-reserve-v287.css">';
const RUNTIME = '<script type="module" src="/src/folego-reserve-runtime-v287.js"></script>';

const read = (file) => fs.readFileSync(file, "utf8");
const write = (file, content) => fs.writeFileSync(file, content);

function replaceRequired(source, search, replacement, label) {
    if (source.includes(replacement)) return source;
    if (!source.includes(search)) throw new Error(`Não foi possível aplicar a Reserva V2.8.7: ${label}.`);
    return source.replace(search, replacement);
}

function patchPackage() {
    const file = "package.json";
    const pkg = JSON.parse(read(file));
    pkg.version = VERSION;
    pkg.engines = { ...(pkg.engines || {}), node: "24.x" };
    for (const script of ["predev", "prebuild"]) {
        if (!pkg.scripts?.[script]) continue;
        const commands = pkg.scripts[script].split(" && ").filter((item) => item !== COMMAND);
        commands.push(COMMAND);
        pkg.scripts[script] = commands.join(" && ");
    }
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

function patchIndex() {
    const file = "index.html";
    let html = read(file);
    html = html.replace(/FÔLEGO \/ V2\.8\.\d+/g, `FÔLEGO / V${VERSION}`);
    if (!html.includes(STYLE)) {
        html = replaceRequired(
            html,
            '<link rel="stylesheet" href="/src/folego-v284.css">',
            `<link rel="stylesheet" href="/src/folego-v284.css">\n    ${STYLE}`,
            "folha de estilo"
        );
    }
    if (!html.includes(RUNTIME)) {
        html = replaceRequired(
            html,
            '<script type="module" src="/src/folego-accounts-runtime-v28.js"></script>',
            `<script type="module" src="/src/folego-accounts-runtime-v28.js"></script>\n    ${RUNTIME}`,
            "runtime"
        );
    }
    write(file, html);
}

function patchVersionAssertions() {
    const files = [
        "src/folego-account-snapshot-v282-integration.test.js",
        "src/folego-accounts-v28-integration.test.js",
        "src/folego-accounts-visual-v281.test.js",
        "src/folego-new-record-mobile-v272.test.js",
        "src/folego-pluggy-loader.test.js",
        "src/folego-transfer-mobile-v271.test.js",
        "src/folego-v284.test.js"
    ];
    for (const file of files) {
        const source = read(file)
            .replace(/"version": "2\.8\.\d+"/g, `"version": "${VERSION}"`)
            .replace(/folego-v2\.8\.\d+/g, `folego-v${VERSION}`)
            .replace(/FÔLEGO \/ V2\.8\.\d+/g, `FÔLEGO / V${VERSION}`);
        write(file, source);
    }
}

function patchAccountsDomain() {
    const file = "src/folego-accounts-v28.js";
    let source = read(file);
    // Normaliza a cor antiga antes da checagem idempotente; a paleta final é aplicada logo abaixo.
    source = source.replace('accent: "#ff4e1a"', 'accent: "#2456d8"');
    source = replaceRequired(
        source,
        'export const ACCOUNT_SNAPSHOT_META_KEY = "folego_account_snapshot_v282";',
        `export const ACCOUNT_SNAPSHOT_META_KEY = "folego_account_snapshot_v282";\nexport const RESERVE_STORAGE_METHOD = "other";\n\nexport const RESERVE_ACCOUNT = Object.freeze({\n    id: "reserve",\n    name: "Reserva",\n    subtitle: "Dinheiro guardado",\n    logo: "",\n    accent: "#2456d8",\n    openingBalance: 0\n});`,
        "identidade da Reserva"
    );
    source = source.replace('accent: "#2456d8"', 'accent: "#ff4e1a"');
    source = replaceRequired(
        source,
        `export function isAccountTransfer(transaction) {\n    return TRANSFER_CATEGORIES.has(String(transaction?.category || ""));\n}`,
        `export function isAccountTransfer(transaction) {\n    return TRANSFER_CATEGORIES.has(String(transaction?.category || ""));\n}\n\nexport function isReserveTransfer(transaction) {\n    if (!isAccountTransfer(transaction)) return false;\n    if (transaction?.type === "transfer") {\n        return transaction.transferFrom === RESERVE_STORAGE_METHOD\n            || transaction.transferTo === RESERVE_STORAGE_METHOD;\n    }\n    return transactionPaymentMethod(transaction) === RESERVE_STORAGE_METHOD;\n}`,
        "identificação dos movimentos guardados"
    );
    source = replaceRequired(
        source,
        `export function accountForMethod(value) {\n    return ACCOUNT_METHODS[normalizeAccountMethod(value)];\n}`,
        `export function accountForMethod(value) {\n    if (value === RESERVE_STORAGE_METHOD) return RESERVE_ACCOUNT;\n    return ACCOUNT_METHODS[normalizeAccountMethod(value)];\n}`,
        "nome da Reserva"
    );
    source = replaceRequired(
        source,
        `.filter((transaction) => transaction?.status === "paid" && transactionDate(transaction) <= throughDate)\n        .filter((transaction) => {`,
        `.filter((transaction) => transaction?.status === "paid" && transactionDate(transaction) <= throughDate)\n        .filter((transaction) => !isReserveTransfer(transaction))\n        .filter((transaction) => {`,
        "separação do saldo disponível"
    );
    source = replaceRequired(
        source,
        `export function accountContext(transaction, assignments = {}) {`,
        `export function calculateReserveBalance(transactions, throughDate = "9999-12-31") {\n    return roundMoney((Array.isArray(transactions) ? transactions : [])\n        .filter((transaction) => (\n            transaction?.status === "paid"\n            && transactionDate(transaction) <= throughDate\n            && isReserveTransfer(transaction)\n            && transaction?.type !== "transfer"\n        ))\n        .reduce((total, transaction) => (\n            total + (transaction.type === "income" ? Number(transaction.amount || 0) : -Number(transaction.amount || 0))\n        ), 0));\n}\n\nexport function calculatePatrimony(transactions, throughDate = "9999-12-31", assignments = {}, snapshotValue = null) {\n    const available = calculateAccountBalances(transactions, throughDate, assignments, snapshotValue);\n    const reserve = calculateReserveBalance(transactions, throughDate);\n    return {\n        balances: available.balances,\n        available: available.total,\n        reserve,\n        total: roundMoney(available.total + reserve)\n    };\n}\n\nexport function accountContext(transaction, assignments = {}) {`,
        "cálculo do patrimônio"
    );
    write(file, source);
}

function patchTransferDomain() {
    const file = "src/folego-transfer-v27.js";
    let source = read(file);
    source = replaceRequired(
        source,
        `    itau: "Itaú",\n    cash: "Espécie"`,
        `    itau: "Itaú",\n    cash: "Espécie",\n    other: "Reserva"`,
        "rótulo da Reserva nas transferências"
    );
    write(file, source);
}

function patchDailyReport() {
    const file = "src/daily-report-movements.js";
    let source = read(file);
    source = replaceRequired(
        source,
        `        const from = methodLabels[row.transferFrom] || methodLabels[paymentMethodOf(row)] || methodLabels.other;\n        const to = methodLabels[row.transferTo];`,
        `        const transferLabel = (method) => method === "other" ? "Reserva" : methodLabels[method];\n        const from = transferLabel(row.transferFrom) || transferLabel(paymentMethodOf(row)) || methodLabels.other;\n        const to = transferLabel(row.transferTo);`,
        "rótulo da Reserva no relatório diário"
    );
    write(file, source);
}

function patchAccountsRuntime() {
    const file = "src/folego-accounts-runtime-v28.js";
    let source = read(file);
    source = replaceRequired(
        source,
        `    ACCOUNT_METHOD_VALUES,\n    accountContext,`,
        `    ACCOUNT_METHOD_VALUES,\n    RESERVE_STORAGE_METHOD,\n    accountContext,`,
        "importação da Reserva"
    );
    source = replaceRequired(
        source,
        `function accountLogo(method, className = "account-logo-v28") {\n    const account = accountForMethod(method);`,
        `function accountLogo(method, className = "account-logo-v28") {\n    if (method === RESERVE_STORAGE_METHOD) {\n        return \`<span class="\${className} reserve" aria-label="Reserva">◆</span>\`;\n    }\n    const account = accountForMethod(method);`,
        "símbolo da Reserva"
    );
    write(file, source);
}

function patchMainRuntime() {
    const file = "script.js";
    let source = read(file);
    source = replaceRequired(
        source,
        `        renderAll();\n        elements.transactionDialog.close();`,
        `        renderAll();\n        window.dispatchEvent(new CustomEvent("folego:transactions-updated", { detail: { source: "transaction" } }));\n        elements.transactionDialog.close();`,
        "atualização das contas após movimento"
    );
    source = replaceRequired(
        source,
        `function openTransferDialog(seriesId = null) {\n    const pair = seriesId ? getTransferPair(state.transactions, seriesId) : null;\n    elements.transferForm.reset();`,
        `function openTransferDialog(seriesId = null) {\n    const pair = seriesId ? getTransferPair(state.transactions, seriesId) : null;\n    if (pair?.complete && [pair.outgoing.paymentMethod, pair.incoming.paymentMethod].includes("other")) {\n        window.dispatchEvent(new CustomEvent("folego:open-reserve-dialog", { detail: { seriesId: pair.seriesId, pair } }));\n        return;\n    }\n    elements.transferForm.reset();`,
        "edição de valores guardados"
    );
    source = replaceRequired(
        source,
        `        renderAll();\n        elements.transferDialog.close();`,
        `        renderAll();\n        window.dispatchEvent(new CustomEvent("folego:transactions-updated", { detail: { source: "transfer" } }));\n        elements.transferDialog.close();`,
        "atualização das contas após transferência"
    );
    source = replaceRequired(
        source,
        '`“${itemName}” será removida dos saldos Pix e espécie, sem alterar receitas ou despesas.`',
        '`“${itemName}” será removida de ${POCKET_LABELS[transferPair?.outgoing?.paymentMethod] || "uma conta"} e ${POCKET_LABELS[transferPair?.incoming?.paymentMethod] || "outra conta"}, sem alterar receitas ou despesas.`',
        "texto de exclusão"
    );
    source = replaceRequired(
        source,
        `        elements.confirmDialog.close();\n        renderAll();\n        setSyncState("ok");`,
        `        elements.confirmDialog.close();\n        renderAll();\n        if (["transaction", "transfer"].includes(deletion.kind)) {\n            window.dispatchEvent(new CustomEvent("folego:transactions-updated", { detail: { source: "delete" } }));\n        }\n        setSyncState("ok");`,
        "atualização após exclusão"
    );
    source = replaceRequired(
        source,
        `async function refreshFromCloud() {\n    if (!session?.user || document.hidden || Date.now() - lastCloudLoad < 30000) return;`,
        `async function refreshFromCloud(force = false) {\n    if (!session?.user || document.hidden || (!force && Date.now() - lastCloudLoad < 30000)) return;`,
        "atualização imediata da nuvem"
    );
    source = replaceRequired(
        source,
        `window.addEventListener("focus", refreshFromCloud);`,
        `window.addEventListener("focus", refreshFromCloud);\nwindow.addEventListener("folego:transactions-updated", (event) => {\n    if (event.detail?.source === "reserve") refreshFromCloud(true);\n});`,
        "sincronização da Reserva"
    );
    write(file, source);
}

function stampCache() {
    const file = "public/sw.js";
    const source = read(file).replace(/const CACHE_NAME = "folego-v[^"]+";/, `const CACHE_NAME = "folego-v${VERSION}";`);
    write(file, source);
}

function validate() {
    const index = read("index.html");
    const accounts = read("src/folego-accounts-v28.js");
    const transfer = read("src/folego-transfer-v27.js");
    const runtime = read("src/folego-reserve-runtime-v287.js");
    const main = read("script.js");
    if (!index.includes(STYLE) || !index.includes(RUNTIME)) throw new Error("A Reserva não foi ligada à interface.");
    if (!accounts.includes("calculatePatrimony") || !accounts.includes("!isReserveTransfer(transaction)")) throw new Error("O saldo disponível ainda pode incluir a Reserva.");
    if (!transfer.includes('other: "Reserva"')) throw new Error("A Reserva ainda não aparece no histórico.");
    if (!runtime.includes("validateReserveOperation") || !runtime.includes("saveInternalTransferPair")) throw new Error("O fluxo Guardar/Resgatar está incompleto.");
    if (!main.includes("folego:open-reserve-dialog") || !main.includes("refreshFromCloud(true)")) throw new Error("A atualização da Reserva não está sincronizada.");
    if (!read("public/sw.js").includes(`folego-v${VERSION}`)) throw new Error("O cache da versão não foi renovado.");
}

patchPackage();
patchIndex();
patchVersionAssertions();
patchAccountsDomain();
patchTransferDomain();
patchDailyReport();
patchAccountsRuntime();
patchMainRuntime();
stampCache();
validate();

console.log("Fôlego V2.8.7 aplicado: Guardar e Resgatar preservam patrimônio e resultado do mês.");
