import fs from "node:fs";

const HTML_MARKER = "<!-- FÔLEGO V2.7 / TRANSFERÊNCIA INTERNA -->";
const SCRIPT_MARKER = "/* FÔLEGO V2.7 / TRANSFERÊNCIA INTERNA */";
const STYLE_MARKER = '<link rel="stylesheet" href="/src/folego-transfer-v27.css">';

function read(path) {
    return fs.readFileSync(path, "utf8");
}

function write(path, content) {
    fs.writeFileSync(path, content, "utf8");
}

function replaceRequired(source, search, replacement, label) {
    if (!source.includes(search)) throw new Error(`Não foi possível aplicar V2.7: ${label}.`);
    return source.replace(search, replacement);
}

function replaceRegexRequired(source, pattern, replacement, label) {
    if (!pattern.test(source)) throw new Error(`Não foi possível aplicar V2.7: ${label}.`);
    pattern.lastIndex = 0;
    return source.replace(pattern, replacement);
}

function patchIndex() {
    const path = "index.html";
    let source = read(path);
    if (!source.includes(STYLE_MARKER)) {
        source = replaceRequired(source, "</head>", `    ${STYLE_MARKER}\n</head>`, "estilos da transferência");
    }

    if (!source.includes(HTML_MARKER)) {
        source = replaceRequired(
            source,
            `                            <button class="ink-button" id="bannerNewTransaction" type="button">\n                                <span>+</span> Anotar movimento\n                            </button>`,
            `                            <div class="transfer-actions">\n                                <button class="transfer-button" id="bannerNewTransfer" type="button">↔ Transferir</button>\n                                <button class="ink-button" id="bannerNewTransaction" type="button">\n                                    <span>+</span> Anotar movimento\n                                </button>\n                            </div>`,
            "atalho do painel"
        );

        source = replaceRequired(
            source,
            `                    <button class="ink-button" id="pageNewTransaction" type="button"><span>+</span> Novo registro</button>`,
            `                    <div class="transfer-actions">\n                        <button class="transfer-button" id="pageNewTransfer" type="button">↔ Transferir</button>\n                        <button class="ink-button" id="pageNewTransaction" type="button"><span>+</span> Novo registro</button>\n                    </div>`,
            "atalho do extrato"
        );

        const dialog = `    ${HTML_MARKER}
    <dialog class="modal" id="transferDialog">
        <form class="modal-sheet compact-sheet" id="transferForm">
            <div class="modal-header">
                <div>
                    <span>CAIXA / MOVIMENTO NEUTRO</span>
                    <h2 id="transferModalTitle">Transferir dinheiro</h2>
                </div>
                <button class="modal-close" type="button" data-close-dialog="transferDialog" aria-label="Fechar">×</button>
            </div>

            <input type="hidden" id="transferSeriesId">

            <div class="form-grid">
                <div class="transfer-flow">
                    <label class="form-field">
                        <span>ORIGEM</span>
                        <select id="transferFrom" required>
                            <option value="pix">Pix</option>
                            <option value="cash">Espécie</option>
                        </select>
                    </label>
                    <span class="transfer-arrow" aria-hidden="true">→</span>
                    <label class="form-field">
                        <span>DESTINO</span>
                        <select id="transferTo" required>
                            <option value="cash">Espécie</option>
                            <option value="pix">Pix</option>
                        </select>
                    </label>
                </div>

                <label class="form-field">
                    <span>VALOR</span>
                    <span class="money-field"><b>R$</b><input type="number" id="transferAmount" min="0.01" step="0.01" placeholder="0,00" required></span>
                </label>

                <label class="form-field">
                    <span>DATA</span>
                    <input type="date" id="transferDate" required>
                </label>

                <label class="form-field form-field-wide">
                    <span>DESCRIÇÃO / OPCIONAL</span>
                    <input type="text" id="transferDescription" maxlength="80" placeholder="Ex.: saque para a carteira">
                </label>

                <p class="transfer-notice"><strong>Não é receita nem despesa.</strong> O valor apenas muda de lugar entre Pix e espécie e não altera o resultado do mês.</p>
            </div>

            <div class="modal-actions">
                <button class="paper-button" type="button" data-close-dialog="transferDialog">Cancelar</button>
                <button class="ink-button" type="submit">Confirmar transferência →</button>
            </div>
        </form>
    </dialog>

`;
        source = replaceRequired(
            source,
            `    <!-- =============================================================\n         FORMULÁRIO DE MOVIMENTAÇÃO`,
            `${dialog}    <!-- =============================================================\n         FORMULÁRIO DE MOVIMENTAÇÃO`,
            "formulário de transferência"
        );
    }

    source = source.replace(/FÔLEGO \/ V2\.6(?:\.\d+)?/g, "FÔLEGO / V2.7.0");
    source = source.replace(/FÔLEGO \/ V2\.5(?:\.\d+)?/g, "FÔLEGO / V2.7.0");
    write(path, source);
}

function patchDomain() {
    const path = "src/domain.js";
    let source = read(path);
    source = source.replace("seriesId: seriesKind ? seriesId : null,", "seriesId,");
    source = source.replace(
        `.filter((transaction) => transaction.type === "expense");`,
        `.filter((transaction) => transaction.type === "expense" && transaction.category !== "Transferência interna");`
    );
    source = source.replace(
        `            transaction.type === "expense"\n            && transaction.status === "paid"`,
        `            transaction.type === "expense"\n            && transaction.category !== "Transferência interna"\n            && transaction.status === "paid"`
    );
    write(path, source);
}

function patchScript() {
    const path = "script.js";
    let source = read(path);
    if (source.includes(SCRIPT_MARKER)) return;

    source = replaceRequired(
        source,
        `import { generateFinancialReportPdf } from "./src/report-pdf.js";`,
        `import { generateFinancialReportPdf } from "./src/report-pdf.js";\nimport { removeInternalTransferPair, saveInternalTransferPair } from "./src/folego-transfer-data-v27.js";\nimport {\n    buildInternalTransfer,\n    collapseInternalTransfers,\n    excludeInternalTransfers,\n    getTransferPair,\n    isInternalTransfer,\n    POCKET_LABELS,\n    TRANSFER_CATEGORY\n} from "./src/folego-transfer-v27.js";\n\n${SCRIPT_MARKER}`,
        "imports"
    );

    source = replaceRequired(
        source,
        `    transactionDialog: $("#transactionDialog"),\n    transactionForm: $("#transactionForm"),`,
        `    transferDialog: $("#transferDialog"),\n    transferForm: $("#transferForm"),\n    transferModalTitle: $("#transferModalTitle"),\n    transferSeriesId: $("#transferSeriesId"),\n    transferFrom: $("#transferFrom"),\n    transferTo: $("#transferTo"),\n    transferAmount: $("#transferAmount"),\n    transferDate: $("#transferDate"),\n    transferDescription: $("#transferDescription"),\n\n    transactionDialog: $("#transactionDialog"),\n    transactionForm: $("#transactionForm"),`,
        "elementos"
    );

    source = replaceRequired(
        source,
        `    "Outras despesas": { icon: "box", color: "#747168" }`,
        `    "Outras despesas": { icon: "box", color: "#747168" },\n    [TRANSFER_CATEGORY]: { icon: "repeat", color: "#2456d8" }`,
        "categoria visual"
    );

    source = replaceRequired(
        source,
        `function totalByType(transactions, type) {\n    return transactions\n        .filter((transaction) => transaction.type === type)\n        .reduce((total, transaction) => total + Number(transaction.amount), 0);\n}`,
        `function totalByType(transactions, type) {\n    return transactions\n        .filter((transaction) => transaction.type === type && !isInternalTransfer(transaction))\n        .reduce((total, transaction) => total + Number(transaction.amount), 0);\n}`,
        "totais neutros"
    );

    source = replaceRequired(
        source,
        `function signedCurrency(transaction) {\n    const signal = transaction.type === "income" ? "+" : "−";\n    return \`${'${signal} ${formatCurrency(transaction.amount)}'}\`;\n}`,
        `function signedCurrency(transaction) {\n    if (transaction.type === "transfer") return \`↔ ${'${formatCurrency(transaction.amount)}'}\`;\n    const signal = transaction.type === "income" ? "+" : "−";\n    return \`${'${signal} ${formatCurrency(transaction.amount)}'}\`;\n}`,
        "valor da transferência"
    );

    source = replaceRegexRequired(
        source,
        /function transactionContext\(transaction\) \{[\s\S]*?\n\}/,
        `function transactionContext(transaction) {\n    if (transaction.type === "transfer") {\n        return \`${'${POCKET_LABELS[transaction.transferFrom]} → ${POCKET_LABELS[transaction.transferTo]} • transferência interna'}\`;\n    }\n    const parts = [transaction.type === "income" ? "Receita" : "Despesa"];\n    parts.push(PAYMENT_METHOD_LABELS[transaction.paymentMethod] ?? PAYMENT_METHOD_LABELS.other);\n    if (transaction.seriesKind === "installment" && transaction.installmentNumber && transaction.installmentTotal) {\n        parts.push(\`parcela ${'${transaction.installmentNumber}/${transaction.installmentTotal}'}\`);\n    } else if (transaction.seriesKind === "recurring") {\n        parts.push("recorrente");\n    }\n    return parts.join(" • ");\n}`,
        "contexto"
    );

    source = source.replaceAll(
        `.filter((transaction) => transaction.type === "expense");`,
        `.filter((transaction) => transaction.type === "expense" && !isInternalTransfer(transaction));`
    );

    source = replaceRegexRequired(
        source,
        /function renderRecentTransactions\(\) \{[\s\S]*?\n\}\n\nfunction renderHealth/,
        `function renderRecentTransactions() {\n    const recent = collapseInternalTransfers([...state.transactions])\n        .sort((a, b) => String(b.createdAt || \`${'${b.date}T00:00:00'}\`).localeCompare(String(a.createdAt || \`${'${a.date}T00:00:00'}\`)))\n        .slice(0, 5);\n\n    if (!recent.length) {\n        elements.recentTransactions.innerHTML = \`\n            <div class="empty-state"><span class="empty-icon">${'${renderIcon("receipt")}'}</span><strong>Seu caixa começa vazio</strong><p>Registre sua primeira receita, despesa ou transferência. Nenhum exemplo foi misturado aos seus dados.</p></div>\n        \`;\n        return;\n    }\n\n    elements.recentTransactions.innerHTML = recent.map((transaction) => {\n        const transfer = transaction.type === "transfer";\n        const details = categoryDetails(transaction.category);\n        const valueClass = transfer ? "transfer-value" : transaction.type === "income" ? "income-value" : "expense-value";\n        const pendingText = transaction.status === "pending" ? " • pendente" : "";\n        const context = transfer\n            ? \`${'${POCKET_LABELS[transaction.transferFrom]} → ${POCKET_LABELS[transaction.transferTo]}'}\`\n            : \`${'${transaction.category} • ${PAYMENT_METHOD_LABELS[transaction.paymentMethod] ?? PAYMENT_METHOD_LABELS.other}${pendingText}'}\`;\n        return \`\n            <div class="recent-item ${'${transfer ? "transfer-item" : ""}'}">\n                <span class="transaction-icon">${'${renderIcon(details.icon)}'}</span>\n                <div class="transaction-main"><strong>${'${escapeHTML(transaction.description)}'}</strong><span>${'${escapeHTML(context)}'}</span></div>\n                <span class="recent-date">${'${escapeHTML(formatDate(transaction.date, { day: "2-digit", month: "short" }))}'}</span>\n                <strong class="recent-value ${'${valueClass}'}">${'${escapeHTML(signedCurrency(transaction))}'}</strong>\n            </div>\n        \`;\n    }).join("");\n}\n\nfunction renderHealth`,
        "registros recentes"
    );

    source = replaceRegexRequired(
        source,
        /function getFilteredTransactions\(\) \{[\s\S]*?\n\}/,
        `function getFilteredTransactions() {\n    const search = filters.search.trim().toLocaleLowerCase("pt-BR");\n    return collapseInternalTransfers(state.transactions)\n        .filter((transaction) => transaction.date.slice(0, 7) === state.settings.selectedMonth)\n        .filter((transaction) => filters.type === "all" || transaction.type === filters.type)\n        .filter((transaction) => filters.category === "all" || transaction.category === filters.category)\n        .filter((transaction) => !search || \`${'${transaction.description} ${transaction.category}'}\`.toLocaleLowerCase("pt-BR").includes(search))\n        .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));\n}`,
        "filtro do extrato"
    );

    source = replaceRegexRequired(
        source,
        /function renderTransactionTable\(\) \{[\s\S]*?\n\}\n\nfunction renderGoals/,
        `function renderTransactionTable() {\n    const transactions = getFilteredTransactions();\n    if (!transactions.length) {\n        elements.transactionRows.innerHTML = \`\n            <tr class="empty-table-row"><td colspan="6"><div class="empty-state"><span class="empty-icon">${'${renderIcon("search")}'}</span><strong>Nada encontrado</strong><p>Altere os filtros ou registre um movimento em ${'${escapeHTML(formatMonthLabel(state.settings.selectedMonth))}'}.</p></div></td></tr>\n        \`;\n    } else {\n        elements.transactionRows.innerHTML = transactions.map((transaction) => {\n            const details = categoryDetails(transaction.category);\n            const transfer = transaction.type === "transfer";\n            const isIncome = transaction.type === "income";\n            const statusText = transaction.status === "paid" ? "Confirmado" : "Pendente";\n            const editAction = transfer ? "edit-transfer" : "edit-transaction";\n            const deleteAction = transfer ? "delete-transfer" : "delete-transaction";\n            const actionId = transfer ? transaction.seriesId : transaction.id;\n            return \`\n                <tr class="transaction-row ${'${transfer ? "transfer-row" : ""}'}">\n                    <td class="movement-cell">\n                        <div class="transaction-cell-main">\n                            <span class="transaction-icon">${'${renderIcon(details.icon)}'}</span>\n                            <div class="transaction-description">\n                                <strong>${'${escapeHTML(transaction.description)}'}</strong>\n                                <small>${'${escapeHTML(transactionContext(transaction))}'}</small>\n                                <span class="mobile-transaction-meta">\n                                    <i>${'${escapeHTML(transaction.category)}'}</i><i>${'${escapeHTML(formatDate(transaction.date, { day: "2-digit", month: "short" }))}'}</i><i class="${'${transaction.status === "pending" ? "pending" : ""}'}">${'${statusText}'}</i>\n                                </span>\n                            </div>\n                        </div>\n                    </td>\n                    <td class="category-cell">${'${transfer ? "Transferência interna" : escapeHTML(transaction.category)}'}</td>\n                    <td class="date-cell">${'${escapeHTML(formatDate(transaction.date, { day: "2-digit", month: "short" }))}'}</td>\n                    <td class="status-cell"><i class="status-pill ${'${transaction.status === "pending" ? "pending" : ""}'}">${'${statusText}'}</i></td>\n                    <td class="value-cell ${'${transfer ? "transfer-value" : isIncome ? "income-value" : "expense-value"}'}"><strong>${'${escapeHTML(signedCurrency(transaction))}'}</strong></td>\n                    <td class="actions-cell">\n                        <div class="row-actions">\n                            <button class="row-action" type="button" data-action="${'${editAction}'}" data-id="${'${escapeHTML(actionId)}'}" aria-label="Editar ${'${escapeHTML(transaction.description)}'}" title="Editar">\n                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>\n                            </button>\n                            <button class="row-action delete" type="button" data-action="${'${deleteAction}'}" data-id="${'${escapeHTML(actionId)}'}" aria-label="Excluir ${'${escapeHTML(transaction.description)}'}" title="Excluir">\n                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5"/></svg>\n                            </button>\n                        </div>\n                    </td>\n                </tr>\n            \`;\n        }).join("");\n    }\n\n    const confirmedFiltered = transactions.filter((transaction) => transaction.status === "paid");\n    const result = totalByType(confirmedFiltered, "income") - totalByType(confirmedFiltered, "expense");\n    elements.transactionCount.textContent = \`${'${transactions.length} ${transactions.length === 1 ? "movimento" : "movimentos"}'}\`;\n    elements.filteredTotal.textContent = \`Confirmado: ${'${formatCurrency(result)}'}\`;\n    elements.filteredTotal.style.color = result < 0 ? "var(--orange)" : "";\n}\n\nfunction renderGoals`,
        "tabela do extrato"
    );

    source = replaceRegexRequired(
        source,
        /function getCurrentReport\(\) \{[\s\S]*?\n\}\n\nfunction renderRanking/,
        `function getCurrentReport() {\n    const range = getPeriodRange(reportState.mode, reportState.referenceDate);\n    const allTransactions = getPeriodTransactions(state.transactions, range)\n        .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));\n    const transactions = excludeInternalTransfers(allTransactions);\n    const incomeTransactions = transactions.filter((transaction) => transaction.type === "income");\n    const expenseTransactions = transactions.filter((transaction) => transaction.type === "expense");\n    const income = totalByType(incomeTransactions, "income");\n    const expense = totalByType(expenseTransactions, "expense");\n\n    return {\n        range,\n        periodLabel: formatReportPeriod(range, reportState.mode),\n        transactions,\n        incomeTransactions,\n        expenseTransactions,\n        income,\n        expense,\n        result: income - expense,\n        pocketBalances: getMoneyPocketBalances(allTransactions, range.end),\n        categoryRanking: rankExpenses(state.transactions, range, "category"),\n        descriptionRanking: rankExpenses(state.transactions, range, "description"),\n        methodRanking: rankPocketExpenses(state.transactions, range)\n    };\n}\n\nfunction renderRanking`,
        "relatório neutro"
    );

    const transferHandlers = `function openTransferDialog(seriesId = null) {\n    const pair = seriesId ? getTransferPair(state.transactions, seriesId) : null;\n    elements.transferForm.reset();\n    elements.transferSeriesId.value = pair?.seriesId || "";\n    elements.transferModalTitle.textContent = pair?.complete ? "Editar transferência" : "Transferir dinheiro";\n    elements.transferFrom.value = pair?.outgoing?.paymentMethod || "pix";\n    elements.transferTo.value = pair?.incoming?.paymentMethod || "cash";\n    elements.transferAmount.value = pair?.outgoing?.amount || "";\n    elements.transferDate.value = pair?.outgoing?.date || defaultDateForSelectedMonth();\n    elements.transferDescription.value = pair?.outgoing?.description || "";\n    elements.transferDialog.showModal();\n    window.setTimeout(() => elements.transferAmount.focus(), 80);\n}\n\nfunction keepTransferPocketsDifferent(changed) {\n    if (elements.transferFrom.value !== elements.transferTo.value) return;\n    if (changed === "from") elements.transferTo.value = elements.transferFrom.value === "pix" ? "cash" : "pix";\n    else elements.transferFrom.value = elements.transferTo.value === "pix" ? "cash" : "pix";\n}\n\nasync function handleTransferSubmit(event) {\n    event.preventDefault();\n    if (!session?.user) return;\n    const existingSeriesId = elements.transferSeriesId.value || null;\n    const existing = existingSeriesId ? getTransferPair(state.transactions, existingSeriesId) : null;\n    const pair = buildInternalTransfer({\n        seriesId: existingSeriesId,\n        outgoingId: existing?.outgoing?.id,\n        incomingId: existing?.incoming?.id,\n        description: elements.transferDescription.value,\n        amount: elements.transferAmount.value,\n        date: elements.transferDate.value,\n        from: elements.transferFrom.value,\n        to: elements.transferTo.value\n    });\n\n    if (!pair) {\n        showToast("Revise origem, destino, valor e data da transferência.", "warning");\n        return;\n    }\n\n    setButtonBusy(elements.transferForm, true, "TRANSFERINDO");\n    setSyncState("busy");\n    try {\n        const saved = await saveInternalTransferPair(session.user.id, pair);\n        state.transactions = [\n            ...state.transactions.filter((transaction) => transaction.seriesId !== pair.seriesId),\n            ...saved.map(normalizeTransaction).filter(Boolean)\n        ];\n        renderAll();\n        elements.transferDialog.close();\n        setSyncState("ok");\n        showToast(existingSeriesId ? "Transferência atualizada sem alterar o resultado." : "Transferência registrada sem contar como entrada ou saída.");\n    } catch (error) {\n        setSyncState("error");\n        showToast(friendlyError(error), "error");\n    } finally {\n        setButtonBusy(elements.transferForm, false);\n    }\n}\n\n`;

    source = replaceRequired(source, `function openGoalDialog(goalId = null) {`, `${transferHandlers}function openGoalDialog(goalId = null) {`, "ações de transferência");

    source = replaceRegexRequired(
        source,
        /function requestDeletion\(kind, id\) \{[\s\S]*?\n\}\n\nasync function confirmDeletion\(\) \{[\s\S]*?\n\}\n\n\/\* ================================================================\n   BACKUPS/,
        `function requestDeletion(kind, id) {\n    const transferPair = kind === "transfer" ? getTransferPair(state.transactions, id) : null;\n    const item = kind === "transfer"\n        ? transferPair?.outgoing\n        : kind === "transaction"\n            ? state.transactions.find((transaction) => transaction.id === id)\n            : kind === "goal"\n                ? state.goals.find((goal) => goal.id === id)\n                : state.budgets.find((budget) => budget.id === id);\n    if (!item) return;\n    const titles = { transfer: "Excluir transferência?", transaction: "Excluir movimentação?", goal: "Excluir plano?", budget: "Excluir limite?" };\n    const itemName = kind === "transaction" || kind === "transfer" ? item.description : kind === "goal" ? item.name : item.category;\n    elements.confirmTitle.textContent = titles[kind];\n    elements.confirmMessage.textContent = kind === "transfer"\n        ? \`“${'${itemName}'}” será removida dos saldos Pix e espécie, sem alterar receitas ou despesas.\`\n        : \`“${'${itemName}'}” será removido do seu caixa sincronizado.\`;\n    pendingDeletion = { kind, id };\n    elements.confirmDialog.showModal();\n}\n\nasync function confirmDeletion() {\n    if (!pendingDeletion || !session?.user) return;\n    const deletion = pendingDeletion;\n    elements.confirmDeleteButton.disabled = true;\n    setSyncState("busy");\n    try {\n        if (deletion.kind === "transfer") {\n            await removeInternalTransferPair(session.user.id, deletion.id);\n            state.transactions = state.transactions.filter((item) => item.seriesId !== deletion.id);\n        } else if (deletion.kind === "transaction") {\n            await removeTransaction(session.user.id, deletion.id);\n            state.transactions = state.transactions.filter((item) => item.id !== deletion.id);\n        } else if (deletion.kind === "goal") {\n            await removeGoal(session.user.id, deletion.id);\n            state.goals = state.goals.filter((item) => item.id !== deletion.id);\n            state.contributions = state.contributions.filter((item) => item.goalId !== deletion.id);\n        } else {\n            await removeBudget(session.user.id, deletion.id);\n            state.budgets = state.budgets.filter((item) => item.id !== deletion.id);\n        }\n        pendingDeletion = null;\n        elements.confirmDialog.close();\n        renderAll();\n        setSyncState("ok");\n        showToast(deletion.kind === "transfer" ? "Transferência excluída dos dois saldos." : deletion.kind === "transaction" ? "Movimentação excluída." : deletion.kind === "goal" ? "Plano excluído." : "Limite excluído.");\n    } catch (error) {\n        setSyncState("error");\n        showToast(friendlyError(error), "error");\n    } finally {\n        elements.confirmDeleteButton.disabled = false;\n    }\n}\n\n/* ================================================================\n   BACKUPS`,
        "exclusão em par"
    );

    source = source.replace(
        `            transaction.type === "income" ? "Receita" : "Despesa",`,
        `            transaction.type === "transfer" ? "Transferência interna" : transaction.type === "income" ? "Receita" : "Despesa",`
    );
    source = source.replace(
        `            PAYMENT_METHOD_LABELS[transaction.paymentMethod] ?? PAYMENT_METHOD_LABELS.other,`,
        `            transaction.type === "transfer" ? `${'${POCKET_LABELS[transaction.transferFrom]} → ${POCKET_LABELS[transaction.transferTo]}'}` : PAYMENT_METHOD_LABELS[transaction.paymentMethod] ?? PAYMENT_METHOD_LABELS.other,`
    );

    source = replaceRequired(
        source,
        `[$("#topbarNewTransaction"), $("#bannerNewTransaction"), $("#pageNewTransaction")]\n    .forEach((button) => button?.addEventListener("click", () => openTransactionDialog()));`,
        `[$("#topbarNewTransaction"), $("#bannerNewTransaction"), $("#pageNewTransaction")]\n    .forEach((button) => button?.addEventListener("click", () => openTransactionDialog()));\n[$("#bannerNewTransfer"), $("#pageNewTransfer")]\n    .forEach((button) => button?.addEventListener("click", () => openTransferDialog()));`,
        "eventos dos atalhos"
    );
    source = replaceRequired(
        source,
        `elements.transactionForm.addEventListener("submit", handleTransactionSubmit);`,
        `elements.transactionForm.addEventListener("submit", handleTransactionSubmit);\nelements.transferForm.addEventListener("submit", handleTransferSubmit);\nelements.transferFrom.addEventListener("change", () => keepTransferPocketsDifferent("from"));\nelements.transferTo.addEventListener("change", () => keepTransferPocketsDifferent("to"));`,
        "evento do formulário"
    );
    source = replaceRequired(
        source,
        `    if (button.dataset.action === "edit-transaction") openTransactionDialog(button.dataset.id);\n    if (button.dataset.action === "delete-transaction") requestDeletion("transaction", button.dataset.id);`,
        `    if (button.dataset.action === "edit-transaction") openTransactionDialog(button.dataset.id);\n    if (button.dataset.action === "delete-transaction") requestDeletion("transaction", button.dataset.id);\n    if (button.dataset.action === "edit-transfer") openTransferDialog(button.dataset.id);\n    if (button.dataset.action === "delete-transfer") requestDeletion("transfer", button.dataset.id);`,
        "ações no extrato"
    );
    source = replaceRequired(
        source,
        `    elements.transactionDialog,\n    elements.goalDialog,`,
        `    elements.transactionDialog,\n    elements.transferDialog,\n    elements.goalDialog,`,
        "fechamento do diálogo"
    );

    write(path, source);
}

function patchServiceWorker() {
    const path = "public/sw.js";
    let source = read(path);
    source = source.replace(/const CACHE_NAME = "[^"]+";/, 'const CACHE_NAME = "folego-v2.7.0";');
    write(path, source);
}

patchIndex();
patchDomain();
patchScript();
patchServiceWorker();

const finalScript = read("script.js");
const finalIndex = read("index.html");
if (!finalScript.includes(SCRIPT_MARKER)) throw new Error("V2.7 não foi aplicada ao script principal.");
if (!finalScript.includes("saveInternalTransferPair")) throw new Error("Persistência da transferência não foi ligada.");
if (!finalIndex.includes("transferDialog")) throw new Error("Diálogo de transferência não foi criado.");
if (!read("public/sw.js").includes("folego-v2.7.0")) throw new Error("Cache V2.7 não foi renovado.");

console.log("Fôlego V2.7 aplicado: transferência Pix ↔ espécie sem impacto em entradas, saídas ou resultado.");
