// backend/routes/admin.routes.js
const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const adminAuth = require("../middleware/adminAuth");

const router = express.Router();

// All admin routes are protected
router.use(adminAuth);

/**
 * GET /api/admin/users
 * Query: q (search email/name/username), page, limit
 */
router.get("/users", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(
      100,
      Math.max(5, parseInt(req.query.limit || "20", 10)),
    );
    const skip = (page - 1) * limit;

    const filter = {};
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { email: re },
        { username: re },
        { firstName: re },
        { lastName: re },
        { phone: re },
      ];
    }

    const [users, count] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);

    // hide sensitive fields (passwordHash)
    const sanitized = users.map((u) => {
      delete u.passwordHash;
      return u;
    });

    res.json({
      users: sanitized,
      meta: { page, limit, total: count, pages: Math.ceil(count / limit) },
    });
  } catch (err) {
    console.error("ADMIN LIST USERS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * DELETE /api/admin/users/:id
 */
router.delete("/users/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid user id" });

    // disallow deleting self
    if (req.user?.id === id) {
      return res
        .status(400)
        .json({ message: "Cannot delete your own admin account." });
    }

    const deleted = await User.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "User not found" });

    res.json({ message: "User deleted." });
  } catch (err) {
    console.error("ADMIN DELETE USER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/admin/users/:id/ban
 * body: { reason?: string, until?: ISODateString|null }
 */
router.post("/users/:id/ban", async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid user id" });

    if (req.user?.id === id) {
      return res.status(400).json({ message: "Cannot ban yourself." });
    }

    const { reason = "", until = null } = req.body || {};
    const bannedUntil = until ? new Date(until) : null;

    const user = await User.findByIdAndUpdate(
      id,
      {
        isBanned: true,
        banReason: reason || "No reason provided",
        bannedUntil,
      },
      { new: true },
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      message: "User banned.",
      user: {
        id: user._id,
        isBanned: user.isBanned,
        banReason: user.banReason,
        bannedUntil: user.bannedUntil,
      },
    });
  } catch (err) {
    console.error("ADMIN BAN USER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/admin/users/:id/unban
 */
router.post("/users/:id/unban", async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid user id" });

    const user = await User.findByIdAndUpdate(
      id,
      { isBanned: false, banReason: "", bannedUntil: null },
      { new: true },
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      message: "User unbanned.",
      user: { id: user._id, isBanned: user.isBanned },
    });
  } catch (err) {
    console.error("ADMIN UNBAN USER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /api/admin/users/:id/role
 * body: { role: "member"|"admin" }
 */
router.patch("/users/:id/role", async (req, res) => {
  try {
    const id = req.params.id;
    const { role } = req.body || {};
    if (!["member", "admin"].includes(role))
      return res.status(400).json({ message: "Invalid role" });

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid user id" });

    // disallow changing own role to non-admin (protect breakage)
    if (req.user?.id === id && role !== "admin") {
      return res
        .status(400)
        .json({ message: "Cannot remove admin role from yourself." });
    }

    const user = await User.findByIdAndUpdate(id, { role }, { new: true });
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      message: "Role updated.",
      user: { id: user._id, role: user.role },
    });
  } catch (err) {
    console.error("ADMIN UPDATE ROLE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
