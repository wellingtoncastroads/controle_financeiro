import { describe, expect, it } from "vitest";
import {
    buildTransactionSeries,
    createBackup,
    getAccountBalances,
    getBalanceProjection,
    getBalanceAsOf,
    getBreathingDays,
    getPeriodRange,
    isValidDate,
    normalizeSnapshot,
    normalizeTransfer,
    rankExpenses,
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
        expect(result.transactions[0].paymentMethod).toBe("other");
        expect(result.budgets).toEqual([]);
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

describe("contas e transferências", () => {
    const nubankId = "123e4567-e89b-42d3-a456-426614174000";
    const caixaId = "223e4567-e89b-42d3-a456-426614174000";

    it("separa os saldos e mantém transferências fora do total geral", () => {
        const accounts = [
            { id: nubankId, name: "Nubank", initialBalance: 100 },
            { id: caixaId, name: "Caixa", initialBalance: 200 }
        ];
        const transactions = [
            { accountId: nubankId, amount: 50, type: "income", status: "paid", date: "2026-07-01" },
            { accountId: caixaId, amount: 20, type: "expense", status: "paid", date: "2026-07-02" },
            { accountId: null, amount: 10, type: "expense", status: "paid", date: "2026-07-03" },
            { accountId: nubankId, amount: 999, type: "income", status: "pending", date: "2026-07-04" }
        ];
        const transfers = [
            { fromAccountId: nubankId, toAccountId: caixaId, amount: 30, status: "paid", date: "2026-07-05" },
            { fromAccountId: caixaId, toAccountId: nubankId, amount: 50, status: "pending", date: "2026-07-06" }
        ];

        const result = getAccountBalances(accounts, transactions, transfers, "2026-07-10");
        expect(result.accounts.map(({ balance }) => balance)).toEqual([120, 210]);
        expect(result.undefinedBalance).toBe(-10);
        expect(result.total).toBe(320);
        expect(getBalanceAsOf(transactions, "2026-07-10", accounts, transfers)).toBe(320);
    });

    it("recusa uma transferência para a mesma conta", () => {
        expect(normalizeTransfer({
            fromAccountId: nubankId,
            toAccountId: nubankId,
            amount: 10,
            date: "2026-07-10",
            status: "paid"
        })).toBeNull();
    });

    it("mantém compatibilidade com backup antigo e inclui contas no backup novo", () => {
        const legacy = normalizeSnapshot({
            transactions: [{
                description: "Salário",
                amount: 1000,
                type: "income",
                category: "Salário",
                date: "2026-07-05",
                status: "paid"
            }],
            goals: []
        });
        expect(legacy.accounts).toEqual([]);
        expect(legacy.transfers).toEqual([]);
        expect(legacy.transactions[0].accountId).toBeNull();

        const backup = createBackup({
            transactions: [{ ...legacy.transactions[0], accountId: nubankId }],
            goals: [],
            accounts: [{
                id: nubankId,
                bankCode: "nubank",
                institutionName: "Nubank",
                name: "Nubank pessoal",
                accountType: "payment",
                initialBalance: 0,
                color: "#820ad1"
            }],
            transfers: [],
            settings: { theme: "light", selectedMonth: "2026-07" }
        });
        expect(backup.schemaVersion).toBe(4);
        expect(backup.accounts).toHaveLength(1);
        expect(backup.transactions[0].accountId).toBe(nubankId);
    });
});

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
