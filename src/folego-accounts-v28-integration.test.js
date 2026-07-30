import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => fs.readFileSync(path, "utf8");

describe("integração de contas V2.8", () => {
    it("carrega o módulo visual e as logos bancárias", () => {
        const index = read("index.html");
        expect(index).toContain("/src/folego-accounts-v28.css");
        expect(index).toContain("/src/folego-accounts-runtime-v28.js");
        expect(fs.existsSync("public/banks/inter.svg")).toBe(true);
        expect(fs.existsSync("public/banks/banco-do-brasil.svg")).toBe(true);
    });

    it("mantém Banco do Brasil disponível em movimentos e transferências", () => {
        const runtime = read("src/folego-accounts-runtime-v28.js");
        const transfer = read("src/folego-transfer-v27.js");
        expect(runtime).toContain('<option value="bank_transfer">Banco do Brasil</option>');
        expect(runtime).toContain("ENTROU EM QUAL CONTA");
        expect(runtime).toContain("SAIU DE QUAL CONTA");
        expect(transfer).toContain('bank_transfer: "Banco do Brasil"');
    });

    it("migra os movimentos antigos para o Inter apenas uma vez", () => {
        const migration = read("src/folego-accounts-migration-v28.js");
        expect(migration).toContain("folego_accounts_v28_migrated");
        expect(migration).toContain('update({ payment_method: "pix" })');
        expect(migration).toContain("TRANSFER_CATEGORIES");
    });

    it("publica a versão e o cache novos", () => {
        expect(read("package.json")).toContain('"version": "2.8.0"');
        expect(read("index.html")).toContain("FÔLEGO / V2.8.0");
        expect(read("public/sw.js")).toContain("folego-v2.8.0");
    });
});
