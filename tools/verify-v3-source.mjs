import fs from "node:fs";

const requiredFiles = [
    "index.html",
    "script.js",
    "style.css",
    "src/folego-agenda-v3.css",
    "src/folego-agenda-v3.js",
    "src/folego-accounts-v28.js",
    "src/folego-accounts-runtime-v28.js",
    "public/banks/itau.svg"
];

for (const file of requiredFiles) {
    if (!fs.existsSync(file)) throw new Error(`Fonte V3 incompleta: arquivo ausente ${file}`);
}

const checks = [
    ["index.html", 'id="agendaV3"'],
    ["index.html", "/src/folego-agenda-v3.css"],
    ["script.js", "renderAgendaV3"],
    ["src/folego-agenda-v3.css", "FÔLEGO V3 — AGENDA DO DINHEIRO"],
    ["src/folego-accounts-v28.js", 'name: "Itaú"']
];

for (const [file, marker] of checks) {
    const source = fs.readFileSync(file, "utf8");
    if (!source.includes(marker)) throw new Error(`Fonte V3 inválida: marcador ausente em ${file}`);
}

console.log("Fôlego V3.0 validado: Agenda do Dinheiro, contas Inter/BB/Itaú e fonte consolidada.");

