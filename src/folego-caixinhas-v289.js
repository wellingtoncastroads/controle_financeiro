import {
    ACCOUNT_METHOD_VALUES,
    RESERVE_STORAGE_METHOD,
    accountNameForMethod
} from "./folego-accounts-v28.js";
import {
    TRANSFER_CATEGORY,
    getTransferPair,
    isInternalTransfer
} from "./folego-transfer-v27.js";

export const SAVINGS_BOXES_META_KEY = "folego_savings_boxes_v289";
export const SAVINGS_BOXES_VERSION = 1;
export const LEGACY_BOX_PREFIX = "legacy:";

export const SAVINGS_MOVEMENT_KINDS = Object.freeze({
    SAVE: "save",
    REDEEM: "redeem",
    MOVE: "move"
});

export const SAVINGS_BOX_ICONS = Object.freeze([
    "shield",
    "plane",
    "home",
    "person",
    "target",
    "bag",
    "heart",
    "spark"
]);

export const SAVINGS_BOX_COLORS = Object.freeze([
    "green",
    "yellow",
    "orange",
    "purple",
    "blue"
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AMOUNT = 999999999999.99;
const MAX_BOXES = 100;
const MAX_MOVEMENTS = 5000;
const VALID_MOVEMENT_KINDS = new Set(Object.values(SAVINGS_MOVEMENT_KINDS));
const VALID_ICONS = new Set(SAVINGS_BOX_ICONS);
const VALID_COLORS = new Set(SAVINGS_BOX_COLORS);

const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const paymentMethodOf = (transaction) => transaction?.paymentMethod ?? transaction?.payment_method ?? null;
const seriesIdOf = (transaction) => transaction?.seriesId ?? transaction?.series_id ?? null;
const transactionDate = (transaction) => String(transaction?.date ?? transaction?.occurred_on ?? "");
const createdAtOf = (transaction) => String(transaction?.createdAt ?? transaction?.created_at ?? "");

function cleanText(value, maximumLength) {
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, maximumLength);
}

function cleanAmount(value, { optional = false } = {}) {
    if (optional && (value === "" || value === null || value === undefined)) return null;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return null;
    return roundMoney(amount);
}

function isValidDate(value) {
    if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year
        && parsed.getUTCMonth() === month - 1
        && parsed.getUTCDate() === day;
}

export function legacyBoxId(accountMethod) {
    return ACCOUNT_METHOD_VALUES.includes(accountMethod) ? `${LEGACY_BOX_PREFIX}${accountMethod}` : null;
}

export function accountForLegacyBoxId(boxId) {
    if (typeof boxId !== "string" || !boxId.startsWith(LEGACY_BOX_PREFIX)) return null;
    const accountMethod = boxId.slice(LEGACY_BOX_PREFIX.length);
    return ACCOUNT_METHOD_VALUES.includes(accountMethod) ? accountMethod : null;
}

export function isSavingsBoxReference(value) {
    return typeof value === "string" && (UUID_PATTERN.test(value) || Boolean(accountForLegacyBoxId(value)));
}

export function legacySavingsBox(accountMethod) {
    const id = legacyBoxId(accountMethod);
    if (!id) return null;
    return {
        id,
        name: "Reserva anterior",
        accountMethod,
        target: null,
        deadline: null,
        icon: "shield",
        color: "green",
        archived: false,
        legacy: true,
        createdAt: null
    };
}

function normalizeBox(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const id = typeof value.id === "string" && UUID_PATTERN.test(value.id) ? value.id : null;
    const name = cleanText(value.name, 48);
    const accountMethod = ACCOUNT_METHOD_VALUES.includes(value.accountMethod) ? value.accountMethod : null;
    const target = cleanAmount(value.target, { optional: true });
    const deadline = value.deadline ? (isValidDate(value.deadline) ? value.deadline : null) : null;
    const icon = VALID_ICONS.has(value.icon) ? value.icon : "target";
    const color = VALID_COLORS.has(value.color) ? value.color : "green";
    const createdAt = typeof value.createdAt === "string" && !Number.isNaN(Date.parse(value.createdAt))
        ? new Date(value.createdAt).toISOString()
        : null;

    if (!id || !name || !accountMethod) return null;
    return {
        id,
        name,
        accountMethod,
        target,
        deadline,
        icon,
        color,
        archived: Boolean(value.archived),
        legacy: false,
        createdAt
    };
}

function boxAccount(boxId, boxesById) {
    return boxesById.get(boxId)?.accountMethod || accountForLegacyBoxId(boxId);
}

function normalizeMovement(value, boxesById) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const kind = VALID_MOVEMENT_KINDS.has(value.kind) ? value.kind : null;
    const accountMethod = ACCOUNT_METHOD_VALUES.includes(value.accountMethod) ? value.accountMethod : null;
    if (!kind || !accountMethod) return null;

    if ([SAVINGS_MOVEMENT_KINDS.SAVE, SAVINGS_MOVEMENT_KINDS.REDEEM].includes(kind)) {
        const boxId = isSavingsBoxReference(value.boxId) ? value.boxId : null;
        if (!boxId || boxAccount(boxId, boxesById) !== accountMethod) return null;
        return { kind, accountMethod, boxId };
    }

    const fromBoxId = isSavingsBoxReference(value.fromBoxId) ? value.fromBoxId : null;
    const toBoxId = isSavingsBoxReference(value.toBoxId) ? value.toBoxId : null;
    if (
        !fromBoxId
        || !toBoxId
        || fromBoxId === toBoxId
        || boxAccount(fromBoxId, boxesById) !== accountMethod
        || boxAccount(toBoxId, boxesById) !== accountMethod
    ) return null;
    return { kind, accountMethod, fromBoxId, toBoxId };
}

export function normalizeSavingsBoxesMetadata(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const boxes = [];
    const seen = new Set();
    for (const item of Array.isArray(source.boxes) ? source.boxes : []) {
        const box = normalizeBox(item);
        if (!box || seen.has(box.id)) continue;
        seen.add(box.id);
        boxes.push(box);
        if (boxes.length >= MAX_BOXES) break;
    }

    const boxesById = new Map(boxes.map((box) => [box.id, box]));
    const movements = {};
    for (const [seriesId, rawMovement] of Object.entries(source.movements || {})) {
        if (!UUID_PATTERN.test(seriesId)) continue;
        const movement = normalizeMovement(rawMovement, boxesById);
        if (!movement) continue;
        movements[seriesId] = movement;
        if (Object.keys(movements).length >= MAX_MOVEMENTS) break;
    }

    return { version: SAVINGS_BOXES_VERSION, boxes, movements };
}

export function buildSavingsBox(values, uuid = () => crypto.randomUUID(), now = () => new Date().toISOString()) {
    const existingId = typeof values?.id === "string" && UUID_PATTERN.test(values.id) ? values.id : null;
    const id = existingId || uuid();
    if (!UUID_PATTERN.test(id)) return null;
    return normalizeBox({
        id,
        name: values?.name,
        accountMethod: values?.accountMethod,
        target: values?.target,
        deadline: values?.deadline,
        icon: values?.icon,
        color: values?.color,
        archived: values?.archived,
        createdAt: values?.createdAt || now()
    });
}

export function upsertSavingsBox(metadataValue, boxValue) {
    const metadata = normalizeSavingsBoxesMetadata(metadataValue);
    const box = normalizeBox(boxValue);
    if (!box) return metadata;
    const boxes = metadata.boxes.some((item) => item.id === box.id)
        ? metadata.boxes.map((item) => item.id === box.id ? box : item)
        : [...metadata.boxes, box].slice(0, MAX_BOXES);
    return normalizeSavingsBoxesMetadata({ ...metadata, boxes });
}

export function archiveSavingsBox(metadataValue, boxId, archived = true) {
    const metadata = normalizeSavingsBoxesMetadata(metadataValue);
    return normalizeSavingsBoxesMetadata({
        ...metadata,
        boxes: metadata.boxes.map((box) => box.id === boxId ? { ...box, archived: Boolean(archived) } : box)
    });
}

export function assignSavingsMovement(metadataValue, seriesId, movementValue) {
    const metadata = normalizeSavingsBoxesMetadata(metadataValue);
    if (!UUID_PATTERN.test(String(seriesId || ""))) return metadata;
    return normalizeSavingsBoxesMetadata({
        ...metadata,
        movements: { ...metadata.movements, [seriesId]: movementValue }
    });
}

export function removeSavingsMovementAssignment(metadataValue, seriesId) {
    const metadata = normalizeSavingsBoxesMetadata(metadataValue);
    const movements = { ...metadata.movements };
    delete movements[seriesId];
    return { ...metadata, movements };
}

export function pruneSavingsMovementAssignments(metadataValue, transactions) {
    const metadata = normalizeSavingsBoxesMetadata(metadataValue);
    const activeSeries = new Set((Array.isArray(transactions) ? transactions : []).map(seriesIdOf).filter(Boolean));
    return {
        ...metadata,
        movements: Object.fromEntries(Object.entries(metadata.movements).filter(([seriesId]) => activeSeries.has(seriesId)))
    };
}

export function savingsBoxForId(metadataValue, boxId) {
    const metadata = normalizeSavingsBoxesMetadata(metadataValue);
    return metadata.boxes.find((box) => box.id === boxId) || legacySavingsBox(accountForLegacyBoxId(boxId));
}

export function savingsMovementForSeries(metadataValue, seriesId) {
    return normalizeSavingsBoxesMetadata(metadataValue).movements[seriesId] || null;
}

function completePairs(transactions, throughDate) {
    const source = Array.isArray(transactions) ? transactions : [];
    const seriesIds = [...new Set(source
        .filter((transaction) => (
            isInternalTransfer(transaction)
            && transaction?.status === "paid"
            && transactionDate(transaction) <= throughDate
        ))
        .map(seriesIdOf)
        .filter((seriesId) => typeof seriesId === "string" && UUID_PATTERN.test(seriesId)))];

    return seriesIds
        .map((seriesId) => getTransferPair(source, seriesId))
        .filter((pair) => (
            pair.complete
            && pair.outgoing?.status === "paid"
            && pair.incoming?.status === "paid"
            && transactionDate(pair.outgoing) <= throughDate
            && transactionDate(pair.incoming) <= throughDate
        ))
        .sort((left, right) => {
            const leftKey = `${transactionDate(left.outgoing)}|${createdAtOf(left.outgoing)}|${left.seriesId}`;
            const rightKey = `${transactionDate(right.outgoing)}|${createdAtOf(right.outgoing)}|${right.seriesId}`;
            return leftKey.localeCompare(rightKey);
        });
}

function movementAmount(pair) {
    const amount = Number(pair?.outgoing?.amount);
    return Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : 0;
}

export function inferSavingsMovementForPair(pair, metadataValue = {}) {
    if (!pair?.complete) return null;
    const mapped = savingsMovementForSeries(metadataValue, pair.seriesId);
    if (mapped) return mapped;
    const from = paymentMethodOf(pair.outgoing);
    const to = paymentMethodOf(pair.incoming);
    if (ACCOUNT_METHOD_VALUES.includes(from) && to === RESERVE_STORAGE_METHOD) {
        return {
            kind: SAVINGS_MOVEMENT_KINDS.SAVE,
            accountMethod: from,
            boxId: legacyBoxId(from),
            legacy: true
        };
    }
    if (from === RESERVE_STORAGE_METHOD && ACCOUNT_METHOD_VALUES.includes(to)) {
        return {
            kind: SAVINGS_MOVEMENT_KINDS.REDEEM,
            accountMethod: to,
            boxId: legacyBoxId(to),
            legacy: true
        };
    }
    return null;
}

export function calculateSavingsBoxes(transactions, metadataValue, throughDate = "9999-12-31") {
    const metadata = normalizeSavingsBoxesMetadata(metadataValue);
    const definitions = new Map(metadata.boxes.map((box) => [box.id, box]));
    const balances = new Map(metadata.boxes.map((box) => [box.id, 0]));

    const ensureLegacy = (accountMethod) => {
        const box = legacySavingsBox(accountMethod);
        if (!box) return null;
        if (!definitions.has(box.id)) definitions.set(box.id, box);
        if (!balances.has(box.id)) balances.set(box.id, 0);
        return box.id;
    };
    const change = (boxId, amount) => {
        if (!boxId || !Number.isFinite(amount)) return;
        const legacyAccount = accountForLegacyBoxId(boxId);
        if (legacyAccount) ensureLegacy(legacyAccount);
        if (!definitions.has(boxId)) return;
        balances.set(boxId, roundMoney((balances.get(boxId) || 0) + amount));
    };
    const consumeLegacy = (amount, preferredAccount) => {
        let remaining = amount;
        const preferredId = ensureLegacy(preferredAccount);
        const candidates = [preferredId, ...ACCOUNT_METHOD_VALUES.map(ensureLegacy)]
            .filter((id, index, list) => id && list.indexOf(id) === index);
        for (const boxId of candidates) {
            const available = Math.max(0, balances.get(boxId) || 0);
            const used = Math.min(available, remaining);
            if (used > 0) change(boxId, -used);
            remaining = roundMoney(remaining - used);
            if (remaining <= 0) break;
        }
        if (remaining > 0 && preferredId) change(preferredId, -remaining);
    };

    for (const pair of completePairs(transactions, throughDate)) {
        const amount = movementAmount(pair);
        if (!amount) continue;
        const mapped = metadata.movements[pair.seriesId];
        if (mapped?.kind === SAVINGS_MOVEMENT_KINDS.SAVE) {
            change(mapped.boxId, amount);
            continue;
        }
        if (mapped?.kind === SAVINGS_MOVEMENT_KINDS.REDEEM) {
            change(mapped.boxId, -amount);
            continue;
        }
        if (mapped?.kind === SAVINGS_MOVEMENT_KINDS.MOVE) {
            change(mapped.fromBoxId, -amount);
            change(mapped.toBoxId, amount);
            continue;
        }

        const from = paymentMethodOf(pair.outgoing);
        const to = paymentMethodOf(pair.incoming);
        if (ACCOUNT_METHOD_VALUES.includes(from) && to === RESERVE_STORAGE_METHOD) {
            change(ensureLegacy(from), amount);
        } else if (from === RESERVE_STORAGE_METHOD && ACCOUNT_METHOD_VALUES.includes(to)) {
            consumeLegacy(amount, to);
        }
    }

    const boxes = [...definitions.values()]
        .map((box) => ({ ...box, balance: roundMoney(balances.get(box.id) || 0) }))
        .filter((box) => !box.legacy || box.balance !== 0)
        .sort((left, right) => (
            ACCOUNT_METHOD_VALUES.indexOf(left.accountMethod) - ACCOUNT_METHOD_VALUES.indexOf(right.accountMethod)
            || Number(left.archived) - Number(right.archived)
            || String(left.createdAt || "").localeCompare(String(right.createdAt || ""))
            || left.name.localeCompare(right.name, "pt-BR")
        ));
    const byAccount = Object.fromEntries(ACCOUNT_METHOD_VALUES.map((accountMethod) => {
        const accountBoxes = boxes.filter((box) => box.accountMethod === accountMethod);
        return [accountMethod, {
            accountMethod,
            boxes: accountBoxes,
            total: roundMoney(accountBoxes.reduce((sum, box) => sum + box.balance, 0))
        }];
    }));

    return {
        boxes,
        byAccount,
        total: roundMoney(boxes.reduce((sum, box) => sum + box.balance, 0)),
        metadata
    };
}

export function calculateSavingsAccountAdjustments(transactions, metadataValue, throughDate = "9999-12-31") {
    const metadata = normalizeSavingsBoxesMetadata(metadataValue);
    const adjustments = Object.fromEntries(ACCOUNT_METHOD_VALUES.map((method) => [method, 0]));

    for (const pair of completePairs(transactions, throughDate)) {
        const movement = metadata.movements[pair.seriesId];
        const amount = movementAmount(pair);
        if (!movement || !amount) continue;
        if (
            movement.kind === SAVINGS_MOVEMENT_KINDS.SAVE
            && paymentMethodOf(pair.outgoing) !== movement.accountMethod
        ) {
            adjustments[movement.accountMethod] = roundMoney(adjustments[movement.accountMethod] - amount);
        }
        if (
            movement.kind === SAVINGS_MOVEMENT_KINDS.REDEEM
            && paymentMethodOf(pair.incoming) !== movement.accountMethod
        ) {
            adjustments[movement.accountMethod] = roundMoney(adjustments[movement.accountMethod] + amount);
        }
    }
    return adjustments;
}

export function applySavingsAccountAdjustments(accountSnapshot, transactions, metadataValue, throughDate = "9999-12-31") {
    const source = accountSnapshot?.balances || {};
    const adjustments = calculateSavingsAccountAdjustments(transactions, metadataValue, throughDate);
    const balances = Object.fromEntries(ACCOUNT_METHOD_VALUES.map((method) => [
        method,
        roundMoney(Number(source[method] || 0) + Number(adjustments[method] || 0))
    ]));
    return {
        ...accountSnapshot,
        balances,
        total: roundMoney(Object.values(balances).reduce((sum, amount) => sum + amount, 0))
    };
}

export function calculateSavingsFinancialState(accountSnapshot, transactions, metadataValue, throughDate = "9999-12-31") {
    const available = applySavingsAccountAdjustments(accountSnapshot, transactions, metadataValue, throughDate);
    const savings = calculateSavingsBoxes(transactions, metadataValue, throughDate);
    return {
        balances: available.balances,
        available: available.total,
        reserve: savings.total,
        total: roundMoney(available.total + savings.total),
        savings
    };
}

function definitionForMovement(metadataValue, boxId) {
    return savingsBoxForId(metadataValue, boxId);
}

export function validateSavingsMovement(values, financialState, savingsState, metadataValue) {
    const kind = VALID_MOVEMENT_KINDS.has(values?.kind) ? values.kind : null;
    const amount = cleanAmount(values?.amount);
    if (!kind) return { valid: false, code: "kind", message: "Escolha o tipo de movimento." };
    if (amount === null) return { valid: false, code: "amount", message: "Informe um valor maior que zero." };

    if ([SAVINGS_MOVEMENT_KINDS.SAVE, SAVINGS_MOVEMENT_KINDS.REDEEM].includes(kind)) {
        const box = definitionForMovement(metadataValue, values?.boxId);
        if (!box || box.archived) return { valid: false, code: "box", message: "Escolha uma caixinha ativa." };
        if (kind === SAVINGS_MOVEMENT_KINDS.SAVE) {
            const available = roundMoney(financialState?.balances?.[box.accountMethod]);
            if (amount > available) {
                return {
                    valid: false,
                    code: "insufficient_account",
                    message: `${accountNameForMethod(box.accountMethod)} tem ${available.toFixed(2)} livre.`
                };
            }
        } else {
            const balance = roundMoney(savingsState?.boxes?.find((item) => item.id === box.id)?.balance);
            if (amount > balance) {
                return {
                    valid: false,
                    code: "insufficient_box",
                    message: `${box.name} tem ${balance.toFixed(2)} guardado.`
                };
            }
        }
        return { valid: true, code: null, message: "", amount, accountMethod: box.accountMethod, box };
    }

    const fromBox = definitionForMovement(metadataValue, values?.fromBoxId);
    const toBox = definitionForMovement(metadataValue, values?.toBoxId);
    if (!fromBox || !toBox || fromBox.archived || toBox.archived) {
        return { valid: false, code: "box", message: "Escolha duas caixinhas ativas." };
    }
    if (fromBox.id === toBox.id) {
        return { valid: false, code: "same_box", message: "Escolha uma caixinha de destino diferente." };
    }
    if (fromBox.accountMethod !== toBox.accountMethod) {
        return { valid: false, code: "different_accounts", message: "Mover entre bancos exige uma transferência real. Escolha caixinhas da mesma conta." };
    }
    const balance = roundMoney(savingsState?.boxes?.find((item) => item.id === fromBox.id)?.balance);
    if (amount > balance) {
        return { valid: false, code: "insufficient_box", message: `${fromBox.name} tem ${balance.toFixed(2)} guardado.` };
    }
    return {
        valid: true,
        code: null,
        message: "",
        amount,
        accountMethod: fromBox.accountMethod,
        fromBox,
        toBox
    };
}

function cleanMovementDescription(value, validation) {
    const custom = cleanText(value, 80);
    if (custom) return custom;
    if (validation.kind === SAVINGS_MOVEMENT_KINDS.SAVE) {
        return `Guardar em ${validation.box.name} • ${accountNameForMethod(validation.accountMethod)}`;
    }
    if (validation.kind === SAVINGS_MOVEMENT_KINDS.REDEEM) {
        return `Resgatar de ${validation.box.name} • ${accountNameForMethod(validation.accountMethod)}`;
    }
    return `Mover ${validation.fromBox.name} → ${validation.toBox.name}`;
}

export function buildSavingsTransfer(values, metadataValue, uuid = () => crypto.randomUUID()) {
    const kind = values?.kind;
    const amount = cleanAmount(values?.amount);
    const date = String(values?.date || "");
    const existingSeriesId = typeof values?.seriesId === "string" && UUID_PATTERN.test(values.seriesId)
        ? values.seriesId
        : null;
    const seriesId = existingSeriesId || uuid();
    if (!VALID_MOVEMENT_KINDS.has(kind) || amount === null || !isValidDate(date) || !UUID_PATTERN.test(seriesId)) return null;

    const box = kind === SAVINGS_MOVEMENT_KINDS.MOVE ? null : definitionForMovement(metadataValue, values?.boxId);
    const fromBox = kind === SAVINGS_MOVEMENT_KINDS.MOVE ? definitionForMovement(metadataValue, values?.fromBoxId) : null;
    const toBox = kind === SAVINGS_MOVEMENT_KINDS.MOVE ? definitionForMovement(metadataValue, values?.toBoxId) : null;
    const accountMethod = box?.accountMethod || fromBox?.accountMethod;
    if (!ACCOUNT_METHOD_VALUES.includes(accountMethod)) return null;
    if (kind === SAVINGS_MOVEMENT_KINDS.MOVE && (!fromBox || !toBox || fromBox.accountMethod !== toBox.accountMethod || fromBox.id === toBox.id)) return null;

    // O banco de dados atual ainda não aceita "nubank" em payment_method.
    // Para essa conta, as duas pernas ficam em "other" e o banco real é
    // preservado no metadado da caixinha, sem migração ou alteração de schema.
    const persistedAccountMethod = accountMethod === "nubank" ? RESERVE_STORAGE_METHOD : accountMethod;
    const from = kind === SAVINGS_MOVEMENT_KINDS.SAVE ? persistedAccountMethod : RESERVE_STORAGE_METHOD;
    const to = kind === SAVINGS_MOVEMENT_KINDS.REDEEM ? persistedAccountMethod : RESERVE_STORAGE_METHOD;
    const validation = kind === SAVINGS_MOVEMENT_KINDS.MOVE
        ? { kind, accountMethod, fromBox, toBox }
        : { kind, accountMethod, box };
    const description = cleanMovementDescription(values?.description, validation);
    const common = {
        description,
        amount,
        category: TRANSFER_CATEGORY,
        date,
        status: "paid",
        seriesId,
        seriesKind: null,
        installmentNumber: null,
        installmentTotal: null
    };
    const movement = kind === SAVINGS_MOVEMENT_KINDS.MOVE
        ? { kind, accountMethod, fromBoxId: fromBox.id, toBoxId: toBox.id }
        : { kind, accountMethod, boxId: box.id };

    return {
        seriesId,
        kind,
        accountMethod,
        movement,
        outgoing: {
            ...common,
            id: typeof values?.outgoingId === "string" ? values.outgoingId : "",
            type: "expense",
            paymentMethod: from
        },
        incoming: {
            ...common,
            id: typeof values?.incomingId === "string" ? values.incomingId : "",
            type: "income",
            paymentMethod: to
        }
    };
}
