import {
    allowMethods,
    assertItemOwnership,
    getPluggyApiKey,
    handleApiError,
    pluggyRequest,
    readJson,
    requireSupabaseUser,
    sendJson
} from "../_pluggy.js";

export default async function handler(request, response) {
    if (!allowMethods(request, response, ["POST"])) return;
    console.info("Fôlego / Pluggy token: requisição recebida.");
    try {
        const body = await readJson(request);
        const user = await requireSupabaseUser(request, body.__folegoSession);
        delete body.__folegoSession;
        console.info("Fôlego / Pluggy token: sessão validada.");
        const itemId = typeof body.itemId === "string" ? body.itemId : undefined;
        const apiKey = await getPluggyApiKey();
        if (itemId) await assertItemOwnership(itemId, user.id, apiKey);

        const payload = await pluggyRequest("/connect_token", {
            method: "POST",
            apiKey,
            body: {
                ...(itemId ? { itemId } : {}),
                options: {
                    clientUserId: user.id,
                    avoidDuplicates: true
                }
            }
        });
        sendJson(response, 200, {
            accessToken: payload.accessToken || payload.connectToken,
            expiresIn: 1800
        });
        console.info("Fôlego / Pluggy token: token temporário emitido.");
    } catch (error) {
        handleApiError(response, error);
    }
}
