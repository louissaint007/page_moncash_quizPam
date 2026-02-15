const { createClient } = require('@supabase/supabase-js');

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

    const { transactionId, orderId } = req.query;

    if (!transactionId) {
        return res.status(400).json({ error: 'Transaction ID is required' });
    }

    try {
        // 1. Get MonCash Token
        const tokenResponse = await fetch(`${MONCASH_API_URL}/oauth/token`, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(MONCASH_CLIENT_ID + ':' + MONCASH_CLIENT_SECRET).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'scope=read,write&grant_type=client_credentials'
        });

        if (!tokenResponse.ok) {
            throw new Error('Failed to authenticate with MonCash');
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        // 2. Look up Transaction
        const paymentLookupResponse = await fetch(`${MONCASH_API_URL}/v1/RetrieveTransactionPayment`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ transactionId: transactionId })
        });

        const paymentData = await paymentLookupResponse.json();

        if (!paymentData || !paymentData.payment) {
            return res.status(404).json({ error: 'Transaction not found in MonCash' });
        }

        const moncashPayment = paymentData.payment;
        const finalOrderId = orderId || moncashPayment.reference;

        if (!finalOrderId) {
            return res.status(400).json({ error: 'Order ID (Transaction ID internal) not found' });
        }

        // 3. Update Supabase
        // Note: the table is 'transactions', columns are 'status', 'metadata', etc.
        const { error: dbError } = await supabase
            .from('transactions')
            .update({
                status: 'completed',
                metadata: {
                    moncash: moncashPayment,
                    updated_at: new Date().toISOString()
                }
            })
            .eq('id', finalOrderId);

        if (dbError) {
            throw dbError;
        }

        return res.status(200).json({
            success: true,
            message: 'Payment verified and recorded',
            payment: moncashPayment
        });

    } catch (error) {
        console.error('Verification Error:', error);
        return res.status(500).json({ error: error.message });
    }
};
