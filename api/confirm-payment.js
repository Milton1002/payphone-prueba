export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // --- CORS recomendado ---
    const allowList = (process.env.NX_ALLOWED_ORIGINS || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    const origin = req.headers.origin || "";
    if (allowList.length && !allowList.includes(origin)) {
      return res.status(403).json({ error: "Origin not allowed" });
    }

    const { id, clientTxId } = req.body || {};
    if (!id || !clientTxId) {
      return res.status(400).json({ error: "Faltan parámetros (id, clientTxId)" });
    }

    const PAY_BASE = process.env.NX_NODE || "https://pay.payphonetodoesposible.com";
    const AUTH = process.env.NX_BRIDGE;

    if (!AUTH) {
      return res.status(500).json({ error: "Misconfiguration" });
    }

    const payload = {
      id: Number(id),
      clientTxId
    };

    const r = await fetch(`${PAY_BASE}/api/button/V2/Confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": AUTH
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(502).json({ error: "Error del proveedor al confirmar", detail: data || null });
    }

    // Regresamos lo necesario para que el front pueda registrar en GAS
    return res.status(200).json({ ok: true, data });

  } catch (err) {
    console.error("confirm-payment error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
