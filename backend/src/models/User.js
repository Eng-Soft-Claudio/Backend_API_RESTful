// src/models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true 
    },
    password: {
        type: String,
        required: true,
        minlength: 8,
        select: false
    },
    role: {
        type: String,
        enum: ['admin', 'user'],
        default: 'user'
    },
    passwordChangedAt: Date,

}, { timestamps: true }); 

// --- MIDDLEWARE Mongoose PRE-SAVE ---
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    this.password = await bcrypt.hash(this.password, 12);

    if (!this.isNew) { 
        this.passwordChangedAt = Date.now() - 1000;
    }


    next();
});

// --- MÉTODO DE INSTÂNCIA PARA COMPARAR SENHA ---
userSchema.methods.correctPassword = async function (candidatePassword, userPassword) {
    return await bcrypt.compare(candidatePassword, userPassword);
};

// --- MÉTODO DE INSTÂNCIA PARA CHECAR MUDANÇA DE SENHA ---
userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
    if (this.passwordChangedAt) {
        const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
        return JWTTimestamp < changedTimestamp; 
    }
    return false;
};

const User = mongoose.model('User', userSchema);

export default User;