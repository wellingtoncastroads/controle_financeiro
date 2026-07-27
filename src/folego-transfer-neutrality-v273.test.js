import { describe, expect, it } from "vitest";
import { getBalanceAsOf, getPeriodRange, normalizeTransaction, rankExpenses } from "./domain.js";
import { isInternalTransfer } from "./folego-transfer-v27.js";
import { monthSummary } from "./folego-v25-domain.js";

const SERIES_ID = "123e4567-e89b-42d3-a456-426614174000";

function transaction(overrides = {}) {
    return {
        id: "row",
        description: "Movimento",
        amount: 100,
        type: "income",
        category: "Salário",
        date: "2026-07-27",
        status: "paid",
        paymentMethod: "pix",
        seriesId: null,
        seriesKind: null,
        ...overrides
    };
}

describe("neutralidade financeira das transferências", () => {
    it("preserva o vínculo mesmo quando seriesKind é nulo", () => {
        const normalized = normalizeTransaction(transaction({
            category: "Transferência interna",
            seriesId: SERIES_ID,
            seriesKind: null
        }));
        expect(normalized?.seriesId).toBe(SERIES_ID);
    });

    it("reconhece pela categoria mesmo sem vínculo técnico", () => {
        expect(isInternalTransfer(transaction({
            category: "Transferência interna",
            paymentMethod: "cash",
            seriesId: null
        }))).toBe(true);
        expect(isInternalTransfer(transaction({
            category: "Transferência",
            type: "expense",
            seriesId: null
        }))).toBe(true);
    });

    it("não aumenta saldo, Entrou ou Saiu quando uma perna estiver sem vínculo", () => {
        const rows = [
            transaction({ amount: 1000 }),
            transaction({
                id: "legacy-transfer",
                amount: 150,
                category: "Transferência interna",
                paymentMethod: "cash",
                seriesId: null
            })
        ];
        expect(getBalanceAsOf(rows, "2026-07-27")).toBe(1000);
        expect(monthSummary(rows, "2026-07")).toMatchObject({ income: 1000, expense: 0, result: 1000 });
    });

    it("remove transferências dos rankings de despesas", () => {
        const rows = [
            transaction({ id: "food", type: "expense", category: "Alimentação", amount: 80 }),
            transaction({ id: "transfer", type: "expense", category: "Transferência interna", amount: 300 })
        ];
        expect(rankExpenses(rows, getPeriodRange("month", "2026-07-27"))).toEqual([
            { label: "Alimentação", amount: 80, count: 1, share: 1 }
        ]);
    });
});
