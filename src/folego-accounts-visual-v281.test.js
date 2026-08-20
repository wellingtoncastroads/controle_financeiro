import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => fs.readFileSync(path, "utf8");

describe("identidade visual das contas V2.8.3", () => {
    it("usa somente a paleta estrutural do Fôlego nos saldos", () => {
        const css = read("src/folego-accounts-v28.css");
        expect(css).toContain("--accounts-acid: #c8ff3d");
        expect(css).toContain("--accounts-orange: #ff4e1a");
        expect(css).toContain("color: var(--accounts-ink) !important");
        expect(css).not.toContain("color: var(--account-accent)");
    });

    it("mantém a hierarquia tipográfica editorial", () => {
        const css = read("src/folego-accounts-v28.css");
        expect(css).toContain('font-family: Georgia, "Times New Roman", serif');
        expect(css).toContain("font-family: ui-monospace");
        expect(css).toContain("font-variant-numeric: tabular-nums lining-nums");
    });

    it("preserva as logos oficiais dentro do painel Fôlego", () => {
        const css = read("src/folego-accounts-v28.css");
        const domain = read("src/folego-accounts-v28.js");
        expect(css).toContain("background: #fffdf5");
        expect(domain).toContain('logo: "/banks/inter.svg"');
        expect(domain).toContain('logo: "/banks/banco-do-brasil.svg"');
    });

    it("publica a revisão com cache renovado", () => {
        expect(read("package.json")).toContain('"version": "2.8.8"');
        expect(read("index.html")).toContain("FÔLEGO / V2.8.8");
        expect(read("public/sw.js")).toContain("folego-v2.8.8");
    });
});

