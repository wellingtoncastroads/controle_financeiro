import fs from "node:fs";

const indexPath = "index.html";
const marker = '<link rel="stylesheet" href="/src/mobile-fix-v253.css">';
let source = fs.readFileSync(indexPath, "utf8");

if (!source.includes(marker)) {
    const preferredAnchor = '<link rel="stylesheet" href="/src/route-number-font-v251.css">';
    const fallbackAnchor = '<link rel="stylesheet" href="/src/folego-v25-suite.css">';
    const anchor = source.includes(preferredAnchor) ? preferredAnchor : fallbackAnchor;
    if (!source.includes(anchor)) {
        throw new Error("Não foi possível aplicar a correção mobile V2.5.3.");
    }
    source = source.replace(anchor, `${anchor}\n    ${marker}`);
}

["FÔLEGO / V2.5.2", "FÔLEGO / V2.5.1", "FÔLEGO / V2.5"].forEach((version) => {
    source = source.replaceAll(version, "FÔLEGO / V2.5.3");
});
fs.writeFileSync(indexPath, source, "utf8");

const swPath = "public/sw.js";
if (fs.existsSync(swPath)) {
    let sw = fs.readFileSync(swPath, "utf8");
    sw = sw.replace(/const CACHE_NAME = "[^"]+";/, 'const CACHE_NAME = "folego-v2.5.3";');
    fs.writeFileSync(swPath, sw, "utf8");
}

console.log("Correção mobile V2.5.3 aplicada com sucesso.");
