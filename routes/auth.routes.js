// backend/routes/auth.routes.js
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const auth = require("../middleware/auth");

const router = express.Router();

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "10", 10);
const JWT_SECRET = process.env.JWT_SECRET || "replace-this-with-a-secret";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "7d";

function sanitizeUser(userDoc) {
  if (!userDoc) return null;
  const u = userDoc.toObject ? userDoc.toObject() : { ...userDoc };
  delete u.passwordHash;
  return u;
}

/**
 * Register
 * POST /api/users/register
 */
router.post("/register", async (req, res) => {
  try {
    const {
      firstName = "",
      lastName = "",
      username = "",
      email = "",
      phone = "",
      country = "",
      password = "",
      dob = "",
      gender = "",
    } = req.body || {};

    // server-side validation (keep this in sync with your frontend)
    if (
      !firstName ||
      !lastName ||
      !username ||
      !email ||
      !phone ||
      !country ||
      !password ||
      !dob ||
      !gender
    ) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    if (password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters." });
    }

    // uniqueness checks
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail)
      return res.status(409).json({ message: "Email already registered." });

    const existingUsername = await User.findOne({ username });
    if (existingUsername)
      return res.status(409).json({ message: "Username already taken." });

    // hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // create user
    const newUser = new User({
      firstName,
      lastName,
      username,
      email: email.toLowerCase(),
      phone,
      country,
      passwordHash,
      dob,
      gender,
    });

    await newUser.save();

    return res.status(201).json({
      message: "Account created.",
      user: sanitizeUser(newUser),
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    // duplicate key handling
    if (err?.code === 11000) {
      const key = Object.keys(err.keyValue || {}).join(", ") || "field";
      return res.status(409).json({ message: `${key} already exists.` });
    }
    return res.status(500).json({ message: "Server error during signup." });
  }
});

// backend/routes/auth.routes.js — use this single /login handler (delete any duplicate handlers)
router.post("/login", async (req, res) => {
  try {
    const { email = "", password = "" } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ message: "Email and password required." });

    const normalizedEmail = email.toLowerCase().trim();

    // always select passwordHash explicitly
    const user = await User.findOne({ email: normalizedEmail }).select(
      "+passwordHash",
    );
    if (!user) return res.status(401).json({ message: "Invalid credentials." });

    // banned check
    if (user.isBanned) {
      const until = user.bannedUntil ? user.bannedUntil.toISOString() : null;
      return res.status(403).json({
        message: "Account is banned.",
        ban: { reason: user.banReason || "No reason provided", until },
      });
    }

    // compare against passwordHash field
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match)
      return res.status(401).json({ message: "Invalid credentials." });

    // include role (and id) in the token payload
    const token = jwt.sign(
      {
        id: user._id.toString(),
        email: user.email,
        username: user.username,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES },
    );

    // sanitizeUser deletes passwordHash but keeps role
    return res.json({
      message: "Login successful.",
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err && err.stack ? err.stack : err);
    return res.status(500).json({ message: "Server error during login." });
  }
});

router.get("/me", auth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ user: sanitizeUser(user) });
  } catch (err) {
    console.error("ME ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * Update profile
 * PUT /api/users/me
 */
router.put("/me", auth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const allowed = [
      "firstName",
      "lastName",
      "username",
      "email",
      "phone",
      "country",
      "dob",
      "gender",
    ];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    // if email or username changed, ensure uniqueness
    if (updates.email) {
      const existing = await User.findOne({
        email: updates.email.toLowerCase(),
        _id: { $ne: userId },
      });
      if (existing)
        return res.status(409).json({ message: "Email already in use." });
      updates.email = updates.email.toLowerCase();
    }
    if (updates.username) {
      const existing = await User.findOne({
        username: updates.username,
        _id: { $ne: userId },
      });
      if (existing)
        return res.status(409).json({ message: "Username already in use." });
    }

    const user = await User.findByIdAndUpdate(userId, updates, {
      new: true,
      runValidators: true,
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({ message: "Profile updated", user: sanitizeUser(user) });
  } catch (err) {
    console.error("UPDATE PROFILE ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * Change password
 * POST /api/users/change-password
 * body: { oldPassword, newPassword }
 */
router.post("/change-password", auth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { oldPassword = "", newPassword = "" } = req.body || {};
    if (!oldPassword || !newPassword)
      return res
        .status(400)
        .json({ message: "Old and new passwords required." });

    if (newPassword.length < 8)
      return res
        .status(400)
        .json({ message: "New password must be at least 8 characters." });

    const user = await User.findById(userId).select("+passwordHash");
    if (!user) return res.status(404).json({ message: "User not found" });

    const match = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!match)
      return res.status(401).json({ message: "Old password incorrect." });

    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await user.save();

    return res.json({ message: "Password updated." });
  } catch (err) {
    console.error("CHANGE PASSWORD ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * Delete account
 * DELETE /api/users/delete
 */
router.delete("/delete", auth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    await User.findByIdAndDelete(userId);
    return res.json({ message: "Account deleted." });
  } catch (err) {
    console.error("DELETE ACCOUNT ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// inside backend/routes/auth.routes.js — replace the existing /login handler with this
router.post("/login", async (req, res) => {
  try {
    const { email = "", password = "" } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ message: "Email and password required." });

    // find user (include passwordHash)
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+passwordHash",
    );
    if (!user) return res.status(401).json({ message: "Invalid credentials." });

    // block banned users
    if (user.isBanned) {
      const until = user.bannedUntil ? user.bannedUntil.toISOString() : null;
      return res.status(403).json({
        message: "Account is banned.",
        ban: { reason: user.banReason || "No reason provided", until },
      });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match)
      return res.status(401).json({ message: "Invalid credentials." });

    // sign token
    const token = jwt.sign(
      { id: user._id.toString(), email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES },
    );

    return res.json({
      message: "Login successful.",
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ message: "Server error during login." });
  }
});

module.exports = router;
