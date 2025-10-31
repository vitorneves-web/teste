require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { MercadoPagoConfig, Payment } = require("mercadopago");
const crypto = require("crypto");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// ✅ URL do seu Web App do Google Apps Script
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyR6qlKPnhAlMn7Klwfts6GRhSUyRl8k7wWEhKrCM1fDjU04mtr_Tt-928BXhNZtMSbgA/exec";

// ✅ Configuração do Mercado Pago
const ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const client = new MercadoPagoConfig({ accessToken: ACCESS_TOKEN });
const payment = new Payment(client);

// 🔹 Função para tentar obter o pagamento diretamente na API REST
async function getPaymentDirect(paymentId, retries = 6, delay = 4000) {
  for (let i = 0; i < retries; i++) {
    const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (resp.status === 404) {
      console.log(`ℹ️ Pagamento ainda não encontrado (${i + 1}/${retries}). Tentando novamente em ${delay / 1000}s...`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Erro na API do Mercado Pago: ${errText}`);
    }

    return await resp.json();
  }

  throw new Error("Pagamento não encontrado após múltiplas tentativas.");
}

// 🔹 Função para enviar dados à planilha (com retry opcional)
async function sendToSheet(data) {
  const retries = 3;
  const delay = 2000;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (err) {
      console.log(`⚠️ Falha ao enviar para planilha, tentativa ${i + 1}: ${err.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  console.error("❌ Não foi possível enviar os dados após múltiplas tentativas.");
}

// ✅ Endpoint para criar pagamento PIX
app.post("/process_payment", async (req, res) => {
  try {
    const referenceId = crypto.randomUUID();

    const result = await payment.create({
      body: {
        transaction_amount: 12.99,
        description: "Inscrição - Grupo de Corredores",
        payment_method_id: "pix",
        payer: {
          email: req.body.email,
          first_name: req.body.payerFirstName,
          last_name: req.body.payerLastName,
          identification: {
            type: req.body.identificationType,
            number: req.body.identificationNumber,
          },
        },
        external_reference: referenceId,
      },
      requestOptions: { idempotencyKey: crypto.randomUUID() },
    });

    // Envia para a planilha como "Aguardando pagamento"
    const data = {
      payerFirstName: req.body.payerFirstName,
      payerLastName: req.body.payerLastName,
      email: req.body.email,
      identificationNumber: req.body.identificationNumber,
      transactionAmount: 12.99,
      date: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      status: "Aguardando pagamento",
      external_reference: referenceId,
      paymentId: result.id || "",
    };

    await sendToSheet(data);

    res.json(result);
  } catch (error) {
    console.error("Erro ao criar pagamento:", error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Webhook do Mercado Pago
app.post("/webhook", bodyParser.json(), async (req, res) => {
  try {
    console.log("📩 Webhook recebido:", JSON.stringify(req.body).slice(0, 500));

    const paymentId = req.body.data?.id || req.body.resource?.id || req.body.id;
    if (!paymentId) return res.status(200).send("No payment id");

    const paymentInfo = await getPaymentDirect(paymentId);
    console.log("💰 Pagamento consultado:", paymentInfo.id, paymentInfo.status);

    if (["approved", "paid", "success"].includes(paymentInfo.status)) {
      console.log("✅ Pagamento aprovado:", paymentInfo.payer?.email);

      const data = {
        payerFirstName: paymentInfo.payer?.first_name || "",
        payerLastName: paymentInfo.payer?.last_name || "",
        email: paymentInfo.payer?.email || "",
        identificationNumber: paymentInfo.payer?.identification?.number || "",
        transactionAmount: paymentInfo.transaction_amount || "",
        paymentId: paymentInfo.id || "",
        external_reference: paymentInfo.external_reference || "",
        date: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
        status: "Aprovado",
      };

      await sendToSheet(data);
    } else {
      console.log("ℹ️ Pagamento ainda não aprovado:", paymentInfo.status);
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Erro no webhook:", err);
    res.status(500).send("Erro");
  }
});

// Porta dinâmica
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
