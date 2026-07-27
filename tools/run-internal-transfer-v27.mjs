import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const sourcePath = "tools/apply-internal-transfer-v27.mjs";
let source = fs.readFileSync(sourcePath, "utf8");

const invalid = '`            transaction.type === "transfer" ? `${\'${POCKET_LABELS[transaction.transferFrom]} → ${POCKET_LABELS[transaction.transferTo]}\'}` : PAYMENT_METHOD_LABELS[transaction.paymentMethod] ?? PAYMENT_METHOD_LABELS.other,`';
const valid = '`            transaction.type === "transfer" ? POCKET_LABELS[transaction.transferFrom] + " → " + POCKET_LABELS[transaction.transferTo] : PAYMENT_METHOD_LABELS[transaction.paymentMethod] ?? PAYMENT_METHOD_LABELS.other,`';

if (!source.includes(invalid)) throw new Error("A fonte V2.7 não contém o trecho esperado para validação.");
source = source.replace(invalid, valid);

const totalsStart = '    source = replaceRequired(\n        source,\n        `function totalByType';
const totalsEnd = '        "totais neutros"\n    );';
const totalsStartIndex = source.indexOf(totalsStart);
const totalsEndIndex = totalsStartIndex >= 0 ? source.indexOf(totalsEnd, totalsStartIndex) : -1;
if (totalsStartIndex < 0 || totalsEndIndex < 0) throw new Error("Não foi possível preparar a compatibilidade dos totais V2.7.");

const totalsReplacement = [
    '    source = replaceRegexRequired(',
    '        source,',
    '        /function totalByType\\(transactions, type\\) \\{[\\s\\S]*?\\n\\}/,',
    '        `function totalByType(transactions, type) {\\n    return transactions\\n        .filter((transaction) => transaction.type === type && !isInternalTransfer(transaction))\\n        .reduce((total, transaction) => total + Number(transaction.amount), 0);\\n}`,',
    '        "totais neutros"',
    '    );'
].join("\n");
source = source.slice(0, totalsStartIndex) + totalsReplacement + source.slice(totalsEndIndex + totalsEnd.length);

const temporaryPath = path.join(os.tmpdir(), `folego-transfer-v27-${process.pid}-${Date.now()}.mjs`);
fs.writeFileSync(temporaryPath, source, "utf8");

try {
    await import(pathToFileURL(temporaryPath).href);
} finally {
    fs.rmSync(temporaryPath, { force: true });
}
