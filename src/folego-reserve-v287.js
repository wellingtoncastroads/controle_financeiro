import {
    ACCOUNT_METHOD_VALUES,
    RESERVE_STORAGE_METHOD,
    accountNameForMethod
} from "./folego-accounts-v28.js";
import { TRANSFER_CATEGORY } from "./folego-transfer-v27.js";

export const RESERVE_DIRECTIONS = Object.freeze({
    SAVE: "save",
    REDEEM: "redeem"
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AMOUNT = 999999999999.99;

const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

function cleanAmount(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return null;
    return roundMoney(amount);
}

function cleanDescription(value, direction, accountMethod) {
    const normalized = String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
    if (normalized) return normalized;
    const account = accountNameForMethod(accountMethod);
    return direction === RESERVE_DIRECTIONS.SAVE
        ? `Guardado na Reserva • ${account}`
        : `Resgate da Reserva • ${account}`;
}

export function reserveDirectionForPair(pair) {
    if (!pair?.outgoing || !pair?.incoming) return null;
    if (pair.incoming.paymentMethod === RESERVE_STORAGE_METHOD) return RESERVE_DIRECTIONS.SAVE;
    if (pair.outgoing.paymentMethod === RESERVE_STORAGE_METHOD) return RESERVE_DIRECTIONS.REDEEM;
    return null;
}

export function reserveAccountForPair(pair) {
    const direction = reserveDirectionForPair(pair);
    if (direction === RESERVE_DIRECTIONS.SAVE) return pair.outgoing.paymentMethod;
    if (direction === RESERVE_DIRECTIONS.REDEEM) return pair.incoming.paymentMethod;
    return null;
}

export function validateReserveOperation(values, financialState = {}) {
    const direction = values?.direction;
    const accountMethod = values?.accountMethod;
    const amount = cleanAmount(values?.amount);

    if (!Object.values(RESERVE_DIRECTIONS).includes(direction)) {
        return { valid: false, code: "direction", message: "Escolha entre guardar ou resgatar." };
    }
    if (!ACCOUNT_METHOD_VALUES.includes(accountMethod)) {
        return { valid: false, code: "account", message: "Escolha uma conta válida." };
    }
    if (amount === null) {
        return { valid: false, code: "amount", message: "Informe um valor maior que zero." };
    }

    if (direction === RESERVE_DIRECTIONS.SAVE) {
        const available = roundMoney(financialState?.balances?.[accountMethod]);
        if (amount > available) {
            return {
                valid: false,
                code: "insufficient_account",
                message: `${accountNameForMethod(accountMethod)} tem apenas ${available.toFixed(2)} disponível.`
            };
        }
    }

    if (direction === RESERVE_DIRECTIONS.REDEEM) {
        const reserve = roundMoney(financialState?.reserve);
        if (amount > reserve) {
            return {
                valid: false,
                code: "insufficient_reserve",
                message: `A Reserva tem apenas ${reserve.toFixed(2)} guardado.`
            };
        }
    }

    return { valid: true, code: null, message: "", amount };
}

export function buildReserveTransfer(values, uuid = () => crypto.randomUUID()) {
    const direction = values?.direction;
    const accountMethod = values?.accountMethod;
    const amount = cleanAmount(values?.amount);
    const date = String(values?.date || "");
    const existingSeriesId = typeof values?.seriesId === "string" && UUID_PATTERN.test(values.seriesId)
        ? values.seriesId
        : null;

    if (
        !Object.values(RESERVE_DIRECTIONS).includes(direction)
        || !ACCOUNT_METHOD_VALUES.includes(accountMethod)
        || amount === null
        || !DATE_PATTERN.test(date)
    ) return null;

    const seriesId = existingSeriesId || uuid();
    if (!UUID_PATTERN.test(seriesId)) return null;

    const from = direction === RESERVE_DIRECTIONS.SAVE ? accountMethod : RESERVE_STORAGE_METHOD;
    const to = direction === RESERVE_DIRECTIONS.SAVE ? RESERVE_STORAGE_METHOD : accountMethod;
    const description = cleanDescription(values?.description, direction, accountMethod);
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

    return {
        seriesId,
        direction,
        accountMethod,
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
