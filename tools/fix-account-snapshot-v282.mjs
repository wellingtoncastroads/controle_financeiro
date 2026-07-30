import fs from "node:fs";
import path from "node:path";

const VERSION = "2.8.2";
const COMMAND = "node tools/fix-account-snapshot-v282.mjs";
const RUNTIME = "src/folego-accounts-runtime-v28.js";

const read = (file) => fs.readFileSync(file, "utf8");
const write = (file, content) => fs.writeFileSync(file, content, "utf8");

function required(source, search, replacement, label) {
    if (!source.includes(search)) throw new Error(`V2.8.2 não encontrou: ${label}.`);
    return source.replace(search, replacement);
}

function patchRuntime() {
    let source = read(RUNTIME);
    if (source.includes("async function ensureAccountSnapshotV282()")) return;

    source = required(
        source,
        `import {\n    ACCOUNT_ASSIGNMENTS_META_KEY,\n    ACCOUNT_METHODS,`,
        `import {\n    ACCOUNT_ASSIGNMENTS_META_KEY,\n    ACCOUNT_SNAPSHOT_META_KEY,\n    ACCOUNT_METHODS,\n    DEFAULT_ACCOUNT_SNAPSHOT_V282,`,
        "importação da fotografia inicial"
    );

    source = required(
        source,
        `    normalizeAccountAssignments,\n    transactionMatchesAccount`,
        `    normalizeAccountAssignments,\n    normalizeAccountSnapshot,\n    transactionMatchesAccount`,
        "normalização da fotografia"
    );

    source = required(
        source,
        `    assignments: {},\n    pendingAssignment: null,`,
        `    assignments: {},\n    snapshot: null,\n    pendingAssignment: null,`,
        "estado da fotografia"
    );

    source = source.replace(
        /calculateAccountBalances\(([\s\S]*?)state\.assignments\)/g,
        (match, inside) => match.includes("state.snapshot")
            ? match
            : `calculateAccountBalances(${inside}state.assignments, state.snapshot)`
    );

    const helper = `async function ensureAccountSnapshotV282() {\n    const existing = normalizeAccountSnapshot(\n        state.user?.user_metadata?.[ACCOUNT_SNAPSHOT_META_KEY]\n    );\n    if (existing) return existing;\n\n    const initial = normalizeAccountSnapshot(DEFAULT_ACCOUNT_SNAPSHOT_V282);\n    const { data, error } = await supabase.auth.updateUser({\n        data: { [ACCOUNT_SNAPSHOT_META_KEY]: initial }\n    });\n    if (error) throw error;\n    if (data.user) state.user = data.user;\n    return initial;\n}\n\n`;

    source = required(
        source,
        "async function saveAssignments(assignments) {",
        `${helper}async function saveAssignments(assignments) {`,
        "gravação da fotografia"
    );

    source = required(
        source,
        `    state.assignments = normalizeAccountAssignments(\n        state.user?.user_metadata?.[ACCOUNT_ASSIGNMENTS_META_KEY]\n    );\n    await loadTransactions();`,
        `    state.assignments = normalizeAccountAssignments(\n        state.user?.user_metadata?.[ACCOUNT_ASSIGNMENTS_META_KEY]\n    );\n    state.snapshot = await ensureAccountSnapshotV282();\n    await loadTransactions();`,
        "ativação da fotografia"
    );

    write(RUNTIME, source);
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
    index = index.replace(/FÔLEGO \/ V2\.8(?:\.\d+)?/g, `FÔLEGO / V${VERSION}`);
    index = index.replace(/<small class="account-version">[^<]+<\/small>/, `<small class="account-version">FÔLEGO / V${VERSION}</small>`);
    write(indexFile, index);

    const swFile = "public/sw.js";
    let sw = read(swFile);
    sw = sw.replace(/const CACHE_NAME = "[^"]+";/, `const CACHE_NAME = "folego-v${VERSION}";`);
    write(swFile, sw);
}

function stampTests() {
    for (const name of fs.readdirSync("src")) {
        if (!name.endsWith(".test.js")) continue;
        const file = path.join("src", name);
        const source = read(file).replaceAll("2.8.1", VERSION);
        write(file, source);
    }
}

function validate() {
    const runtime = read(RUNTIME);
    const domain = read("src/folego-accounts-v28.js");
    for (const marker of [
        "ensureAccountSnapshotV282",
        "ACCOUNT_SNAPSHOT_META_KEY",
        "DEFAULT_ACCOUNT_SNAPSHOT_V282",
        "state.assignments, state.snapshot"
    ]) {
        if (!runtime.includes(marker)) throw new Error(`Fotografia inicial incompleta: ${marker}`);
    }
    for (const marker of [
        "folego_account_snapshot_v282",
        "1552.57",
        "302.01",
        "transactionCreatedAt(transaction)"
    ]) {
        if (!domain.includes(marker)) throw new Error(`Regra de saldos incompleta: ${marker}`);
    }
}

patchRuntime();
stampPackage();
stampInterface();
stampTests();
validate();

console.log("Fôlego V2.8.2 aplicado: saldos atuais viraram fotografia inicial e apenas movimentos novos alteram as contas.");
