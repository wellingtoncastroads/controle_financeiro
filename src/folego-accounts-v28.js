export const ACCOUNT_ASSIGNMENTS_META_KEY = "folego_account_assignments_v28";
export const ACCOUNT_SNAPSHOT_META_KEY = "folego_account_snapshot_v282";

export const ACCOUNT_METHODS = Object.freeze({
    pix: {
        id: "inter",
        name: "Inter",
        subtitle: "Conta corrente",
        logo: "/banks/inter.svg",
        accent: "#ed7400",
        openingBalance: 0
    },
    bank_transfer: {
        id: "bb",
        name: "Banco do Brasil",
        subtitle: "Conta corrente",
        logo: "/banks/banco-do-brasil.svg",
        accent: "#0057b8",
        openingBalance: 302.01
    },
    cash: {
        id: "itau",
        name: "Itaú",
        subtitle: "Conta corrente",
        logo: "/banks/itau.svg",
        accent: "#ec7000",
        openingBalance: 0
    }
});

export const ACCOUNT_METHOD_VALUES = Object.freeze(Object.keys(ACCOUNT_METHODS));
export const DEFAULT_ACCOUNT_SNAPSHOT_V282 = Object.freeze({
    capturedAt: "2026-07-30T13:43:00.000Z",
    balances: Object.freeze({
        pix: 1552.57,
        bank_transfer: 302.01,
        cash: 0
    })
});

const TRANSFER_CATEGORIES = new Set(["Transferência", "Transferência interna"]);
const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const transactionDate = (transaction) => String(transaction?.date ?? transaction?.occurred_on ?? "");
const transactionCreatedAt = (transaction) => String(transaction?.createdAt ?? transaction?.created_at ?? "");
const transactionPaymentMethod = (transaction) => transaction?.paymentMethod ?? transaction?.payment_method ?? "pix";

export function isAccountTransfer(transaction) {
    return TRANSFER_CATEGORIES.has(String(transaction?.category || ""));
}

export function normalizeAccountMethod(value) {
    return ACCOUNT_METHOD_VALUES.includes(value) ? value : "pix";
}

export function normalizeAccountAssignments(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
        Object.entries(value)
            .filter(([id, method]) => typeof id === "string" && id && ACCOUNT_METHOD_VALUES.includes(method))
            .slice(0, 5000)
    );
}

export function normalizeAccountSnapshot(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const capturedAt = typeof value.capturedAt === "string" && !Number.isNaN(Date.parse(value.capturedAt))
        ? new Date(value.capturedAt).toISOString()
        : null;
    if (!capturedAt || !value.balances || typeof value.balances !== "object" || Array.isArray(value.balances)) return null;

    const balances = Object.fromEntries(ACCOUNT_METHOD_VALUES.map((method) => {
        const amount = Number(value.balances[method]);
        return [method, Number.isFinite(amount) ? roundMoney(amount) : 0];
    }));

    return { capturedAt, balances };
}

export function accountForMethod(value) {
    return ACCOUNT_METHODS[normalizeAccountMethod(value)];
}

export function accountNameForMethod(value) {
    return accountForMethod(value).name;
}

export function accountMethodForTransaction(transaction, assignments = {}) {
    if (isAccountTransfer(transaction)) {
        return normalizeAccountMethod(transactionPaymentMethod(transaction));
    }
    const id = transaction?.id;
    return normalizeAccountMethod(id && assignments[id] ? assignments[id] : "pix");
}

export function calculateAccountBalances(transactions, throughDate = "9999-12-31", assignments = {}, snapshotValue = null) {
    const snapshot = normalizeAccountSnapshot(snapshotValue);
    const balances = snapshot
        ? { ...snapshot.balances }
        : Object.fromEntries(ACCOUNT_METHOD_VALUES.map((method) => [method, Number(ACCOUNT_METHODS[method].openingBalance)]));

    (Array.isArray(transactions) ? transactions : [])
        .filter((transaction) => transaction?.status === "paid" && transactionDate(transaction) <= throughDate)
        .filter((transaction) => {
            if (!snapshot) return true;
            const createdAt = transactionCreatedAt(transaction);
            return Boolean(createdAt && createdAt > snapshot.capturedAt);
        })
        .forEach((transaction) => {
            const method = accountMethodForTransaction(transaction, assignments);
            const amount = Number(transaction.amount) || 0;
            balances[method] = roundMoney(
                balances[method] + (transaction.type === "income" ? amount : -amount)
            );
        });

    return {
        balances,
        total: roundMoney(Object.values(balances).reduce((sum, value) => sum + value, 0))
    };
}

export function accountContext(transaction, assignments = {}) {
    if (transaction?.type === "transfer") {
        return `${accountNameForMethod(transaction.transferFrom)} → ${accountNameForMethod(transaction.transferTo)}`;
    }
    const name = accountNameForMethod(accountMethodForTransaction(transaction, assignments));
    return transaction?.type === "income" ? `Entrou em ${name}` : `Saiu de ${name}`;
}

export function transactionMatchesAccount(transaction, selectedMethod, assignments = {}) {
    if (!selectedMethod || selectedMethod === "all") return true;
    if (transaction?.type === "transfer") {
        return transaction.transferFrom === selectedMethod || transaction.transferTo === selectedMethod;
    }
    return accountMethodForTransaction(transaction, assignments) === selectedMethod;
}

export function accountExpenseRanking(transactions, range, assignments = {}) {
    const grouped = Object.fromEntries(
        ACCOUNT_METHOD_VALUES.map((method) => [method, { label: ACCOUNT_METHODS[method].name, amount: 0, count: 0 }])
    );

    (Array.isArray(transactions) ? transactions : [])
        .filter((transaction) => (
            transaction?.type === "expense"
            && transaction?.status === "paid"
            && !isAccountTransfer(transaction)
            && transactionDate(transaction) >= range.start
            && transactionDate(transaction) <= range.end
        ))
        .forEach((transaction) => {
            const method = accountMethodForTransaction(transaction, assignments);
            grouped[method].amount = roundMoney(grouped[method].amount + Number(transaction.amount || 0));
            grouped[method].count += 1;
        });

    const items = Object.values(grouped).filter((item) => item.amount > 0);
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    return items
        .map((item) => ({ ...item, share: total > 0 ? item.amount / total : 0 }))
        .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label, "pt-BR"));
}
