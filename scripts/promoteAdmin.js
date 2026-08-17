// promoteAdmin.js
// Usage: node promoteAdmin.js <email>

const mongoose = require("mongoose");
require("dotenv").config({ path: ".env.local" });

const MONGO_URI = process.env.MONGO_URI;

const UserSchema = new mongoose.Schema({
  email: String,
  role: String,
});

const User = mongoose.models.User || mongoose.model("User", UserSchema);

async function promote(email) {
  if (!email) {
    console.error("Usage: node promoteAdmin.js <email>");
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI);
  const user = await User.findOne({ email });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }
  user.role = "admin";
  await user.save();
  console.log(`Promoted ${email} to admin.`);
  await mongoose.disconnect();
}

promote(process.argv[2]);
