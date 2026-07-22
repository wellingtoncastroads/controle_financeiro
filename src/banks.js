export const BANK_CATALOG = [
    { code: "nubank", name: "Nubank", mark: "nu", color: "#820ad1", foreground: "#ffffff", defaultType: "payment" },
    { code: "caixa", name: "Caixa", mark: "X", color: "#0066a6", foreground: "#ffffff", defaultType: "checking" },
    { code: "bb", name: "Banco do Brasil", mark: "BB", color: "#ffdf00", foreground: "#153a73", defaultType: "checking" },
    { code: "banpara", name: "Banpará", mark: "B", color: "#0066b3", foreground: "#ffffff", defaultType: "checking" },
    { code: "itau", name: "Itaú", mark: "itaú", color: "#ec7000", foreground: "#ffffff", defaultType: "checking" },
    { code: "bradesco", name: "Bradesco", mark: "B", color: "#cc092f", foreground: "#ffffff", defaultType: "checking" },
    { code: "santander", name: "Santander", mark: "S", color: "#ec0000", foreground: "#ffffff", defaultType: "checking" },
    { code: "inter", name: "Inter", mark: "inter", color: "#ff7a00", foreground: "#ffffff", defaultType: "payment" },
    { code: "c6", name: "C6 Bank", mark: "C6", color: "#242424", foreground: "#ffffff", defaultType: "payment" },
    { code: "picpay", name: "PicPay", mark: "P", color: "#21c25e", foreground: "#ffffff", defaultType: "wallet" },
    { code: "mercado_pago", name: "Mercado Pago", mark: "MP", color: "#009ee3", foreground: "#ffffff", defaultType: "wallet" },
    { code: "pagbank", name: "PagBank", mark: "P", color: "#00a868", foreground: "#ffffff", defaultType: "payment" },
    { code: "sicredi", name: "Sicredi", mark: "S", color: "#3fae2a", foreground: "#ffffff", defaultType: "checking" },
    { code: "sicoob", name: "Sicoob", mark: "S", color: "#003f34", foreground: "#ffffff", defaultType: "checking" },
    { code: "basa", name: "Banco da Amazônia", mark: "BASA", color: "#007a53", foreground: "#ffffff", defaultType: "checking" },
    { code: "neon", name: "Neon", mark: "neon", color: "#00a5f0", foreground: "#ffffff", defaultType: "payment" },
    { code: "will", name: "Will Bank", mark: "will", color: "#ffe600", foreground: "#11120e", defaultType: "payment" },
    { code: "bv", name: "Banco BV", mark: "BV", color: "#2446f5", foreground: "#ffffff", defaultType: "checking" },
    { code: "cash", name: "Dinheiro em espécie", mark: "R$", color: "#164b3a", foreground: "#ffffff", defaultType: "cash" },
    { code: "other", name: "Outro banco", mark: "+", color: "#747168", foreground: "#ffffff", defaultType: "other" }
];

export const BANK_BY_CODE = Object.fromEntries(BANK_CATALOG.map((bank) => [bank.code, bank]));

export function getBankDefinition(code) {
    return BANK_BY_CODE[code] || BANK_BY_CODE.other;
}
