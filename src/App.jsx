import React, { useEffect, useState } from 'react';

function App() {
    const [status, setStatus] = useState('loading'); // 'loading', 'redirecting', 'success', 'error'
    const [message, setMessage] = useState('Chargement...');
    const [redirectUrl, setRedirectUrl] = useState('');

    useEffect(() => {
        const handleFlow = async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const transactionId = urlParams.get('transactionId');
            const paramOrderId = urlParams.get('orderId');
            const amount = urlParams.get('amount');
            const action = urlParams.get('action'); // 'withdraw' or null
            const phone = urlParams.get('phone');
            const userId = urlParams.get('userId');

            // Scenario 1: Verification (Return/Redirect from MonCash)
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
                    setMessage("Impossible de vérifier automatiquement la transaction. " + error.message);
                }
                return;
            }

            // Scenario 2: Initiation (Preparation from Site)
            if (amount && paramOrderId && action !== 'withdraw') {
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
                        // Auto redirect after 2s for visual transition
                        setTimeout(() => {
                            window.top.location.href = data.url;
                        }, 2000);
                    } else {
                        throw new Error(data.error || "Erreur lors de la création du paiement.");
                    }
                } catch (error) {
                    setStatus('error');
                    setMessage("Erreur d'initialisation: " + error.message);
                }
                return;
            }

            // Scenario 3: Withdrawal Request
            if (action === 'withdraw' && amount && phone && userId) {
                setStatus('loading');
                setMessage('Traitement de votre retrait MonCash...');
                try {
                    const response = await fetch('/api/withdraw', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ amount, phone, userId })
                    });
                    const data = await response.json();

                    if (response.ok && data.success) {
                        setStatus('success');
                        setMessage('Retrait effectué avec succès ! L\'argent a été envoyé sur votre compte MonCash.');
                    } else {
                        throw new Error(data.error || "Erreur lors du retrait.");
                    }
                } catch (error) {
                    setStatus('error');
                    setMessage("Échec du retrait: " + error.message);
                }
                return;
            }

            // Scenario 4: Missing Info
            setStatus('error');
            setMessage("Informations de paiement manquantes dans l'URL.");
        };

        handleFlow();
    }, []);

    return (
        <div className="card">
            <div className="logo-wrapper">
                <div className="pulse-ring"></div>
                <div className="moncash-logo">
                    <span className="m">M</span><span className="c">on</span><span className="cash">Cash</span>
                </div>
            </div>

            {/* Preparation / Loading / Verification */}
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

            {/* Success (Matches haitiShipping_thanks look) */}
            {status === 'success' && (
                <>
                    <div className="icon-container success">
                        <svg className="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                            <circle className="checkmark-circle" cx="26" cy="26" r="25" fill="none" />
                            <path className="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                        </svg>
                        <div className="confetti"></div>
                        <div className="confetti" style={{ left: '10%', animationDelay: '0.2s' }}></div>
                        <div className="confetti" style={{ right: '10%', animationDelay: '0.5s' }}></div>
                    </div>
                    <h1>{message.includes('Retrait') ? 'Retrait Réussi !' : 'Paiement Réussi !'}</h1>
                    <p className="status-text">{message}</p>
                    <button className="btn" onClick={() => window.close()}>Retourner au jeu</button>
                </>
            )}

            {/* Error */}
            {status === 'error' && (
                <>
                    <div className="icon-container error">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                            <path d="M12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22Z" stroke="#cf0921" strokeWidth="2" />
                            <path d="M12 8V12M12 16H12.01" stroke="#cf0921" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                    </div>
                    <h1>Oups !</h1>
                    <p className="status-text">{message}</p>
                    <button className="btn" onClick={() => window.location.reload()}>Réessayer</button>
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
