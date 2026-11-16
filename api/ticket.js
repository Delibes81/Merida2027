// Lee la foto de un ticket y devuelve sus renglones.
// POST /api/ticket  { image: <base64>, mime: "image/jpeg" }  con el token de sesión de Supabase.
// Necesita la variable de entorno ANTHROPIC_API_KEY en Vercel; sin ella responde 501
// y la página ofrece capturar los renglones a mano.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

export const config = { maxDuration: 60 };

const SUPABASE_URL = 'https://tpjudpjeapxsaywyjclx.supabase.co';
// Clave pública (anon), la misma de assets/config.js.
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwanVkcGplYXB4c2F5d3lqY2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3OTU3OTgsImV4cCI6MjExMDM3MTc5OH0.5f4gePkwcWHhXPRt9LUm9Jlw9hlRgXZH_KvItgMmaek';
const MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BASE64 = 4_000_000;

const Ticket = z.object({
  legible: z.boolean().describe('false si la imagen no es un ticket o no se alcanza a leer'),
  merchant: z.string().describe('Nombre del lugar; cadena vacía si no aparece'),
  items: z.array(z.object({
    name: z.string().describe('Nombre del renglón tal como viene, con la cantidad al inicio si es mayor a 1, por ejemplo "2 Cerveza"'),
    amount: z.number().describe('Importe total del renglón en pesos, ya multiplicado por la cantidad'),
  })),
  tip: z.number().describe('Propina o servicio cobrado en el ticket; 0 si no viene'),
  total: z.number().describe('Total impreso en el ticket; 0 si no se lee'),
});

const PROMPT = `Esta es la foto de un ticket de consumo en México (restaurante, bar, súper o similar).
Extrae cada renglón consumido con su importe total en pesos.

- Un renglón por producto. Si un producto trae cantidad mayor a 1, deja un solo renglón con el importe ya multiplicado y la cantidad al inicio del nombre.
- No incluyas como renglones el subtotal, el IVA, el total, la propina, el cambio ni las formas de pago.
- Los precios en México ya incluyen IVA. Si el ticket lo desglosa aparte y los renglones vienen sin IVA, reparte el IVA proporcionalmente para que la suma de los renglones dé el total sin propina.
- Los descuentos van como parte del renglón al que aplican; si aplican a toda la cuenta, repártelos proporcionalmente.
- Si la imagen no es un ticket o no se alcanza a leer, responde legible en false y deja la lista vacía. No inventes renglones.`;

async function memberOf(authorization) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/my_member`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: authorization, 'Content-Type': 'application/json' },
    body: '{}',
  });
  return r.ok ? r.json() : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(501).json({ error: 'not_configured' });

  // Solo quien ya entró al grupo puede usar la lectura (cada lectura cuesta).
  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ') || !(await memberOf(authorization).catch(() => null))) {
    return res.status(401).json({ error: 'not_member' });
  }

  const { image, mime } = req.body || {};
  if (typeof image !== 'string' || !MIMES.includes(mime) || image.length > MAX_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(image)) {
    return res.status(400).json({ error: 'bad_image' });
  }

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(Ticket) },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: image } },
          { type: 'text', text: PROMPT },
        ],
      }],
    });
    const out = response.parsed_output;
    if (response.stop_reason === 'refusal' || !out || !out.legible) {
      return res.status(422).json({ error: 'unreadable' });
    }
    const items = out.items
      .map((i) => ({ name: String(i.name).trim().slice(0, 80), amount: Math.round(i.amount * 100) / 100 }))
      .filter((i) => i.name && i.amount > 0)
      .slice(0, 60);
    if (!items.length) return res.status(422).json({ error: 'unreadable' });
    return res.status(200).json({
      merchant: String(out.merchant || '').trim().slice(0, 80),
      items,
      tip: Math.max(0, Math.round((out.tip || 0) * 100) / 100),
      total: Math.max(0, Math.round((out.total || 0) * 100) / 100),
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return res.status(501).json({ error: 'not_configured' });
    if (error instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'busy' });
    if (error instanceof Anthropic.BadRequestError) { console.error('ticket: solicitud rechazada', error.message); return res.status(422).json({ error: 'unreadable' }); }
    if (error instanceof Anthropic.APIError) { console.error('ticket: error de la API', error.status, error.message); return res.status(502).json({ error: 'upstream' }); }
    console.error('ticket: error inesperado', error);
    return res.status(500).json({ error: 'server' });
  }
}
