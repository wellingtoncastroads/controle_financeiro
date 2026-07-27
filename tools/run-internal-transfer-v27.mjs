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

const temporaryPath = path.join(os.tmpdir(), `folego-transfer-v27-${process.pid}-${Date.now()}.mjs`);
fs.writeFileSync(temporaryPath, source, "utf8");

try {
    await import(pathToFileURL(temporaryPath).href);
    fs.rmSync("public/v27-diagnostic.txt", { force: true });
} catch (error) {
    const diagnostic = String(error?.stack || error?.message || error);
    fs.writeFileSync("public/v27-diagnostic.txt", diagnostic, "utf8");
    console.error("Diagnóstico V2.7:", diagnostic);
} finally {
    fs.rmSync(temporaryPath, { force: true });
}
