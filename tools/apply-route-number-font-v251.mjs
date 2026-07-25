import fs from "node:fs";

const path = "index.html";
const marker = '<link rel="stylesheet" href="/src/route-number-font-v251.css">';
let source = fs.readFileSync(path, "utf8");

if (!source.includes(marker)) {
    const anchor = '<link rel="stylesheet" href="/src/folego-v25-suite.css">';
    if (!source.includes(anchor)) {
        throw new Error("Não foi possível aplicar a tipografia da Rota: folha V2.5 ausente.");
    }
    source = source.replace(anchor, `${anchor}\n    ${marker}`);
}

source = source.replaceAll("FÔLEGO / V2.5", "FÔLEGO / V2.5.1");
fs.writeFileSync(path, source, "utf8");
console.log("Tipografia numérica da Rota V2.5.1 aplicada com sucesso.");
