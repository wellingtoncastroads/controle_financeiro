import fs from "node:fs";

const HTML_MARKER = "<!-- FÔLEGO PIX/ESPÉCIE SPLIT -->";
const SCRIPT_MARKER = "/* FÔLEGO PIX/ESPÉCIE SPLIT */";
const STYLE_MARKER = "/* FÔLEGO PIX/ESPÉCIE SPLIT */";
const DOMAIN_MARKER = "// FÔLEGO PIX/ESPÉCIE SPLIT";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content, "utf8");
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Não foi possível aplicar o ajuste: ${label}.`);
  }
  return source.replace(search, replacement);
}

function patchHtml() {
  const path = "index.html";
  let source = read(path);
  if (source.includes(HTML_MARKER)) return;

  source = replaceRequired(
    source,
    `                        <strong class="hero-balance" id="currentBalance">R$ 0,00</strong>\n\n                        <div class="balance-footer">`,
    `                        <strong class="hero-balance" id="currentBalance">R$ 0,00</strong>\n\n                        ${HTML_MARKER}\n                        <section class="balance-pockets" aria-label="Saldo separado entre Pix e espécie">\n                            <article class="money-pocket pix-pocket">\n                                <span>PIX</span>\n                                <strong id="pixBalance">R$ 0,00</strong>\n                                <small>dinheiro digital</small>\n                            </article>\n                            <article class="money-pocket cash-pocket">\n                                <span>ESPÉCIE</span>\n                                <strong id="cashBalance">R$ 0,00</strong>\n                                <small>dinheiro em mãos</small>\n                            </article>\n                        </section>\n\n                        <div class="balance-footer">`,
    "saldos Pix e espécie no painel"
  );

  source = replaceRequired(
    source,
    `                <section class="report-totals" aria-label="Resumo do período">\n                    <article class="report-total income"><span>ENTROU</span><strong id="reportIncome">R$ 0,00</strong><small id="reportIncomeCount">0 registros</small></article>\n                    <article class="report-total expense"><span>SAIU</span><strong id="reportExpense">R$ 0,00</strong><small id="reportExpenseCount">0 registros</small></article>\n                    <article class="report-total result"><span>RESULTADO</span><strong id="reportResult">R$ 0,00</strong><small>somente confirmados</small></article>\n                </section>`,
    `                <section class="report-totals" aria-label="Resumo do período">\n                    <article class="report-total income"><span>ENTROU</span><strong id="reportIncome">R$ 0,00</strong><small id="reportIncomeCount">0 registros</small></article>\n                    <article class="report-total expense"><span>SAIU</span><strong id="reportExpense">R$ 0,00</strong><small id="reportExpenseCount">0 registros</small></article>\n                    <article class="report-total result"><span>RESULTADO</span><strong id="reportResult">R$ 0,00</strong><small>somente confirmados</small></article>\n                </section>\n\n                <section class="report-pocket-grid" aria-label="Resultado separado entre Pix e espécie no período">\n                    <article class="report-pocket pix-pocket">\n                        <span>PIX NO PERÍODO</span>\n                        <strong id="reportPixBalance">R$ 0,00</strong>\n                    </article>\n                    <article class="report-pocket cash-pocket">\n                        <span>ESPÉCIE NO PERÍODO</span>\n                        <strong id="reportCashBalance">R$ 0,00</strong>\n                    </article>\n                </section>`,
    "saldos Pix e espécie no Raio-X"
  );

  source = replaceRequired(
    source,
    `                    <select id="transactionPaymentMethod" required>\n                        <option value="pix">Pix</option>\n                        <option value="cash">Dinheiro</option>\n                        <option value="debit_card">Cartão de débito</option>\n                        <option value="credit_card">Cartão de crédito</option>\n                        <option value="bank_transfer">Transferência bancária</option>\n                        <option value="boleto">Boleto</option>\n                        <option value="other">Não informado</option>\n                    </select>`,
    `                    <select id="transactionPaymentMethod" required>\n                        <option value="pix">Pix</option>\n                        <option value="cash">Espécie</option>\n                    </select>`,
    "opções Pix e espécie no formulário"
  );

  source = source.replace("03 / COMO PAGOU", "03 / PIX OU ESPÉCIE");
  write(path, source);
}

function patchDomain() {
  const path = "src/domain.js";
  let source = read(path);
  if (source.includes(DOMAIN_MARKER)) return;
  source = replaceRequired(
    source,
    `export const PAYMENT_METHODS = [\n    { value: "pix", label: "Pix" },\n    { value: "cash", label: "Dinheiro" },`,
    `${DOMAIN_MARKER}\nexport const PAYMENT_METHODS = [\n    { value: "pix", label: "Pix" },\n    { value: "cash", label: "Espécie" },`,
    "nome Espécie"
  );
  write(path, source);
}

function patchScript() {
  const path = "script.js";
  let source = read(path);
  if (source.includes(SCRIPT_MARKER)) return;

  source = replaceRequired(
    source,
    `    bannerBalance: $("#bannerBalance"),\n    currentBalance: $("#currentBalance"),\n    balanceCaption: $("#balanceCaption"),`,
    `    bannerBalance: $("#bannerBalance"),\n    currentBalance: $("#currentBalance"),\n    pixBalance: $("#pixBalance"),\n    cashBalance: $("#cashBalance"),\n    balanceCaption: $("#balanceCaption"),`,
    "referências dos saldos no painel"
  );

  source = replaceRequired(
    source,
    `    reportIncomeCount: $("#reportIncomeCount"),\n    reportExpenseCount: $("#reportExpenseCount"),\n    categoryRanking: $("#categoryRanking"),`,
    `    reportIncomeCount: $("#reportIncomeCount"),\n    reportExpenseCount: $("#reportExpenseCount"),\n    reportPixBalance: $("#reportPixBalance"),\n    reportCashBalance: $("#reportCashBalance"),\n    categoryRanking: $("#categoryRanking"),`,
    "referências dos saldos no Raio-X"
  );

  source = replaceRequired(
    source,
    `function totalByType(transactions, type) {\n    return transactions\n        .filter((transaction) => transaction.type === type)\n        .reduce((total, transaction) => total + Number(transaction.amount), 0);\n}\n\nfunction signedCurrency(transaction) {`,
    `function totalByType(transactions, type) {\n    return transactions\n        .filter((transaction) => transaction.type === type)\n        .reduce((total, transaction) => total + Number(transaction.amount), 0);\n}\n\n${SCRIPT_MARKER}\nfunction moneyPocket(transaction) {\n    return transaction.paymentMethod === "cash" ? "cash" : "pix";\n}\n\nfunction getMoneyPocketBalances(transactions, throughDate = "9999-12-31") {\n    return transactions\n        .filter((transaction) => transaction.status === "paid" && transaction.date <= throughDate)\n        .reduce((balances, transaction) => {\n            const pocket = moneyPocket(transaction);\n            const amount = Number(transaction.amount) || 0;\n            balances[pocket] += transaction.type === "income" ? amount : -amount;\n            return balances;\n        }, { pix: 0, cash: 0 });\n}\n\nfunction rankPocketExpenses(transactions, range) {\n    const expenses = getPeriodTransactions(transactions, range)\n        .filter((transaction) => transaction.type === "expense");\n    const grouped = expenses.reduce((result, transaction) => {\n        const pocket = moneyPocket(transaction);\n        result[pocket].amount += Number(transaction.amount) || 0;\n        result[pocket].count += 1;\n        return result;\n    }, { pix: { amount: 0, count: 0 }, cash: { amount: 0, count: 0 } });\n    const total = grouped.pix.amount + grouped.cash.amount;\n    return [\n        { label: "Pix", ...grouped.pix },\n        { label: "Espécie", ...grouped.cash }\n    ]\n        .filter((item) => item.amount > 0)\n        .map((item) => ({ ...item, share: total > 0 ? item.amount / total : 0 }))\n        .sort((a, b) => b.amount - a.amount);\n}\n\nfunction signedCurrency(transaction) {`,
    "cálculo dos saldos Pix e espécie"
  );

  source = replaceRequired(
    source,
    `    const balanceToday = getBalanceAsOf(state.transactions, today);\n    const projectedBalance = totalByType(confirmed, "income") - totalByType(confirmed, "expense");`,
    `    const balanceToday = getBalanceAsOf(state.transactions, today);\n    const pocketBalances = getMoneyPocketBalances(state.transactions, today);\n    const projectedBalance = totalByType(confirmed, "income") - totalByType(confirmed, "expense");`,
    "leitura dos saldos separados"
  );

  source = replaceRequired(
    source,
    `    elements.currentBalance.textContent = formatCurrency(balanceToday);\n    elements.currentBalance.classList.toggle("long-value", elements.currentBalance.textContent.length > 17);\n    elements.bannerBalance.textContent = formatCurrency(projectedBalance);`,
    `    elements.currentBalance.textContent = formatCurrency(balanceToday);\n    elements.currentBalance.classList.toggle("long-value", elements.currentBalance.textContent.length > 17);\n    elements.pixBalance.textContent = formatCurrency(pocketBalances.pix);\n    elements.cashBalance.textContent = formatCurrency(pocketBalances.cash);\n    elements.pixBalance.classList.toggle("negative", pocketBalances.pix < 0);\n    elements.cashBalance.classList.toggle("negative", pocketBalances.cash < 0);\n    elements.bannerBalance.textContent = formatCurrency(projectedBalance);`,
    "exibição dos saldos separados"
  );

  source = replaceRequired(
    source,
    `        result: income - expense,\n        categoryRanking: rankExpenses(state.transactions, range, "category"),\n        descriptionRanking: rankExpenses(state.transactions, range, "description"),\n        methodRanking: rankExpenses(state.transactions, range, "paymentMethod")`,
    `        result: income - expense,\n        pocketBalances: getMoneyPocketBalances(transactions, range.end),\n        categoryRanking: rankExpenses(state.transactions, range, "category"),\n        descriptionRanking: rankExpenses(state.transactions, range, "description"),\n        methodRanking: rankPocketExpenses(state.transactions, range)`,
    "separação no relatório"
  );

  source = replaceRequired(
    source,
    `    elements.reportIncomeCount.textContent = \`\${report.incomeTransactions.length} \${report.incomeTransactions.length === 1 ? "registro" : "registros"}\`;\n    elements.reportExpenseCount.textContent = \`\${report.expenseTransactions.length} \${report.expenseTransactions.length === 1 ? "registro" : "registros"}\`;\n    renderRanking(elements.categoryRanking, report.categoryRanking, "Nenhuma despesa confirmada neste período.");`,
    `    elements.reportIncomeCount.textContent = \`\${report.incomeTransactions.length} \${report.incomeTransactions.length === 1 ? "registro" : "registros"}\`;\n    elements.reportExpenseCount.textContent = \`\${report.expenseTransactions.length} \${report.expenseTransactions.length === 1 ? "registro" : "registros"}\`;\n    elements.reportPixBalance.textContent = formatCurrency(report.pocketBalances.pix);\n    elements.reportCashBalance.textContent = formatCurrency(report.pocketBalances.cash);\n    elements.reportPixBalance.classList.toggle("negative", report.pocketBalances.pix < 0);\n    elements.reportCashBalance.classList.toggle("negative", report.pocketBalances.cash < 0);\n    renderRanking(elements.categoryRanking, report.categoryRanking, "Nenhuma despesa confirmada neste período.");`,
    "exibição da separação no Raio-X"
  );

  source = replaceRequired(
    source,
    `    elements.transactionMethodLabel.textContent = type === "income" ? "COMO O DINHEIRO ENTROU" : "COMO PAGOU";`,
    `    elements.transactionMethodLabel.textContent = type === "income" ? "ONDE O DINHEIRO FICOU" : "DE ONDE O DINHEIRO SAIU";`,
    "texto do seletor Pix ou espécie"
  );

  source = replaceRequired(
    source,
    `    elements.transactionPaymentMethod.value = transaction?.paymentMethod || "other";`,
    `    elements.transactionPaymentMethod.value = transaction?.paymentMethod === "cash" ? "cash" : "pix";`,
    "compatibilidade com movimentações antigas"
  );

  source = source.replace(
    `    renderRanking(elements.methodRanking, report.methodRanking, "As formas de pagamento aparecerão aqui.");`,
    `    renderRanking(elements.methodRanking, report.methodRanking, "A divisão entre Pix e espécie aparecerá aqui.");`
  );

  write(path, source);
}

function patchStyles() {
  const path = "style.css";
  let source = read(path);
  if (source.includes(STYLE_MARKER)) return;
  source += `\n\n${STYLE_MARKER}\n.balance-pockets,\n.report-pocket-grid {\n    display: grid;\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n    gap: 12px;\n}\n\n.balance-pockets {\n    width: min(100%, 560px);\n    margin-top: 24px;\n}\n\n.money-pocket,\n.report-pocket {\n    position: relative;\n    overflow: hidden;\n    border: 1px solid var(--line, #23231f);\n    background: var(--paper, #fffdf5);\n    padding: 15px 16px;\n    min-width: 0;\n}\n\n.money-pocket::before,\n.report-pocket::before {\n    content: \"\";\n    position: absolute;\n    inset: 0 auto 0 0;\n    width: 5px;\n    background: var(--pocket-accent);\n}\n\n.pix-pocket { --pocket-accent: #2456d8; }\n.cash-pocket { --pocket-accent: #164b3a; }\n\n.money-pocket span,\n.report-pocket span {\n    display: block;\n    color: var(--muted, #747168);\n    font-size: 0.68rem;\n    font-weight: 800;\n    letter-spacing: 0.12em;\n}\n\n.money-pocket strong,\n.report-pocket strong {\n    display: block;\n    margin-top: 6px;\n    color: var(--ink, #11120e);\n    font-size: clamp(1.05rem, 2.2vw, 1.45rem);\n    line-height: 1;\n    overflow-wrap: anywhere;\n}\n\n.money-pocket strong.negative,\n.report-pocket strong.negative {\n    color: var(--orange, #ff4e1a);\n}\n\n.money-pocket small {\n    display: block;\n    margin-top: 7px;\n    color: var(--muted, #747168);\n    font-size: 0.72rem;\n}\n\n.report-pocket-grid {\n    margin: 14px 0 28px;\n}\n\n.report-pocket {\n    padding: 18px 20px;\n}\n\n@media (max-width: 620px) {\n    .balance-pockets,\n    .report-pocket-grid {\n        grid-template-columns: 1fr 1fr;\n        gap: 8px;\n    }\n\n    .money-pocket,\n    .report-pocket {\n        padding: 13px 12px 13px 16px;\n    }\n\n    .money-pocket span,\n    .report-pocket span {\n        font-size: 0.58rem;\n        letter-spacing: 0.08em;\n    }\n}\n`;
  write(path, source);
}

patchHtml();
patchDomain();
patchScript();
patchStyles();
console.log("Separação Pix/Espécie aplicada com sucesso.");
