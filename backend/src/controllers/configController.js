// src/controllers/configController.js
import AppError from '../utils/appError.js';

/**
 * @description Retorna a chave pública do Mercado Pago configurada no ambiente.
 *              Essencial para o frontend inicializar o SDK JS V2 do Mercado Pago.
 * @route GET /api/config/mp-public-key
 * @access Público
 * @param {object} req - Objeto de requisição do Express.
 * @param {object} res - Objeto de resposta do Express.
 * @param {function} next - Função de middleware do Express.
 */
export const getMercadoPagoPublicKey = (req, res, next) => {
    const publicKey = process.env.MP_PUBLIC_KEY;

    if (!publicKey) {
        return next(new AppError('Configuração de pagamento indisponível no momento.', 503));
    }
    res.status(200).json({ publicKey: publicKey });
};

// --- Adicione aqui outros controllers de configuração se necessário ---
// Exemplo:
// export const getSomeOtherApiKey = (req, res, next) => {
//   const apiKey = process.env.OTHER_API_KEY;
//   if (!apiKey) {
//       return next(new AppError('Outra chave não configurada.', 503));
//   }
//   res.status(200).json({ otherKey: apiKey });
// };