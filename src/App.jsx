import React, { useEffect, useState } from 'react';

function App() {
    const [status, setStatus] = useState('loading'); // 'loading', 'redirecting', 'success', 'error', 'manual'
    const [message, setMessage] = useState('Préparation de votre paiement...');
    const [redirectUrl, setRedirectUrl] = useState('');
    const [manualTxId, setManualTxId] = useState('');
    const [orderId, setOrderId] = useState('');

    useEffect(() => {
        const handleFlow = async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const transactionId = urlParams.get('transactionId');
            const paramOrderId = urlParams.get('orderId');
            const amount = urlParams.get('amount');

            if (paramOrderId) setOrderId(paramOrderId);

            // Scenario 1: Verification (Return from MonCash)
            if (transactionId) {
                setStatus('loading');
                setMessage('Vérification de votre transaction...');
                try {
                    const response = await fetch(`/api/verify?transactionId=${transactionId}&orderId=${paramOrderId || ''}`);
                    const data = await response.json();

                    if (response.ok && data.success) {
                        setStatus('success');
                        setMessage('Merci ! Votre paiement a été confirmé avec succès.');
                    } else {
                        throw new Error(data.error || "Échec de la vérification.");
                    }
                } catch (error) {
                    console.error("Verification error:", error);
                    setStatus('error');
                    setMessage("Impossible de vérifier automatiquement. Tu peux essayer de saisir l'ID manuellement.");
                }
                return;
            }

            // Scenario 2: Initiation (Redirection to MonCash)
            if (amount && paramOrderId) {
                setStatus('redirecting');
                setMessage('Connexion sécurisée à MonCash...');
                try {
                    const response = await fetch('/api/create-payment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ amount, orderId: paramOrderId })
                    });
                    const data = await response.json();

                    if (response.ok && data.url) {
                        setRedirectUrl(data.url);
                        // Auto redirect after 2s to let user see the "Preparation"
                        setTimeout(() => {
                            window.top.location.href = data.url;
                        }, 2000);
                    } else {
                        throw new Error(data.error || "Erreur lors de la création du paiement.");
                    }
                } catch (error) {
                    setStatus('error');
                    setMessage("Erreur: " + error.message);
                }
                return;
            }

            // Scenario 3: No params or manual fallback
            setStatus('manual');
            setMessage("Saisissez les informations de votre transaction MonCash.");
        };

        handleFlow();
    }, []);

    const handleManualVerify = async (e) => {
        e.preventDefault();
        if (!manualTxId) return;
        setStatus('loading');
        setMessage('Vérification manuelle en cours...');
        try {
            const response = await fetch(`/api/verify?transactionId=${manualTxId}&orderId=${orderId}`);
            const data = await response.json();
            if (response.ok && data.success) {
                setStatus('success');
                setMessage('Paiement confirmé avec succès !');
            } else {
                setStatus('manual');
                alert("Erreur: " + (data.error || "Transaction introuvable."));
            }
        } catch (error) {
            setStatus('manual');
            alert("Erreur de connexion.");
        }
    };

    return (
        <div className="card">
            <div className="logo-wrapper">
                <div className="pulse-ring"></div>
                <div className="moncash-logo">
                    <span className="m">M</span><span className="c">on</span><span className="cash">Cash</span>
                </div>
            </div>

            {/* Initiation / Loading View */}
            {(status === 'loading' || status === 'redirecting') && (
                <>
                    <h1>{status === 'redirecting' ? 'Préparation...' : 'Vérification...'}</h1>
                    <div className="loader-bar">
                        <div className="progress"></div>
                    </div>
                    <p className="status-text">{message}</p>
                    {redirectUrl && (
                        <a href={redirectUrl} className="btn" target="_top">Cliquer ici si la redirection bloque</a>
                    )}
                </>
            )}

            {/* Success View */}
            {status === 'success' && (
                <>
                    <div className="icon-container success">
                        <svg className="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                            <circle className="checkmark-circle" cx="26" cy="26" r="25" fill="none" />
                            <path className="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                        </svg>
                    </div>
                    <h1>Paiement Réussi !</h1>
                    <p className="status-text">{message}</p>
                    <button className="btn" onClick={() => window.close()}>Fermer la fenêtre</button>
                </>
            )}

            {/* Error / Manual Entry View */}
            {(status === 'error' || status === 'manual') && (
                <>
                    {status === 'error' && (
                        <div className="icon-container error">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                                <path d="M12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22Z" stroke="#cf0921" strokeWidth="2" />
                                <path d="M12 8V12M12 16H12.01" stroke="#cf0921" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                        </div>
                    )}
                    <h1>{status === 'error' ? 'Oups !' : 'Action Requise'}</h1>
                    <p className="status-text">{message}</p>

                    <form onSubmit={handleManualVerify} className="manual-form">
                        <label>ID Transaction MonCash</label>
                        <input
                            type="text"
                            placeholder="Ex: 12345678"
                            value={manualTxId}
                            onChange={(e) => setManualTxId(e.target.value)}
                            required
                        />
                        <button type="submit" className="btn btn-small">Vérifier maintenant</button>
                    </form>
                </>
            )}

            <div className="security-info">
                <svg className="lock-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2a5 5 0 00-5 5v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1v-3a5 5 0 00-5-5zm3 8H9V7a3 3 0 016 0v3z" />
                </svg>
                <span>Paiement 100% sécurisé</span>
            </div>

            <div className="footer">
                QuizPam MonCash Gateway
            </div>
        </div>
    );
}

export default App;
