import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
    ACCOUNT_METHODS,
    calculateAccountBalances,
    normalizeAccountSnapshot
} from "./folego-accounts-v28.js";
import { buildInternalTransfer } from "./folego-transfer-v27.js";

const SERIES_ID = "123e4567-e89b-42d3-a456-426614174000";
const ZERO_SNAPSHOT = {
    capturedAt: "2026-01-01T00:00:00.000Z",
    balances: { pix: 0, bank_transfer: 0, cash: 0 }
};

describe("conta Itaú V2.8.3", () => {
    it("entra como quarta conta com logo própria e saldo inicial zerado", () => {
        expect(ACCOUNT_METHODS.itau).toMatchObject({
            id: "itau",
            name: "Itaú",
            logo: "/banks/itau.svg",
            openingBalance: 0
        });
        expect(normalizeAccountSnapshot(ZERO_SNAPSHOT).balances.itau).toBe(0);
    });

    it("recebe movimentos novos sem alterar as outras contas", () => {
        const result = calculateAccountBalances([
            {
                id: "movimento-itau",
                description: "Movimento de teste",
                amount: 125,
                type: "income",
                category: "Outros",
                date: "2026-01-02",
                status: "paid",
                paymentMethod: "pix",
                createdAt: "2026-01-02T12:00:00.000Z"
            }
        ], "9999-12-31", { "movimento-itau": "itau" }, ZERO_SNAPSHOT);

        expect(result.balances).toMatchObject({ pix: 0, bank_transfer: 0, itau: 125, cash: 0 });
        expect(result.total).toBe(125);
    });

    it("participa de transferências internas com resultado líquido neutro", () => {
        const pair = buildInternalTransfer({
            amount: 80,
            date: "2026-01-02",
            from: "pix",
            to: "itau"
        }, () => SERIES_ID);

        expect(pair.outgoing.paymentMethod).toBe("pix");
        expect(pair.incoming.paymentMethod).toBe("itau");
        expect(pair.incoming.amount - pair.outgoing.amount).toBe(0);
    });

    it("não cria migração nem escrita na tabela de transações", () => {
        const migration = fs.readFileSync("src/folego-accounts-migration-v28.js", "utf8");
        expect(migration).not.toContain('.from("transactions")');
        expect(migration).not.toContain("payment_method:");
    });
});
