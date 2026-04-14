// Brevo (Sendinblue) Transactional Email API
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export async function sendBrevoEmail({
  apiKey,
  fromEmail,
  fromName = "Amila Gold",
  toEmail,
  toName = "",
  subject,
  textContent,
  htmlContent,
}) {
  if (!apiKey) {
    throw new Error("BREVO_API_KEY not configured");
  }

  const payload = {
    sender: {
      email: fromEmail,
      name: fromName,
    },
    to: [
      {
        email: toEmail,
        name: toName || toEmail.split("@")[0],
      },
    ],
    subject,
    textContent: textContent || undefined,
    htmlContent: htmlContent || undefined,
  };

  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Brevo API error: ${response.status} ${response.statusText}`
    );
  }

  return await response.json();
}

// Backward compatibility - wraps Brevo API
export async function sendSmtpMail({
  host,
  port,
  secure,
  user,
  pass,
  from,
  to,
  subject,
  text,
}) {
  // Use Brevo API instead of SMTP
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL || from;
  const fromName = process.env.BREVO_FROM_NAME || "Amila Gold";

  if (!apiKey) {
    throw new Error("BREVO_API_KEY not configured");
  }

  return await sendBrevoEmail({
    apiKey,
    fromEmail,
    fromName,
    toEmail: to,
    subject,
    textContent: text,
  });
}
