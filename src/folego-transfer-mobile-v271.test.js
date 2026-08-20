import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => fs.readFileSync(path, "utf8");

describe("layout mobile da transferência", () => {
  it("mantém a seta compacta", () => {
    const css = read("src/folego-transfer-v27.css");
    expect(css).toContain(".transfer-arrow::before");
    expect(css).toContain("width: 52px");
    expect(css).not.toContain("rotate(90deg)");
  });

  it("mantém o botão visível no painel escuro", () => {
    const css = read("src/folego-transfer-v27.css");
    expect(css).toContain(".balance-footer .transfer-button");
    expect(css).toContain("color: var(--paper, #fffdf5)");
  });

  it("renova a versão e o cache", () => {
    expect(read("package.json")).toContain('"version": "2.7.3"');
    expect(read("index.html")).toContain("FÔLEGO / V2.7.3");
    expect(read("public/sw.js")).toContain("folego-v2.7.3");
  });
});
