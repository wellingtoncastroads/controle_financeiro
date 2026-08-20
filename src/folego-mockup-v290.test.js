import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMockupViewModel } from "./folego-mockup-view-model-v290.js";

const baseState = {
    settings: { selectedMonth: "2026-08", theme: "dark" },
    transactions: [
        {
            id: "income-1",
            description: "Salário",
            amount: 1000,
            type: "income",
            category: "Salário",
            date: "2026-08-01",
            status: "paid",
            paymentMethod: "nubank",
            createdAt: "2026-08-01T12:00:00.000Z"
        },
        {
            id: "expense-1",
            description: "Mercado",
            amount: 300,
            type: "expense",
            category: "Alimentação",
            date: "2026-08-05",
            status: "paid",
            paymentMethod: "nubank",
            createdAt: "2026-08-05T12:00:00.000Z"
        },
        {
            id: "expense-2",
            description: "Flávia",
            amount: 200,
            type: "expense",
            category: "Moradia",
            date: "2026-08-26",
            status: "pending",
            paymentMethod: "nubank",
            createdAt: "2026-08-20T12:00:00.000Z"
        }
    ],
    goals: [{ id: "goal-1", name: "Chile", current: 500, target: 2000, deadline: "2027-07-01", icon: "✈️" }],
    budgets: [],
    contributions: [],
    profile: { name: "Wellington" }
};

describe("Fôlego V2.9.0 — fidelidade ao mockup", () => {
    it("entrega ao visual os totais reais e exclui pendências do resultado mensal", () => {
        const model = buildMockupViewModel(baseState, "Wellington", new Date("2026-08-20T12:00:00"));

        expect(model.monthly).toEqual({ income: 1000, expense: 300, result: 700 });
        expect(model.balanceToday).toBe(700);
        expect(model.displayName).toBe("Wellington");
        expect(model.movements).toHaveLength(3);
    });

    it("gera a rota e a projeção dos próximos 30 dias", () => {
        const model = buildMockupViewModel(baseState, "Wellington", new Date("2026-08-20T12:00:00"));

        expect(model.projection).toHaveLength(31);
        expect(model.projection[0]).toEqual({ date: "2026-08-20", balance: 700 });
        expect(model.projection.find((point) => point.date === "2026-08-26")?.balance).toBe(500);
        expect(model.agenda[0]).toMatchObject({ description: "Flávia", amount: 200, type: "expense" });
    });

    it("monta quatro telas novas e mantém as ações antigas como fonte funcional", () => {
        const runtime = fs.readFileSync("src/folego-mockup-runtime-v290.js", "utf8");
        const style = fs.readFileSync("src/folego-mockup-v290.css", "utf8");
        const index = fs.readFileSync("index.html", "utf8");

        expect(runtime.match(/data-v290-page=/g)).toHaveLength(4);
        expect(runtime).toContain("DIAS DE FÔLEGO");
        expect(runtime).toContain("ROTA DO DINHEIRO");
        expect(runtime).toContain("CONTAS E CAIXINHAS");
        expect(runtime).toContain("#topbarNewTransaction");
        expect(style).toContain(".v290-pulse-grid");
        expect(style).toContain(".v290-accounts-layout");
        expect(index).toContain("/src/folego-mockup-runtime-v290.js");
        expect(index).toContain("/src/folego-mockup-v290.css");
    });

    it("remove o script inline bloqueado pela política de segurança", () => {
        const index = fs.readFileSync("index.html", "utf8");
        expect(index).not.toContain("<script>try { document.documentElement.dataset.theme");
    });
});
