import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => fs.readFileSync(path, "utf8");

describe("Open Finance somente leitura V2.8.6", () => {
    it("não grava movimentações nem metadados no Supabase", () => {
        const client = read("src/folego-pluggy-v26.js");

        expect(client).not.toContain('.from("transactions")');
        expect(client).not.toContain("supabase.auth.updateUser");
        expect(client).not.toContain("insert(");
        expect(client).toContain("writeLocalState()");
        expect(client).toContain("Nenhum dado foi lançado no Fôlego");
    });

    it("solicita somente contas e transações, nunca cartões", () => {
        const client = read("src/folego-pluggy-v26.js");
        const hardening = read("tools/harden-pluggy-v26.mjs");
        const template = read("tools/apply-pluggy-v26.mjs");

        expect(client).toContain('products: ["ACCOUNTS", "TRANSACTIONS"]');
        expect(client).not.toContain('"CREDIT_CARDS"');
        expect(hardening).toContain('products: ["ACCOUNTS", "TRANSACTIONS"]');
        expect(template).toContain("somente contas bancárias");
        expect(template).not.toContain("ABERTO NO CRÉDITO");
    });

    it("usa paginação atual da Pluggy e filtra contas bancárias em reais", () => {
        const sync = read("api/pluggy/sync.js");

        expect(sync).toContain("/v2/transactions?");
        expect(sync).toContain("dateFrom=");
        expect(sync).toContain("dateTo=");
        expect(sync).toContain('account?.type === "BANK"');
        expect(sync).toContain('mode: "read_only"');
        expect(sync).not.toContain("creditCardMetadata");
    });

    it("mantém o segredo da Pluggy exclusivamente no servidor", () => {
        const server = read("api/_pluggy.js");
        const client = read("src/folego-pluggy-v26.js");

        expect(server).toContain("process.env.PLUGGY_CLIENT_ID");
        expect(server).toContain("process.env.PLUGGY_CLIENT_SECRET");
        expect(server).toContain("fetchWithTimeout");
        expect(client).not.toContain("PLUGGY_CLIENT_SECRET");
        expect(client).not.toContain("PLUGGY_CLIENT_ID");
    });

    it("não disputa o cabeçalho Authorization com a proteção da Vercel", () => {
        const server = read("api/_pluggy.js");
        const client = read("src/folego-pluggy-v26.js");

        expect(client).toContain('"X-Folego-Session": session.access_token');
        expect(client).toContain('credentials: "same-origin"');
        expect(client).not.toContain("Authorization: `Bearer ${session.access_token}`");
        expect(server).toContain('request.headers["x-folego-session"]');
    });
});
