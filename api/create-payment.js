export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // --- CORS recomendado (lista blanca) ---
    const allowList = (process.env.NX_ALLOWED_ORIGINS || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    const origin = req.headers.origin || "";
    if (allowList.length && !allowList.includes(origin)) {
      return res.status(403).json({ error: "Origin not allowed" });
    }

    const { productos = "", monto = 0, deviceId = "" } = req.body || {};

    const PAY_BASE = process.env.NX_NODE || "https://pay.payphonetodoesposible.com";
    const AUTH = process.env.NX_BRIDGE;   // Bearer ***
    const STORE = process.env.NX_STORE;   // storeId
    const PUBLIC_BASE = process.env.NX_GATE || "https://pagos.macvasquez.com";

    if (!AUTH || !STORE) {
      return res.status(500).json({ error: "Misconfiguration" });
    }

    // monto USD → centavos
    const amountCents = Math.max(0, Math.round(Number(monto) * 100));
    if (!amountCents) {
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

    // Referencia legible (similar a tu index.html original)
    const refName = (() => {
      try {
        const first = decodeURIComponent((productos || "").split(",")[0] || "");
        const name = first.split("|")[0] || "Productos";
        return `Compra MACVASQUEZ - ${name}`.slice(0, 100);
      } catch {
        return "Compra MACVASQUEZ";
      }
    })();

    // Payload PayPhone
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

    const r = await fetch(`${PAY_BASE}/api/button/Prepare`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": AUTH
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data) {
      return res.status(502).json({ error: "Error al preparar pago", detail: data || null });
    }

    const payUrl = data.payWithCard || data.payWithCardDirect || null;
    if (!payUrl) {
      return res.status(502).json({ error: "El proveedor no devolvió URL de pago", detail: data || null });
    }

    // Respuesta segura al cliente
    return res.status(200).json({
      url: payUrl,
      clientTransactionId
    });

  } catch (err) {
    console.error("create-payment error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
