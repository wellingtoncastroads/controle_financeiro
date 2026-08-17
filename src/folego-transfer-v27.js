export const TRANSFER_CATEGORY = "Transferência interna";
export const LEGACY_TRANSFER_CATEGORY = "Transferência";

export const POCKET_LABELS = Object.freeze({
    pix: "Inter",
    bank_transfer: "Banco do Brasil",
    itau: "Itaú",
    cash: "Espécie",
    other: "Reserva"
});

const VALID_POCKETS = new Set(Object.keys(POCKET_LABELS));
const TRANSFER_CATEGORIES = new Set([TRANSFER_CATEGORY, LEGACY_TRANSFER_CATEGORY]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function paymentMethodOf(transaction) {
    return transaction?.paymentMethod ?? transaction?.payment_method ?? null;
}

function seriesIdOf(transaction) {
    return transaction?.seriesId ?? transaction?.series_id ?? null;
}

function createdAtOf(transaction) {
    return transaction?.createdAt ?? transaction?.created_at ?? null;
}

function currencyRound(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function amountOf(transaction) {
    const amount = Number(transaction?.amount);
    return Number.isFinite(amount) ? amount : 0;
}

function cleanDescription(value, from, to) {
    const normalized = String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
    return normalized || `Transferência ${POCKET_LABELS[from]} → ${POCKET_LABELS[to]}`;
}

function cleanAmount(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999.99) return null;
    return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function hasValidSeriesId(transaction) {
    const seriesId = seriesIdOf(transaction);
    return typeof seriesId === "string" && UUID_PATTERN.test(seriesId);
}

export function isInternalTransfer(transaction) {
    return Boolean(
        transaction
        && TRANSFER_CATEGORIES.has(String(transaction.category || ""))
        && ["income", "expense", "transfer"].includes(transaction.type)
    );
}

export function excludeInternalTransfers(transactions) {
    return (Array.isArray(transactions) ? transactions : []).filter((transaction) => !isInternalTransfer(transaction));
}

export function getTransferPair(transactions, seriesId) {
    if (typeof seriesId !== "string" || !UUID_PATTERN.test(seriesId)) {
        return { seriesId: null, outgoing: null, incoming: null, complete: false, ids: [] };
    }
    const legs = (Array.isArray(transactions) ? transactions : [])
        .filter((transaction) => isInternalTransfer(transaction) && seriesIdOf(transaction) === seriesId);
    const outgoing = legs.find((transaction) => transaction.type === "expense") || null;
    const incoming = legs.find((transaction) => transaction.type === "income") || null;
    return {
        seriesId,
        outgoing,
        incoming,
        complete: Boolean(outgoing && incoming),
        ids: legs.map((transaction) => transaction.id).filter(Boolean)
    };
}

export function buildInternalTransfer(values, uuid = () => crypto.randomUUID()) {
    const from = values?.from;
    const to = values?.to;
    const amount = cleanAmount(values?.amount);
    const date = String(values?.date || "");
    const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date);
    const existingSeriesId = typeof values?.seriesId === "string" && UUID_PATTERN.test(values.seriesId)
        ? values.seriesId
        : null;

    if (!VALID_POCKETS.has(from) || !VALID_POCKETS.has(to) || from === to || amount === null || !dateValid) {
        return null;
    }

    const seriesId = existingSeriesId || uuid();
    if (!UUID_PATTERN.test(seriesId)) return null;
    const description = cleanDescription(values?.description, from, to);
    const common = {
        description,
        amount,
        category: TRANSFER_CATEGORY,
        date,
        status: "paid",
        seriesId,
        seriesKind: null,
        installmentNumber: null,
        installmentTotal: null
    };

    return {
        seriesId,
        outgoing: {
            ...common,
            id: typeof values?.outgoingId === "string" ? values.outgoingId : "",
            type: "expense",
            paymentMethod: from
        },
        incoming: {
            ...common,
            id: typeof values?.incomingId === "string" ? values.incomingId : "",
            type: "income",
            paymentMethod: to
        }
    };
}

export function collapseInternalTransfers(transactions) {
    const source = Array.isArray(transactions) ? transactions : [];
    const seen = new Set();
    const collapsed = [];

    source.forEach((transaction) => {
        const seriesId = seriesIdOf(transaction);
        if (!isInternalTransfer(transaction) || !hasValidSeriesId(transaction)) {
            collapsed.push(transaction);
            return;
        }
        if (seen.has(seriesId)) return;
        seen.add(seriesId);

        const pair = getTransferPair(source, seriesId);
        if (!pair.complete) {
            collapsed.push(...source.filter((item) => seriesIdOf(item) === seriesId));
            return;
        }

        const createdAt = [createdAtOf(pair.outgoing), createdAtOf(pair.incoming)].filter(Boolean).sort().at(-1) || null;
        collapsed.push({
            ...pair.outgoing,
            id: pair.outgoing.id || pair.incoming.id,
            type: "transfer",
            amount: Number(pair.outgoing.amount),
            seriesId,
            transferFrom: paymentMethodOf(pair.outgoing),
            transferTo: paymentMethodOf(pair.incoming),
            transferIds: pair.ids,
            createdAt
        });
    });

    return collapsed;
}

export function summarizeFinancialMovements(transactions) {
    const confirmed = (Array.isArray(transactions) ? transactions : [])
        .filter((transaction) => transaction?.status === "paid");
    const financial = excludeInternalTransfers(confirmed);
    const income = currencyRound(financial
        .filter((transaction) => transaction.type === "income")
        .reduce((sum, transaction) => sum + amountOf(transaction), 0));
    const expense = currencyRound(financial
        .filter((transaction) => transaction.type === "expense")
        .reduce((sum, transaction) => sum + amountOf(transaction), 0));
    const transfers = collapseInternalTransfers(confirmed.filter(isInternalTransfer));

    return {
        income,
        expense,
        result: currencyRound(income - expense),
        count: financial.length,
        transferCount: transfers.length
    };
}
