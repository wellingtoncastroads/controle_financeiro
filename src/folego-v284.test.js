import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file) => fs.readFileSync(file, "utf8");

describe("Fôlego V2.8.6", () => {
    it("mantém somente cinco áreas na navegação", () => {
        const index = read("index.html");
        const views = [...index.matchAll(/class="rail-link[^\"]*"[^>]*data-view="([^"]+)"/g)]
            .map((match) => match[1]);

        expect(views).toEqual(["dashboard", "transactions", "goals", "reports", "archive"]);
        expect(index).not.toContain('data-view="cards"');
        expect(index).not.toContain('data-view="planning"');
        expect(index).not.toContain('id="cardsView"');
        expect(index).not.toContain('id="planningView"');
    });

    it("não carrega mais os módulos visuais de Cartão e Rota", () => {
        const index = read("index.html");

        expect(index).not.toContain('src="/src/credit-card-feature.js"');
        expect(index).not.toContain('src="/src/monthly-planning.js"');
        expect(index).not.toContain('href="/src/credit-card-feature.css"');
        expect(index).not.toContain('href="/src/monthly-planning.css"');
        expect(index).not.toContain('id="creditCardDialog"');
    });

    it("preserva a identidade original e aplica somente a estrutura compacta", () => {
        const index = read("index.html");
        const css = read("src/folego-v284.css");
        const identity = read("style.css");
        const runtime = read("src/folego-accounts-runtime-v28.js");

        expect(index).toContain('<link rel="stylesheet" href="/src/folego-v284.css">');
        expect(index).toContain('<meta name="theme-color" content="#eeebe2">');
        expect(identity).toContain("--paper: #eeebe2");
        expect(identity).toContain("--ink: #11120e");
        expect(identity).toContain("--acid: #c8ff3d");
        expect(identity).toContain("--orange: #ff4e1a");
        expect(identity).toContain('font-family: Georgia, "Times New Roman", serif');
        expect(identity).toContain("font-family: ui-monospace");
        expect(css).not.toMatch(/:root\s*\{/);
        expect(css).not.toContain("--font-display");
        expect(css).not.toContain("#1647d8");
        expect(css).not.toContain("#e64a35");
        expect(css).toContain("grid-template-columns: repeat(5, minmax(0, 1fr))");
        expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
        expect(runtime).toContain("V2.8.4: as contas formam uma faixa própria");
    });

    it("renova a versão sem criar qualquer operação de dados", () => {
        const tool = read("tools/simplify-folego-v284.mjs");

        expect(read("package.json")).toContain('"version": "2.8.6"');
        expect(read("public/sw.js")).toContain('folego-v2.8.6');
        expect(tool).not.toContain('.from("');
        expect(tool).not.toContain("supabase");
    });
});
