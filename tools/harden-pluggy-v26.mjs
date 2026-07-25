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

const callbacksBefore = `            onSuccess: async (result) => {
                const item = result?.item || result;
                if (!item?.id) return showToast("A conexão terminou sem identificação do banco.", "warning");
                mergeItem(item);
                await saveMetadata({ [PLUGGY_META_KEYS.items]: state.items });
                render();
                await syncBanks();
            },
            onError: (error) => showToast(error?.message || "A conexão bancária não foi concluída.", "error")`;
const callbacksAfter = `            onEvent: async (event) => {
                const item = event?.item;
                if (!item?.id || state.items.some((current) => current.id === item.id)) return;
                mergeItem(item);
                await saveMetadata({ [PLUGGY_META_KEYS.items]: state.items });
                render();
            },
            onSuccess: async (result) => {
                const item = result?.item || result;
                if (!item?.id) return showToast("A conexão terminou sem identificação do banco.", "warning");
                mergeItem(item);
                await saveMetadata({ [PLUGGY_META_KEYS.items]: state.items });
                render();
                await syncBanks();
            },
            onError: async (error) => {
                const item = error?.data?.item;
                if (item?.id) {
                    mergeItem(item);
                    await saveMetadata({ [PLUGGY_META_KEYS.items]: state.items });
                    render();
                }
                showToast(error?.message || "A conexão bancária não foi concluída.", "error");
            }`;
if (source.includes(callbacksBefore)) source = source.replace(callbacksBefore, callbacksAfter);

source = source.replace(
    "O Fôlego busca novas movimentações ao abrir, ao voltar para a aba e a cada 15 minutos enquanto estiver aberto.",
    "O Fôlego consulta os dados disponíveis ao abrir, ao voltar para a aba e a cada 15 minutos enquanto estiver aberto."
);

if (
    source.includes(destroyBefore)
    || !source.includes('products: ["ACCOUNTS", "CREDIT_CARDS", "TRANSACTIONS"]')
    || !source.includes("onEvent: async (event)")
) {
    throw new Error("Não foi possível reforçar a inicialização Pluggy V2.6.");
}

fs.writeFileSync(path, source, "utf8");
console.log("Inicialização Pluggy V2.6 reforçada para desktop, mobile e autorizações pendentes.");
