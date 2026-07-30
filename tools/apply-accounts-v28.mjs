import fs from "node:fs";

const VERSION = "2.8.0";
const STYLE = '<link rel="stylesheet" href="/src/folego-accounts-v28.css">';
const SCRIPT = '<script type="module" src="/src/folego-accounts-runtime-v28.js"></script>';

const read = (path) => fs.readFileSync(path, "utf8");
const write = (path, content) => fs.writeFileSync(path, content, "utf8");

function required(source, search, replacement, label) {
    if (!source.includes(search)) throw new Error(`V2.8 não encontrou: ${label}.`);
    return source.replace(search, replacement);
}

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
    if (source.includes("function ensureTransactionAccountField()")) {
        if (!source.includes("observer.disconnect()")) {
            source = source.replace(
                `function render() {
    if (!state.user) return;`,
                `function render() {
    if (!state.user) return;
    observer.disconnect();
    try {`
            ).replace(
                `    renderForecastOpeningBalance();
}`,
                `    renderForecastOpeningBalance();
    } finally {
        observer.observe(document.documentElement, { childList: true, subtree: true, characterData: false });
    }
}`
            );
        }
        write(path, source);
        return;
    }

    source = required(
        source,
        `import {
    ACCOUNT_METHODS,`,
        `import {
    ACCOUNT_ASSIGNMENTS_META_KEY,
    ACCOUNT_METHODS,`,
        "importação da chave das contas"
    );
    source = required(
        source,
        `    isAccountTransfer,
    transactionMatchesAccount`,
        `    isAccountTransfer,
    normalizeAccountAssignments,
    transactionMatchesAccount`,
        "normalização das contas"
    );
    source = required(
        source,
        `    selectedAccount: "all",
    loading: false,`,
        `    selectedAccount: "all",
    assignments: {},
    pendingAssignment: null,
    loading: false,`,
        "estado das contas"
    );

    source = source
        .replaceAll("calculateAccountBalances(state.transactions, todayKey())", "calculateAccountBalances(state.transactions, todayKey(), state.assignments)")
        .replace(
            `calculateAccountBalances(
        state.transactions.filter((transaction) => transaction.status === "paid")
    )`,
            `calculateAccountBalances(
        state.transactions.filter((transaction) => transaction.status === "paid"),
        "9999-12-31",
        state.assignments
    )`
        )
        .replaceAll("accountContext(transaction)}", "accountContext(transaction, state.assignments)}")
        .replaceAll("accountContext(transaction);", "accountContext(transaction, state.assignments);")
        .replaceAll("accountContext(transaction))", "accountContext(transaction, state.assignments))")
        .replaceAll("accountMethodForTransaction(transaction);", "accountMethodForTransaction(transaction, state.assignments);")
        .replaceAll("transactionMatchesAccount(transaction, state.selectedAccount)", "transactionMatchesAccount(transaction, state.selectedAccount, state.assignments)")
        .replaceAll("calculateAccountBalances(state.transactions, end)", "calculateAccountBalances(state.transactions, end, state.assignments)")
        .replaceAll("accountExpenseRanking(state.transactions, reportRange())", "accountExpenseRanking(state.transactions, reportRange(), state.assignments)");

    const oldForm = `function updateTransactionForm() {
    const select = $("#transactionPaymentMethod");
    if (select && !select.dataset.accountsV28) {
        const current = select.value;
        replaceOptions(select, current);
        select.dataset.accountsV28 = "true";
    }
    const type = document.querySelector('#transactionForm input[name="transactionType"]:checked')?.value || "expense";
    const label = $("#transactionMethodLabel");
    if (label) label.textContent = type === "income" ? "ENTROU EM QUAL CONTA" : "SAIU DE QUAL CONTA";
}`;

    const newForm = `function ensureTransactionAccountField() {
    let field = $("#transactionAccountFieldV28");
    const paymentSelect = $("#transactionPaymentMethod");
    if (field || !paymentSelect) return field;

    field = document.createElement("label");
    field.className = "form-field account-form-field-v28";
    field.id = "transactionAccountFieldV28";
    field.innerHTML = \`
        <span id="transactionAccountLabelV28">SAIU DE QUAL CONTA</span>
        <select id="transactionAccountV28" required>
            <option value="pix">Inter</option>
            <option value="bank_transfer">Banco do Brasil</option>
            <option value="cash">Espécie</option>
        </select>
    \`;
    paymentSelect.closest(".form-field")?.insertAdjacentElement("afterend", field);
    return field;
}

function updateTransactionForm() {
    const field = ensureTransactionAccountField();
    const type = document.querySelector('#transactionForm input[name="transactionType"]:checked')?.value || "expense";
    const accountLabel = $("#transactionAccountLabelV28");
    if (accountLabel) accountLabel.textContent = type === "income" ? "ENTROU EM QUAL CONTA" : "SAIU DE QUAL CONTA";

    const methodLabel = $("#transactionMethodLabel");
    if (methodLabel) methodLabel.textContent = "FORMA DE MOVIMENTAÇÃO";

    const transactionId = $("#transactionId")?.value || "";
    const accountSelect = $("#transactionAccountV28");
    if (field && accountSelect && document.activeElement !== accountSelect) {
        accountSelect.value = transactionId && state.assignments[transactionId]
            ? state.assignments[transactionId]
            : "pix";
    }
}`;
    source = required(source, oldForm, newForm, "campo separado de conta");

    const assignmentHelpers = `async function saveAssignments(assignments) {
    const normalized = normalizeAccountAssignments(assignments);
    const { data, error } = await supabase.auth.updateUser({
        data: { [ACCOUNT_ASSIGNMENTS_META_KEY]: normalized }
    });
    if (error) throw error;
    state.assignments = normalized;
    if (data.user) state.user = data.user;
}

function capturePendingAssignment() {
    const account = $("#transactionAccountV28")?.value || "pix";
    const transactionId = $("#transactionId")?.value || "";
    const type = document.querySelector('#transactionForm input[name="transactionType"]:checked')?.value || "expense";
    state.pendingAssignment = {
        account,
        transactionId,
        type,
        description: $("#transactionDescription")?.value.trim() || "",
        beforeIds: new Set(state.transactions.map((transaction) => transaction.id)),
        attempts: 0
    };
    window.setTimeout(loadTransactions, 450);
}

async function resolvePendingAssignment() {
    const pending = state.pendingAssignment;
    if (!pending) return;

    const targets = pending.transactionId
        ? state.transactions.filter((transaction) => transaction.id === pending.transactionId)
        : state.transactions.filter((transaction) => (
            !pending.beforeIds.has(transaction.id)
            && transaction.type === pending.type
            && transaction.description === pending.description
            && !isAccountTransfer(transaction)
        ));

    if (!targets.length) {
        pending.attempts += 1;
        if (pending.attempts < 8) window.setTimeout(loadTransactions, 450);
        else state.pendingAssignment = null;
        return;
    }

    const next = { ...state.assignments };
    targets.forEach((transaction) => { next[transaction.id] = pending.account; });
    state.pendingAssignment = null;
    await saveAssignments(next);
}

`;
    source = required(source, "async function loadTransactions() {", `${assignmentHelpers}async function loadTransactions() {`, "gravação da conta");
    source = required(
        source,
        `        state.transactions = (data || []).map(toTransaction);
        render();`,
        `        state.transactions = (data || []).map(toTransaction);
        await resolvePendingAssignment();
        render();`,
        "sincronização da conta"
    );

    const oldActivate = `async function activate(user) {
    if (!user?.id) return;
    const needsMigration = !user.user_metadata?.[ACCOUNT_MIGRATION_META_KEY];
    state.user = user;
    try {
        const migratedUser = await migrateExistingTransactionsToInter(user);
        state.user = migratedUser || user;
        if (needsMigration) {
            window.location.reload();
            return;
        }
    } catch (error) {
        console.error("Fôlego V2.8 não conseguiu migrar as movimentações para o Inter:", error);
    }
    await loadTransactions();
}`;
    const newActivate = `async function activate(user) {
    if (!user?.id) return;
    state.user = user;
    try {
        const migratedUser = await migrateExistingTransactionsToInter(user);
        state.user = migratedUser || user;
    } catch (error) {
        console.error("Fôlego V2.8 não conseguiu preparar as contas:", error);
    }
    state.assignments = normalizeAccountAssignments(
        state.user?.user_metadata?.[ACCOUNT_ASSIGNMENTS_META_KEY]
    );
    await loadTransactions();
}`;
    source = required(source, oldActivate, newActivate, "ativação das contas");
    source = required(
        source,
        `document.addEventListener("change", (event) => {`,
        `$("#transactionForm")?.addEventListener("submit", capturePendingAssignment, true);

document.addEventListener("change", (event) => {`,
        "evento da conta"
    );

    source = required(
        source,
        `function render() {
    if (!state.user) return;
    renderOverview();`,
        `function render() {
    if (!state.user) return;
    observer.disconnect();
    try {
        renderOverview();`,
        "proteção da renderização"
    );
    source = required(
        source,
        `    renderForecastOpeningBalance();
}`,
        `    renderForecastOpeningBalance();
    } finally {
        observer.observe(document.documentElement, { childList: true, subtree: true, characterData: false });
    }
}`,
        "retomada do observador"
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
        if (path.endsWith("folego-pluggy-loader.test.js")) {
            test = test.replace(`/pluggy-connect/v${VERSION}/pluggy-connect.js`, "/pluggy-connect/v2.7.0/pluggy-connect.js");
        }
        write(path, test);
    }
}

patchIndex();
patchTransferDomain();
patchRuntime();
stamp();

if (!read("index.html").includes(SCRIPT)) throw new Error("O módulo de contas não foi carregado.");
if (!read("src/folego-transfer-v27.js").includes("bank_transfer")) throw new Error("Banco do Brasil não entrou nas transferências.");
if (!read("src/folego-accounts-runtime-v28.js").includes("transactionAccountV28")) throw new Error("O campo de conta não foi aplicado.");
if (!read("src/folego-accounts-runtime-v28.js").includes("observer.disconnect()")) throw new Error("A renderização das contas pode entrar em repetição.");
if (!read("public/sw.js").includes(`folego-v${VERSION}`)) throw new Error("O cache da V2.8 não foi renovado.");

console.log("Fôlego V2.8.0 aplicado: contas separadas da forma de movimentação.");
