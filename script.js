document.addEventListener('DOMContentLoaded', async () => {
    const statusText = document.getElementById('status-text');

    const urlParams = new URLSearchParams(window.location.search);
    const amount = urlParams.get('amount');
    const orderId = urlParams.get('orderId');

    if (!amount || !orderId) {
        statusText.innerText = "Erreur: Informations manquantes.";
        return;
    }

    try {
        statusText.innerText = "Connexion sécurisée à MonCash...";

        const response = await fetch('/api/create-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, orderId })
        });

        const data = await response.json();

        if (response.ok && data.url) {
            console.log(">>> [CLIENT] URL de paiement reçue");

            // 1. On change le texte pour inviter l'utilisateur à cliquer si ça bloque
            statusText.innerHTML = `
                <div style="margin-top: 20px;">
                    <p style="margin-bottom: 15px;">Votre lien de paiement est prêt.</p>
                    <a href="${data.url}" id="pay-button" target="_top" style="
                        background-color: #ff0000;
                        color: white;
                        padding: 12px 24px;
                        border-radius: 8px;
                        text-decoration: none;
                        font-weight: bold;
                        display: inline-block;
                        box-shadow: 0 4px 15px rgba(255,0,0,0.3);
                    ">Payer ${amount} HTG maintenant</a>
                </div>
            `;

            // 2. On tente quand même la redirection automatique immédiatement
            setTimeout(() => {
                window.top.location.href = data.url;
            }, 100);

        } else {
            throw new Error(data.error || "Erreur serveur.");
        }

    } catch (error) {
        console.error(">>> [CLIENT ERROR]:", error);
        statusText.innerText = "Erreur: " + error.message;
        statusText.style.color = "#ff4444";
    }
});
