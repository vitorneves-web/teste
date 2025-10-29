// server.js
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { MercadoPagoConfig, Payment } = require("mercadopago");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public")); // serve os arquivos HTML/JS

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
});

const payment = new Payment(client);

// Endpoint que cria o pagamento PIX
app.post("/process_payment", async (req, res) => {
  try {
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
      },
      requestOptions: { idempotencyKey: crypto.randomUUID() },
    });

    res.json(result);
  } catch (error) {
    console.error("Erro ao criar pagamento:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log("Servidor rodando em http://localhost:3000");
});
