// /api/confirm-payment.js
// Confirma el pago (Confirm) usando el token del backend y devuelve el resultado.
// Incluye: CORS flexible + LOGS de diagnóstico del proveedor (PayPhone).

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // --- CORS recomendado (lista blanca flexible) ---
    const allowList = (process.env.NX_ALLOWED_ORIGINS || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    // Permite el propio host (preview/prod) para no bloquearse a sí mismo
    const selfOrigin = `https://${req.headers.host}`;
    if (!allowList.includes(selfOrigin)) allowList.push(selfOrigin);

    const origin = (req.headers.origin || "").toLowerCase();
    function isAllowed(originStr) {
      if (!allowList.length) return true;   // si no definiste nada, permitir
      if (!originStr) return true;          // si no viene header Origin, permitir
      const o = originStr.replace(/\/$/, "");
      return allowList.some(a => o === a.toLowerCase().replace(/\/$/, ""));
    }
    if (!isAllowed(origin)) {
      return res.status(403).json({ error: "Origin not allowed" });
    }

    const { id, clientTxId } = req.body || {};
    if (!id || !clientTxId) {
      console.error("[Confirm] Faltan parámetros: id/clientTxId", { id, clientTxId });
      return res.status(400).json({ error: "Faltan parámetros (id, clientTxId)" });
    }

    const PAY_BASE = process.env.NX_NODE || "https://pay.payphonetodoesposible.com";
    const AUTH = process.env.NX_BRIDGE;

    if (!AUTH) {
      console.error("[Confirm] Misconfiguration: falta NX_BRIDGE");
      return res.status(500).json({ error: "Misconfiguration" });
    }

    // --- Llamada al proveedor con LOGS de diagnóstico ---
    const r = await fetch(`${PAY_BASE}/api/button/V2/Confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": AUTH
      },
      body: JSON.stringify({ id: Number(id), clientTxId })
    });

    const rawText = await r.text();
    let data;
    try { data = JSON.parse(rawText); } catch { data = null; }

    console.error("[Confirm] status:", r.status, "body:", (rawText || "").slice(0, 500));

    if (!r.ok || !data) {
      return res.status(502).json({ error: "Error del proveedor al confirmar", detail: data || rawText || null });
    }

    return res.status(200).json({ ok: true, data });

  } catch (err) {
    console.error("confirm-payment error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
