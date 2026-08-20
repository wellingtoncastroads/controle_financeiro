import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => fs.readFileSync(path, "utf8");

describe("Pluggy Connect loader", () => {
    it("usa a URL estável indicada pelo SDK oficial", () => {
        const index = read("index.html");
        expect(index).toContain("https://cdn.pluggy.ai/pluggy-connect/latest/pluggy-connect.js");
        expect(index).not.toContain("/pluggy-connect/v2.13.0/pluggy-connect.js");
    });

    it("tenta carregar novamente o módulo quando o script global não está disponível", () => {
        const source = read("src/folego-pluggy-v26.js");
        expect(source).toContain("loadPluggyConstructor");
        expect(source).toContain("folego_retry=");
        expect(source).toContain("/pluggy-connect/v2.7.0/pluggy-connect.js");
        expect(source).not.toContain("ainda não carregou. Atualize a página");
    });

    it("renova o cache da PWA e mantém a política de segurança necessária", () => {
        expect(read("public/sw.js")).toContain('folego-v2.7.3');
        const vercel = read("vercel.json");
        expect(vercel).toContain("script-src 'self' https://cdn.pluggy.ai");
        expect(vercel).toContain("frame-src https://*.pluggy.ai");
    });
});
