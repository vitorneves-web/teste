document.addEventListener("DOMContentLoaded", () => {
  // Inicializa o Mercado Pago com sua Public Key
  const mp = new MercadoPago("TEST-575a3b82-701d-46fe-a1a9-ca4efc92944a"); // substitua pela sua Public Key

  // Carrega os tipos de documento (CPF, CNPJ etc)
  (async function getIdentificationTypes() {
    try {
      const identificationTypes = await mp.getIdentificationTypes();
      const identificationTypeElement = document.getElementById('form-checkout__identificationType');
      createSelectOptions(identificationTypeElement, identificationTypes);
    } catch (e) {
      console.error('Erro ao buscar tipos de documento:', e);
    }
  })();

  function createSelectOptions(elem, options, labelsAndKeys = { label: "name", value: "id" }) {
    const { label, value } = labelsAndKeys;
    elem.options.length = 0;

    // Opção padrão
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Selecione o tipo de documento";
    elem.appendChild(defaultOption);

    const tempOptions = document.createDocumentFragment();
    options.forEach(option => {
      const opt = document.createElement('option');
      opt.value = option[value];
      opt.textContent = option[label];
      tempOptions.appendChild(opt);
    });

    elem.appendChild(tempOptions);
  }

  // Captura envio do formulário
  const form = document.getElementById("form-checkout");
  const result = document.getElementById("result");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = Object.fromEntries(new FormData(form).entries());
    result.innerHTML = "<p>Gerando QR Code PIX...</p>";

    try {
      const response = await fetch("/process_payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      const transaction = data.point_of_interaction?.transaction_data;

      if (transaction) {
        const qrBase64 = transaction.qr_code_base64;
        const qrText = transaction.qr_code;
        const ticketUrl = transaction.ticket_url;

        result.innerHTML = `
          <h3>Escaneie o QR Code abaixo para pagar com Pix:</h3>
          <img src="data:image/jpeg;base64,${qrBase64}" width="300" height="300" alt="QR Code PIX" />
          <div class="pix-copy">
            <label for="pix-code">Ou copie o código PIX:</label><br>
            <textarea id="pix-code" rows="4" cols="50" readonly>${qrText}</textarea>
            <br>
            <button id="copy-btn">Copiar código</button>
          </div>
          <br>
          <a href="${ticketUrl}" target="_blank">Abrir no site do Mercado Pago</a>
        `;

        // 💡 NOVO: mostrar a seção de pagamentos (.pixBox)
        const pixSection = document.querySelector("section.pixBox");
        if (pixSection) {
          pixSection.classList.add("mostrar");
        }

        // Botão de copiar código
        document.getElementById("copy-btn").addEventListener("click", () => {
          const pixCode = document.getElementById("pix-code");
          pixCode.select();
          document.execCommand("copy");
          alert("Código Pix copiado!");
        });
      } else {
        result.innerHTML = "<p>Erro: não foi possível gerar o QR Code Pix.</p>";
        console.log("Resposta completa:", data);
      }
    } catch (err) {
      console.error(err);
      result.innerHTML = `<p>Erro ao gerar pagamento: ${err.message}</p>`;
    }
  });
});
