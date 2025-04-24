// src/config/mercadopago.js
import { MercadoPagoConfig, Payment } from 'mercadopago';
import dotenv from 'dotenv';

dotenv.config();

const accessToken = process.env.MP_ACCESS_TOKEN;
let client = null; 

if (!accessToken) {
    console.error("ERRO CRÍTICO: MP_ACCESS_TOKEN não definido nas variáveis de ambiente.");
} else {
    client = new MercadoPagoConfig({ accessToken: accessToken });
}

export default client;

export { Payment };

export const isMercadoPagoConfigured = () => !!client; 