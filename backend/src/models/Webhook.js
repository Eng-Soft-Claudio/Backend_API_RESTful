import mongoose from 'mongoose';

const webhookSchema = new mongoose.Schema({
  url: { type: String, required: true, unique: true },
  eventType: { 
    type: String, 
    enum: ['product_created', 'product_updated'], 
    required: true 
  }
});

export default mongoose.model('Webhook', webhookSchema);