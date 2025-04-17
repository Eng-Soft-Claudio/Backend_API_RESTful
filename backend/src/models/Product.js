import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  image: { type: String, required: true },
  price: { type: Number, required: true },
  category: { type: String, required: true }
}, { 
  timestamps: true 
});

productSchema.index({ name: 'text', description: 'text' });

export default mongoose.model('Product', productSchema);