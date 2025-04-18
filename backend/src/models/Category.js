// src/models/Category.js
import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Nome da categoria é obrigatório'],
        unique: true,
        trim: true
    },
    slug: {
        type: String,
        unique: true,
        lowercase: true,
    },
    description: {
        type: String,
        trim: true
    }
}, { timestamps: true });

categorySchema.pre('save', function(next) {
    if (this.isModified('name')) {
        const slugTemp = this.name.toLowerCase()
            .replace(/[áàãâä]/g, 'a')
            .replace(/[éèêë]/g, 'e')
            .replace(/[íìîï]/g, 'i')
            .replace(/[óòõôö]/g, 'o') 
            .replace(/[úùûü]/g, 'u')
            .replace(/[ç]/g, 'c')
            .replace(/[^a-z0-9-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/(^-|-$)+/g, '');
        this.slug = slugTemp;
    }
    next();
});


const Category = mongoose.model('Category', categorySchema);

export default Category;