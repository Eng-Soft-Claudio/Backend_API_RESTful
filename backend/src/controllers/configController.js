// src/controllers/configController.js
import AppError from '../utils/appError.js';

export const getMercadoPagoPublicKey = (req, res, next) => {
    const publicKey = process.env.MP_PUBLIC_KEY;
    if (!publicKey) {
        console.error("ERRO: MP_PUBLIC_KEY não definida no .env");
        return next(new AppError('Configuração de pagamento indisponível.', 500));
    }
    res.status(200).json({ publicKey: publicKey });
};