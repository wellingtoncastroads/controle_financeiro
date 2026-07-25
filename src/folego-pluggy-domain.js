export const PLUGGY_META_KEYS = {
    items: "folego_pluggy_items_v1",
    lastSync: "folego_pluggy_last_sync_v1"
};

export const TRANSFER_CATEGORY = "Transferência";

export function normalizeText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function brazilDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const brazil = new Date(date.getTime() - 3 * 60 * 60 * 1000);
    return brazil.toISOString().slice(0, 10);
}

export function transactionFingerprint(row) {
    return [
        String(row.occurred_on || row.date || "").slice(0, 10),
        row.type || "",
        Math.abs(Number(row.amount || 0)).toFixed(2),
        normalizeText(row.description).slice(0, 64)
    ].join("|");
}

export function isBillPayment(transaction) {
    const text = normalizeText([
        transaction?.description,
        transaction?.descriptionRaw,
        transaction?.category,
        transaction?.operationType,
        transaction?.operationTypeAdditionalInfo
    ].filter(Boolean).join(" "));
    return /(pagamento.*fatura|fatura.*cartao|pgto.*cartao|payment.*bill|credit card bill)/.test(text);
}

export function looksLikeTransfer(transaction) {
    const text = normalizeText([
        transaction?.description,
        transaction?.descriptionRaw,
        transaction?.category,
        transaction?.operationType,
        transaction?.paymentData?.paymentMethod
    ].filter(Boolean).join(" "));
    return /(pix|ted|doc|transfer|transferencia)/.test(text);
}

export function paymentMethodFor(transaction, account) {
    if (account?.type === "CREDIT") return "credit_card";
    const text = normalizeText([
        transaction?.paymentData?.paymentMethod,
        transaction?.description,
        transaction?.operationType
    ].filter(Boolean).join(" "));
    if (text.includes("pix")) return "pix";
    if (/(saque|cash|dinheiro)/.test(text)) return "cash";
    return "other";
}

export function categoryFor(transaction, account) {
    if (isBillPayment(transaction)) return TRANSFER_CATEGORY;
    const text = normalizeText([
        transaction?.category,
        transaction?.merchant?.category,
        transaction?.merchant?.name,
        transaction?.description,
        transaction?.operationType
    ].filter(Boolean).join(" "));

    if (/(salario|salary|folha pagamento|payroll)/.test(text)) return "Salário";
    if (/(mercado|supermercado|grocery|food market|padaria|restaurant|restaurante|ifood|alimentacao|eating out)/.test(text)) return "Alimentação";
    if (/(uber|99 |taxi|combustivel|posto|gas station|transporte|transport)/.test(text)) return "Transporte";
    if (/(farmacia|pharmacy|hospital|clinica|saude|health)/.test(text)) return "Saúde";
    if (/(aluguel|condominio|moradia|rent|housing)/.test(text)) return "Moradia";
    if (/(energia|eletric|internet|telefone|telefonia|agua|utility|utilities|conta consumo)/.test(text)) return "Contas";
    if (/(netflix|spotify|assinatura|subscription|streaming)/.test(text)) return "Assinaturas";
    if (/(escola|faculdade|curso|education|educacao)/.test(text)) return "Educação";
    if (/(cinema|lazer|entertainment|viagem|travel)/.test(text)) return "Lazer";
    if (/(investimento|investment|rendimento|aplicacao|resgate)/.test(text)) return "Investimentos";
    return transaction?.type === "CREDIT" ? "Outras receitas" : "Outras despesas";
}

function currentMonthKey(now = new Date()) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function cardFromAccount(account) {
    const limit = Number(account?.creditData?.creditLimit || 0);
    if (account?.type !== "CREDIT" || limit <= 0) return null;
    const close = String(account?.creditData?.balanceCloseDate || "").slice(8, 10);
    const due = String(account?.creditData?.balanceDueDate || "").slice(8, 10);
    return {
        id: account.id,
        name: String(account.marketingName || account.name || "Cartão conectado").slice(0, 40),
        limit,
        closingDay: Math.min(28, Math.max(1, Number(close) || 10)),
        dueDay: Math.min(28, Math.max(1, Number(due) || 17)),
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

function pairInternalTransfers(rows) {
    const candidates = rows.filter((row) => row._accountType === "BANK" && row._transferHint);
    candidates.forEach((row, index) => {
        if (row._paired) return;
        const date = new Date(`${row.occurred_on}T12:00:00Z`).getTime();
        const match = candidates.slice(index + 1).find((other) => {
            if (other._paired || other.type === row.type || other._accountId === row._accountId) return false;
            if (Math.abs(Number(other.amount) - Number(row.amount)) > 0.009) return false;
            const otherDate = new Date(`${other.occurred_on}T12:00:00Z`).getTime();
            return Math.abs(otherDate - date) <= 86400000;
        });
        if (match) {
            row.category = TRANSFER_CATEGORY;
            match.category = TRANSFER_CATEGORY;
            row._paired = true;
            match._paired = true;
        }
    });
}

export function mapPluggyPayload(payload, { userId, now = new Date() } = {}) {
    const accounts = Array.isArray(payload?.accounts) ? payload.accounts : [];
    const transactions = Array.isArray(payload?.transactions) ? payload.transactions : [];
    const accountMap = new Map(accounts.map((account) => [account.id, account]));
    const month = currentMonthKey(now);
    const rows = [];
    const seriesMap = {};

    transactions.forEach((transaction) => {
        const account = accountMap.get(transaction.accountId);
        if (!account || !transaction?.id || !transaction?.date) return;
        if (account.type === "CREDIT" && transaction.type === "CREDIT") return;
        const date = brazilDate(transaction.date);
        if (!date) return;
        const creditPurchase = account.type === "CREDIT";
        const type = creditPurchase ? "expense" : transaction.type === "CREDIT" ? "income" : "expense";
        const description = String(transaction.merchant?.name || transaction.description || "Movimentação bancária")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 80);
        const row = {
            user_id: userId,
            description,
            amount: Math.abs(Number(transaction.amount || 0)),
            type,
            category: categoryFor(transaction, account),
            occurred_on: date,
            status: creditPurchase ? (date.slice(0, 7) < month ? "paid" : "pending") : transaction.status === "PENDING" ? "pending" : "paid",
            payment_method: paymentMethodFor(transaction, account),
            series_id: transaction.id,
            series_kind: "pluggy_import",
            installment_number: transaction.creditCardMetadata?.installmentNumber || null,
            installment_total: transaction.creditCardMetadata?.totalInstallments || null,
            _accountId: account.id,
            _accountType: account.type,
            _transferHint: looksLikeTransfer(transaction)
        };
        if (!Number.isFinite(row.amount) || row.amount <= 0) return;
        rows.push(row);
        if (creditPurchase) seriesMap[transaction.id] = account.id;
    });

    pairInternalTransfers(rows);

    const cleanRows = rows.map(({ _accountId, _accountType, _transferHint, _paired, ...row }) => row);
    const cards = accounts.map(cardFromAccount).filter(Boolean);
    const bankAccounts = accounts.filter((account) => account.type === "BANK");
    const creditAccounts = accounts.filter((account) => account.type === "CREDIT");

    return {
        rows: cleanRows,
        cards,
        seriesMap,
        summary: {
            bankBalance: bankAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0),
            creditOpen: creditAccounts.reduce((sum, account) => sum + Math.max(0, Number(account.balance || 0)), 0),
            bankCount: bankAccounts.length,
            cardCount: creditAccounts.length
        }
    };
}
