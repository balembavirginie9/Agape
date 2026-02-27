const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const BookingSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["appointment", "session", "callback"],
      required: true,
    },
    duration: { type: Number, required: true }, // minutes
    platform: { type: String, required: true },
    platformDetails: { type: String, default: "" },
    scheduledAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "cancelled", "rescheduled"],
      default: "pending",
    },
    notes: { type: String, default: "" },
    adminNote: { type: String, default: "" },
    rescheduledTo: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Booking", BookingSchema);
