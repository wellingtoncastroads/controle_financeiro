import fs from "node:fs";

const path = "style.css";
const marker = "/* FÔLEGO POCKET OVERLAP FIX V2.1.3 */";
let source = fs.readFileSync(path, "utf8");

if (!source.includes(marker)) {
  source += `\n\n${marker}\n/* A linha verde decorativa termina antes da divisão Pix/Espécie e permanece atrás do conteúdo. */\n.balance-field::before {\n    height: 33%;\n    z-index: 0;\n    pointer-events: none;\n}\n\n.balance-pockets {\n    position: relative;\n    z-index: 2;\n    background: var(--ink);\n    isolation: isolate;\n}\n\n.balance-footer {\n    position: relative;\n    z-index: 2;\n}\n\n.balance-tape {\n    z-index: 3;\n}\n\n@media (max-width: 620px) {\n    .balance-field::before {\n        height: 29%;\n    }\n}\n`;
  fs.writeFileSync(path, source, "utf8");
}

console.log("Sobreposição da linha decorativa corrigida.");
