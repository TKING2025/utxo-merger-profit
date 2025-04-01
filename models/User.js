const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  walletAddress: { type: String, required: true, unique: true },
  referralCode: { type: String, unique: true },
  referredBy: { type: String, default: null },
  referralEarnings: { type: Number, default: 0 }
});

module.exports = mongoose.model('User', userSchema);