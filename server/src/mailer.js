import nodemailer from 'nodemailer';

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const money = (value) => `Rs. ${Number(value).toLocaleString('en-PK', { minimumFractionDigits: 2 })}`;

export function isMailConfigured() {
  return Boolean(process.env.MAIL_HOST && process.env.MAIL_USERNAME && process.env.MAIL_PASSWORD);
}

export function createMailer() {
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 587),
    secure: Number(process.env.MAIL_PORT) === 465,
    auth: { user: process.env.MAIL_USERNAME, pass: process.env.MAIL_PASSWORD },
    requireTLS: String(process.env.MAIL_ENCRYPTION).toLowerCase() === 'tls'
  });
}

export async function sendReceiptEmail({ to, customerName, storeName, receipt }) {
  const items = Array.isArray(receipt.items) ? receipt.items.slice(0, 100) : [];
  const rows = items.map((item) => `<tr><td style="padding:8px 0;color:#536158">${Number(item.quantity)} × ${escapeHtml(item.name)}</td><td style="padding:8px 0;text-align:right;font-weight:600">${money(Number(item.price) * Number(item.quantity))}</td></tr>`).join('');
  const transporter = createMailer();
  return transporter.sendMail({
    from: { name: process.env.MAIL_FROM_NAME || 'Counterly POS', address: process.env.MAIL_FROM_ADDRESS || process.env.MAIL_USERNAME },
    to,
    subject: `Receipt #${Number(receipt.id)} from ${storeName}`,
    text: `Payment received: ${money(receipt.total)}. Order #${Number(receipt.id)}. Thank you, ${customerName}.`,
    html: `<div style="background:#f3f6f4;padding:32px;font-family:Arial,sans-serif;color:#17211b"><div style="max-width:560px;margin:auto;background:white;border-radius:16px;padding:28px"><div style="font-size:22px;font-weight:800;color:#173f2b">${escapeHtml(storeName)}</div><p style="color:#748078">Payment receipt</p><h1 style="font-size:34px;margin:25px 0 4px">${money(receipt.total)}</h1><p style="color:#748078;margin-top:0">Order #${Number(receipt.id)} · ${escapeHtml(receipt.paymentMethod)}</p><table style="width:100%;border-top:1px dashed #cbd4ce;border-bottom:1px dashed #cbd4ce;margin:22px 0;padding:10px 0">${rows}<tr><td style="padding-top:14px;font-weight:700">Total</td><td style="padding-top:14px;text-align:right;font-weight:700">${money(receipt.total)}</td></tr></table><p style="color:#536158">Thank you, ${escapeHtml(customerName)}. Your payment was recorded successfully.</p><p style="font-size:11px;color:#98a29b;margin-top:28px">This is an automated notification from Counterly POS.</p></div></div>`
  });
}
