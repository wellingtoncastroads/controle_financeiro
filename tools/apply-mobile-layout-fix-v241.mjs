import fs from "node:fs";

const path = "index.html";
const baseMarker = '<link rel="stylesheet" href="/src/mobile-layout-fix-v241.css">';
const carouselMarker = '<link rel="stylesheet" href="/src/mobile-layout-carousel-v242.css">';
const routeNumberMarker = '<link rel="stylesheet" href="/src/route-number-font-v243.css">';
let source = fs.readFileSync(path, "utf8");

if (!source.includes(baseMarker)) {
    const anchor = '<link rel="stylesheet" href="/src/monthly-planning.css">';
    if (!source.includes(anchor)) {
        throw new Error("Não foi possível aplicar o acabamento mobile: folha do planejamento ausente.");
    }
    source = source.replace(anchor, `${anchor}\n    ${baseMarker}`);
}

if (!source.includes(carouselMarker)) {
    source = source.replace(baseMarker, `${baseMarker}\n    ${carouselMarker}`);
}

if (!source.includes(routeNumberMarker)) {
    source = source.replace(carouselMarker, `${carouselMarker}\n    ${routeNumberMarker}`);
}

source = source.replaceAll("FÔLEGO / V2.4.2", "FÔLEGO / V2.4.3");
source = source.replaceAll("FÔLEGO / V2.4.1", "FÔLEGO / V2.4.3");
source = source.replaceAll("FÔLEGO / V2.4", "FÔLEGO / V2.4.3");
fs.writeFileSync(path, source, "utf8");

console.log("Tipografia numérica da Rota V2.4.3 aplicada com sucesso.");
