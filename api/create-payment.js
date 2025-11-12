// /api/create-payment.js
// Serverless (Vercel, Node 18+). Crea el Prepare y devuelve el enlace de pago.
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

    const { productos = "", monto = 0, deviceId = "" } = req.body || {};

    const PAY_BASE = process.env.NX_NODE || "https://pay.payphonetodoesposible.com";
    const AUTH = process.env.NX_BRIDGE;   // Bearer ***
    const STORE = process.env.NX_STORE;   // storeId
    const PUBLIC_BASE = process.env.NX_GATE || "https://pagos.macvasquez.com";

    if (!AUTH || !STORE) {
      console.error("[Prepare] Misconfiguration: falta NX_BRIDGE o NX_STORE");
      return res.status(500).json({ error: "Misconfiguration" });
    }

    // monto USD → centavos
    const amountCents = Math.max(0, Math.round(Number(monto) * 100));
    if (!amountCents) {
      console.error("[Prepare] Monto inválido (cents):", amountCents, "monto recibido:", monto);
      return res.status(400).json({ error: "Monto inválido" });
    }

    // ID no sensible
    const clientTransactionId = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

    // Construir ResponseUrl (redirección a order-status con datos NO sensibles)
    const params = new URLSearchParams({
      productos: productos || "",
      deviceId: deviceId || "",
      clientTransactionId
    });
    const ResponseUrl = `${PUBLIC_BASE.replace(/\/+$/, "")}/order-status.html?${params.toString()}`;

    // Referencia legible
    const refName = (() => {
      try {
        const first = decodeURIComponent((productos || "").split(",")[0] || "");
        const name = first.split("|")[0] || "Productos";
        return `Compra MACVASQUEZ - ${name}`.slice(0, 100);
      } catch {
        return "Compra MACVASQUEZ";
      }
    })();

    const payload = {
      amount: amountCents,
      amountWithoutTax: amountCents,
      amountWithTax: 0,
      tax: 0,
      clientTransactionId,
      currency: "USD",
      reference: refName,
      storeId: STORE,
      ResponseUrl
    };

    // --- Llamada al proveedor con LOGS de diagnóstico ---
    const r = await fetch(`${PAY_BASE}/api/button/Prepare`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": AUTH
      },
      body: JSON.stringify(payload)
    });

    // Lee texto crudo para log (por si no es JSON válido)
    const rawText = await r.text();
    let data;
    try { data = JSON.parse(rawText); } catch { data = null; }

    console.error("[Prepare] status:", r.status, "body:", (rawText || "").slice(0, 500));

    if (!r.ok || !data) {
      return res.status(502).json({ error: "Error al preparar pago", detail: data || rawText || null });
    }

    const payUrl = data.payWithCard || data.payWithCardDirect || null;
    if (!payUrl) {
      console.error("[Prepare] Missing payWithCard/payWithCardDirect. data:", data);
      return res.status(502).json({ error: "El proveedor no devolvió URL de pago", detail: data || null });
    }

    return res.status(200).json({
      url: payUrl,
      clientTransactionId
    });

  } catch (err) {
    console.error("create-payment error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
