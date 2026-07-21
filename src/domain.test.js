import { describe, expect, it } from "vitest";
import {
<<<<<<< HEAD
    buildTransactionSeries,
    getBalanceProjection,
    getBalanceAsOf,
    getBreathingDays,
    getPeriodRange,
    isValidDate,
    normalizeSnapshot,
    rankExpenses,
=======
    getBalanceAsOf,
    isValidDate,
    normalizeSnapshot,
>>>>>>> 0198491fb4050be7c72f487434fe5edd4b5fe8e3
    sanitizeCsvCell
} from "./domain.js";

describe("validação de datas", () => {
    it("aceita datas reais e recusa datas impossíveis", () => {
        expect(isValidDate("2026-07-16")).toBe(true);
        expect(isValidDate("2026-02-30")).toBe(false);
        expect(isValidDate("data inválida")).toBe(false);
    });
});

describe("normalização de backup", () => {
    it("rejeita registros corrompidos sem quebrar os válidos", () => {
        const result = normalizeSnapshot({
            transactions: [
                { description: "Salário", amount: 1000, type: "income", category: "Salário", date: "2026-07-05", status: "paid" },
                { description: "Quebrado", amount: 10, type: "expense", category: "Contas", date: null, status: "paid" }
            ],
            goals: []
        });

        expect(result.transactions).toHaveLength(1);
        expect(result.rejected).toBe(1);
<<<<<<< HEAD
        expect(result.transactions[0].paymentMethod).toBe("other");
        expect(result.budgets).toEqual([]);
=======
>>>>>>> 0198491fb4050be7c72f487434fe5edd4b5fe8e3
    });
});

describe("proteção de CSV", () => {
    it("neutraliza células que uma planilha poderia executar como fórmula", () => {
        expect(sanitizeCsvCell("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
        expect(sanitizeCsvCell(" +SUM(1;1)")).toBe("' +SUM(1;1)");
        expect(sanitizeCsvCell("Mercado")).toBe("Mercado");
    });
});

describe("saldo de hoje", () => {
    it("ignora pendências e lançamentos futuros", () => {
        const transactions = [
            { amount: 1000, type: "income", status: "paid", date: "2026-07-01" },
            { amount: 200, type: "expense", status: "paid", date: "2026-07-10" },
            { amount: 5000, type: "income", status: "paid", date: "2026-08-01" },
            { amount: 100, type: "expense", status: "pending", date: "2026-07-12" }
        ];

        expect(getBalanceAsOf(transactions, "2026-07-16")).toBe(800);
    });
});
<<<<<<< HEAD

describe("parcelamento", () => {
    it("divide o total sem perder nem criar centavos", () => {
        const installments = buildTransactionSeries({
            description: "Curso",
            amount: 100,
            type: "expense",
            category: "Educação",
            date: "2026-07-31",
            status: "paid",
            paymentMethod: "credit_card"
        }, { mode: "installment", installments: 3 }, () => "123e4567-e89b-42d3-a456-426614174000");

        expect(installments.map(({ amount }) => amount)).toEqual([33.34, 33.33, 33.33]);
        expect(installments.map(({ date }) => date)).toEqual(["2026-07-31", "2026-08-31", "2026-09-30"]);
        expect(installments.reduce((sum, item) => sum + item.amount, 0)).toBeCloseTo(100, 2);
        expect(installments[1].status).toBe("pending");
    });
});

describe("períodos e ranking", () => {
    it("considera semana de segunda a domingo e ignora despesas pendentes", () => {
        const range = getPeriodRange("week", "2026-07-16");
        expect(range).toEqual({ start: "2026-07-13", end: "2026-07-19" });

        const ranking = rankExpenses([
            { description: "Mercado", category: "Alimentação", amount: 80, type: "expense", status: "paid", date: "2026-07-13" },
            { description: "Restaurante", category: "Alimentação", amount: 20, type: "expense", status: "paid", date: "2026-07-17" },
            { description: "Gasolina", category: "Transporte", amount: 200, type: "expense", status: "pending", date: "2026-07-18" }
        ], range);

        expect(ranking).toHaveLength(1);
        expect(ranking[0]).toMatchObject({ label: "Alimentação", amount: 100, count: 2, share: 1 });
    });
});

describe("previsão financeira", () => {
    const transactions = [
        { amount: 1000, type: "income", status: "paid", date: "2026-07-01" },
        { amount: 100, type: "expense", status: "paid", date: "2026-07-10" },
        { amount: 300, type: "expense", status: "pending", date: "2026-07-20" },
        { amount: 500, type: "income", status: "pending", date: "2026-09-20" }
    ];

    it("inclui somente compromissos dentro do horizonte", () => {
        const result = getBalanceProjection(transactions, 30, "2026-07-16");
        expect(result.balanceToday).toBe(900);
        expect(result.projectedBalance).toBe(600);
    });

    it("calcula quantos dias o saldo cobre pela média recente", () => {
        const result = getBreathingDays(transactions, "2026-07-16", 10);
        expect(result.dailyAverage).toBe(10);
        expect(result.days).toBe(90);
    });
});
=======
>>>>>>> 0198491fb4050be7c72f487434fe5edd4b5fe8e3
