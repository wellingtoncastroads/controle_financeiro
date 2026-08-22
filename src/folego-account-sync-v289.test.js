import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { accountMethodForTransaction } from "./folego-accounts-v28.js";

describe("sincronização das contas V2.8.9", () => {
    it("usa a conta registrada na movimentação quando o metadado ainda não existe", () => {
        const cashExpense = {
            id: "cash-expense",
            type: "expense",
            paymentMethod: "cash",
            category: "Alimentação"
        };

        expect(accountMethodForTransaction(cashExpense, {})).toBe("cash");
        expect(accountMethodForTransaction(cashExpense, { "cash-expense": "pix" })).toBe("pix");
    });

    it("busca o usuário atualizado ao abrir e ao retornar para o aplicativo", () => {
        const runtime = fs.readFileSync("src/folego-accounts-runtime-v28.js", "utf8");
        expect(runtime).toContain("supabase.auth.getUser()");
        expect(runtime).toContain('window.addEventListener("focus", refreshAccountStateV289)');
        expect(runtime).toContain("await currentAuthUserV289(data.session.user)");
    });
});
