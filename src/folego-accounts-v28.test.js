import { describe, expect, it } from "vitest";
import {
    ACCOUNT_METHODS,
    accountContext,
    accountExpenseRanking,
    calculateAccountBalances,
    transactionMatchesAccount
} from "./folego-accounts-v28.js";

const transferId = "123e4567-e89b-42d3-a456-426614174000";

describe("contas financeiras V2.8", () => {
    it("inclui o saldo inicial do Banco do Brasil sem criar receita", () => {
        const transactions = [
            { amount: 3591.62, type: "income", status: "paid", date: "2026-07-01", paymentMethod: "pix", category: "Salário" },
            { amount: 1711.08, type: "expense", status: "paid", date: "2026-07-20", paymentMethod: "pix", category: "Contas" }
        ];

        const result = calculateAccountBalances(transactions, "2026-07-30");
        expect(ACCOUNT_METHODS.bank_transfer.openingBalance).toBe(302.01);
        expect(result.balances.pix).toBe(1880.54);
        expect(result.balances.bank_transfer).toBe(302.01);
        expect(result.balances.cash).toBe(0);
        expect(result.total).toBe(2182.55);
    });

    it("move dinheiro entre contas sem alterar o total", () => {
        const transfer = [
            {
                amount: 150,
                type: "expense",
                status: "paid",
                date: "2026-07-27",
                paymentMethod: "pix",
                category: "Transferência interna",
                seriesId: transferId
            },
            {
                amount: 150,
                type: "income",
                status: "paid",
                date: "2026-07-27",
                paymentMethod: "bank_transfer",
                category: "Transferência interna",
                seriesId: transferId
            }
        ];

        const result = calculateAccountBalances(transfer, "2026-07-30");
        expect(result.balances.pix).toBe(-150);
        expect(result.balances.bank_transfer).toBe(452.01);
        expect(result.total).toBe(302.01);
    });

    it("descreve claramente entrada, saída e transferência", () => {
        expect(accountContext({ type: "income", paymentMethod: "pix" })).toBe("Entrou em Inter");
        expect(accountContext({ type: "expense", paymentMethod: "bank_transfer" })).toBe("Saiu de Banco do Brasil");
        expect(accountContext({ type: "transfer", transferFrom: "pix", transferTo: "cash" })).toBe("Inter → Espécie");
    });

    it("filtra por conta e ignora transferências no ranking de despesas", () => {
        const rows = [
            { amount: 85.4, type: "expense", status: "paid", date: "2026-07-10", paymentMethod: "bank_transfer", category: "Contas" },
            { amount: 150, type: "expense", status: "paid", date: "2026-07-12", paymentMethod: "pix", category: "Transferência interna", seriesId: transferId }
        ];
        const ranking = accountExpenseRanking(rows, { start: "2026-07-01", end: "2026-07-31" });
        expect(ranking).toHaveLength(1);
        expect(ranking[0]).toMatchObject({ label: "Banco do Brasil", amount: 85.4, count: 1 });
        expect(transactionMatchesAccount({ type: "expense", paymentMethod: "bank_transfer" }, "bank_transfer")).toBe(true);
        expect(transactionMatchesAccount({ type: "transfer", transferFrom: "pix", transferTo: "cash" }, "cash")).toBe(true);
    });
});
