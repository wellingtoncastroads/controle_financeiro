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
        id: "cash",
        name: "Espécie",
        subtitle: "Dinheiro em mãos",
        logo: "",
        accent: "#c8ff3d",
        openingBalance: 0
    }
});

export const ACCOUNT_METHOD_VALUES = Object.freeze(Object.keys(ACCOUNT_METHODS));
const TRANSFER_CATEGORIES = new Set(["Transferência", "Transferência interna"]);

const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const transactionDate = (transaction) => String(transaction?.date ?? transaction?.occurred_on ?? "");
const transactionMethod = (transaction) => transaction?.paymentMethod ?? transaction?.payment_method ?? "pix";

export function isAccountTransfer(transaction) {
    return TRANSFER_CATEGORIES.has(String(transaction?.category || ""));
}

export function normalizeAccountMethod(value) {
    return ACCOUNT_METHOD_VALUES.includes(value) ? value : "pix";
}

export function accountForMethod(value) {
    return ACCOUNT_METHODS[normalizeAccountMethod(value)];
}

export function accountNameForMethod(value) {
    return accountForMethod(value).name;
}

export function accountMethodForTransaction(transaction) {
    return normalizeAccountMethod(transactionMethod(transaction));
}

export function calculateAccountBalances(transactions, throughDate = "9999-12-31") {
    const balances = Object.fromEntries(
        ACCOUNT_METHOD_VALUES.map((method) => [method, Number(ACCOUNT_METHODS[method].openingBalance)])
    );

    (Array.isArray(transactions) ? transactions : [])
        .filter((transaction) => (
            transaction?.status === "paid"
            && transactionDate(transaction) <= throughDate
        ))
        .forEach((transaction) => {
            const method = accountMethodForTransaction(transaction);
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

export function accountContext(transaction) {
    if (transaction?.type === "transfer") {
        return `${accountNameForMethod(transaction.transferFrom)} → ${accountNameForMethod(transaction.transferTo)}`;
    }
    const name = accountNameForMethod(accountMethodForTransaction(transaction));
    return transaction?.type === "income" ? `Entrou em ${name}` : `Saiu de ${name}`;
}

export function transactionMatchesAccount(transaction, selectedMethod) {
    if (!selectedMethod || selectedMethod === "all") return true;
    if (transaction?.type === "transfer") {
        return transaction.transferFrom === selectedMethod || transaction.transferTo === selectedMethod;
    }
    return accountMethodForTransaction(transaction) === selectedMethod;
}

export function accountExpenseRanking(transactions, range) {
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
            const method = accountMethodForTransaction(transaction);
            grouped[method].amount = roundMoney(grouped[method].amount + Number(transaction.amount || 0));
            grouped[method].count += 1;
        });

    const items = Object.values(grouped).filter((item) => item.amount > 0);
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    return items
        .map((item) => ({ ...item, share: total > 0 ? item.amount / total : 0 }))
        .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label, "pt-BR"));
}
