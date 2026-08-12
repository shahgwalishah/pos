import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './auth.css';
import './payment.css';
import './notifications.css';
import './oauth.css';
import './dashboard.css';
import './management.css';
import './sales.css';
import './customers.css';
import './register-extras.css';
import './shifts.css';
import './reports-settings.css';
import './staff.css';
import './stripe.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
