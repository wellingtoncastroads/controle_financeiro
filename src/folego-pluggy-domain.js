export const PLUGGY_META_KEYS = {
    items: "folego_pluggy_items_v1",
    lastSync: "folego_pluggy_last_sync_v1"
};

export const TRANSFER_CATEGORY = "Transferência";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
        row.payment_method || row.paymentMethod || "",
        normalizeText(row.description).slice(0, 64)
    ].join("|");
}

export function looksLikeTransfer(transaction) {
    const text = normalizeText([
        transaction?.description,
        transaction?.descriptionRaw,
        transaction?.category,
        transaction?.operationType,
        transaction?.operationTypeAdditionalInfo,
        transaction?.paymentData?.paymentMethod
    ].filter(Boolean).join(" "));
    return /(pix|ted|doc|transfer|transferencia|mesma titularidade)/.test(text);
}

export function accountPocket(account, item) {
    const text = normalizeText([
        item?.connector?.name,
        item?.name,
        account?.marketingName,
        account?.name
    ].filter(Boolean).join(" "));

    if (/(^| )inter( |$)/.test(text)) return "pix";
    if (/(banco do brasil|(^| )bb( |$))/.test(text)) return "bank_transfer";
    if (/(^| )itau( |$)/.test(text)) return "itau";
    return "other";
}

export function paymentMethodFor(_transaction, account, item) {
    return accountPocket(account, item);
}

export function categoryFor(transaction) {
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

function sharedTransferSeriesId(first, second) {
    return [first?.series_id, second?.series_id]
        .filter((value) => typeof value === "string" && UUID_PATTERN.test(value))
        .sort()[0] || null;
}

function pairInternalTransfers(rows) {
    const candidates = rows.filter((row) => row._transferHint && row.payment_method !== "other");
    let pairCount = 0;

    candidates.forEach((row, index) => {
        if (row._paired) return;
        const date = new Date(`${row.occurred_on}T12:00:00Z`).getTime();
        const match = candidates.slice(index + 1).find((other) => {
            if (other._paired || other.type === row.type || other._accountId === row._accountId) return false;
            if (other.payment_method === row.payment_method) return false;
            if (Math.abs(Number(other.amount) - Number(row.amount)) > 0.009) return false;
            const otherDate = new Date(`${other.occurred_on}T12:00:00Z`).getTime();
            return Math.abs(otherDate - date) <= 86400000;
        });

        if (!match) return;
        const seriesId = sharedTransferSeriesId(row, match);
        if (!seriesId) return;
        row.category = TRANSFER_CATEGORY;
        match.category = TRANSFER_CATEGORY;
        row.series_id = seriesId;
        match.series_id = seriesId;
        row._paired = true;
        match._paired = true;
        pairCount += 1;
    });

    return pairCount;
}

export function mapPluggyPayload(payload, { userId } = {}) {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const accounts = Array.isArray(payload?.accounts)
        ? payload.accounts.filter((account) => account?.type === "BANK")
        : [];
    const transactions = Array.isArray(payload?.transactions) ? payload.transactions : [];
    const accountMap = new Map(accounts.map((account) => [account.id, account]));
    const itemMap = new Map(items.map((item) => [item.id, item]));
    const rows = [];

    transactions.forEach((transaction) => {
        const account = accountMap.get(transaction?.accountId);
        if (!account || !transaction?.id || !transaction?.date) return;
        if (String(transaction.currencyCode || account.currencyCode || "BRL") !== "BRL") return;
        const date = brazilDate(transaction.date);
        if (!date) return;

        const description = String(transaction.merchant?.name || transaction.description || "Movimentação bancária")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 80);
        const row = {
            user_id: userId,
            description,
            amount: Math.abs(Number(transaction.amount || 0)),
            type: transaction.type === "CREDIT" ? "income" : "expense",
            category: categoryFor(transaction),
            occurred_on: date,
            status: transaction.status === "PENDING" ? "pending" : "paid",
            payment_method: paymentMethodFor(transaction, account, itemMap.get(account.itemId)),
            series_id: transaction.id,
            series_kind: null,
            installment_number: null,
            installment_total: null,
            _accountId: account.id,
            _transferHint: looksLikeTransfer(transaction)
        };
        if (!Number.isFinite(row.amount) || row.amount <= 0) return;
        rows.push(row);
    });

    const transferCount = pairInternalTransfers(rows);
    const cleanRows = rows.map(({ _accountId, _transferHint, _paired, ...row }) => row);
    const brlAccounts = accounts.filter((account) => String(account.currencyCode || "BRL") === "BRL");

    return {
        rows: cleanRows,
        summary: {
            bankBalance: brlAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0),
            bankCount: brlAccounts.length,
            transactionCount: cleanRows.length,
            transferCount
        }
    };
}
