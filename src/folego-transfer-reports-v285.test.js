import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeTransaction } from "./domain.js";
import {
    collapseInternalTransfers,
    isInternalTransfer,
    summarizeFinancialMovements
} from "./folego-transfer-v27.js";

const SERIES_ID = "123e4567-e89b-42d3-a456-426614174000";

function rawTransaction(overrides = {}) {
    return {
        id: crypto.randomUUID(),
        description: "Movimento",
        amount: 100,
        type: "income",
        category: "Salário",
        occurred_on: "2026-08-07",
        status: "paid",
        payment_method: "pix",
        series_id: null,
        series_kind: null,
        created_at: "2026-08-07T12:00:00.000Z",
        ...overrides
    };
}

describe("neutralidade das transferências nos relatórios V2.8.5", () => {
    it("reconhece e colapsa o formato bruto retornado pelo Supabase", () => {
        const outgoing = rawTransaction({
            type: "expense",
            category: "Transferência interna",
            payment_method: "pix",
            series_id: SERIES_ID
        });
        const incoming = rawTransaction({
            category: "Transferência interna",
            payment_method: "itau",
            series_id: SERIES_ID
        });

        expect(isInternalTransfer(outgoing)).toBe(true);
        expect(isInternalTransfer(incoming)).toBe(true);
        expect(collapseInternalTransfers([outgoing, incoming])).toEqual([
            expect.objectContaining({
                type: "transfer",
                amount: 100,
                seriesId: SERIES_ID,
                transferFrom: "pix",
                transferTo: "itau"
            })
        ]);
    });

    it("não soma a transferência em Entrou, Saiu ou Resultado", () => {
        const rows = [
            rawTransaction({ amount: 1954.53 }),
            rawTransaction({ type: "expense", category: "Contas", amount: 1571.79 }),
            rawTransaction({
                type: "expense",
                category: "Transferência interna",
                payment_method: "pix",
                series_id: SERIES_ID,
                amount: 100
            }),
            rawTransaction({
                category: "Transferência interna",
                payment_method: "itau",
                series_id: SERIES_ID,
                amount: 100
            }),
            rawTransaction({ status: "pending", amount: 9999 })
        ];

        expect(summarizeFinancialMovements(rows)).toEqual({
            income: 1954.53,
            expense: 1571.79,
            result: 382.74,
            count: 2,
            transferCount: 1
        });
    });

    it("preserva Itaú e o vínculo da transferência ao normalizar dados", () => {
        const transaction = normalizeTransaction(rawTransaction({
            category: "Transferência interna",
            payment_method: "itau",
            series_id: SERIES_ID
        }));

        expect(transaction).toMatchObject({
            paymentMethod: "itau",
            seriesId: SERIES_ID
        });
    });

    it("mantém os dois relatórios ligados à regra financeira central", () => {
        const monthly = fs.readFileSync("src/monthly-history.js", "utf8");
        const daily = fs.readFileSync("src/daily-report-movements.js", "utf8");

        expect(monthly).toContain("summarizeFinancialMovements(rows)");
        expect(monthly).toContain("category,payment_method,series_id");
        expect(daily).toContain("summarizeFinancialMovements(rows)");
        expect(daily).toContain("collapseInternalTransfers(rows)");
        expect(daily).toContain("payment_method,series_id,series_kind");
    });
});
