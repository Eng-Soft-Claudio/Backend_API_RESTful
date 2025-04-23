//src/test-signature.js
import crypto from 'crypto';

const webhookSecret = 'fe5283d0baef7ef048f9da58513fa7f3c92fc21d5c7cf190215a545bf45ebb72';
const baseString = 'id:1323136738;request-id:2a54f694-42a8-47f9-86c4-a4ee89af83df;ts:1745366822395';

const hmac = crypto.createHmac('sha256', webhookSecret);
const calculatedSignature = hmac.update(baseString).digest('hex');

console.log('Assinatura Calculada:', calculatedSignature);
