import fs from "node:fs";

const VERSION = "2.7.2";

function read(path) {
    return fs.readFileSync(path, "utf8");
}

function write(path, content) {
    fs.writeFileSync(path, content, "utf8");
}

const indexPath = "index.html";
let index = read(indexPath);
index = index.replace(/FÔLEGO \/ V2\.7(?:\.\d+)?/g, `FÔLEGO / V${VERSION}`);
write(indexPath, index);

const swPath = "public/sw.js";
let sw = read(swPath);
sw = sw.replace(/const CACHE_NAME = "[^"]+";/, `const CACHE_NAME = "folego-v${VERSION}";`);
write(swPath, sw);

const css = read("src/folego-transfer-v27.css");
const requiredRules = [
    ".page-intro #pageNewTransaction",
    "font-size: 0.72rem !important",
    "color: var(--paper, #fffdf5) !important",
    "width: 100% !important"
];

for (const rule of requiredRules) {
    if (!css.includes(rule)) throw new Error(`Correção V2.7.2 ausente: ${rule}`);
}

if (!read(swPath).includes(`folego-v${VERSION}`)) {
    throw new Error("O cache da V2.7.2 não foi renovado.");
}

console.log("Fôlego V2.7.2 aplicado: botão Novo registro restaurado no mobile.");