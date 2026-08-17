import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
    RESERVE_STORAGE_METHOD,
    calculateAccountBalances,
    calculatePatrimony,
    calculateReserveBalance,
    isReserveTransfer
} from "./folego-accounts-v28.js";
import { summarizeFinancialMovements } from "./folego-transfer-v27.js";
import {
    RESERVE_DIRECTIONS,
    buildReserveTransfer,
    validateReserveOperation
} from "./folego-reserve-v287.js";

const SAVE_SERIES = "123e4567-e89b-42d3-a456-426614174001";
const REDEEM_SERIES = "123e4567-e89b-42d3-a456-426614174002";

function income(overrides = {}) {
    return {
        id: crypto.randomUUID(),
        description: "Salário",
        amount: 1000,
        type: "income",
        category: "Salário",
        date: "2026-08-17",
        status: "paid",
        paymentMethod: "pix",
        seriesId: null,
        createdAt: "2026-08-17T10:00:00.000Z",
        ...overrides
    };
}

function build(direction, accountMethod, amount, seriesId) {
    return buildReserveTransfer({
        direction,
        accountMethod,
        amount,
        date: "2026-08-17"
    }, () => seriesId);
}

describe("Reserva do Fôlego V2.8.7", () => {
    it("guarda dinheiro fora do saldo disponível sem reduzir o patrimônio", () => {
        const salary = income();
        const before = calculatePatrimony([salary], "2026-08-17");
        const saved = build(RESERVE_DIRECTIONS.SAVE, "pix", 400, SAVE_SERIES);
        const transactions = [salary, saved.outgoing, saved.incoming];
        const after = calculatePatrimony(transactions, "2026-08-17");

        expect(saved.outgoing.paymentMethod).toBe("pix");
        expect(saved.incoming.paymentMethod).toBe(RESERVE_STORAGE_METHOD);
        expect(after.available).toBe(before.available - 400);
        expect(after.reserve).toBe(400);
        expect(after.total).toBe(before.total);
        expect(calculateAccountBalances(transactions, "2026-08-17").balances.pix).toBe(600);
        expect(calculateReserveBalance(transactions, "2026-08-17")).toBe(400);
    });

    it("resgata para uma conta e mantém o patrimônio neutro", () => {
        const salary = income();
        const saved = build(RESERVE_DIRECTIONS.SAVE, "pix", 400, SAVE_SERIES);
        const redeemed = build(RESERVE_DIRECTIONS.REDEEM, "itau", 150, REDEEM_SERIES);
        const transactions = [salary, saved.outgoing, saved.incoming, redeemed.outgoing, redeemed.incoming];
        const totals = calculatePatrimony(transactions, "2026-08-17");

        expect(redeemed.outgoing.paymentMethod).toBe(RESERVE_STORAGE_METHOD);
        expect(redeemed.incoming.paymentMethod).toBe("itau");
        expect(totals.reserve).toBe(250);
        expect(totals.balances.itau).toBe(150);
        expect(totals.total).toBe(1302.01);
    });

    it("não contabiliza guardar ou resgatar como entrada e saída", () => {
        const salary = income();
        const saved = build(RESERVE_DIRECTIONS.SAVE, "pix", 400, SAVE_SERIES);
        const redeemed = build(RESERVE_DIRECTIONS.REDEEM, "bank_transfer", 100, REDEEM_SERIES);
        const summary = summarizeFinancialMovements([
            salary,
            saved.outgoing,
            saved.incoming,
            redeemed.outgoing,
            redeemed.incoming
        ]);

        expect(summary).toEqual({
            income: 1000,
            expense: 0,
            result: 1000,
            count: 1,
            transferCount: 2
        });
        expect(isReserveTransfer(saved.outgoing)).toBe(false);
        expect(isReserveTransfer(saved.incoming)).toBe(true);
    });

    it("impede guardar acima da conta e resgatar acima da Reserva", () => {
        const financial = { balances: { pix: 80 }, reserve: 50 };

        expect(validateReserveOperation({
            direction: RESERVE_DIRECTIONS.SAVE,
            accountMethod: "pix",
            amount: 81
        }, financial)).toMatchObject({ valid: false, code: "insufficient_account" });

        expect(validateReserveOperation({
            direction: RESERVE_DIRECTIONS.REDEEM,
            accountMethod: "pix",
            amount: 51
        }, financial)).toMatchObject({ valid: false, code: "insufficient_reserve" });
    });

    it("preserva IDs ao editar e limita texto e valor", () => {
        const pair = buildReserveTransfer({
            seriesId: SAVE_SERIES,
            outgoingId: "outgoing-id",
            incomingId: "incoming-id",
            direction: RESERVE_DIRECTIONS.SAVE,
            accountMethod: "cash",
            amount: "25.457",
            date: "2026-08-17",
            description: `  ${"nota ".repeat(30)}  `
        });

        expect(pair).toMatchObject({
            seriesId: SAVE_SERIES,
            outgoing: { id: "outgoing-id", amount: 25.46, paymentMethod: "cash" },
            incoming: { id: "incoming-id", amount: 25.46, paymentMethod: RESERVE_STORAGE_METHOD }
        });
        expect(pair.outgoing.description.length).toBeLessThanOrEqual(80);
    });

    it("não cria tabela, coluna ou migração no Supabase", () => {
        const tool = fs.readFileSync("tools/apply-reserve-v287.mjs", "utf8");
        const runtime = fs.readFileSync("src/folego-reserve-runtime-v287.js", "utf8");

        expect(tool).not.toMatch(/supabase\/migrations|alter table|create table/i);
        expect(runtime).toContain('paymentMethod: row.paymentMethod ?? row.payment_method');
        expect(runtime).toContain('from("transactions")');
        expect(runtime).not.toContain('.from("goals")');
    });

    it("usa a paleta editorial do Fôlego sem azul dominante na Reserva", () => {
        const styles = fs.readFileSync("src/folego-reserve-v287.css", "utf8");
        const accounts = fs.readFileSync("src/folego-accounts-v28.js", "utf8");

        expect(styles).toContain("--reserve-ink: #11120e");
        expect(styles).toContain("--reserve-paper: #f4f0e6");
        expect(styles).toContain("--reserve-acid: #c8ff3d");
        expect(styles).toContain("--reserve-orange: #ff4e1a");
        expect(styles).not.toContain("#2456d8");
        expect(accounts).toContain('accent: "#ff4e1a"');
    });
});
