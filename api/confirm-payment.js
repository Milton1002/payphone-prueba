// /api/confirm-payment.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { id, clientTxId } = req.body || {};
    if (!id || !clientTxId) return res.status(400).json({ error: "Faltan parámetros" });

    const PAY_BASE = process.env.MV_BASE_URL || "https://pay.payphonetodoesposible.com";
    const AUTH = process.env.MV_PAY_SECRET;

    const r = await fetch(`${PAY_BASE}/api/button/V2/Confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": AUTH
      },
      body: JSON.stringify({
        id: Number(id),
        clientTxId: clientTxId
      })
    });

    const data = await r.json();

    // Retornar lo que el cliente necesite para presentarlo
    return res.json({ ok: true, data });

  } catch (err) {
    console.error("confirm-payment error:", err);
    res.status(500).json({ error: "Error interno" });
  }
}
