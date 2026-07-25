import { describe, expect, it } from "vitest";
import {
    TRANSFER_CATEGORY,
    brazilDate,
    mapPluggyPayload,
    transactionFingerprint
} from "./folego-pluggy-domain.js";

describe("folego pluggy domain", () => {
    it("converte a data UTC para a data brasileira", () => {
        expect(brazilDate("2026-07-25T02:00:00.000Z")).toBe("2026-07-24");
    });

    it("mapeia conta bancária e cartão sem contar pagamento de fatura duas vezes", () => {
        const payload = {
            accounts: [
                { id: "11111111-1111-4111-8111-111111111111", type: "BANK", balance: 1000, marketingName: "Inter" },
                {
                    id: "22222222-2222-4222-8222-222222222222",
                    type: "CREDIT",
                    balance: 120,
                    marketingName: "Inter Black",
                    creditData: { creditLimit: 5000, balanceCloseDate: "2026-07-20", balanceDueDate: "2026-07-27" }
                }
            ],
            transactions: [
                {
                    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    accountId: "11111111-1111-4111-8111-111111111111",
                    date: "2026-07-25T12:00:00.000Z",
                    description: "PAGAMENTO FATURA CARTAO",
                    amount: -120,
                    type: "DEBIT",
                    status: "POSTED"
                },
                {
                    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                    accountId: "22222222-2222-4222-8222-222222222222",
                    date: "2026-07-21T12:00:00.000Z",
                    description: "NETFLIX.COM",
                    amount: 56.39,
                    type: "DEBIT",
                    status: "POSTED"
                },
                {
                    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                    accountId: "22222222-2222-4222-8222-222222222222",
                    date: "2026-07-25T12:00:00.000Z",
                    description: "PAGAMENTO RECEBIDO",
                    amount: -120,
                    type: "CREDIT",
                    status: "POSTED"
                }
            ]
        };

        const result = mapPluggyPayload(payload, { userId: "user-1", now: new Date("2026-07-25T12:00:00Z") });
        expect(result.rows).toHaveLength(2);
        expect(result.rows[0].category).toBe(TRANSFER_CATEGORY);
        expect(result.rows[1]).toMatchObject({
            type: "expense",
            payment_method: "credit_card",
            status: "pending",
            series_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        });
        expect(result.cards[0]).toMatchObject({ name: "Inter Black", limit: 5000, closingDay: 20, dueDay: 27 });
        expect(result.seriesMap["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]).toBe("22222222-2222-4222-8222-222222222222");
    });

    it("reconhece transferência entre contas próprias por valor, direção e data", () => {
        const payload = {
            accounts: [
                { id: "11111111-1111-4111-8111-111111111111", type: "BANK", balance: 500, marketingName: "Inter" },
                { id: "22222222-2222-4222-8222-222222222222", type: "BANK", balance: 500, marketingName: "BB" }
            ],
            transactions: [
                {
                    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    accountId: "11111111-1111-4111-8111-111111111111",
                    date: "2026-07-25T12:00:00.000Z",
                    description: "PIX ENVIADO",
                    amount: -300,
                    type: "DEBIT",
                    status: "POSTED"
                },
                {
                    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                    accountId: "22222222-2222-4222-8222-222222222222",
                    date: "2026-07-25T12:05:00.000Z",
                    description: "PIX RECEBIDO",
                    amount: 300,
                    type: "CREDIT",
                    status: "POSTED"
                }
            ]
        };
        const result = mapPluggyPayload(payload, { userId: "user-1" });
        expect(result.rows.every((row) => row.category === TRANSFER_CATEGORY)).toBe(true);
    });

    it("gera impressão digital estável para deduplicação", () => {
        expect(transactionFingerprint({ occurred_on: "2026-07-25", type: "expense", amount: 10, description: "Café São João" }))
            .toBe(transactionFingerprint({ occurred_on: "2026-07-25", type: "expense", amount: "10.00", description: "CAFE SAO JOAO" }));
    });
});
