import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => fs.readFileSync(path, "utf8");

describe("integração Itaú com o Supabase", () => {
    it("mantém a migração aditiva e sem alteração de movimentações", () => {
        const migration = read("supabase/migrations/20260810195759_allow_itau_payment_method.sql");

        expect(migration).toContain("transactions_payment_method_check");
        expect(migration).toContain("'itau'");
        expect(migration).not.toMatch(/\b(insert|update|delete|truncate)\b/i);
    });

    it("não confunde qualquer erro de relation com V2.1 ausente", () => {
        const script = read("script.js");

        expect(script).toContain('const code = String(error?.code || "").toUpperCase();');
        expect(script).toContain('["42P01", "PGRST202", "PGRST204", "PGRST205"].includes(code)');
        expect(script).not.toContain('message.includes("relation") || message.includes("schema cache")');
    });
});
