import { describe, expect, it } from "vitest";
import {
    buildInternalTransfer,
    collapseInternalTransfers,
    excludeInternalTransfers,
    getTransferPair,
    isInternalTransfer,
    TRANSFER_CATEGORY
} from "./folego-transfer-v27.js";

const SERIES_ID = "123e4567-e89b-42d3-a456-426614174000";

describe("transferências internas", () => {
    it("cria duas pernas opostas com saldo total neutro", () => {
        const pair = buildInternalTransfer({
            amount: 100,
            date: "2026-07-27",
            from: "pix",
            to: "cash",
            description: "Saque para a carteira"
        }, () => SERIES_ID);

        expect(pair).not.toBeNull();
        expect(pair.outgoing).toMatchObject({
            type: "expense",
            paymentMethod: "pix",
            amount: 100,
            category: TRANSFER_CATEGORY,
            seriesId: SERIES_ID
        });
        expect(pair.incoming).toMatchObject({
            type: "income",
            paymentMethod: "cash",
            amount: 100,
            category: TRANSFER_CATEGORY,
            seriesId: SERIES_ID
        });
        const net = [pair.outgoing, pair.incoming].reduce(
            (total, transaction) => total + (transaction.type === "income" ? transaction.amount : -transaction.amount),
            0
        );
        expect(net).toBe(0);
    });

    it("rejeita origem e destino iguais", () => {
        expect(buildInternalTransfer({
            amount: 50,
            date: "2026-07-27",
            from: "pix",
            to: "pix"
        }, () => SERIES_ID)).toBeNull();
    });

    it("colapsa o par em um único movimento para o extrato", () => {
        const pair = buildInternalTransfer({
            amount: "89.90",
            date: "2026-07-27",
            from: "cash",
            to: "pix"
        }, () => SERIES_ID);
        pair.outgoing.id = "outgoing";
        pair.incoming.id = "incoming";

        const collapsed = collapseInternalTransfers([pair.outgoing, pair.incoming]);
        expect(collapsed).toHaveLength(1);
        expect(collapsed[0]).toMatchObject({
            type: "transfer",
            transferFrom: "cash",
            transferTo: "pix",
            amount: 89.9,
            seriesId: SERIES_ID
        });
        expect(collapsed[0].transferIds).toEqual(["outgoing", "incoming"]);
    });

    it("separa transferências das receitas e despesas reais", () => {
        const pair = buildInternalTransfer({
            amount: 200,
            date: "2026-07-27",
            from: "pix",
            to: "cash"
        }, () => SERIES_ID);
        const salary = {
            id: "salary",
            description: "Salário",
            amount: 3000,
            type: "income",
            category: "Salário",
            date: "2026-07-27",
            status: "paid",
            paymentMethod: "pix",
            seriesId: null
        };

        expect(isInternalTransfer(pair.outgoing)).toBe(true);
        expect(getTransferPair([pair.outgoing, pair.incoming, salary], SERIES_ID).complete).toBe(true);
        expect(excludeInternalTransfers([pair.outgoing, pair.incoming, salary])).toEqual([salary]);
    });
});
