const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// MonCash configuration
const MONCASH_CLIENT_ID = process.env.MONCASH_CLIENT_ID;
const MONCASH_CLIENT_SECRET = process.env.MONCASH_CLIENT_SECRET;
const MONCASH_API_URL = process.env.MONCASH_MODE === 'sandbox'
    ? 'https://sandbox.moncashbutton.digicelgroup.com/Api'
    : 'https://moncashbutton.digicelgroup.com/Api';

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Méthode non autorisée' });
    }

    try {
        const { amount, phone, userId, reference } = req.body;

        if (!amount || !phone || !userId) {
            return res.status(400).json({ error: 'Montant, numéro de téléphone et userId requis.' });
        }

        const withdrawalAmount = parseFloat(amount);
        if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) {
            return res.status(400).json({ error: 'Montant invalide.' });
        }

        // 1. Check User Balance in Supabase
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('balance_htg')
            .eq('id', userId)
            .single();

        if (profileError || !profile) {
            return res.status(404).json({ error: 'Utilisateur introuvable.' });
        }

        if (profile.balance_htg < withdrawalAmount) {
            return res.status(400).json({ error: 'Solde insuffisant pour ce retrait.' });
        }

        // 2. Generate a unique transaction reference for MonCash
        const transactionRef = reference || `WD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        // 3. Authenticate with MonCash
        const credentials = Buffer.from(`${MONCASH_CLIENT_ID}:${MONCASH_CLIENT_SECRET}`).toString('base64');
        const authResponse = await axios.post(`${MONCASH_API_URL}/oauth/token`,
            "grant_type=client_credentials&scope=read,write",
            {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const accessToken = authResponse.data.access_token;
        if (!accessToken) {
            throw new Error("Impossible d'obtenir le token d'accès MonCash.");
        }

        // 4. Initiate Transfer / Payout
        // MonCash Transfer API Endpoint (Check Digicel Docs, /v1/Transfer is common)
        let transferSuccess = false;
        let transferData = null;

        try {
            const transferResponse = await axios.post(`${MONCASH_API_URL}/v1/Transfer`, {
                amount: withdrawalAmount,
                receiver: phone,
                desc: "Retrait QuizPam",
                reference: transactionRef
            }, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            transferData = transferResponse.data;

            // In successful transfer, MonCash returns status 200 or 202
            // Often includes a code indicating success or queued status
            // Example data we might expect: { "status": "200", "message": "successful", "transaction": {...} }
            // Since every API differs slightly, we assume no error thrown by axios = success
            transferSuccess = true;

        } catch (transferError) {
            console.error("[MONCASH TRANSFER ERROR]", transferError.response ? transferError.response.data : transferError.message);
            const detailedError = transferError.response && transferError.response.data
                ? JSON.stringify(transferError.response.data)
                : transferError.message;

            // Si MonCash échoue (ex: numéro invalid), on ne continue pas.
            return res.status(400).json({
                error: `Échec du transfert MonCash. Détails: ${detailedError}`
            });
        }

        if (transferSuccess) {
            // 5. Record the successful transaction in Supabase
            const { data: newTx, error: txError } = await supabase
                .from('transactions')
                .insert([{
                    id: transactionRef,
                    user_id: userId,
                    amount: withdrawalAmount,
                    type: 'withdrawal',
                    status: 'completed', // 'completed' will trigger update_wallet_balance in the DB
                    description: `Retrait vers MonCash: ${phone}`,
                    payment_method: 'moncash',
                    metadata: {
                        phone: phone,
                        moncash_response: transferData,
                        withdrawn_at: new Date().toISOString()
                    }
                }])
                .select()
                .single();

            if (txError) {
                console.error("[DATABASE INSERT ERROR]", txError);
                // The transfer happened, but recording failed. Critical alert!
                return res.status(500).json({
                    error: 'Le transfert a été effectué, mais une erreur est survenue lors de l\'enregistrement. Contactez le support.',
                    transactionId: transactionRef
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Retrait effectué avec succès.',
                transaction: newTx
            });
        }

    } catch (error) {
        console.error("[WITHDRAW SERVER ERROR]", error);
        res.status(500).json({ error: error.message });
    }
};
