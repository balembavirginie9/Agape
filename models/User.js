// backend/models/User.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },

    // auth
    passwordHash: { type: String, required: true },

    // profile
    dob: { type: String, required: true },
    gender: { type: String, required: true },

    // admin / moderation
    role: { type: String, enum: ["member", "admin"], default: "member" },
    isBanned: { type: Boolean, default: false },
    banReason: { type: String, default: "" },
    bannedUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

// ensure index for uniqueness
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });

module.exports = mongoose.models?.User || mongoose.model("User", userSchema);
