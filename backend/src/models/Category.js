// src/models/Category.js
import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Nome da categoria é obrigatório'],
        unique: true, // Garante nomes únicos (case-insensitive por padrão com collation)
        trim: true
    },
    slug: {
        type: String,
        unique: true, // Garante slugs únicos
        lowercase: true,
        index: true // Otimiza buscas pelo slug
    },
    description: {
        type: String,
        trim: true
    }
}, { timestamps: true });

// Middleware pre-save para gerar/atualizar o slug automaticamente
categorySchema.pre('save', function(next) {
    // Gera o slug apenas se o nome foi modificado (ou é um novo documento)
    if (this.isModified('name') || this.isNew) {
        // Lógica de slugificação:
        // 1. Converte para minúsculas
        // 2. Remove acentos (usando replace para cada vogal acentuada)
        // 3. Substitui ç por c
        // 4. Substitui qualquer caractere não alfanumérico ou hífen por hífen
        // 5. Remove múltiplos hífens consecutivos
        // 6. Remove hífens no início ou fim
        const slugTemp = this.name.toLowerCase()
            .replace(/[áàãâä]/g, 'a')
            .replace(/[éèêë]/g, 'e')
            .replace(/[íìîï]/g, 'i')
            .replace(/[óòõôö]/g, 'o')
            .replace(/[úùûü]/g, 'u')
            .replace(/[ç]/g, 'c')
            .replace(/[^a-z0-9-]+/g, '-') // Mantém letras, números e hífens
            .replace(/-+/g, '-')           // Remove hífens duplicados
            .replace(/^-+|-+$/g, '');       // Remove hífens do início/fim
        this.slug = slugTemp;
    }
    next(); // Continua o processo de salvar
});


// Cria o índice unique case-insensitive para 'name' (importante para evitar duplicatas como "Eletronicos" e "eletronicos")
// Nota: Se o MongoDB já criou o índice sem essa opção, pode ser necessário recriá-lo.
// categorySchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
// Alternativamente, o unique: true no schema pode ser suficiente dependendo da versão/config do MongoDB.

const Category = mongoose.model('Category', categorySchema);

export default Category;