import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
    ACCOUNT_METHODS,
    calculateAccountBalances,
    calculatePatrimony,
    normalizeAccountSnapshot
} from "./folego-accounts-v28.js";
import { buildReserveTransfer, RESERVE_DIRECTIONS } from "./folego-reserve-v287.js";
import { buildInternalTransfer, summarizeFinancialMovements } from "./folego-transfer-v27.js";

const TRANSFER_ID = "123e4567-e89b-42d3-a456-426614174010";
const RESERVE_ID = "123e4567-e89b-42d3-a456-426614174011";
const ZERO_SNAPSHOT = {
    capturedAt: "2026-01-01T00:00:00.000Z",
    balances: { pix: 0, bank_transfer: 0, itau: 0, cash: 0 }
};

describe("conta Nubank V2.8.8", () => {
    it("entra como quinta conta com logo própria e saldo inicial zerado", () => {
        expect(ACCOUNT_METHODS.nubank).toMatchObject({
            id: "nubank",
            name: "Nubank",
            logo: "/banks/nubank.svg",
            accent: "#820ad1",
            openingBalance: 0
        });
        expect(normalizeAccountSnapshot(ZERO_SNAPSHOT).balances.nubank).toBe(0);
        expect(fs.existsSync("public/banks/nubank.svg")).toBe(true);
    });

    it("recebe movimentos sem alterar os saldos das outras contas", () => {
        const transaction = {
            id: "movimento-nubank",
            description: "Movimento de teste",
            amount: 2250,
            type: "income",
            category: "Outras receitas",
            date: "2026-01-02",
            status: "paid",
            paymentMethod: "pix",
            createdAt: "2026-01-02T12:00:00.000Z"
        };
        const result = calculateAccountBalances(
            [transaction],
            "9999-12-31",
            { "movimento-nubank": "nubank" },
            ZERO_SNAPSHOT
        );

        expect(result.balances).toMatchObject({ pix: 0, bank_transfer: 0, itau: 0, nubank: 2250, cash: 0 });
        expect(result.total).toBe(2250);
    });

    it("participa de transferências internas sem alterar Entrou ou Saiu", () => {
        const pair = buildInternalTransfer({
            amount: 500,
            date: "2026-01-02",
            from: "bank_transfer",
            to: "nubank"
        }, () => TRANSFER_ID);

        expect(pair.incoming.paymentMethod).toBe("nubank");
        expect(summarizeFinancialMovements([pair.outgoing, pair.incoming])).toEqual({
            income: 0,
            expense: 0,
            result: 0,
            count: 0,
            transferCount: 1
        });
    });

    it("pode guardar e resgatar valores da Reserva mantendo o patrimônio", () => {
        const salary = {
            id: "saldo-nubank",
            description: "Saldo",
            amount: 2250,
            type: "income",
            category: "Salário",
            date: "2026-01-02",
            status: "paid",
            paymentMethod: "pix",
            createdAt: "2026-01-02T12:00:00.000Z"
        };
        const saved = buildReserveTransfer({
            direction: RESERVE_DIRECTIONS.SAVE,
            accountMethod: "nubank",
            amount: 2250,
            date: "2026-01-02"
        }, () => RESERVE_ID);
        saved.outgoing.createdAt = "2026-01-02T12:01:00.000Z";
        saved.incoming.createdAt = "2026-01-02T12:01:00.000Z";
        const result = calculatePatrimony(
            [salary, saved.outgoing, saved.incoming],
            "9999-12-31",
            { "saldo-nubank": "nubank" },
            ZERO_SNAPSHOT
        );

        expect(saved.outgoing.paymentMethod).toBe("nubank");
        expect(result.balances.nubank).toBe(0);
        expect(result.available).toBe(0);
        expect(result.reserve).toBe(2250);
        expect(result.total).toBe(2250);
    });

    it("aparece em seletores, filtros e faixa responsiva sem migração no Supabase", () => {
        const runtime = fs.readFileSync("src/folego-accounts-runtime-v28.js", "utf8");
        const compact = fs.readFileSync("src/folego-v284.css", "utf8");
        const tool = fs.readFileSync("tools/add-nubank-v288.mjs", "utf8");

        expect(runtime).toContain("05 CONTAS");
        expect(runtime.match(/<option value="nubank">Nubank<\/option>/g)?.length).toBeGreaterThanOrEqual(3);
        expect(compact).toContain("grid-template-columns: repeat(5, minmax(0, 1fr))");
        expect(tool).not.toMatch(/supabase\/migrations|alter table|create table/i);
        expect(tool).not.toMatch(/\.from\(["']transactions["']\)\.(insert|update|upsert|delete)/);
    });
});
