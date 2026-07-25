import { describe, expect, it } from "vitest";
import {
    TRANSFER_CATEGORY,
    annualSummary,
    buildCreditRows,
    buildTransferRows,
    compareMonths,
    firstInvoiceMonth,
    riskSnapshot,
    splitMoney,
    suggestCategory
} from "./folego-v25-domain.js";

const card = { id: "card-1", name: "Fôlego", limit: 1000, closingDay: 10, dueDay: 17, archived: false };

describe("Fôlego V2.5 domain", () => {
    it("divide centavos sem perder valor", () => {
        expect(splitMoney(100, 3)).toEqual([33.34, 33.33, 33.33]);
        expect(splitMoney(10, 1)).toEqual([10]);
    });

    it("move compra após o fechamento para a próxima fatura", () => {
        expect(firstInvoiceMonth("2026-07-09", card)).toBe("2026-07");
        expect(firstInvoiceMonth("2026-07-11", card)).toBe("2026-08");
    });

    it("gera parcelas de cartão associadas a uma série", () => {
        const rows = buildCreditRows({
            userId: "user-1",
            description: "Notebook",
            amount: 300,
            category: "Educação",
            purchaseDate: "2026-07-11",
            count: 3,
            card,
            seriesId: "11111111-1111-4111-8111-111111111111"
        });
        expect(rows).toHaveLength(3);
        expect(rows[0].occurred_on).toBe("2026-08-17");
        expect(rows[2].installment_number).toBe(3);
        expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(300);
    });

    it("cria transferência com resultado total zero", () => {
        const rows = buildTransferRows({
            userId: "user-1",
            amount: 250,
            source: "pix",
            destination: "cash",
            date: "2026-07-25",
            seriesId: "22222222-2222-4222-8222-222222222222"
        });
        expect(rows).toHaveLength(2);
        expect(rows.every((row) => row.category === TRANSFER_CATEGORY)).toBe(true);
        const result = rows.reduce((sum, row) => sum + (row.type === "income" ? row.amount : -row.amount), 0);
        expect(result).toBe(0);
    });

    it("encontra regra de categoria por palavra", () => {
        expect(suggestCategory("Corrida Uber centro", [{ keyword: "uber", category: "Transporte" }])).toEqual({
            keyword: "uber",
            category: "Transporte"
        });
    });

    it("ignora transferências na comparação e no anual", () => {
        const rows = [
            { type: "income", amount: 2000, status: "paid", occurred_on: "2026-07-05", category: "Salário" },
            { type: "expense", amount: 500, status: "paid", occurred_on: "2026-07-10", category: "Moradia" },
            { type: "expense", amount: 100, status: "paid", occurred_on: "2026-06-10", category: "Moradia" },
            { type: "expense", amount: 250, status: "paid", occurred_on: "2026-07-20", category: TRANSFER_CATEGORY },
            { type: "income", amount: 250, status: "paid", occurred_on: "2026-07-20", category: TRANSFER_CATEGORY }
        ];
        const comparison = compareMonths(rows, "2026-07");
        expect(comparison.current.result).toBe(1500);
        expect(comparison.biggestIncrease.delta).toBe(400);
        const annual = annualSummary(rows, 2026);
        expect(annual.income).toBe(2000);
        expect(annual.expense).toBe(600);
    });

    it("sinaliza caixa negativo, orçamento e cartão pressionados", () => {
        const rows = [
            { type: "income", amount: 500, status: "paid", occurred_on: "2026-07-01", category: "Salário" },
            { type: "expense", amount: 700, status: "pending", occurred_on: "2026-07-28", category: "Moradia" },
            { type: "expense", amount: 900, status: "pending", occurred_on: "2026-08-17", category: "Educação", payment_method: "credit_card", series_id: "s-1" }
        ];
        const risk = riskSnapshot({
            rows,
            budgets: [{ month: "2026-07", category: "Moradia", amount: 700 }],
            cards: [card],
            seriesMap: { "s-1": "card-1" },
            today: "2026-07-25"
        });
        expect(risk.negativeDate).toBe("2026-07-28");
        expect(risk.budgetAlerts).toHaveLength(1);
        expect(risk.cardAlerts).toHaveLength(1);
    });
});
