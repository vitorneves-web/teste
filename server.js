require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { MercadoPagoConfig, Payment } = require("mercadopago");
const crypto = require("crypto");
const fetch = require("node-fetch"); // para enviar à planilha

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// ✅ URL do seu Web App do Google Apps Script
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxwSwmexJtO3PAdMDEjvNf-_JcrpAS3LjuIa2ISig7JxS1G3mSJRljXVrfXPUAyt7FLoA/exec";

// Configuração do Mercado Pago (NÃO ALTERAR)
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
});
const payment = new Payment(client);

// ✅ Endpoint para criar pagamento PIX
app.post("/process_payment", async (req, res) => {
  try {
    const result = await payment.create({
      body: {
        transaction_amount: 1.00, // valor de teste
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
        external_reference: crypto.randomUUID(), // ID local único
      },
      requestOptions: { idempotencyKey: crypto.randomUUID() },
    });

    res.json(result);
  } catch (error) {
    console.error("Erro ao criar pagamento:", error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Webhook do Mercado Pago
app.post("/webhook", express.json(), async (req, res) => {
  try {
    console.log("📩 Webhook recebido:", JSON.stringify(req.body).slice(0, 500));

    // Pegando ID do pagamento
    const paymentId = req.body.data?.id || req.body.resource?.id || req.body.id;
    if (!paymentId) return res.status(200).send("No payment id");

    let paymentInfo;
    try {
      const mpResp = await payment.get({ payment_id: paymentId });
      paymentInfo = mpResp.body || mpResp;
    } catch (err) {
      if (err.message.includes("resource not found")) {
        console.log("ℹ️ Pagamento ainda não disponível. Ignorando webhook temporariamente.");
        return res.status(200).send("Pagamento não disponível ainda");
      } else {
        throw err;
      }
    }

    console.log("💰 Pagamento consultado:", paymentInfo.id, paymentInfo.status);

    // Só envia para a planilha se aprovado
    if (["approved", "paid", "success"].includes(paymentInfo.status)) {
      console.log("✅ Pagamento aprovado:", paymentInfo.payer?.email);

      const data = {
        payerFirstName: paymentInfo.payer?.first_name || "",
        payerLastName: paymentInfo.payer?.last_name || "",
        email: paymentInfo.payer?.email || "",
        identificationNumber: paymentInfo.payer?.identification?.number || "",
        transactionAmount: paymentInfo.transaction_amount || "",
        paymentId: paymentInfo.id || "",
        date: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      };

      // Envia para Google Sheets via Apps Script
      try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
          method: "POST",
          body: JSON.stringify(data),
          headers: { "Content-Type": "application/json" },
        });

        const result = await response.text();
        console.log("📊 Planilha atualizada com sucesso:", result);
      } catch (err) {
        console.error("⚠️ Erro ao enviar dados para planilha:", err);
      }
    } else {
      console.log("ℹ️ Pagamento ainda não aprovado:", paymentInfo.status);
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Erro no webhook:", err);
    res.status(500).send("Erro");
  }
});

// Porta dinâmica (Render exige isso)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
