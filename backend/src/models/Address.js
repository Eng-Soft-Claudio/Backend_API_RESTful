//src/models/Address.js
import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // --- Identificação do Endereço ---
    label: {
      type: String,
      trim: true,
      maxlength: 50,
    },

    // --- Detalhes do Logradouro ---
    street: {
      type: String,
      required: [true, "O nome da rua/logradouro é obrigatório."],
      trim: true,
      maxlength: 400,
    },
    number: {
      type: String,
      required: [true, "O número é obrigatório (use S/N se não houver)."],
      trim: true,
      maxlength: 20,
    },
    complement: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    neighborhood: {
      type: String,
      required: [true, "O bairro é obrigatório."],
      trim: true,
      maxlength: 100,
    },

    // --- Localização Geográfica ---
    city: {
      type: String,
      required: [true, "A cidade é obrigatória."],
      trim: true,
      maxlength: 100,
    },
    state: {
      type: String,
      required: [true, "O estado (UF) é obrigatório."],
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 2,
    },
    postalCode: {
      type: String,
      required: [true, "O CEP é obrigatório."],
      trim: true,
      match: [
        /^\d{5}-?\d{3}$/,
        "Formato de CEP inválido (ex: 12345-678 ou 12345678).",
      ],
    },
    country: {
      type: String,
      required: [true, "O país é obrigatório."],
      trim: true,
      default: "Brasil",
      maxlength: 50,
    },

    // --- Informações Adicionais ---
    phone: {
      type: String,
      trim: true,
      maxlength: 20,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// --- Middleware (Hook) pré-save para garantir apenas um 'isDefault' por usuário ---
addressSchema.pre("save", async function (next) {
  if (this.isModified("isDefault") && this.isDefault === true) {
    try {
      await this.constructor.updateMany(
        { user: this.user, isDefault: true, _id: { $ne: this._id } },
        { $set: { isDefault: false } }
      );
      next();
    } catch (err) {
      next(err);
    }
  } else {
    next();
  }
});

// Cria o modelo 'Address'
const Address = mongoose.model("Address", addressSchema);

// Exporta o modelo
export default Address;
