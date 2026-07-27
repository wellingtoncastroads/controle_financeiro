export const TRANSFER_CATEGORY = "Transferência interna";

export const POCKET_LABELS = Object.freeze({
    pix: "Pix",
    cash: "Espécie"
});

const VALID_POCKETS = new Set(Object.keys(POCKET_LABELS));
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanDescription(value, from, to) {
    const normalized = String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
    return normalized || `Transferência ${POCKET_LABELS[from]} → ${POCKET_LABELS[to]}`;
}

function cleanAmount(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999.99) return null;
    return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function isInternalTransfer(transaction) {
    return Boolean(
        transaction
        && transaction.category === TRANSFER_CATEGORY
        && typeof transaction.seriesId === "string"
        && UUID_PATTERN.test(transaction.seriesId)
        && VALID_POCKETS.has(transaction.paymentMethod)
        && ["income", "expense"].includes(transaction.type)
    );
}

export function excludeInternalTransfers(transactions) {
    return (Array.isArray(transactions) ? transactions : []).filter((transaction) => !isInternalTransfer(transaction));
}

export function getTransferPair(transactions, seriesId) {
    const legs = (Array.isArray(transactions) ? transactions : [])
        .filter((transaction) => isInternalTransfer(transaction) && transaction.seriesId === seriesId);
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
        if (!isInternalTransfer(transaction)) {
            collapsed.push(transaction);
            return;
        }
        if (seen.has(transaction.seriesId)) return;
        seen.add(transaction.seriesId);

        const pair = getTransferPair(source, transaction.seriesId);
        if (!pair.complete) {
            collapsed.push(...source.filter((item) => item.seriesId === transaction.seriesId));
            return;
        }

        const createdAt = [pair.outgoing.createdAt, pair.incoming.createdAt].filter(Boolean).sort().at(-1) || null;
        collapsed.push({
            ...pair.outgoing,
            id: pair.outgoing.id || pair.incoming.id,
            type: "transfer",
            amount: Number(pair.outgoing.amount),
            transferFrom: pair.outgoing.paymentMethod,
            transferTo: pair.incoming.paymentMethod,
            transferIds: pair.ids,
            createdAt
        });
    });

    return collapsed;
}
