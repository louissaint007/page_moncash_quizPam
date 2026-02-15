import React, { useEffect, useState } from 'react';
import './index.css';

function App() {
    const [status, setStatus] = useState('loading'); // 'loading', 'success', 'error', 'redirecting'
    const [message, setMessage] = useState('Initialisation...');
    const [redirectUrl, setRedirectUrl] = useState(null);

    useEffect(() => {
        const handleLogic = async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const transactionId = urlParams.get('transactionId');
            const amount = urlParams.get('amount');
            const orderId = urlParams.get('orderId');

            // Scenario 1: Verification (Coming back from MonCash)
            if (transactionId) {
                setStatus('loading');
                setMessage("Vérification de votre paiement...");
                try {
                    const response = await fetch(`/api/verify?transactionId=${transactionId}&orderId=${orderId || ''}`);
                    const data = await response.json();

                    if (response.ok && data.success) {
                        setStatus('success');
                        setMessage("Votre compte QuizPam a été rechargé avec succès !");
                    } else {
                        console.error("Verification failed:", data);
                        setStatus('error');
                        setMessage("Impossible de vérifier la transaction. " + (data.error || ""));
                    }
                } catch (error) {
                    console.error("Network error:", error);
                    setStatus('error');
                    setMessage("Une erreur de communication est survenue.");
                }
                return;
            }

            // Scenario 2: Preparation (Initiating payment)
            if (amount && orderId) {
                setStatus('loading');
                setMessage("Connexion sécurisée à MonCash...");
                try {
                    const response = await fetch('/api/create-payment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ amount, orderId })
                    });
                    const data = await response.json();
                    if (response.ok && data.url) {
                        setRedirectUrl(data.url);
                        setStatus('redirecting');
                        setMessage("Votre lien de paiement est prêt.");
                        // Auto redirect
                        setTimeout(() => {
                            window.top.location.href = data.url;
                        }, 1500);
                    } else {
                        throw new Error(data.error || "Erreur lors de la création du paiement.");
                    }
                } catch (error) {
                    console.error("Prep error:", error);
                    setStatus('error');
                    setMessage("Erreur: " + error.message);
                }
                return;
            }

            // Default state
            setStatus('error');
            setMessage("Informations de transaction manquantes.");
        };

        handleLogic();
    }, []);

    return (
        <div className="card">
            {(status === 'success') && (
                <div className="icon-container glass-effect success">
                    <svg className="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                        <circle className="checkmark-circle" cx="26" cy="26" r="25" fill="none" />
                        <path className="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                    </svg>
                    <div className="confetti"></div>
                    <div className="confetti" style={{ left: '15%', animationDelay: '0.2s' }}></div>
                    <div className="confetti" style={{ right: '15%', animationDelay: '0.4s' }}></div>
                </div>
            )}

            {(status === 'loading' || status === 'redirecting') && (
                <div className="logo-wrapper">
                    <div className="moncash-logo">
                        <span className="m">M</span><span className="c">on</span><span className="cash">Cash</span>
                    </div>
                    <div className="pulse-ring"></div>
                </div>
            )}

            {status === 'error' && (
                <div className="icon-container glass-effect error">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22Z" stroke="#e02424" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M12 8V12" stroke="#e02424" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M12 16H12.01" stroke="#e02424" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>
            )}

            <h1>{status === 'success' ? 'Paiement Réussi !' : (status === 'error' ? 'Oups !' : 'Paiement QuizPam')}</h1>
            <p className="status-text">{message}</p>

            {status === 'redirecting' && redirectUrl && (
                <div style={{ marginTop: '20px' }}>
                    <a href={redirectUrl} className="btn" target="_top">
                        Payer maintenant
                    </a>
                </div>
            )}

            {status === 'success' && (
                <a href="#" className="btn" onClick={(e) => { e.preventDefault(); window.close(); }}>
                    Retourner au jeu
                </a>
            )}

            <div className="security-info">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="lock-icon">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <span>Paiement sécurisé par Digicel MonCash</span>
            </div>

            <div className="footer">
                QuizPam System & MonCash
            </div>
        </div>
    );
}

export default App;
