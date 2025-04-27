// src/config/mercadopago.js
import { MercadoPagoConfig, Payment } from 'mercadopago';
import dotenv from 'dotenv';

dotenv.config();

const accessToken = process.env.MP_ACCESS_TOKEN;
let mpClient = null; 

if (!accessToken) {
} else {
    mpClient = new MercadoPagoConfig({ accessToken: accessToken });
}

export default mpClient;

export { Payment };

export const isMercadoPagoConfigured = () => !!mpClient; 