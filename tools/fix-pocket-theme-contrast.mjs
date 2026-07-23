import fs from "node:fs";

const path = "style.css";
const marker = "/* FÔLEGO PIX/ESPÉCIE — CONTRASTE DO TEMA INVERTIDO */";
let source = fs.readFileSync(path, "utf8");

if (!source.includes(marker)) {
  source += `

${marker}
/* No tema invertido, o palco do saldo fica claro. Estes ajustes mantêm
   a divisão Pix/Espécie legível sem perder as faixas ácida e laranja. */
html[data-theme="dark"] .balance-pockets {
    border-color: color-mix(in srgb, var(--paper) 48%, transparent);
    background: color-mix(in srgb, var(--paper) 4%, transparent);
}

html[data-theme="dark"] .balance-pocket-head {
    border-bottom-color: color-mix(in srgb, var(--paper) 48%, transparent);
}

html[data-theme="dark"] .balance-pocket-head span {
    color: var(--paper);
}

html[data-theme="dark"] .balance-pocket-head i,
html[data-theme="dark"] .balance-pockets .money-pocket span,
html[data-theme="dark"] .balance-pockets .money-pocket small {
    color: color-mix(in srgb, var(--paper) 72%, transparent);
}

html[data-theme="dark"] .balance-pockets .money-pocket strong {
    color: var(--paper);
}

html[data-theme="dark"] .balance-pockets .money-pocket + .money-pocket {
    border-left-color: color-mix(in srgb, var(--paper) 48%, transparent);
}

/* No Raio-X, o cabeçalho volta a usar tinta escura com texto claro,
   preservando a mesma lógica visual do tema original. */
html[data-theme="dark"] .report-pocket-grid {
    border-color: var(--ink);
    box-shadow: 7px 7px 0 var(--acid);
}

html[data-theme="dark"] .report-pocket-head {
    border-bottom-color: var(--ink);
    background: var(--paper);
    color: var(--ink);
}

html[data-theme="dark"] .report-pocket-head span {
    color: var(--acid);
}

html[data-theme="dark"] .report-pocket-head strong {
    color: var(--ink);
}

html[data-theme="dark"] .report-pocket-grid .report-pocket {
    background: var(--paper-light);
}

html[data-theme="dark"] .report-pocket-grid .report-pocket span,
html[data-theme="dark"] .report-pocket-grid .report-pocket small {
    color: color-mix(in srgb, var(--ink) 72%, transparent);
}

html[data-theme="dark"] .report-pocket-grid .report-pocket strong {
    color: var(--ink);
}

html[data-theme="dark"] .report-pocket-grid .report-pocket + .report-pocket {
    border-left-color: var(--ink);
}

@media (max-width: 620px) {
    html[data-theme="dark"] .report-pocket-grid .report-pocket + .report-pocket {
        border-top-color: var(--ink);
        border-left: 0;
    }
}
`;

  fs.writeFileSync(path, source, "utf8");
}

console.log("Contraste Pix/Espécie ajustado para o tema invertido.");
