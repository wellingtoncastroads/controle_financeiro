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
    try {
        const user = await requireSupabaseUser(request);
        const body = await readJson(request);
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
    } catch (error) {
        handleApiError(response, error);
    }
}
