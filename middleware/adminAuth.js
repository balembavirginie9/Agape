// backend/middleware/adminAuth.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const JWT_SECRET = process.env.JWT_SECRET || "replace-this-with-a-secret";

module.exports = async function (req, res, next) {
  const header = req.headers.authorization || "";
  const m = header.match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ message: "Unauthorized" });
  const token = m[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // payload should contain id
    if (!payload?.id) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden: admin only" });
    }

    // attach both payload and full user doc for convenience
    req.user = payload;
    req.userDoc = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
