const express = require('express');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const bitcoin = require('bitcoinjs-lib');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

// 使用环境变量连接 MongoDB
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost/utxo-merger';
mongoose.connect(mongoUri).then(() => console.log('MongoDB 已连接'));

const User = require('./models/User');

function generateReferralCode() {
  return uuidv4().slice(0, 8);
}

async function getGasRate() {
  try {
    const response = await axios.get('https://mempool.space/api/v1/fees/recommended');
    return response.data.fastestFee;
  } catch (error) {
    console.error('获取 Gas 费率失败:', error);
    return 2;
  }
}

async function getBtcPrice() {
  return 80000;
}

async function getWalletUTXO(walletAddress) {
  return { value: 0.0003, txid: '示例txid', vout: 0 };
}

app.get('/', (req, res) => res.render('index'));

app.get('/register', (req, res) => {
  const referralCode = req.query.ref || null;
  res.render('register', { referralCode });
});

app.post('/register', async (req, res) => {
  const { username, walletAddress, referralCode } = req.body;
  const newUser = new User({
    username,
    walletAddress,
    referralCode: generateReferralCode(),
    referredBy: referralCode || null
  });
  await newUser.save();
  res.redirect('/wallet?address=' + walletAddress);
});

app.get('/wallet', async (req, res) => {
  const walletAddress = req.query.address || '示例地址';
  const utxo = await getWalletUTXO(walletAddress);
  const btcPrice = await getBtcPrice();
  const gasRate = await getGasRate();
  const txSize = 225;

  const utxoSatoshis = utxo.value * 100000000;
  const serviceFee = utxoSatoshis * 0.10;
  const referralFee = utxoSatoshis * 0.10;
  const gasFee = txSize * gasRate;
  const userReceives = utxoSatoshis - serviceFee - referralFee - gasFee;

  res.render('wallet', {
    walletAddress,
    utxoValue: utxo.value,
    utxoUSD: utxo.value * btcPrice,
    serviceFee: serviceFee / 100000000 * btcPrice,
    referralFee: referralFee / 100000000 * btcPrice,
    gasFee: gasFee / 100000000 * btcPrice,
    userReceives: userReceives / 100000000 * btcPrice,
    gasRate
  });
});

app.post('/trade', async (req, res) => {
  const { walletAddress } = req.body;
  const utxo = await getWalletUTXO(walletAddress);
  const user = await User.findOne({ walletAddress });
  const gasRate = await getGasRate();
  const btcPrice = await getBtcPrice();

  const utxoSatoshis = utxo.value * 100000000;
  const serviceFee = utxoSatoshis * 0.10;
  const referralFee = utxoSatoshis * 0.10;
  const gasFee = 225 * gasRate;
  const userReceives = utxoSatoshis - serviceFee - referralFee - gasFee;

  const network = bitcoin.networks.bitcoin;
  const txb = new bitcoin.TransactionBuilder(network);
  txb.addInput(utxo.txid, utxo.vout);
  txb.addOutput(walletAddress, Math.floor(userReceives));
  txb.addOutput(process.env.PLATFORM_ADDRESS, Math.floor(serviceFee));

  if (user && user.referredBy) {
    const inviter = await User.findOne({ referralCode: user.referredBy });
    if (inviter) {
      txb.addOutput(inviter.walletAddress, Math.floor(referralFee));
      inviter.referralEarnings += referralFee / 100000000 * btcPrice;
      await inviter.save();
    }
  }

  const tx = txb.buildIncomplete().toHex();
  res.json({ psbt: tx });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`服务器运行在端口 ${port}`));