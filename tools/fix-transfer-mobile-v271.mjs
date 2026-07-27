import fs from "node:fs";

const VERSION = "2.7.1";

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
if (css.includes("transform: rotate(90deg)")) {
    throw new Error("A seta mobile ainda está girando uma barra de largura total.");
}
if (!css.includes('.transfer-arrow::before') || !css.includes('content: "↓"')) {
    throw new Error("A seta compacta mobile da transferência não foi aplicada.");
}
if (!css.includes(".balance-footer .transfer-button")) {
    throw new Error("O botão Transferir ainda não possui contraste no Pulso.");
}
if (!read(swPath).includes(`folego-v${VERSION}`)) {
    throw new Error("O cache da V2.7.1 não foi renovado.");
}

console.log("Fôlego V2.7.1 aplicado: transferência corrigida no mobile e cache renovado.");
