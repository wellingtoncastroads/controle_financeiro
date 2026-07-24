import fs from "node:fs";

const MARKER = "<!-- FÔLEGO CARTÃO V2.2 -->";

function read(path) {
    return fs.readFileSync(path, "utf8");
}

function write(path, content) {
    fs.writeFileSync(path, content, "utf8");
}

function replaceRequired(source, search, replacement, label) {
    if (!source.includes(search)) {
        throw new Error(`Não foi possível aplicar Cartão V2.2: ${label}.`);
    }
    return source.replace(search, replacement);
}

const path = "index.html";
let source = read(path);

if (!source.includes(MARKER)) {
    source = replaceRequired(
        source,
        `    <link rel="stylesheet" href="style.css">`,
        `    <link rel="stylesheet" href="style.css">
    <link rel="stylesheet" href="/src/credit-card-feature.css">`,
        "folha de estilos"
    );

    source = replaceRequired(
        source,
        `            <button class="rail-link" type="button" data-view="reports">
                <span>04</span>
                <strong>Raio-X</strong>
            </button>`,
        `            <button class="rail-link" type="button" data-view="cards">
                <span>04</span>
                <strong>Cartão</strong>
            </button>
            <button class="rail-link" type="button" data-view="reports">
                <span>05</span>
                <strong>Raio-X</strong>
            </button>`,
        "item Cartão no índice"
    );

    const cardsView = `
            ${MARKER}
            <!-- =====================================================
                 04 — CARTÃO E FATURAS
            ====================================================== -->
            <section class="view" id="cardsView" data-view-section="cards">
                <div class="view-index" aria-hidden="true">
                    <span>04</span>
                    <i></i>
                    <b>CARTÃO</b>
                </div>

                <header class="page-intro card-intro">
                    <div>
                        <span class="section-code">CRÉDITO SOB CONTROLE</span>
                        <h2>O limite tem borda.<br>A fatura tem data.</h2>
                    </div>
                    <button class="ink-button" id="newCreditCardButton" type="button"><span>+</span> Adicionar cartão</button>
                </header>

                <section class="credit-card-summary" aria-label="Resumo do cartão">
                    <article>
                        <span>LIMITE TOTAL</span>
                        <strong id="cardTotalLimit">R$ 0,00</strong>
                        <small>valor definido no cartão</small>
                    </article>
                    <article>
                        <span>LIMITE USADO</span>
                        <strong id="cardUsedLimit">R$ 0,00</strong>
                        <small>parcelas ainda abertas</small>
                    </article>
                    <article class="available">
                        <span>DISPONÍVEL</span>
                        <strong id="cardAvailableLimit">R$ 0,00</strong>
                        <small>margem para respirar</small>
                    </article>
                    <article class="invoice">
                        <span>FATURA DO MÊS</span>
                        <strong id="cardCurrentInvoice">R$ 0,00</strong>
                        <small id="cardInvoiceCaption">nenhuma compra</small>
                    </article>
                </section>

                <section class="credit-card-workspace">
                    <article class="credit-card-board">
                        <header class="board-heading">
                            <div>
                                <span class="section-code">01 / LIMITE</span>
                                <h3>O crédito em circulação</h3>
                            </div>
                        </header>
                        <div id="creditCardPanel"></div>
                    </article>

                    <article class="credit-invoice-board">
                        <header class="board-heading">
                            <div>
                                <span class="section-code">02 / FATURA</span>
                                <h3>O que vence agora</h3>
                            </div>
                            <button class="paper-button" id="payInvoiceButton" type="button">MARCAR FATURA PAGA</button>
                        </header>

                        <div class="credit-invoice-control">
                            <label>
                                <span>MÊS DA FATURA /</span>
                                <input type="month" id="invoiceMonthFilter">
                            </label>
                            <div>
                                <span>TOTAL ABERTO</span>
                                <strong id="invoiceOpenTotal">R$ 0,00</strong>
                                <small id="invoicePurchaseCount">0 parcelas</small>
                            </div>
                        </div>

                        <div class="credit-card-invoice-list" id="creditCardInvoiceList"></div>
                    </article>
                </section>
            </section>

`;

    source = replaceRequired(
        source,
        `            <!-- =====================================================
                 04 — RAIO-X E RELATÓRIOS
            ====================================================== -->
            <section class="view" id="reportsView" data-view-section="reports">
                <div class="view-index" aria-hidden="true">
                    <span>04</span>
                    <i></i>
                    <b>RAIO-X</b>
                </div>`,
        `${cardsView}            <!-- =====================================================
                 05 — RAIO-X E RELATÓRIOS
            ====================================================== -->
            <section class="view" id="reportsView" data-view-section="reports">
                <div class="view-index" aria-hidden="true">
                    <span>05</span>
                    <i></i>
                    <b>RAIO-X</b>
                </div>`,
        "tela exclusiva de cartão"
    );

    source = replaceRequired(
        source,
        `                    <select id="transactionPaymentMethod" required>
                        <option value="pix">Pix</option>
                        <option value="cash">Espécie</option>
                    </select>`,
        `                    <select id="transactionPaymentMethod" required>
                        <option value="pix">Pix</option>
                        <option value="cash">Espécie</option>
                        <option value="debit_card">Cartão de débito</option>
                        <option value="credit_card">Cartão de crédito (parcela)</option>
                    </select>`,
        "formas de saída"
    );

    source = replaceRequired(
        source,
        `                <label class="form-field">
                    <span>TIPO DE LANÇAMENTO</span>
                    <select id="transactionMode">`,
        `                <div class="credit-purchase-fields form-field-wide" id="creditPurchaseFields" hidden>
                    <label class="form-field">
                        <span>QUANTIDADE DE PARCELAS</span>
                        <input type="number" id="creditInstallmentCount" min="1" max="120" value="1">
                    </label>
                    <p><strong>A compra não sai do saldo agora.</strong> Ela entra na fatura e só reduz o saldo digital quando a fatura for marcada como paga.</p>
                </div>

                <label class="form-field" id="transactionModeField">
                    <span>TIPO DE LANÇAMENTO</span>
                    <select id="transactionMode">`,
        "parcelas do cartão"
    );

    const cardDialog = `
    <!-- =============================================================
         CADASTRO DO CARTÃO DE CRÉDITO
    ============================================================== -->
    <dialog class="modal" id="creditCardDialog">
        <form class="modal-sheet compact-sheet" id="creditCardForm">
            <div class="modal-header">
                <div>
                    <span>CRÉDITO / LIMITE</span>
                    <h2 id="creditCardModalTitle">Adicionar cartão</h2>
                </div>
                <button class="modal-close" type="button" data-close-dialog="creditCardDialog" aria-label="Fechar">×</button>
            </div>

            <div class="form-grid">
                <label class="form-field form-field-wide">
                    <span>NOME DO CARTÃO</span>
                    <input type="text" id="creditCardName" maxlength="40" placeholder="Ex.: Nubank, Inter, Caixa" required>
                </label>

                <label class="form-field form-field-wide">
                    <span>VALOR DO LIMITE</span>
                    <span class="money-field"><b>R$</b><input type="number" id="creditCardLimit" min="0.01" step="0.01" placeholder="0,00" required></span>
                </label>

                <label class="form-field">
                    <span>DIA DO FECHAMENTO</span>
                    <input type="number" id="creditCardClosingDay" min="1" max="28" value="10" required>
                </label>

                <label class="form-field">
                    <span>DIA DO VENCIMENTO</span>
                    <input type="number" id="creditCardDueDay" min="1" max="28" value="17" required>
                </label>

                <p class="credit-card-form-note form-field-wide">Compras feitas depois do fechamento entram na fatura seguinte. Os dias ficam entre 1 e 28 para funcionar em todos os meses.</p>
            </div>

            <div class="modal-actions">
                <button class="paper-button" type="button" data-close-dialog="creditCardDialog">Cancelar</button>
                <button class="ink-button" type="submit">Gravar cartão →</button>
            </div>
        </form>
    </dialog>

`;

    source = replaceRequired(
        source,
        `    <!-- =============================================================
         FORMULÁRIO DE META
    ============================================================== -->`,
        `${cardDialog}    <!-- =============================================================
         FORMULÁRIO DE META
    ============================================================== -->`,
        "modal do cartão"
    );

    source = replaceRequired(
        source,
        `    <script type="module" src="script.js"></script>`,
        `    <script type="module" src="script.js"></script>
    <script type="module" src="/src/credit-card-feature.js"></script>`,
        "módulo de cartão"
    );

    source = source.replace("FÔLEGO / V2.1", "FÔLEGO / V2.2");
    write(path, source);
}

console.log("Interface Cartão V2.2 aplicada com sucesso.");