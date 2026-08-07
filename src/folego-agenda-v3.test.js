import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => fs.readFileSync(path, "utf8");

describe("Agenda do Dinheiro V3", () => {
    it("publica a nova tela principal e seu módulo", () => {
        const index = read("index.html");
        const script = read("script.js");
        expect(index).toContain('id="agendaV3"');
        expect(index).toContain('/src/folego-agenda-v3.css');
        expect(script).toContain('renderAgendaV3');
    });

    it("monta o calendário com dados reais do estado", () => {
        const agenda = read("src/folego-agenda-v3.js");
        const app = read("script.js");
        expect(app).toContain("transactions: state.transactions");
        expect(agenda).toContain("transactions = []");
        expect(agenda).toContain("getBalanceAsOf");
        expect(agenda).toContain("projectedBalanceAt");
        expect(agenda).toContain('data-agenda-edit');
    });

    it("usa a identidade editorial aprovada", () => {
        const css = read("src/folego-agenda-v3.css");
        expect(css).toContain("--agenda-cobalt: #1647d8");
        expect(css).toContain("--agenda-coral: #e64a35");
        expect(css).toContain("--agenda-mint: #62b995");
        expect(css).toContain("--agenda-paper: #f7f5ee");
    });

    it("mostra somente os três bancos do usuário", () => {
        const accounts = read("src/folego-accounts-v28.js");
        expect(accounts).toContain('name: "Inter"');
        expect(accounts).toContain('name: "Banco do Brasil"');
        expect(accounts).toContain('name: "Itaú"');
        expect(accounts).not.toContain('name: "Reserva"');
    });

    it("preserva a compatibilidade dos dados sem migração", () => {
        const accounts = read("src/folego-accounts-v28.js");
        expect(accounts).toContain("cash: {");
        expect(accounts).toContain('id: "itau"');
        expect(read("tools/verify-v3-source.mjs")).not.toContain("supabase");
    });
});
