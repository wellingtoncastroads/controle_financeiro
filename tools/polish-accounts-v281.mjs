import fs from "node:fs";
import path from "node:path";

const VERSION = "2.8.1";
const COMMAND = "node tools/polish-accounts-v281.mjs";

const read = (file) => fs.readFileSync(file, "utf8");
const write = (file, content) => fs.writeFileSync(file, content, "utf8");

function stampPackage() {
    const file = "package.json";
    const pkg = JSON.parse(read(file));
    pkg.version = VERSION;
    for (const script of ["predev", "prebuild"]) {
        if (!pkg.scripts?.[script]) throw new Error(`Script ${script} não encontrado.`);
        if (!pkg.scripts[script].includes(COMMAND)) pkg.scripts[script] += ` && ${COMMAND}`;
    }
    write(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

function stampInterface() {
    const indexFile = "index.html";
    let index = read(indexFile);
    index = index.replace(/FÔLEGO \/ V2\.8(?:\.\d+)?/g, `FÔLEGO / V${VERSION}`);
    index = index.replace(/<small class="account-version">[^<]+<\/small>/, `<small class="account-version">FÔLEGO / V${VERSION}</small>`);
    write(indexFile, index);

    const swFile = "public/sw.js";
    let sw = read(swFile);
    sw = sw.replace(/const CACHE_NAME = "[^"]+";/, `const CACHE_NAME = "folego-v${VERSION}";`);
    write(swFile, sw);
}

function stampTests() {
    for (const name of fs.readdirSync("src")) {
        if (!name.endsWith(".test.js")) continue;
        const file = path.join("src", name);
        const source = read(file).replaceAll("2.8.0", VERSION);
        write(file, source);
    }
}

function validateVisualLanguage() {
    const css = read("src/folego-accounts-v28.css");
    const required = [
        "FÔLEGO V2.8.1 / CONTAS FINANCEIRAS",
        "--accounts-acid: #c8ff3d",
        "--accounts-orange: #ff4e1a",
        "font-family: Georgia, \"Times New Roman\", serif",
        "font-family: ui-monospace",
        "color: var(--accounts-ink) !important",
        ".account-card-v28[data-account-method=\"pix\"]::before"
    ];
    for (const marker of required) {
        if (!css.includes(marker)) throw new Error(`Polimento visual incompleto: ${marker}`);
    }
    if (css.includes("color: var(--account-accent)")) {
        throw new Error("Os saldos ainda usam cores bancárias fora da identidade Fôlego.");
    }
}

stampPackage();
stampInterface();
stampTests();
validateVisualLanguage();

console.log("Fôlego V2.8.1 aplicado: cores, tipografia e contraste das contas alinhados à identidade editorial.");
