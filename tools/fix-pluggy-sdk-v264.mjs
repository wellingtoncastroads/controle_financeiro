import fs from "node:fs";

const latestUrl = "https://cdn.pluggy.ai/pluggy-connect/latest/pluggy-connect.js";
const fallbackUrl = "https://cdn.pluggy.ai/pluggy-connect/v2.7.0/pluggy-connect.js";
const latestTag = `<script src="${latestUrl}"></script>`;

function read(path) {
    return fs.readFileSync(path, "utf8");
}

function write(path, content) {
    fs.writeFileSync(path, content, "utf8");
}

function replaceRequired(source, search, replacement, label) {
    if (!source.includes(search)) throw new Error(`Não foi possível corrigir o SDK da Pluggy: ${label}.`);
    return source.replace(search, replacement);
}

const applyPath = "tools/apply-pluggy-v26.mjs";
let apply = read(applyPath);
apply = apply.replace(
    /const sdkMarker = '<script src="https:\/\/cdn\.pluggy\.ai\/pluggy-connect\/[^\"]+\/pluggy-connect\.js"><\/script>';/,
    `const sdkMarker = '${latestTag}';`
);
apply = apply.replace(/FÔLEGO \/ V2\\\.6(?:\\\.\\d\+)?/g, "FÔLEGO / V2\\.6(?:\\.\\d+)?");
apply = apply.replace('"FÔLEGO / V2.6"', '"FÔLEGO / V2.6.4"');
apply = apply.replace('folego-v2.6.0', 'folego-v2.6.4');
write(applyPath, apply);

const indexPath = "index.html";
let index = read(indexPath);
index = index.replace(
    /<script src="https:\/\/cdn\.pluggy\.ai\/pluggy-connect\/[^\"]+\/pluggy-connect\.js"><\/script>/g,
    latestTag
);
index = index.replace(/FÔLEGO \/ V2\.6(?:\.\d+)?/g, "FÔLEGO / V2.6.4");
write(indexPath, index);

const modulePath = "src/folego-pluggy-v26.js";
let moduleSource = read(modulePath);
const constructorBefore = `function pluggyConstructor() {
    return window.PluggyConnect?.default || window.PluggyConnect || null;
}`;
const constructorAfter = `const PLUGGY_SDK_URLS = [
    "${latestUrl}",
    "${fallbackUrl}"
];
let pluggySdkPromise = null;

function pluggyConstructor() {
    return window.PluggyConnect?.default || window.PluggyConnect || null;
}

function injectPluggySdk(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        const separator = url.includes("?") ? "&" : "?";
        const timeout = window.setTimeout(() => {
            script.remove();
            reject(new Error("A conexão segura demorou além do esperado para carregar."));
        }, 15000);

        script.src = \`${'${url}${separator}'}folego_retry=${'${Date.now()}'}\`;
        script.async = true;
        script.dataset.folegoPluggySdk = "true";
        script.onload = () => {
            window.clearTimeout(timeout);
            const Constructor = pluggyConstructor();
            if (Constructor) resolve(Constructor);
            else reject(new Error("O arquivo da conexão bancária carregou sem iniciar o módulo."));
        };
        script.onerror = () => {
            window.clearTimeout(timeout);
            script.remove();
            reject(new Error("Não foi possível baixar o módulo seguro de conexão."));
        };
        document.head.append(script);
    });
}

async function loadPluggyConstructor() {
    const ready = pluggyConstructor();
    if (ready) return ready;

    if (!pluggySdkPromise) {
        pluggySdkPromise = (async () => {
            let lastError = null;
            for (const url of PLUGGY_SDK_URLS) {
                try {
                    const Constructor = await injectPluggySdk(url);
                    if (Constructor) return Constructor;
                } catch (error) {
                    lastError = error;
                    console.warn("Tentativa de carregar Pluggy Connect falhou:", error);
                }
            }
            throw lastError || new Error("O módulo seguro de conexão não ficou disponível.");
        })().catch((error) => {
            pluggySdkPromise = null;
            throw error;
        });
    }

    return pluggySdkPromise;
}`;

if (!moduleSource.includes("const PLUGGY_SDK_URLS")) {
    moduleSource = replaceRequired(moduleSource, constructorBefore, constructorAfter, "carregador dinâmico");
}
moduleSource = moduleSource.replace(
    `const Constructor = pluggyConstructor();
        if (!Constructor) throw new Error("O módulo seguro de conexão ainda não carregou. Atualize a página.");`,
    `const Constructor = await loadPluggyConstructor();`
);
moduleSource = moduleSource.replace(
    `render();
    window.clearInterval(state.timer);`,
    `render();
    if (navigator.onLine) {
        loadPluggyConstructor().catch((error) => console.warn("Pré-carregamento Pluggy indisponível:", error));
    }
    window.clearInterval(state.timer);`
);
write(modulePath, moduleSource);

const swPath = "public/sw.js";
let sw = read(swPath);
sw = sw.replace(/const CACHE_NAME = "[^"]+";/, 'const CACHE_NAME = "folego-v2.6.4";');
write(swPath, sw);

if (!read(applyPath).includes(latestUrl)) throw new Error("A aplicação da interface ainda aponta para o SDK antigo.");
if (!read(modulePath).includes("loadPluggyConstructor")) throw new Error("O fallback automático da Pluggy não foi aplicado.");
if (!read(swPath).includes("folego-v2.6.4")) throw new Error("O cache da PWA não foi renovado.");

console.log("Pluggy Connect V2.6.4 corrigido: URL oficial, fallback automático e cache renovado.");