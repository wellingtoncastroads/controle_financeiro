import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => fs.readFileSync(path, "utf8");

describe("integração dos saldos iniciais V2.8.2", () => {
    it("publica os valores atuais informados pelo usuário", () => {
        const domain = read("src/folego-accounts-v28.js");
        expect(domain).toContain('capturedAt: "2026-07-30T13:43:00.000Z"');
        expect(domain).toContain("pix: 1552.57");
        expect(domain).toContain("bank_transfer: 302.01");
        expect(domain).toContain("cash: 0");
    });

    it("carrega a fotografia do usuário antes de calcular os saldos", () => {
        const runtime = read("src/folego-accounts-runtime-v28.js");
        expect(runtime).toContain("ensureAccountSnapshotV282");
        expect(runtime).toContain("state.snapshot = await ensureAccountSnapshotV282()");
        expect(runtime).toContain("state.assignments, state.snapshot");
    });

    it("mantém o histórico anterior fora dos saldos por conta", () => {
        const domain = read("src/folego-accounts-v28.js");
        expect(domain).toContain("createdAt > snapshot.capturedAt");
        expect(domain).toContain("transactionCreatedAt(transaction)");
    });

    it("renova versão e cache", () => {
        const pkg = read("package.json");
        expect(pkg).toContain('"version": "3.0.0"');
        expect(pkg).toContain("node tools/verify-v3-source.mjs");
        expect(read("public/sw.js")).toContain("folego-v3.0.0");
    });
});
