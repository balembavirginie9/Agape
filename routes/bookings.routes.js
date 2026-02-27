const express = require("express");
const router = express.Router();
const Booking = require("../models/Booking");
const auth = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");
const mongoose = require("mongoose");

/**
 * POST /api/bookings
 * body: { type, duration, platform, platformDetails, scheduledAt, notes }
 * requires auth
 */
router.post("/", auth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const {
      type,
      duration,
      platform,
      platformDetails = "",
      scheduledAt,
      notes = "",
    } = req.body || {};

    if (!type || !duration || !platform || !scheduledAt) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ message: "Invalid scheduledAt date." });
    }

    const booking = new Booking({
      user: mongoose.Types.ObjectId(userId),
      type,
      duration,
      platform,
      platformDetails,
      scheduledAt: scheduledDate,
      notes,
      status: "pending",
    });

    await booking.save();

    // return booking (populate user minimal if needed)
    return res.status(201).json({ message: "Booking created", booking });
  } catch (err) {
    console.error("CREATE BOOKING ERROR", err);
    return res.status(500).json({ message: "Server error creating booking" });
  }
});

/**
 * GET /api/bookings/me
 * returns bookings for logged-in user
 */
router.get("/me", auth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const bookings = await Booking.find({ user: userId })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ bookings });
  } catch (err) {
    console.error("GET MY BOOKINGS ERROR", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * Admin: GET /api/admin/bookings
 * query: page, limit, status
 */
router.get("/admin/bookings", adminAuth, async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(
      100,
      Math.max(5, parseInt(req.query.limit || "50", 10)),
    );
    const skip = (page - 1) * limit;
    const filter = {};

    if (req.query.status) filter.status = req.query.status;
    if (q) {
      // search by user email/username? populate user
      // Keep it simple: try match booking notes or platformDetails
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ notes: re }, { platformDetails: re }, { platform: re }];
    }

    const [bookings, count] = await Promise.all([
      Booking.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "firstName lastName email username")
        .lean(),
      Booking.countDocuments(filter),
    ]);

    return res.json({
      bookings,
      meta: { page, limit, total: count, pages: Math.ceil(count / limit) },
    });
  } catch (err) {
    console.error("ADMIN LIST BOOKINGS ERROR", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * Admin: PATCH /api/admin/bookings/:id
 * body: { action: 'approve'|'cancel'|'reschedule', adminNote?, rescheduledTo? }
 */
router.patch("/admin/bookings/:id", adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid booking id" });

    const { action, adminNote = "", rescheduledTo = null } = req.body || {};
    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    if (action === "approve") {
      booking.status = "approved";
      booking.adminNote = adminNote;
      booking.rescheduledTo = null;
    } else if (action === "cancel") {
      booking.status = "cancelled";
      booking.adminNote = adminNote;
      booking.rescheduledTo = null;
    } else if (action === "reschedule") {
      const dt = rescheduledTo ? new Date(rescheduledTo) : null;
      if (!dt || isNaN(dt.getTime()))
        return res.status(400).json({ message: "Invalid rescheduledTo date" });
      booking.status = "rescheduled";
      booking.rescheduledTo = dt;
      booking.adminNote = adminNote;
    } else {
      return res.status(400).json({ message: "Invalid action" });
    }

    await booking.save();
    // Optionally populate user
    await booking.populate("user", "firstName lastName email username");
    return res.json({ message: "Booking updated", booking });
  } catch (err) {
    console.error("ADMIN UPDATE BOOKING ERROR", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
