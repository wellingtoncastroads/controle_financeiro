import fs from "node:fs";

const path = "index.html";
const marker = '<link rel="stylesheet" href="/src/mobile-layout-fix-v241.css">';
let source = fs.readFileSync(path, "utf8");

if (!source.includes(marker)) {
    const anchor = '<link rel="stylesheet" href="/src/monthly-planning.css">';
    if (!source.includes(anchor)) {
        throw new Error("Não foi possível aplicar o acabamento V2.4.1: folha do planejamento ausente.");
    }

    source = source.replace(anchor, `${anchor}\n    ${marker}`);
    source = source.replaceAll("FÔLEGO / V2.4", "FÔLEGO / V2.4.1");
    fs.writeFileSync(path, source, "utf8");
}

console.log("Acabamento mobile V2.4.1 aplicado com sucesso.");
