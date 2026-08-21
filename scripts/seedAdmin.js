const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: ".env.local" });

const MONGO_URI = process.env.MONGODB_URI ?? process.env.MONGO_URI;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@veriverse.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  console.error("Please set ADMIN_PASSWORD in your environment before running this script");
  process.exit(1);
}

const UserSchema = new mongoose.Schema(
  {
    username: String,
    email: String,
    password: String,
    reputation: { type: Number, default: 0 },
    role: { type: String, enum: ["user", "admin"], default: "user" },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);

async function run() {
  try {
    await mongoose.connect(MONGO_URI);

    const email = ADMIN_EMAIL;
    const existing = await User.findOne({ email });

    if (existing) {
      existing.role = "admin";
      existing.password = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await existing.save();
      console.log("Existing user promoted to admin and password reset");
    } else {
      const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

      await User.create({
        username: "admin",
        email,
        password: hashedPassword,
        reputation: 100,
        role: "admin",
      });

      console.log("Admin user created");
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
}

run();