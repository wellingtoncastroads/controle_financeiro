import fs from "node:fs";

function replaceRequired(source, search, replacement, label) {
    if (!source.includes(search)) throw new Error(`Não foi possível reforçar a V2.5: ${label}.`);
    return source.replace(search, replacement);
}

const suitePath = "src/folego-v25-suite.js";
let suite = fs.readFileSync(suitePath, "utf8");

suite = suite.replaceAll(".slice(0, 50)", ".slice(0, 20)");

suite = replaceRequired(
    suite,
    `state.cardSeries = { ...state.cardSeries, [seriesId]: card.id };
    await saveMetadataKey(META_KEYS.cardSeries, state.cardSeries);`,
    `state.cardSeries = Object.fromEntries(
        Object.entries({ ...state.cardSeries, [seriesId]: card.id }).slice(-600)
    );
    await saveMetadataKey(META_KEYS.cardSeries, state.cardSeries);`,
    "limite do mapa de cartões"
);

suite = replaceRequired(
    suite,
    `const { error } = await supabase
            .from("transactions")
            .update({ ...rows[0], user_id: undefined })`,
    `const values = { ...rows[0] };
        delete values.user_id;
        const { error } = await supabase
            .from("transactions")
            .update(values)`,
    "atualização offline segura"
);

suite = replaceRequired(
    suite,
    `try {
        await updateTransactionRows(state.user.id, rows.map((row) => row.id), { status: "paid", payment_method: source });
        const payment = {`,
    `try {
        const mappedRows = { ...state.cardSeries };
        rows.forEach((row) => {
            if (!row.series_id && row.id) mappedRows[\`row:\${row.id}\`] = card.id;
        });
        state.cardSeries = Object.fromEntries(Object.entries(mappedRows).slice(-600));
        await saveMetadataKey(META_KEYS.cardSeries, state.cardSeries);
        await updateTransactionRows(state.user.id, rows.map((row) => row.id), { status: "paid", payment_method: source });
        const payment = {`,
    "preservação de compras antigas"
);

suite = replaceRequired(
    suite,
    `rowIds: rows.map((row) => row.id),`,
    `rowCount: rows.length,`,
    "histórico compacto de faturas"
);

suite = suite.replace(
    `state.invoicePayments = [payment, ...state.invoicePayments].slice(0, 120);`,
    `state.invoicePayments = [payment, ...state.invoicePayments].slice(0, 60);`
);

fs.writeFileSync(suitePath, suite, "utf8");

const domainPath = "src/folego-v25-domain.js";
let domain = fs.readFileSync(domainPath, "utf8");
domain = replaceRequired(
    domain,
    `export function cardIdForRow(row, seriesMap = {}, fallbackCardId = null) {
    const seriesId = rowSeriesId(row);
    return (seriesId && seriesMap[seriesId]) || fallbackCardId || null;
}`,
    `export function cardIdForRow(row, seriesMap = {}, fallbackCardId = null) {
    const seriesId = rowSeriesId(row);
    const rowId = typeof row?.id === "string" ? row.id : null;
    return (seriesId && seriesMap[seriesId])
        || (rowId && seriesMap[\`row:\${rowId}\`])
        || fallbackCardId
        || null;
}`,
    "associação de compras antigas"
);
fs.writeFileSync(domainPath, domain, "utf8");

console.log("Persistência V2.5 reforçada com limites e compatibilidade histórica.");
