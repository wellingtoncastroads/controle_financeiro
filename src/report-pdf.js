import { jsPDF } from "jspdf";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BLACK = [17, 18, 14];
const PAPER = [247, 245, 237];
const ACID = [200, 255, 61];
const ORANGE = [255, 78, 26];
const GRAY = [103, 102, 94];

function currency(value) {
    return money.format(Number(value) || 0);
}

function safeFilePart(value) {
    return String(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();
}

export function generateFinancialReportPdf(report) {
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 16;
    const usableWidth = pageWidth - margin * 2;
    let pageNumber = 1;

    const drawFooter = () => {
        doc.setDrawColor(...BLACK);
        doc.setLineWidth(0.35);
        doc.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
        doc.setFont("courier", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...GRAY);
        doc.text("FÔLEGO V2.2 / RELATÓRIO PESSOAL", margin, pageHeight - 8);
        doc.text(String(pageNumber).padStart(2, "0"), pageWidth - margin, pageHeight - 8, { align: "right" });
    };

    const drawPageHeader = (label = "RAIO-X FINANCEIRO") => {
        doc.setFillColor(...PAPER);
        doc.rect(0, 0, pageWidth, pageHeight, "F");
        doc.setFillColor(...BLACK);
        doc.rect(0, 0, pageWidth, 21, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.setTextColor(255, 255, 255);
        doc.text("FÔLEGO", margin, 13.8);
        doc.setFont("courier", "bold");
        doc.setFontSize(8);
        doc.text(label, pageWidth - margin, 13.2, { align: "right" });
        doc.setFillColor(...ACID);
        doc.rect(margin, 20, 27, 3, "F");
        drawFooter();
    };

    const addPage = (label) => {
        if (pageNumber > 1) doc.addPage();
        drawPageHeader(label);
        pageNumber += 1;
        return 31;
    };

    const sectionTitle = (code, title, y) => {
        doc.setFont("courier", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(...GRAY);
        doc.text(code, margin, y);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.setTextColor(...BLACK);
        doc.text(title, margin, y + 7);
        doc.setDrawColor(...BLACK);
        doc.setLineWidth(0.5);
        doc.line(margin, y + 10, pageWidth - margin, y + 10);
        return y + 17;
    };

    const rankingBlock = (items, x, y, width, emptyText) => {
        if (!items.length) {
            doc.setFont("courier", "normal");
            doc.setFontSize(8.5);
            doc.setTextColor(...GRAY);
            doc.text(emptyText, x, y + 4);
            return y + 12;
        }

        items.slice(0, 8).forEach((item, index) => {
            const lineY = y + index * 10;
            doc.setFont("courier", "bold");
            doc.setFontSize(8);
            doc.setTextColor(...BLACK);
            doc.text(String(index + 1).padStart(2, "0"), x, lineY + 3.5);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8.5);
            const label = doc.splitTextToSize(item.label, width - 45)[0];
            doc.text(label, x + 9, lineY + 3.5);
            doc.setFont("courier", "bold");
            doc.setFontSize(8);
            doc.text(currency(item.amount), x + width, lineY + 3.5, { align: "right" });
            doc.setFillColor(221, 219, 210);
            doc.rect(x + 9, lineY + 6, width - 9, 1.5, "F");
            doc.setFillColor(index === 0 ? ORANGE[0] : BLACK[0], index === 0 ? ORANGE[1] : BLACK[1], index === 0 ? ORANGE[2] : BLACK[2]);
            doc.rect(x + 9, lineY + 6, (width - 9) * Math.min(1, item.share || 0), 1.5, "F");
        });
        return y + Math.min(items.length, 8) * 10 + 4;
    };

    drawPageHeader("RAIO-X / V2.2");
    pageNumber += 1;

    doc.setFont("courier", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY);
    doc.text("RELATÓRIO FINANCEIRO PESSOAL", margin, 37);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.setTextColor(...BLACK);
    doc.text("Onde o dinheiro", margin, 50);
    doc.text("ganhou peso.", margin, 61);

    doc.setFillColor(...ACID);
    doc.rect(margin, 70, usableWidth, 24, "F");
    doc.setFont("courier", "bold");
    doc.setFontSize(8);
    doc.text("RECORTE ANALISADO", margin + 5, 78);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(report.periodLabel, margin + 5, 88);

    doc.setFont("courier", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(`CONTA / ${report.profileName || "Usuário"}`, margin, 104);
    doc.text(report.email || "", margin, 109);
    doc.text(`GERADO / ${report.generatedAt}`, pageWidth - margin, 104, { align: "right" });

    const cardsY = 119;
    const gap = 4;
    const cardWidth = (usableWidth - gap * 2) / 3;
    const cards = [
        { label: "ENTROU", value: report.totals.income, color: ACID },
        { label: "SAIU", value: report.totals.expense, color: ORANGE },
        { label: "RESULTADO", value: report.totals.result, color: BLACK }
    ];
    cards.forEach((card, index) => {
        const x = margin + index * (cardWidth + gap);
        doc.setDrawColor(...BLACK);
        doc.setLineWidth(0.35);
        doc.rect(x, cardsY, cardWidth, 31, "S");
        doc.setFillColor(...card.color);
        doc.rect(x, cardsY, cardWidth, 4, "F");
        doc.setFont("courier", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(...GRAY);
        doc.text(card.label, x + 4, cardsY + 12);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(...BLACK);
        doc.text(currency(card.value), x + 4, cardsY + 23);
    });

    let y = sectionTitle("01 / CATEGORIAS", "O que mais pesou", 165);
    y = rankingBlock(report.categoryRanking, margin, y, usableWidth, "Nenhuma despesa confirmada neste período.");

    if (y < 249) {
        doc.setFillColor(...BLACK);
        doc.rect(margin, 260, usableWidth, 11, "F");
        doc.setFont("courier", "bold");
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text("LEIA OS NÚMEROS. MUDE O RITMO.", margin + 5, 267);
        doc.setTextColor(...ACID);
        doc.text(`${report.transactions.length} MOVIMENTOS CONFIRMADOS`, pageWidth - margin - 5, 267, { align: "right" });
    }

    y = addPage("RANKINGS / DETALHE");
    y = sectionTitle("02 / MOVIMENTOS", "Maiores saídas", y);
    y = rankingBlock(report.descriptionRanking, margin, y, usableWidth, "Não há saídas para ordenar.");
    y += 7;
    y = sectionTitle("03 / MEIOS", "Como o dinheiro circulou", y);
    y = rankingBlock(report.methodRanking, margin, y, usableWidth, "Nenhuma forma de pagamento registrada.");

    y = addPage("CONTAS / SALDOS");
    y = sectionTitle("04 / CONTAS", "Onde o dinheiro está", y);
    if (!report.accounts?.length) {
        doc.setFont("courier", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...GRAY);
        doc.text("Nenhuma conta financeira cadastrada.", margin, y + 5);
    } else {
        report.accounts.forEach((account) => {
            if (y > pageHeight - 28) {
                y = addPage("CONTAS / CONTINUAÇÃO");
                y = sectionTitle("04 / CONTAS", "Onde o dinheiro está", y);
            }
            doc.setDrawColor(210, 208, 199);
            doc.setLineWidth(0.3);
            doc.rect(margin, y, usableWidth, 18, "S");
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(...BLACK);
            doc.text(doc.splitTextToSize(account.name, 92)[0], margin + 4, y + 7);
            doc.setFont("courier", "normal");
            doc.setFontSize(7);
            doc.setTextColor(...GRAY);
            doc.text(doc.splitTextToSize(account.institutionName, 92)[0], margin + 4, y + 12);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.setTextColor(...BLACK);
            doc.text(currency(account.balance), pageWidth - margin - 4, y + 10, { align: "right" });
            y += 22;
        });
    }

    y = addPage("EXTRATO DO PERÍODO");
    y = sectionTitle("05 / ARQUIVO", "Movimentos confirmados", y);
    const columns = { date: margin, description: margin + 23, type: margin + 105, value: pageWidth - margin };

    const drawTableHeader = () => {
        doc.setFillColor(...BLACK);
        doc.rect(margin, y, usableWidth, 8, "F");
        doc.setFont("courier", "bold");
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        doc.text("DATA", columns.date + 2, y + 5.2);
        doc.text("MOVIMENTO / GRUPO + CONTA", columns.description, y + 5.2);
        doc.text("TIPO / MEIO", columns.type, y + 5.2);
        doc.text("VALOR", columns.value - 2, y + 5.2, { align: "right" });
        y += 11;
    };

    drawTableHeader();
    if (!report.transactions.length) {
        doc.setFont("courier", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...GRAY);
        doc.text("Nenhum movimento confirmado no recorte.", margin, y + 5);
    } else {
        report.transactions.forEach((transaction) => {
            if (y > pageHeight - 26) {
                y = addPage("EXTRATO / CONTINUAÇÃO");
                drawTableHeader();
            }

            const description = doc.splitTextToSize(transaction.description, 74)[0];
            const category = doc.splitTextToSize(`${transaction.category} / ${transaction.accountLabel}`, 74)[0];
            doc.setFont("courier", "normal");
            doc.setFontSize(7.4);
            doc.setTextColor(...BLACK);
            doc.text(transaction.date.split("-").reverse().join("/"), columns.date, y + 2);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8.2);
            doc.text(description, columns.description, y + 1);
            doc.setFont("courier", "normal");
            doc.setFontSize(6.8);
            doc.setTextColor(...GRAY);
            doc.text(category, columns.description, y + 5.3);
            doc.text(`${transaction.type === "income" ? "ENTROU" : "SAIU"} / ${transaction.methodLabel}`, columns.type, y + 2);
            doc.setFont("courier", "bold");
            doc.setFontSize(7.7);
            doc.setTextColor(...BLACK);
            doc.text(`${transaction.type === "income" ? "+" : "-"} ${currency(transaction.amount)}`, columns.value, y + 2, { align: "right" });
            doc.setDrawColor(210, 208, 199);
            doc.setLineWidth(0.25);
            doc.line(margin, y + 8, pageWidth - margin, y + 8);
            y += 11;
        });
    }

    const filename = `folego-relatorio-${safeFilePart(report.periodLabel) || "financeiro"}.pdf`;
    const blob = doc.output("blob");
    return { blob, filename };
}
