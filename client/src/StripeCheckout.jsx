import { useEffect, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { LockKeyhole } from 'lucide-react';
import { supabase } from './lib/supabase';
import { apiUrl } from './lib/api';

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

function StripePaymentForm({ payload, paymentIntentId, onComplete, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true); onError('');
    const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: 'if_required', confirmParams: { return_url: window.location.origin } });
    if (error) { setProcessing(false); return onError(error.message); }
    if (paymentIntent?.status !== 'succeeded') { setProcessing(false); return onError(`Payment is ${paymentIntent?.status || 'not complete'}.`); }
    const { data } = await supabase.auth.getSession();
    const response = await fetch(apiUrl('/api/stripe/finalize'), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` }, body: JSON.stringify({ ...payload, paymentIntentId }) });
    const result = await response.json().catch(() => ({}));
    setProcessing(false);
    if (!response.ok) return onError(result.message || 'Paid, but the sale could not be recorded. Contact support.');
    onComplete(result.receipt, paymentIntent.id);
  };
  return <form className="stripe-payment-form" onSubmit={submit}><PaymentElement options={{ layout: 'tabs' }}/><div className="stripe-secure"><LockKeyhole size={14}/> Payment details are securely handled by Stripe.</div><button className="stripe-pay-button" disabled={!stripe || processing}>{processing ? 'Processing payment…' : 'Pay securely with Stripe'}</button></form>;
}

export default function StripeCheckout({ store, cart, discount, note, onComplete, onError }) {
  const [setup, setSetup] = useState({ loading: true, error: '', clientSecret: '', paymentIntentId: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    if (!publishableKey) { setSetup({ loading: false, error: 'Add VITE_STRIPE_PUBLISHABLE_KEY to enable Stripe.', clientSecret: '', paymentIntentId: '' }); return; }
    setSetup({ loading: true, error: '', clientSecret: '', paymentIntentId: '' });
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session?.access_token) throw new Error('Your session expired. Please sign in again.');
      const response = await fetch(apiUrl('/api/stripe/payment-intent'), { signal: controller.signal, method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ storeId: store.id, cart: cart.map((item) => ({ productId: item.id, quantity: item.quantity })), discount }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || `Stripe API returned ${response.status}.`);
      if (active) setSetup({ loading: false, error: '', clientSecret: result.clientSecret, paymentIntentId: result.paymentIntentId });
    }).catch((error) => {
      if (!active) return;
      const message = error.name === 'AbortError' ? 'Stripe API timed out. Check the live backend and try again.' : error.message === 'Failed to fetch' ? 'Cannot connect to Stripe API. The backend CORS configuration must allow this frontend.' : error.message;
      setSetup({ loading: false, error: message, clientSecret: '', paymentIntentId: '' });
    }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [store.id, cart, discount, attempt]);
  if (setup.loading) return <div className="stripe-loading">Preparing secure payment…</div>;
  if (setup.error) return <div className="stripe-setup-error"><span>{setup.error}</span><button type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button></div>;
  const options = { clientSecret: setup.clientSecret, appearance: { theme: 'stripe', variables: { colorPrimary: '#17563b', borderRadius: '10px', fontFamily: 'Inter, system-ui, sans-serif' } } };
  return <Elements stripe={stripePromise} options={options}><StripePaymentForm payload={{ storeId: store.id, cart: cart.map((item) => ({ productId: item.id, quantity: item.quantity })), discount, note }} paymentIntentId={setup.paymentIntentId} onComplete={onComplete} onError={onError}/></Elements>;
}
