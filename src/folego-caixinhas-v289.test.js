import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { summarizeFinancialMovements } from "./folego-transfer-v27.js";
import {
    SAVINGS_MOVEMENT_KINDS,
    applySavingsAccountAdjustments,
    assignSavingsMovement,
    buildSavingsBox,
    buildSavingsTransfer,
    calculateSavingsBoxes,
    normalizeSavingsBoxesMetadata,
    pruneSavingsMovementAssignments,
    upsertSavingsBox,
    validateSavingsMovement
} from "./folego-caixinhas-v289.js";

const IDS = {
    emergency: "11111111-1111-4111-8111-111111111111",
    trip: "22222222-2222-4222-8222-222222222222",
    nubank: "33333333-3333-4333-8333-333333333333",
    save: "44444444-4444-4444-8444-444444444444",
    redeem: "55555555-5555-4555-8555-555555555555",
    move: "66666666-6666-4666-8666-666666666666",
    orphan: "77777777-7777-4777-8777-777777777777"
};

const now = () => "2026-08-20T12:00:00.000Z";
const createBox = (values, id) => buildSavingsBox(values, () => id, now);

function metadataWith(...boxes) {
    return boxes.reduce((metadata, box) => upsertSavingsBox(metadata, box), {});
}

function savePair(metadata, boxId, amount, seriesId = IDS.save) {
    const pair = buildSavingsTransfer({
        kind: SAVINGS_MOVEMENT_KINDS.SAVE,
        boxId,
        amount,
        date: "2026-08-20"
    }, metadata, () => seriesId);
    return {
        pair,
        metadata: assignSavingsMovement(metadata, pair.seriesId, pair.movement)
    };
}

describe("definições de caixinhas", () => {
    it("cria categorias independentes dentro de uma conta", () => {
        const emergency = createBox({
            name: "  Reserva   emergencial ",
            accountMethod: "nubank",
            target: 1500,
            deadline: "2027-01-31",
            icon: "shield",
            color: "green"
        }, IDS.emergency);
        const trip = createBox({
            name: "Chile 2027",
            accountMethod: "nubank",
            target: 2000,
            icon: "plane",
            color: "yellow"
        }, IDS.trip);
        const metadata = metadataWith(emergency, trip);

        expect(metadata.boxes).toHaveLength(2);
        expect(metadata.boxes.map((box) => box.name)).toEqual(["Reserva emergencial", "Chile 2027"]);
        expect(metadata.boxes.every((box) => box.accountMethod === "nubank")).toBe(true);
    });

    it("descarta metadados inválidos sem quebrar os válidos", () => {
        const valid = createBox({
            name: "Casa",
            accountMethod: "pix",
            icon: "home",
            color: "blue"
        }, IDS.emergency);
        const normalized = normalizeSavingsBoxesMetadata({
            boxes: [valid, { id: "inválido", name: "", accountMethod: "qualquer" }],
            movements: { inválido: { kind: "save" } }
        });

        expect(normalized.boxes).toEqual([valid]);
        expect(normalized.movements).toEqual({});
    });
});

describe("guardar, resgatar e mover", () => {
    it("guarda em uma categoria sem criar entrada ou saída", () => {
        const box = createBox({
            name: "Emergência",
            accountMethod: "pix",
            icon: "shield",
            color: "green"
        }, IDS.emergency);
        const initial = metadataWith(box);
        const { pair, metadata } = savePair(initial, box.id, 300);
        const transactions = [pair.outgoing, pair.incoming];
        const savings = calculateSavingsBoxes(transactions, metadata, "2026-08-20");
        const summary = summarizeFinancialMovements(transactions);

        expect(pair.outgoing.paymentMethod).toBe("pix");
        expect(pair.incoming.paymentMethod).toBe("other");
        expect(savings.total).toBe(300);
        expect(savings.boxes[0].balance).toBe(300);
        expect(summary).toMatchObject({ income: 0, expense: 0, result: 0, transferCount: 1 });
    });

    it("resgata somente da caixinha escolhida", () => {
        const box = createBox({
            name: "Emergência",
            accountMethod: "pix",
            icon: "shield",
            color: "green"
        }, IDS.emergency);
        const initial = metadataWith(box);
        const saved = savePair(initial, box.id, 500);
        const redeemPair = buildSavingsTransfer({
            kind: SAVINGS_MOVEMENT_KINDS.REDEEM,
            boxId: box.id,
            amount: 120,
            date: "2026-08-20"
        }, saved.metadata, () => IDS.redeem);
        const metadata = assignSavingsMovement(saved.metadata, redeemPair.seriesId, redeemPair.movement);
        const savings = calculateSavingsBoxes([
            saved.pair.outgoing,
            saved.pair.incoming,
            redeemPair.outgoing,
            redeemPair.incoming
        ], metadata, "2026-08-20");

        expect(savings.total).toBe(380);
        expect(savings.boxes.find((item) => item.id === box.id).balance).toBe(380);
    });

    it("move parte do valor entre duas caixinhas da mesma conta", () => {
        const emergency = createBox({
            name: "Emergência",
            accountMethod: "pix",
            icon: "shield",
            color: "green"
        }, IDS.emergency);
        const trip = createBox({
            name: "Viagem",
            accountMethod: "pix",
            icon: "plane",
            color: "yellow"
        }, IDS.trip);
        const initial = metadataWith(emergency, trip);
        const saved = savePair(initial, emergency.id, 500);
        const movePair = buildSavingsTransfer({
            kind: SAVINGS_MOVEMENT_KINDS.MOVE,
            fromBoxId: emergency.id,
            toBoxId: trip.id,
            amount: 200,
            date: "2026-08-20"
        }, saved.metadata, () => IDS.move);
        const metadata = assignSavingsMovement(saved.metadata, movePair.seriesId, movePair.movement);
        const savings = calculateSavingsBoxes([
            saved.pair.outgoing,
            saved.pair.incoming,
            movePair.outgoing,
            movePair.incoming
        ], metadata, "2026-08-20");

        expect(movePair.outgoing.paymentMethod).toBe("other");
        expect(movePair.incoming.paymentMethod).toBe("other");
        expect(savings.total).toBe(500);
        expect(savings.boxes.find((item) => item.id === emergency.id).balance).toBe(300);
        expect(savings.boxes.find((item) => item.id === trip.id).balance).toBe(200);
    });

    it("impede mover entre bancos porque isso exigiria transferência real", () => {
        const inter = createBox({
            name: "Inter",
            accountMethod: "pix",
            icon: "target",
            color: "green"
        }, IDS.emergency);
        const nubank = createBox({
            name: "Nubank",
            accountMethod: "nubank",
            icon: "target",
            color: "purple"
        }, IDS.nubank);
        const metadata = metadataWith(inter, nubank);
        const validation = validateSavingsMovement({
            kind: SAVINGS_MOVEMENT_KINDS.MOVE,
            fromBoxId: inter.id,
            toBoxId: nubank.id,
            amount: 10
        }, { balances: {} }, {
            boxes: [{ ...inter, balance: 50 }, { ...nubank, balance: 0 }]
        }, metadata);

        expect(validation).toMatchObject({ valid: false, code: "different_accounts" });
    });

    it("bloqueia guardar acima do saldo livre e resgatar acima da caixinha", () => {
        const box = createBox({
            name: "Reserva",
            accountMethod: "pix",
            icon: "shield",
            color: "green"
        }, IDS.emergency);
        const metadata = metadataWith(box);
        const saveValidation = validateSavingsMovement({
            kind: SAVINGS_MOVEMENT_KINDS.SAVE,
            boxId: box.id,
            amount: 80
        }, { balances: { pix: 50 } }, { boxes: [{ ...box, balance: 30 }] }, metadata);
        const redeemValidation = validateSavingsMovement({
            kind: SAVINGS_MOVEMENT_KINDS.REDEEM,
            boxId: box.id,
            amount: 40
        }, { balances: { pix: 50 } }, { boxes: [{ ...box, balance: 30 }] }, metadata);

        expect(saveValidation.code).toBe("insufficient_account");
        expect(redeemValidation.code).toBe("insufficient_box");
    });
});

describe("compatibilidade sem migração de Supabase", () => {
    it("mantém a Reserva antiga ligada à conta de origem", () => {
        const metadata = metadataWith();
        const legacyBox = {
            id: "legacy:pix",
            name: "Reserva anterior",
            accountMethod: "pix",
            icon: "shield",
            color: "green"
        };
        const pair = buildSavingsTransfer({
            kind: SAVINGS_MOVEMENT_KINDS.SAVE,
            boxId: legacyBox.id,
            amount: 1750,
            date: "2026-08-18"
        }, metadata, () => IDS.save);
        const savings = calculateSavingsBoxes([pair.outgoing, pair.incoming], metadata, "2026-08-20");

        expect(savings.total).toBe(1750);
        expect(savings.byAccount.pix.boxes[0]).toMatchObject({
            id: "legacy:pix",
            name: "Reserva anterior",
            balance: 1750,
            legacy: true
        });
    });

    it("representa caixinha Nubank sem gravar payment_method fora da regra atual", () => {
        const box = createBox({
            name: "Chile",
            accountMethod: "nubank",
            icon: "plane",
            color: "purple"
        }, IDS.nubank);
        const initial = metadataWith(box);
        const { pair, metadata } = savePair(initial, box.id, 500);
        const transactions = [pair.outgoing, pair.incoming];
        const adjusted = applySavingsAccountAdjustments({
            balances: { pix: 0, bank_transfer: 0, itau: 0, nubank: 500, cash: 0 },
            total: 500
        }, transactions, metadata, "2026-08-20");

        expect(pair.outgoing.paymentMethod).toBe("other");
        expect(pair.incoming.paymentMethod).toBe("other");
        expect(adjusted.balances.nubank).toBe(0);
        expect(calculateSavingsBoxes(transactions, metadata, "2026-08-20").total).toBe(500);
    });

    it("remove apenas atribuições órfãs ao limpar o metadado", () => {
        const box = createBox({
            name: "Reserva",
            accountMethod: "pix",
            icon: "shield",
            color: "green"
        }, IDS.emergency);
        const saved = savePair(metadataWith(box), box.id, 100);
        const withOrphan = assignSavingsMovement(saved.metadata, IDS.orphan, {
            kind: SAVINGS_MOVEMENT_KINDS.SAVE,
            accountMethod: "pix",
            boxId: box.id
        });
        const pruned = pruneSavingsMovementAssignments(withOrphan, [
            saved.pair.outgoing,
            saved.pair.incoming
        ]);

        expect(Object.keys(pruned.movements)).toEqual([IDS.save]);
    });

    it("não adiciona tabela, coluna ou migração para as caixinhas", () => {
        const patch = fs.readFileSync("tools/apply-pulso-caixinhas-v289.mjs", "utf8");
        const packageJson = fs.readFileSync("package.json", "utf8");

        expect(patch).not.toContain("supabase/migrations");
        expect(patch).not.toContain("alter table");
        expect(packageJson).toContain('"version": "2.8.9"');
    });
});

describe("integração visual e backup", () => {
    it("liga o visual Pulso, a rota Contas e o runtime novo", () => {
        const index = fs.readFileSync("index.html", "utf8");
        const css = fs.readFileSync("src/folego-pulso-v289.css", "utf8");
        const accountsRuntime = fs.readFileSync("src/folego-accounts-runtime-v28.js", "utf8");
        const savingsRuntime = fs.readFileSync("src/folego-caixinhas-runtime-v289.js", "utf8");

        expect(index).toContain('data-view="accounts"');
        expect(index).toContain('class="pulso-v289" data-theme="dark"');
        expect(index).toContain('localStorage.getItem("folego-theme-v2") === "light"');
        expect(index).toContain("/src/folego-pulso-v289.css");
        expect(index).toContain("/src/folego-caixinhas-runtime-v289.js");
        expect(index).not.toContain("folego-reserve-runtime-v287.js");
        expect(css).toContain("--pulso-yellow");
        expect(css).toContain(".savings-ledger-v289");
        expect(accountsRuntime).toContain('window.addEventListener("folego:savings-render-start", () => observer.disconnect())');
        expect(accountsRuntime).toContain('window.addEventListener("folego:savings-render-end", observeApp)');
        expect(savingsRuntime).toContain('new CustomEvent("folego:savings-render-start")');
        expect(savingsRuntime).toContain('new CustomEvent("folego:savings-render-end")');
    });

    it("inclui caixinhas no backup exportado e restaurado", () => {
        const source = fs.readFileSync("script.js", "utf8");
        expect(source).toContain("backup.savingsBoxes = savingsBoxes");
        expect(source).toContain("folegoSavingsBoxesBackup.importData(parsed.savingsBoxes || {})");
        expect(fs.readFileSync("src/domain.js", "utf8")).toContain("BACKUP_VERSION = 4");
    });
});
