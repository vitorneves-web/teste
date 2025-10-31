// ✅ Endpoint para criar pagamento PIX
app.post("/process_payment", async (req, res) => {
  try {
    // Geramos uma referência única
    const referenceId = crypto.randomUUID();

    // Cria o pagamento PIX no Mercado Pago
    const result = await payment.create({
      body: {
        transaction_amount: 12.99, // valor real do evento
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

    // ✅ Envia imediatamente para a planilha como "Aguardando pagamento"
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

    try {
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const text = await response.text();
      console.log("📋 Dados enviados à planilha:", text);
    } catch (err) {
      console.error("⚠️ Falha ao enviar inscrição à planilha:", err);
    }

    // Retorna a resposta do Mercado Pago ao front-end
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

    const paymentId = req.body.data?.id || req.body.resource?.id || req.body.id;
    if (!paymentId) return res.status(200).send("No payment id");

    // Busca pagamento diretamente na API REST (garantia)
    const paymentInfo = await getPaymentDirect(paymentId);
    console.log("💰 Pagamento consultado:", paymentInfo.id, paymentInfo.status);

    // Só envia para planilha se aprovado
    if (["approved", "paid", "success"].includes(paymentInfo.status)) {
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

      try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
          method: "POST",
          body: JSON.stringify(data),
          headers: { "Content-Type": "application/json" },
        });

        const result = await response.text();
        console.log("📊 Planilha atualizada (pagamento aprovado):", result);
      } catch (err) {
        console.error("⚠️ Erro ao atualizar planilha:", err);
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
