const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: ".env.local" });

const MONGO_URI = process.env.MONGO_URI;

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

    const email = "admin@veriverse.com";
    const existing = await User.findOne({ email });

    if (existing) {
      existing.role = "admin";
      await existing.save();
      console.log("Existing user promoted to admin");
    } else {
      const hashedPassword = await bcrypt.hash("Admin12345!", 10);

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