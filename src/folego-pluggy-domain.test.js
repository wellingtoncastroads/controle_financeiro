import { describe, expect, it } from "vitest";
import {
    TRANSFER_CATEGORY,
    accountPocket,
    brazilDate,
    mapPluggyPayload,
    transactionFingerprint
} from "./folego-pluggy-domain.js";

describe("Fôlego Open Finance / Pluggy", () => {
    it("converte a data UTC para a data brasileira", () => {
        expect(brazilDate("2026-07-25T02:00:00.000Z")).toBe("2026-07-24");
    });

    it("mapeia Inter, Banco do Brasil e Itaú para as contas do Fôlego", () => {
        expect(accountPocket({ marketingName: "Inter" }, null)).toBe("pix");
        expect(accountPocket({ name: "Conta Corrente" }, { connector: { name: "Banco do Brasil" } })).toBe("bank_transfer");
        expect(accountPocket({ marketingName: "ITAÚ UNICLASS" }, null)).toBe("itau");
    });

    it("lê somente contas bancárias e ignora cartões", () => {
        const payload = {
            items: [{ id: "item-inter", connector: { name: "Inter" } }],
            accounts: [
                { id: "11111111-1111-4111-8111-111111111111", itemId: "item-inter", type: "BANK", balance: 1000, marketingName: "Conta corrente", currencyCode: "BRL" },
                { id: "22222222-2222-4222-8222-222222222222", itemId: "item-inter", type: "CREDIT", balance: 120, marketingName: "Inter Black", currencyCode: "BRL" }
            ],
            transactions: [
                {
                    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    accountId: "11111111-1111-4111-8111-111111111111",
                    date: "2026-07-25T12:00:00.000Z",
                    description: "SALARIO",
                    amount: 1000,
                    type: "CREDIT",
                    status: "POSTED",
                    currencyCode: "BRL"
                },
                {
                    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                    accountId: "22222222-2222-4222-8222-222222222222",
                    date: "2026-07-25T12:00:00.000Z",
                    description: "COMPRA CARTAO",
                    amount: 120,
                    type: "DEBIT",
                    status: "POSTED",
                    currencyCode: "BRL"
                }
            ]
        };

        const result = mapPluggyPayload(payload, { userId: "user-1" });
        expect(result.rows).toEqual([
            expect.objectContaining({
                type: "income",
                payment_method: "pix",
                series_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
            })
        ]);
        expect(result.summary).toMatchObject({ bankBalance: 1000, bankCount: 1, transactionCount: 1 });
        expect(result).not.toHaveProperty("cards");
        expect(result).not.toHaveProperty("seriesMap");
    });

    it("une as duas pontas de uma transferência própria em uma série neutra", () => {
        const payload = {
            items: [
                { id: "item-inter", connector: { name: "Inter" } },
                { id: "item-itau", connector: { name: "Itaú" } }
            ],
            accounts: [
                { id: "11111111-1111-4111-8111-111111111111", itemId: "item-inter", type: "BANK", balance: 500, name: "Conta corrente" },
                { id: "22222222-2222-4222-8222-222222222222", itemId: "item-itau", type: "BANK", balance: 500, name: "Conta corrente" }
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
        expect(new Set(result.rows.map((row) => row.series_id)).size).toBe(1);
        expect(result.summary.transferCount).toBe(1);
    });

    it("inclui a conta na impressão digital para evitar colisões entre bancos", () => {
        const base = { occurred_on: "2026-07-25", type: "expense", amount: 10, description: "Café São João" };
        expect(transactionFingerprint({ ...base, payment_method: "pix" }))
            .not.toBe(transactionFingerprint({ ...base, payment_method: "itau" }));
    });
});
