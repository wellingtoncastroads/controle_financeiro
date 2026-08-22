import fs from "node:fs";

const VERSION = "2.8.9";
const CACHE_VERSION = `${VERSION}-account-sync`;
const COMMAND = "node tools/fix-account-sync-v289.mjs";
const NUBANK_COMMAND = "node tools/add-nubank-v288.mjs";
const DOMAIN = "src/folego-accounts-v28.js";
const RUNTIME = "src/folego-accounts-runtime-v28.js";

const read = (file) => fs.readFileSync(file, "utf8");
const write = (file, content) => fs.writeFileSync(file, content, "utf8");

function replaceRequired(source, search, replacement, label) {
    if (!source.includes(search)) throw new Error(`V2.8.9 não encontrou: ${label}.`);
    return source.replace(search, replacement);
}

function patchDomain() {
    let source = read(DOMAIN);
    const updated = `    const id = transaction?.id;
    const assignedMethod = id && assignments[id] ? assignments[id] : null;
    return normalizeAccountMethod(assignedMethod || transactionPaymentMethod(transaction));`;

    if (!source.includes(updated)) {
        source = replaceRequired(
            source,
            `    const id = transaction?.id;
    return normalizeAccountMethod(id && assignments[id] ? assignments[id] : "pix");`,
            updated,
            "fallback da conta da movimentação"
        );
    }
    write(DOMAIN, source);
}

function patchRuntime() {
    let source = read(RUNTIME);
    const helpers = `async function currentAuthUserV289(sessionUser = null) {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
        console.warn("Fôlego V2.8.9 não conseguiu atualizar os dados da sessão:", error);
        return sessionUser;
    }
    return data?.user || sessionUser;
}

async function refreshAccountStateV289() {
    if (!state.user) return;
    const currentUser = await currentAuthUserV289(state.user);
    if (currentUser) {
        state.user = currentUser;
        state.assignments = normalizeAccountAssignments(
            currentUser.user_metadata?.[ACCOUNT_ASSIGNMENTS_META_KEY]
        );
        state.snapshot = normalizeAccountSnapshot(
            currentUser.user_metadata?.[ACCOUNT_SNAPSHOT_META_KEY]
        ) || state.snapshot;
    }
    await loadTransactions();
}

`;

    if (!source.includes("async function currentAuthUserV289")) {
        source = replaceRequired(
            source,
            `$("#transactionForm")?.addEventListener("submit", capturePendingAssignment, true);`,
            `${helpers}$("#transactionForm")?.addEventListener("submit", capturePendingAssignment, true);`,
            "atualização do usuário autenticado"
        );
    }

    source = source.replace(
        'window.addEventListener("focus", loadTransactions);',
        'window.addEventListener("focus", refreshAccountStateV289);'
    );

    const oldBootstrap = `const { data } = await supabase?.auth.getSession() || { data: null };
if (data?.session?.user) await activate(data.session.user);`;
    const newBootstrap = `const { data } = await supabase?.auth.getSession() || { data: null };
if (data?.session?.user) {
    const currentUser = await currentAuthUserV289(data.session.user);
    if (currentUser) await activate(currentUser);
}`;
    if (!source.includes(newBootstrap)) {
        source = replaceRequired(source, oldBootstrap, newBootstrap, "abertura com usuário atualizado");
    }
    write(RUNTIME, source);
}

function stampPackage() {
    const file = "package.json";
    const pkg = JSON.parse(read(file));
    pkg.version = VERSION;
    pkg.scripts.predev = `${NUBANK_COMMAND} && ${COMMAND}`;
    pkg.scripts.prebuild = `${NUBANK_COMMAND} && ${COMMAND}`;
    write(file, `${JSON.stringify(pkg, null, 2)}\n`);

    const lockFile = "package-lock.json";
    const lock = JSON.parse(read(lockFile));
    lock.version = VERSION;
    if (lock.packages?.[""]) lock.packages[""].version = VERSION;
    write(lockFile, `${JSON.stringify(lock, null, 2)}\n`);
}

function stampTests() {
    for (const name of fs.readdirSync("src")) {
        if (!name.endsWith(".test.js")) continue;
        const file = `src/${name}`;
        const source = read(file)
            .replaceAll('"version": "2.8.8"', `"version": "${VERSION}"`)
            .replaceAll("FÔLEGO / V2.8.8", `FÔLEGO / V${VERSION}`)
            .replaceAll("folego-v2.8.8", `folego-v${VERSION}`);
        write(file, source);
    }
}

function stampInterface() {
    const indexFile = "index.html";
    let index = read(indexFile).replace(/FÔLEGO \/ V2\.8\.\d+/g, `FÔLEGO / V${VERSION}`);
    index = index.replace(
        /<small class="account-version">[^<]+<\/small>/,
        `<small class="account-version">FÔLEGO / V${VERSION}</small>`
    );
    write(indexFile, index);

    const swFile = "public/sw.js";
    const sw = read(swFile).replace(
        /const CACHE_NAME = "[^"]+";/,
        `const CACHE_NAME = "folego-v${CACHE_VERSION}";`
    );
    write(swFile, sw);
}

function validate() {
    const domain = read(DOMAIN);
    const runtime = read(RUNTIME);
    if (!domain.includes("assignedMethod || transactionPaymentMethod(transaction)")) {
        throw new Error("A conta da movimentação ainda pode cair no Inter por padrão.");
    }
    for (const marker of [
        "currentAuthUserV289",
        "supabase.auth.getUser()",
        'window.addEventListener("focus", refreshAccountStateV289)',
        "await currentAuthUserV289(data.session.user)"
    ]) {
        if (!runtime.includes(marker)) throw new Error(`Sincronização da sessão incompleta: ${marker}`);
    }
    if (!read("public/sw.js").includes(`folego-v${CACHE_VERSION}`)) {
        throw new Error("O cache da correção V2.8.9 não foi renovado.");
    }
}

patchDomain();
patchRuntime();
stampPackage();
stampInterface();
stampTests();
validate();

console.log("Fôlego V2.8.9 aplicado: contas e sessão sincronizadas com o Supabase.");
