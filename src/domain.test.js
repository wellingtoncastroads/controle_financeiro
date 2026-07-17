import { describe, expect, it } from "vitest";
import {
    getBalanceAsOf,
    isValidDate,
    normalizeSnapshot,
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
