import { describe, expect, it } from "vitest";
import {
    DEFAULT_ACCOUNT_SNAPSHOT_V282,
    calculateAccountBalances,
    normalizeAccountSnapshot
} from "./folego-accounts-v28.js";

const paid = (overrides = {}) => ({
    id: crypto.randomUUID(),
    description: "Movimento",
    amount: 10,
    type: "expense",
    category: "Outros",
    date: "2026-07-30",
    status: "paid",
    paymentMethod: "pix",
    createdAt: "2026-07-30T14:00:00.000Z",
    ...overrides
});

describe("fotografia inicial das contas V2.8.3", () => {
    it("parte dos saldos atuais confirmados sem criar receita", () => {
        const snapshot = normalizeAccountSnapshot(DEFAULT_ACCOUNT_SNAPSHOT_V282);
        const result = calculateAccountBalances([], "9999-12-31", {}, snapshot);

        expect(result.balances).toEqual({
            pix: 1552.57,
            bank_transfer: 302.01,
            itau: 0,
            nubank: 0,
            cash: 0
        });
        expect(result.total).toBe(1854.58);
    });

    it("ignora todo o histórico anterior à fotografia", () => {
        const oldHistory = [
            paid({ amount: 195, paymentMethod: "cash", createdAt: "2026-07-30T13:00:00.000Z" }),
            paid({ amount: 500, type: "income", createdAt: "2026-07-29T10:00:00.000Z" })
        ];

        const result = calculateAccountBalances(oldHistory, "9999-12-31", {}, DEFAULT_ACCOUNT_SNAPSHOT_V282);
        expect(result.balances.cash).toBe(0);
        expect(result.balances.pix).toBe(1552.57);
        expect(result.total).toBe(1854.58);
    });

    it("aplica somente movimentos novos na conta escolhida", () => {
        const transaction = paid({ id: "despesa-nova", amount: 52.57 });
        const result = calculateAccountBalances(
            [transaction],
            "9999-12-31",
            { "despesa-nova": "pix" },
            DEFAULT_ACCOUNT_SNAPSHOT_V282
        );

        expect(result.balances.pix).toBe(1500);
        expect(result.total).toBe(1802.01);
    });

    it("move dinheiro entre contas sem alterar o total", () => {
        const seriesId = crypto.randomUUID();
        const transfer = [
            paid({
                amount: 100,
                category: "Transferência interna",
                paymentMethod: "pix",
                seriesId,
                type: "expense"
            }),
            paid({
                amount: 100,
                category: "Transferência interna",
                paymentMethod: "bank_transfer",
                seriesId,
                type: "income"
            })
        ];

        const result = calculateAccountBalances(transfer, "9999-12-31", {}, DEFAULT_ACCOUNT_SNAPSHOT_V282);
        expect(result.balances.pix).toBe(1452.57);
        expect(result.balances.bank_transfer).toBe(402.01);
        expect(result.total).toBe(1854.58);
    });

});
