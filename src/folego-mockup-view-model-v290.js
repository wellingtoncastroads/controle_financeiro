import {
    getBalanceAsOf,
    getBalanceProjection,
    getBreathingDays,
    getUpcomingTransactions,
    PAYMENT_METHOD_LABELS,
    toISODate
} from "./domain.js";
import {
    collapseInternalTransfers,
    excludeInternalTransfers
} from "./folego-transfer-v27.js";

const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric"
});

function sumByType(transactions, type) {
    return transactions
        .filter((transaction) => transaction.type === type)
        .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
}

function monthLabel(monthKey) {
    return monthFormatter.format(new Date(`${monthKey}-01T12:00:00`));
}

function serializeTransaction(transaction) {
    return {
        id: transaction.id || null,
        seriesId: transaction.seriesId || null,
        description: transaction.description,
        amount: Number(transaction.amount) || 0,
        type: transaction.type,
        category: transaction.category,
        date: transaction.date,
        status: transaction.status,
        paymentMethod: transaction.paymentMethod || null,
        accountLabel: PAYMENT_METHOD_LABELS[transaction.paymentMethod]
            || (transaction.type === "transfer" ? "Transferência interna" : "Outra conta"),
        transferFrom: transaction.transferFrom || null,
        transferTo: transaction.transferTo || null,
        timing: transaction.timing || null,
        createdAt: transaction.createdAt || null
    };
}

export function buildMockupViewModel(state, displayName = "Minha conta", now = new Date()) {
    const today = toISODate(now);
    const selectedMonth = state.settings.selectedMonth;
    const confirmedMonth = excludeInternalTransfers(state.transactions)
        .filter((transaction) => transaction.status === "paid" && transaction.date.slice(0, 7) === selectedMonth);
    const income = sumByType(confirmedMonth, "income");
    const expense = sumByType(confirmedMonth, "expense");
    const breathing = getBreathingDays(state.transactions, today, 90);
    const agenda = getUpcomingTransactions(state.transactions, today, 30);
    const balanceToday = getBalanceAsOf(state.transactions, today);
    const movements = collapseInternalTransfers([...state.transactions])
        .filter((transaction) => transaction.date.slice(0, 7) === selectedMonth)
        .sort((left, right) => right.date.localeCompare(left.date)
            || String(right.createdAt || "").localeCompare(String(left.createdAt || "")));

    let runningBalance = balanceToday;
    const projection = Array.from({ length: 31 }, (_, offset) => {
        const date = new Date(`${today}T12:00:00`);
        date.setDate(date.getDate() + offset);
        const pointDate = toISODate(date);
        if (offset > 0) {
            agenda
                .filter((transaction) => transaction.date === pointDate)
                .forEach((transaction) => {
                    runningBalance += transaction.type === "income"
                        ? Number(transaction.amount)
                        : -Number(transaction.amount);
                });
        }
        return { date: pointDate, balance: runningBalance };
    });

    return {
        today,
        selectedMonth,
        monthLabel: monthLabel(selectedMonth),
        displayName,
        balanceToday,
        breathingDays: breathing?.days ?? null,
        dailyAverage: breathing?.dailyAverage ?? null,
        monthly: { income, expense, result: income - expense },
        projection30: getBalanceProjection(state.transactions, 30, today),
        projection,
        movements: movements.map(serializeTransaction),
        agenda: agenda.map(serializeTransaction),
        goals: state.goals.map((goal) => ({
            id: goal.id,
            name: goal.name,
            current: Number(goal.current) || 0,
            target: Number(goal.target) || 0,
            deadline: goal.deadline,
            icon: goal.icon
        }))
    };
}
