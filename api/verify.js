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

        // 3. Update Supabase 'transactions' table
        console.log(`[VERIFY] Checking transaction: ${finalOrderId}`);

        // Use maybeSingle() to avoid error if not found, and select everything
        const { data: existingTx, error: fetchError } = await supabase
            .from('transactions')
            .select('*')
            .eq('id', finalOrderId)
            .maybeSingle();

        if (fetchError) {
            console.error('[DATABASE ERROR] Fetch failed:', fetchError);
            throw new Error(`Database error: ${fetchError.message}`);
        }

        if (!existingTx) {
            console.error(`[VERIFY ERROR] Transaction ${finalOrderId} NOT FOUND in DB.`);
            return res.status(404).json({ error: 'Transaction found in MonCash but not in our records.' });
        }

        console.log(`[VERIFY] Found existing transaction. User ID: ${existingTx.user_id}`);

        // Merge Metadata: keep everything from pending, add moncash data
        const currentMetadata = existingTx.metadata || {};
        const updatedMetadata = {
            ...currentMetadata,
            moncash: moncashPayment,
            verified_at: new Date().toISOString(),
            user_id: existingTx.user_id || currentMetadata.user_id // Ensure ID is in metadata
        };

        const updateData = {
            status: 'completed',
            metadata: updatedMetadata
        };

        // If user_id column is missing but we have it elsewhere, restore it
        // 1. Try to extract from combined ID (Site_Quiz_Pam format: userId__uuid)
        let extractedUserId = null;
        if (finalOrderId && finalOrderId.includes('__')) {
            extractedUserId = finalOrderId.split('__')[0];
            console.log(`[VERIFY] Extracted User ID from orderId: ${extractedUserId}`);
        }

        const finalUserId = existingTx.user_id || extractedUserId || updatedMetadata.user_id || req.query.userId || moncashPayment.userId;

        if (finalUserId) {
            updateData.user_id = finalUserId;
            // Also ensure it's in metadata for good measure
            updatedMetadata.user_id = finalUserId;
        }

        const { error: dbError } = await supabase
            .from('transactions')
            .update(updateData)
            .eq('id', finalOrderId);

        if (dbError) {
            throw dbError;
        }

        const responsePayload = {
            success: true,
            message: 'Payment verified and recorded',
            payment: moncashPayment,
            transaction_id: finalOrderId,
            userId: finalUserId
        };
        console.log("DEBUG: Réponse finale verification:", responsePayload);

        return res.status(200).json(responsePayload);

    } catch (error) {
        console.error('Verification Error:', error);
        return res.status(500).json({ error: error.message });
    }
};
