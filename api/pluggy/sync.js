import {
    allowMethods,
    assertItemOwnership,
    collectPluggyPages,
    getPluggyApiKey,
    handleApiError,
    publicItem,
    readJson,
    requireSupabaseUser,
    sendJson
} from "../_pluggy.js";

function dateKey(value, fallback) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : fallback;
}

function publicAccount(account) {
    return {
        id: account.id,
        itemId: account.itemId,
        type: account.type,
        subtype: account.subtype,
        name: account.name,
        marketingName: account.marketingName,
        balance: Number(account.balance || 0),
        currencyCode: account.currencyCode || "BRL",
        bankData: account.bankData ? {
            transferNumber: account.bankData.transferNumber,
            closingBalance: account.bankData.closingBalance
        } : null
    };
}

function publicTransaction(transaction) {
    return {
        id: transaction.id,
        accountId: transaction.accountId,
        date: transaction.date,
        description: transaction.description,
        descriptionRaw: transaction.descriptionRaw,
        amount: Number(transaction.amount || 0),
        currencyCode: transaction.currencyCode || "BRL",
        type: transaction.type,
        status: transaction.status,
        category: transaction.category,
        operationType: transaction.operationType,
        operationTypeAdditionalInfo: transaction.operationTypeAdditionalInfo,
        providerId: transaction.providerId,
        paymentData: transaction.paymentData ? {
            paymentMethod: transaction.paymentData.paymentMethod,
            payer: transaction.paymentData.payer ? { name: transaction.paymentData.payer.name } : null,
            receiver: transaction.paymentData.receiver ? { name: transaction.paymentData.receiver.name } : null
        } : null,
        merchant: transaction.merchant ? {
            name: transaction.merchant.name,
            category: transaction.merchant.category
        } : null
    };
}

export default async function handler(request, response) {
    if (!allowMethods(request, response, ["POST"])) return;
    try {
        const user = await requireSupabaseUser(request);
        const body = await readJson(request);
        const itemIds = [...new Set(Array.isArray(body.itemIds) ? body.itemIds.filter((id) => typeof id === "string") : [])].slice(0, 8);
        if (!itemIds.length) return sendJson(response, 400, { error: "Nenhuma conexão bancária foi informada." });

        const today = new Date();
        const defaultTo = today.toISOString().slice(0, 10);
        const fromDate = new Date(today);
        fromDate.setUTCFullYear(fromDate.getUTCFullYear() - 1);
        const from = dateKey(body.from, fromDate.toISOString().slice(0, 10));
        const to = dateKey(body.to, defaultTo);
        const apiKey = await getPluggyApiKey();
        const items = [];
        const accounts = [];
        const transactions = [];

        for (const itemId of itemIds) {
            const item = await assertItemOwnership(itemId, user.id, apiKey);
            items.push(publicItem(item));
            const allAccounts = await collectPluggyPages(`/accounts?itemId=${encodeURIComponent(itemId)}&pageSize=500`, apiKey, 10);
            const itemAccounts = allAccounts.filter((account) => (
                account?.type === "BANK"
                && String(account.currencyCode || "BRL") === "BRL"
            ));
            accounts.push(...itemAccounts.map(publicAccount));
            for (const account of itemAccounts) {
                const rows = await collectPluggyPages(
                    `/v2/transactions?accountId=${encodeURIComponent(account.id)}&dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`,
                    apiKey,
                    30
                );
                transactions.push(...rows.map(publicTransaction));
            }
        }

        sendJson(response, 200, {
            mode: "read_only",
            syncedAt: new Date().toISOString(),
            period: { from, to },
            items,
            accounts,
            transactions
        });
    } catch (error) {
        handleApiError(response, error);
    }
}
