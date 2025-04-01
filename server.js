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
    return 2; // 默认值
  }
}

async function getBtcPrice() {
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    return response.data.bitcoin.usd;
  } catch (error) {
    console.error('获取比特币价格失败:', error);
    return 80000; // 默认值
  }
}

async function getWalletUTXO(walletAddress) {
  try {
    const response = await axios.get(`https://mempool.space/api/address/${walletAddress}/utxo`);
    return response.data.map(utxo => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value // 以聪为单位
    }));
  } catch (error) {
    console.error('获取 UTXO 失败:', error.message);
    return [];
  }
}

app.get('/', (req, res) => res.render('index'));

app.get('/register', (req, res) => {
  const referralCode = req.query.ref || null;
  res.render('register', { referralCode });
});

app.post('/register', async (req, res) => {
  const { username, walletAddress, referralCode } = req.body;
  if (!username || !walletAddress) {
    return res.status(400).send('缺少用户名或钱包地址');
  }
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
  const utxos = await getWalletUTXO(walletAddress);
  const btcPrice = await getBtcPrice();
  const gasRate = await getGasRate();

  let totalSatoshis = 0;
  utxos.forEach(utxo => totalSatoshis += utxo.value);

  const serviceFee = totalSatoshis * 0.10; // 10% 服务费
  const referralFee = totalSatoshis * 0.10; // 10% 推荐费
  const txSize = utxos.length * 148 + 34 + 10; // 粗略估算交易大小
  const gasFee = txSize * gasRate;
  const userReceives = totalSatoshis - serviceFee - referralFee - gasFee;

  res.render('wallet', {
    walletAddress,
    utxos,
    totalValue: totalSatoshis / 100000000,
    totalUSD: totalSatoshis / 100000000 * btcPrice,
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
    const utxos = await getWalletUTXO(address);
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
  if (!walletAddress || !targetAddress) {
    return res.status(400).json({ error: '缺少钱包地址或目标地址' });
  }

  const utxos = await getWalletUTXO(walletAddress);
  if (utxos.length === 0) {
    return res.status(400).json({ error: '没有可用的 UTXO' });
  }

  const user = await User.findOne({ walletAddress });
  const gasRate = feeRate || await getGasRate();
  const network = bitcoin.networks.bitcoin;
  const psbt = new bitcoin.Psbt({ network });

  // 添加输入
  let totalInputSatoshis = 0;
  utxos.forEach(utxo => {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      nonWitnessUtxo: null // UniSat 会处理签名，留空即可
    });
    totalInputSatoshis += utxo.value;
  });

  // 计算费用
  const serviceFee = totalInputSatoshis * 0.10; // 10% 服务费
  const referralFee = totalInputSatoshis * 0.10; // 10% 推荐费
  const txSize = utxos.length * 148 + 34 * 3 + 10; // 粗略估算（3 个输出）
  const gasFee = txSize * gasRate;
  const userReceives = totalInputSatoshis - serviceFee - referralFee - gasFee;

  if (userReceives <= 0) {
    return res.status(400).json({ error: '余额不足以支付费用' });
  }

  // 添加输出
  psbt.addOutput({ address: targetAddress, value: Math.floor(userReceives) });
  psbt.addOutput({
    address: process.env.PLATFORM_ADDRESS || '15Kh1QUbZg9cT9UXvtABjg12RCPmzbNLpd',
    value: Math.floor(serviceFee)
  });

  if (user && user.referredBy) {
    const inviter = await User.findOne({ referralCode: user.referredBy });
    if (inviter) {
      psbt.addOutput({ address: inviter.walletAddress, value: Math.floor(referralFee) });
      const btcPrice = await getBtcPrice();
      inviter.referralEarnings += referralFee / 100000000 * btcPrice;
      await inviter.save();
    }
  }

  const psbtHex = psbt.toHex();
  res.json({ psbt: psbtHex });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`服务器运行在端口 ${port}`));