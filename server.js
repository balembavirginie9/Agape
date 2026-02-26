require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");

const app = express();

// graceful uncaught handlers
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err && err.stack ? err.stack : err);
});
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

// config
const PORT = process.env.PORT || 5000;
const MONGO_URI = (process.env.MONGO_URI || "").replace(/^"|"$/g, "");

// quick guard
if (!MONGO_URI) {
  console.error("MONGO_URI is not set in .env. Exiting.");
  process.exit(1);
}

// helmet: stricter in production
if (process.env.NODE_ENV === "production") {
  app.use(helmet());
} else {
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
}

// parsing and CORS
app.use(cors());
app.use(express.json({ limit: "50kb" }));

// rate limiters
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
});
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
});

// connect to MongoDB
mongoose.set("strictQuery", true);
mongoose
  .connect(MONGO_URI, { dbName: process.env.DB_NAME || undefined })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => {
    console.error(
      "MongoDB connection error:",
      err && err.stack ? err.stack : err,
    );
    process.exit(1);
  });

// routes
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");

app.use("/api/admin", adminLimiter, adminRoutes);
app.use("/api/users", authLimiter, authRoutes);

// health
app.get("/health", (req, res) => res.json({ ok: true, time: Date.now() }));

// serve frontend
const frontendPath = path.resolve(__dirname, "..", "frontend");
if (fs.existsSync(frontendPath) && fs.statSync(frontendPath).isDirectory()) {
  console.log("Serving frontend from:", frontendPath);
  app.use(express.static(frontendPath));

  app.get("/", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
  });

  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
  });
} else {
  console.warn(`Frontend folder not found at ${frontendPath}.`);
  app.get("/", (req, res) =>
    res.json({ message: "API running. Frontend not found." }),
  );
}

// error handler
app.use((err, req, res, next) => {
  console.error("EXPRESS ERROR HANDLER:", err && err.stack ? err.stack : err);
  try {
    res.status(500).json({ message: "Internal server error" });
  } catch (e) {}
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
