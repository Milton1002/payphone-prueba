// /api/create-payment.js
// Vercel / Netlify style serverless (Node 18+)
import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { productos = "", monto = 0, deviceId = "" } = req.body || {};

    // Valores desde variables de entorno (NO en el repo)
    const PAY_BASE = process.env.MV_BASE_URL || "https://pay.payphonetodoesposible.com";
    const AUTH = process.env.MV_PAY_SECRET; // ej: "Bearer ABC..."
    const STORE = process.env.MV_STORE_KEY;

    if (!AUTH || !STORE) return res.status(500).json({ error: "Configuración de pago incompleta" });

    const transactionId = Date.now().toString();

    // Preparar payload igual que en tu cliente original (amount en centavos)
    // Si monto viene en dólares: monto * 100 (enteros)
    const amountNum = Math.round((parseFloat(monto) || 0) * 100);

    const responseUrlBase = `${process.env.PUBLIC_BASE_ORIGIN || "https://pagos.macvasquez.com"}/order-status.html`;
    const responseUrlParams = new URLSearchParams({
      productos: productos || "",
      deviceId: deviceId || ""
    });

    const payload = {
      amount: amountNum,
      amountWithoutTax: amountNum,
      amountWithTax: 0,
      tax: 0,
      reference: "Compra en MACVASQUEZ - " + (productos ? decodeURIComponent(productos.split(",")[0].split("|")[0]) : "Productos"),
      currency: "USD",
      clientTransactionId: transactionId,
      storeId: STORE,
      ResponseUrl: responseUrlBase + "?" + responseUrlParams.toString()
    };

    const r = await fetch(`${PAY_BASE}/api/button/Prepare`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": AUTH
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(502).json({ error: "Error al preparar pago", detail: data });
    }

    // Devuelve solo lo necesario al frontend
    return res.json({
      payWithCard: data.payWithCard || null,
      transactionId,
      raw: process.env.NODE_ENV === "development" ? data : undefined // opcional para debug dev
    });

  } catch (err) {
    console.error("create-payment error:", err);
    res.status(500).json({ error: "Error interno" });
  }
}
