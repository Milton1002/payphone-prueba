// /api/create-payment.js
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const debugEnabled =
      (req.headers["x-debug"] === "1") ||
      (typeof req.query?.debug !== "undefined"); // por si llamas /api/create-payment?debug=1

    // --- CORS (lista blanca flexible) ---
    const allowList = (process.env.NX_ALLOWED_ORIGINS || "")
      .split(",").map(s => s.trim()).filter(Boolean);
    const selfOrigin = `https://${req.headers.host}`;
    if (!allowList.includes(selfOrigin)) allowList.push(selfOrigin);

    const origin = (req.headers.origin || "").toLowerCase();
    const isAllowed = (o) => {
      if (!allowList.length) return true;
      if (!o) return true;
      const x = o.replace(/\/$/, "");
      return allowList.some(a => x === a.toLowerCase().replace(/\/$/, ""));
    };
    const allowed = isAllowed(origin);
    if (!allowed) {
      const dbg = debugEnabled ? { origin, selfOrigin, allowList, allowed } : undefined;
      return res.status(403).json({ error: "Origin not allowed", __debug: dbg });
    }

    // --- Input ---
    const { productos = "", monto = 0, deviceId = "" } = req.body || {};

    // --- Config ---
    const PAY_BASE   = process.env.NX_NODE  || "https://pay.payphonetodoesposible.com";
    const AUTH       = process.env.NX_BRIDGE; // Bearer ***
    const STORE      = process.env.NX_STORE;  // storeId
    const PUBLIC_BASE = process.env.NX_GATE || `https://${req.headers.host}`;

    if (!AUTH || !STORE) {
      const dbg = debugEnabled ? { hasAuth: !!AUTH, hasStore: !!STORE } : undefined;
      return res.status(500).json({ error: "Misconfiguration", __debug: dbg });
    }

    // --- Validaciones ---
    const amountCents = Math.max(0, Math.round(Number(monto) * 100));
    if (!amountCents) {
      const dbg = debugEnabled ? { monto, amountCents } : undefined;
      return res.status(400).json({ error: "Monto inválido", __debug: dbg });
    }

    // --- Construcción payload ---
    const clientTransactionId = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const params = new URLSearchParams({
      productos: productos || "",
      deviceId: deviceId || "",
      clientTransactionId
    });
    const ResponseUrl = `${PUBLIC_BASE.replace(/\/+$/, "")}/order-status.html?${params.toString()}`;

    const refName = (() => {
      try {
        const first = decodeURIComponent((productos || "").split(",")[0] || "");
        const name = first.split("|")[0] || "Productos";
        return `Compra MACVASQUEZ - ${name}`.slice(0, 100);
      } catch { return "Compra MACVASQUEZ"; }
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

    // --- Llamada proveedor ---
    const r = await fetch(`${PAY_BASE}/api/button/Prepare`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": AUTH
      },
      body: JSON.stringify(payload)
    });

    const rawText = await r.text();
    let data; try { data = JSON.parse(rawText); } catch { data = null; }

    // LOG servidor
    console.error("[Prepare] status:", r.status, "body:", (rawText || "").slice(0, 500));

    // DEBUG para cliente (sanitizado)
    const dbg = debugEnabled ? {
      origin, selfOrigin, allowList, allowed,
      PUBLIC_BASE, ResponseUrl, PAY_BASE,
      amountCents, clientTransactionId,
      storeMasked: STORE ? `${STORE.slice(0,4)}…${STORE.slice(-4)} (len=${STORE.length})` : null,
      authMasked:  AUTH ? `${AUTH.slice(0,10)}…${AUTH.slice(-6)} (len=${AUTH.length})` : null,
      providerStatus: r.status,
      providerBodySnippet: (rawText || "").slice(0, 300)
    } : undefined;

    if (!r.ok || !data) {
      return res.status(502).json({ error: "Error al preparar pago", detail: data || rawText || null, __debug: dbg });
    }

    const payUrl = data.payWithCard || data.payWithCardDirect || null;
    if (!payUrl) {
      return res.status(502).json({ error: "El proveedor no devolvió URL de pago", detail: data || null, __debug: dbg });
    }

    return res.status(200).json({ url: payUrl, clientTransactionId, __debug: dbg });

  } catch (err) {
    console.error("create-payment error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
