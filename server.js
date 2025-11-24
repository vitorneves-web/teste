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

// NODE EMAILER
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Função de envio de e-mail
async function enviarEmailConfirmacao(to, nome) {
  const mailOptions = {
    from: "Se Não Aguentar, Corra! <senaoaguentarcorra2023@gmail.com>",
    to,
    subject: "Pagamento confirmado!",
    text: `
Olá ${nome},

Seu pagamento foi APROVADO! 🎉
Sua inscrição está confirmada.

Nos vemos na corrida!
    `
  };

  await transporter.sendMail(mailOptions);
}

// URL do script
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyR6qlKPnhAlMn7Klwfts6GRhSUyRl8k7wWEhKrCM1fDjU04mtr_Tt-928BXhNZtMSbgA/exec";

// Função buscar dados da planilha pelo external_reference
async function buscarDadosDaPlanilha(referenceId) {
  try {
    const url = `${GOOGLE_SCRIPT_URL}?external_reference=${referenceId}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data || Object.keys(data).length === 0) {
      console.log("⚠️ Nenhuma inscrição encontrada na planilha.");
      return null;
    }

    return data;
  } catch (err) {
    console.error("❌ Erro ao buscar dados na planilha:", err);
    return null;
  }
}

// Mercado Pago config
const ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const client = new MercadoPagoConfig({ accessToken: ACCESS_TOKEN });
const payment = new Payment(client);

// Buscar pagamento na API do MP
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
      throw new Error(`Erro na API do Mercado Pago: ${await resp.text()}`);
    }

    return await resp.json();
  }

  throw new Error("Pagamento não encontrado após múltiplas tentativas.");
}

// Enviar para a planilha
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

// Criar pagamento PIX
app.post("/process_payment", async (req, res) => {
  try {
    const referenceId = crypto.randomUUID();

    const result = await payment.create({
      body: {
        transaction_amount: Number(req.body.valor),
        description: "Inscrição - Grupo de Corredores",
        payment_method_id: "pix",

        external_reference: referenceId,

        payer: {
          email: req.body.email,
          first_name: req.body.payerFirstName,
          last_name: req.body.payerLastName,
          identification: {
            type: req.body.identificationType,
            number: req.body.identificationNumber,
          },
        },
      },
      requestOptions: { idempotencyKey: crypto.randomUUID() },
    });

    const data = {
      status: "Aguardando pagamento",
      payerFirstName: req.body.payerFirstName,
      payerLastName: req.body.payerLastName,
      identificationType: req.body.identificationType,
      identificationNumber: req.body.identificationNumber,
      email: req.body.email,
      estado: req.body.estado,
      cidade: req.body.cidade,
      celular: req.body.celular,
      celular_emergencia: req.body.celular_emergencia,
      data_nascimento: req.body.data_nascimento,
      sexo: req.body.sexo,
      camisa: req.body.camisa,
      percurso: req.body.percurso,
      apelido: req.body.apelido,
      equipe: req.body.equipe,
      date: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      external_reference: referenceId,
      paymentId: result.id || ""
    };

    await sendToSheet(data);

    res.json(result);
  } catch (error) {
    console.error("Erro ao criar pagamento:", error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook MP
app.post("/webhook", bodyParser.json(), async (req, res) => {
  try {
    console.log("📩 Webhook recebido:", JSON.stringify(req.body).slice(0, 500));

    const paymentId = req.body.data?.id || req.body.resource?.id || req.body.id;
    if (!paymentId) return res.status(200).send("No payment id");

    const paymentInfo = await getPaymentDirect(paymentId);
    console.log("💰 Pagamento consultado:", paymentInfo.id, paymentInfo.status);

    if (["approved", "paid", "success"].includes(paymentInfo.status)) {

      const referenceId = paymentInfo.external_reference;

      // Buscar dados reais da planilha
      const dados = await buscarDadosDaPlanilha(referenceId);

      if (!dados) {
        console.log("⚠️ Não foi possível buscar dados na planilha. Cancelando envio de e-mail.");
      } else {
        const email = dados.email;
        const nome = dados.payerFirstName || "Atleta";

        if (email) {
          await enviarEmailConfirmacao(email, nome);
          console.log("📧 E-mail enviado para:", email);
        } else {
          console.log("⚠️ Nenhum e-mail encontrado para enviar.");
        }
      }

      // Atualiza planilha
      const data = {
        payerFirstName: paymentInfo.payer?.first_name || "",
        payerLastName: paymentInfo.payer?.last_name || "",
        email: dados?.email || "",
        identificationNumber: paymentInfo.payer?.identification?.number || "",
        transactionAmount: paymentInfo.transaction_amount || "",
        paymentId: paymentInfo.id || "",
        external_reference: referenceId,
        date: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
        status: "Aprovado",
      };

      await sendToSheet(data);
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Erro no webhook:", err);
    res.status(500).send("Erro");
  }
});

// Status pagamento
app.get("/status-pagamento", async (req, res) => {
  const id = req.query.payment_id;

  try {
    const status = await getStatusFromSheet(id);
    res.json({ status });
  } catch (e) {
    res.json({ status: "não encontrado" });
  }
});

// Porta
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
