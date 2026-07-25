import fs from "node:fs";

const path = "src/folego-pluggy-v26.js";
let source = fs.readFileSync(path, "utf8");

const destroyBefore = "        state.sdk?.destroy?.().catch?.(() => {});";
const destroyAfter = `        try {
            await state.sdk?.destroy?.();
        } catch (error) {
            console.warn("O componente anterior da Pluggy não pôde ser encerrado:", error);
        }`;
if (source.includes(destroyBefore)) source = source.replace(destroyBefore, destroyAfter);

const optionsBefore = `            connectToken: token.accessToken,
            includeSandbox: false,
            countries: ["BR"],`;
const optionsAfter = `            connectToken: token.accessToken,
            includeSandbox: false,
            products: ["ACCOUNTS", "CREDIT_CARDS", "TRANSACTIONS"],
            connectorTypes: ["PERSONAL_BANK"],
            countries: ["BR"],
            forceOauthInBrowser: true,`;
if (source.includes(optionsBefore)) source = source.replace(optionsBefore, optionsAfter);

source = source.replace(
    "O Fôlego busca novas movimentações ao abrir, ao voltar para a aba e a cada 15 minutos enquanto estiver aberto.",
    "O Fôlego consulta os dados disponíveis ao abrir, ao voltar para a aba e a cada 15 minutos enquanto estiver aberto."
);

if (source.includes(destroyBefore) || !source.includes('products: ["ACCOUNTS", "CREDIT_CARDS", "TRANSACTIONS"]')) {
    throw new Error("Não foi possível reforçar a inicialização Pluggy V2.6.");
}

fs.writeFileSync(path, source, "utf8");
console.log("Inicialização Pluggy V2.6 reforçada para desktop e mobile.");
