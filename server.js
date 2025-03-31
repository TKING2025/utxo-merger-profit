const express = require('express');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const bitcoin = require('bitcoinjs-lib');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static('public'));

// 使用环境变量读取 MongoDB URI
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost/utxo-merger';
mongoose.connect(mongoUri)
  .then(() => console.log('MongoDB 已连接'))
  .catch(err => console.error('MongoDB 连接失败:', err));

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

app.get('/get-fee-rates', async (req, res) => {
  try {
    const response = await axios.get('https://mempool.space/api/v1/fees/recommended');
    res.json(response.data);
  } catch (error) {
    console.error('获取费率失败:', error.message);
    res.status(500).json({ error: '获取费率失败' });
  }
});

app.post('/get-utxos', async (req, res) => {
  const { address } = req.body;
  if (!address) {
    return res.status(400).json({ error: '缺少钱包地址' });
  }
  try {
    const response = await axios.get(`https://mempool.space/api/address/${address}/utxo`);
    const utxos = response.data.map(utxo => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value
    }));
    res.json({ utxos });
  } catch (error) {
    console.error('获取 UTXO 失败:', error.message);
    res.status(500).json({ error: '获取 UTXO 失败' });
  }
});

app.post('/broadcast', async (req, res) => {
  const { txHex } = req.body;
  if (!txHex) {
    return res.status(400).json({ error: '缺少交易数据' });
  }
  try {
    const response = await axios.post('https://mempool.space/api/tx', txHex, {
      headers: { 'Content-Type': 'text/plain' }
    });
    res.json({ txId: response.data });
  } catch (error) {
    console.error('广播交易失败:', error.message);
    res.status(500).json({ error: '广播交易失败' });
  }
});

app.post('/trade', async (req, res) => {
  const { walletAddress, targetAddress, feeRate } = req.body;
  const utxo = await getWalletUTXO(walletAddress);
  const user = await User.findOne({ walletAddress });
  const gasRate = feeRate || await getGasRate();
  const btcPrice = await getBtcPrice();

  const utxoSatoshis = utxo.value * 100000000;
  const serviceFee = utxoSatoshis * 0.10;
  const referralFee = utxoSatoshis * 0.10;
  const gasFee = 225 * gasRate;
  const userReceives = utxoSatoshis - serviceFee - referralFee - gasFee;

  const network = bitcoin.networks.bitcoin;
  const txb = new bitcoin.TransactionBuilder(network);
  txb.addInput(utxo.txid, utxo.vout);
  txb.addOutput(targetAddress || walletAddress, Math.floor(userReceives));
  txb.addOutput(process.env.PLATFORM_ADDRESS || '15Kh1QUbZg9cT9UXvtABjg12RCPmzbNLpd', Math.floor(serviceFee));

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