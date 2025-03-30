const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  walletAddress: { type: String, required: true },
  referralCode: { type: String, unique: true },
  referredBy: String,
  referralEarnings: { type: Number, default: 0 }
});

module.exports = mongoose.model('User', userSchema);