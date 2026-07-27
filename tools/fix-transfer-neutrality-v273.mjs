import fs from "node:fs";

const VERSION = "2.7.3";
const TRANSFER_HELPER = `const NEUTRAL_TRANSFER_CATEGORIES = new Set(["Transferência interna", "Transferência"]);

function isNeutralTransferTransaction(transaction) {
    return NEUTRAL_TRANSFER_CATEGORIES.has(String(transaction?.category || ""));
}`;

function read(path) {
    return fs.readFileSync(path, "utf8");
}

function write(path, content) {
    fs.writeFileSync(path, content, "utf8");
}

function replaceRegexRequired(source, pattern, replacement, label) {
    if (!pattern.test(source)) throw new Error(`Não foi possível aplicar V2.7.3: ${label}.`);
    pattern.lastIndex = 0;
    return source.replace(pattern, replacement);
}

function patchDomain() {
    const path = "src/domain.js";
    let source = read(path);
    source = source.replace("seriesId: seriesKind ? seriesId : null,", "seriesId,");

    if (!source.includes("const NEUTRAL_TRANSFER_CATEGORIES")) {
        source = source.replace(
            "const MAX_AMOUNT = 999999999999.99;",
            `const MAX_AMOUNT = 999999999999.99;\n${TRANSFER_HELPER}`
        );
    }

    source = replaceRegexRequired(
        source,
        /export function getBalanceAsOf\(transactions, isoDate = toISODate\(\)\) \{[\s\S]*?\n\}/,
        `export function getBalanceAsOf(transactions, isoDate = toISODate()) {
    return transactions
        .filter((transaction) => (
            transaction.status === "paid"
            && transaction.date <= isoDate
            && !isNeutralTransferTransaction(transaction)
        ))
        .reduce((total, transaction) => (
            total + (transaction.type === "income" ? Number(transaction.amount) : -Number(transaction.amount))
        ), 0);
}`,
        "saldo total neutro"
    );

    source = replaceRegexRequired(
        source,
        /const expenses = getPeriodTransactions\(transactions, range\)\n\s*\.filter\(\(transaction\) => transaction\.type === "expense"[^;]*\);/,
        `const expenses = getPeriodTransactions(transactions, range)
        .filter((transaction) => transaction.type === "expense" && !isNeutralTransferTransaction(transaction));`,
        "ranking sem transferências"
    );

    source = replaceRegexRequired(
        source,
        /export function getBalanceProjection\(transactions, horizonDays, isoDate = toISODate\(\)\) \{[\s\S]*?\n\}/,
        `export function getBalanceProjection(transactions, horizonDays, isoDate = toISODate()) {
    const endDate = addDaysToISO(isoDate, horizonDays);
    const balanceToday = getBalanceAsOf(transactions, isoDate);
    const scheduledChange = transactions
        .filter((transaction) => (
            !isNeutralTransferTransaction(transaction)
            && transaction.date <= endDate
            && (
                (transaction.status === "paid" && transaction.date > isoDate)
                || transaction.status === "pending"
            )
        ))
        .reduce((total, transaction) => (
            total + (transaction.type === "income" ? Number(transaction.amount) : -Number(transaction.amount))
        ), 0);

    return {
        days: horizonDays,
        endDate,
        balanceToday,
        scheduledChange,
        projectedBalance: balanceToday + scheduledChange
    };
}`,
        "projeção neutra"
    );

    source = replaceRegexRequired(
        source,
        /export function getBreathingDays\(transactions, isoDate = toISODate\(\), lookbackDays = 90\) \{[\s\S]*?\n\}/,
        `export function getBreathingDays(transactions, isoDate = toISODate(), lookbackDays = 90) {
    const safeLookback = Number.isInteger(lookbackDays) && lookbackDays > 0 ? lookbackDays : 90;
    const startDate = addDaysToISO(isoDate, -(safeLookback - 1));
    const expenses = transactions
        .filter((transaction) => (
            transaction.type === "expense"
            && !isNeutralTransferTransaction(transaction)
            && transaction.status === "paid"
            && transaction.date >= startDate
            && transaction.date <= isoDate
        ))
        .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

    if (expenses <= 0) return null;

    const balance = getBalanceAsOf(transactions, isoDate);
    const dailyAverage = expenses / safeLookback;
    return {
        days: Math.max(0, Math.floor(balance / dailyAverage)),
        dailyAverage,
        balance,
        lookbackDays: safeLookback
    };
}`,
        "autonomia neutra"
    );

    write(path, source);
}

function patchMainScript() {
    const path = "script.js";
    let source = read(path);
    source = replaceRegexRequired(
        source,
        /function totalByType\(transactions, type\) \{[\s\S]*?\n\}/,
        `function totalByType(transactions, type) {
    return transactions
        .filter((transaction) => transaction.type === type && !isInternalTransfer(transaction))
        .reduce((total, transaction) => total + Number(transaction.amount), 0);
}`,
        "totais Entrou e Saiu"
    );
    write(path, source);
}

function patchLegacyDomain() {
    const path = "src/folego-v25-domain.js";
    let source = read(path);
    source = replaceRegexRequired(
        source,
        /export function isTransfer\(row\) \{[\s\S]*?\n\}/,
        `export function isTransfer(row) {
    return ["Transferência", "Transferência interna"].includes(String(row?.category || ""));
}`,
        "compatibilidade com transferências antigas"
    );
    write(path, source);
}

function stampVersion() {
    const indexPath = "index.html";
    let index = read(indexPath);
    index = index.replace(/FÔLEGO \/ V2\.7(?:\.\d+)?/g, `FÔLEGO / V${VERSION}`);
    write(indexPath, index);

    const swPath = "public/sw.js";
    let sw = read(swPath);
    sw = sw.replace(/const CACHE_NAME = "[^"]+";/, `const CACHE_NAME = "folego-v${VERSION}";`);
    write(swPath, sw);
}

patchDomain();
patchMainScript();
patchLegacyDomain();
stampVersion();

const finalDomain = read("src/domain.js");
const finalTransfer = read("src/folego-transfer-v27.js");
const finalScript = read("script.js");
if (!finalDomain.includes("seriesId,")) throw new Error("O vínculo da transferência ainda pode ser descartado.");
if (!finalDomain.includes("isNeutralTransferTransaction")) throw new Error("Os cálculos financeiros ainda não reconhecem transferências neutras.");
if (!finalTransfer.includes("TRANSFER_CATEGORIES")) throw new Error("A identificação por categoria não foi aplicada.");
if (!finalScript.includes("transaction.type === type && !isInternalTransfer(transaction)")) throw new Error("Entrou e Saiu ainda podem somar transferências.");
if (!read("public/sw.js").includes(`folego-v${VERSION}`)) throw new Error("O cache da V2.7.3 não foi renovado.");

console.log("Fôlego V2.7.3 aplicado: transferências excluídas de Entrou, Saiu, rankings, projeções e autonomia.");
