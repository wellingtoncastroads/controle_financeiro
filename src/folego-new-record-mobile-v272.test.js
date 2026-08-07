import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => fs.readFileSync(path, "utf8");

describe("botão Novo registro no mobile", () => {
    it("mantém o texto visível e o botão em largura total", () => {
        const css = read("src/folego-transfer-v27.css");
        expect(css).toContain(".page-intro #pageNewTransaction");
        expect(css).toContain("font-size: 0.72rem !important");
        expect(css).toContain("color: var(--paper, #fffdf5) !important");
        expect(css).toContain("width: 100% !important");
    });

    it("publica a revisão com um cache novo", () => {
        expect(read("package.json")).toContain('"version": "2.7.3"');
        expect(read("public/sw.js")).toContain('folego-v2.7.3');
    });
});
