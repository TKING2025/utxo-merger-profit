const express = require('express');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const bitcoin = require('bitcoinjs-lib');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

// 连接 MongoDB（替换为你的 MongoDB Atlas URL）
mongoose.connect('mongodb://localhost/utxo-merger', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB 已连接'));

// 用户模型
const User = require('./models/User');

// 生成推荐码
function generateReferralCode() {
  return uuidv4().slice(0, 8);
}

// 获取实时 Gas 费率
async function getGasRate() {
  try {
    const response = await axios.get('https://mempool.space/api/v1/fees/recommended');
    return response.data.fastestFee; // 最快费率 (sat/vB)
  } catch (error) {
    console.error('获取 Gas 费率失败:', error);
    return 2; // 默认 2 sat/vB
  }
}

// 获取 BTC/USD 价格（示例，实际可替换为 CoinGecko API）
async function getBtcPrice() {
  return 80000; // 假设 1 BTC = 80,000 USD
}

// 模拟获取钱包 UTXO 数据（需替换为 OKX Wallet API 或其他服务）
async function getWalletUTXO(walletAddress) {
  return { value: 0.0003, txid: '示例txid', vout: 0 }; // 示例 UTXO: 0.0003 BTC
}

// 首页
app.get('/', (req, res) => {
  res.render('index');
});

// 注册路由
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

// 钱包页面（展示 UTXO 和费用预估）
app.get('/wallet', async (req, res) => {
  const walletAddress = req.query.address || '示例地址';
  const utxo = await getWalletUTXO(walletAddress);
  const btcPrice = await getBtcPrice();
  const gasRate = await getGasRate();
  const txSize = 225; // 假设交易大小（vBytes）

  const utxoSatoshis = utxo.value * 100000000;
  const serviceFee = utxoSatoshis * 0.10; // 10% 服务费
  const referralFee = utxoSatoshis * 0.10; // 10% 返佣
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

// 交易路由
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
  txb.addOutput(walletAddress, Math.floor(userReceives)); // 用户到手
  txb.addOutput('你的平台BTC地址', Math.floor(serviceFee)); // 替换为实际地址

  if (user && user.referredBy) {
    const inviter = await User.findOne({ referralCode: user.referredBy });
    if (inviter) {
      txb.addOutput(inviter.walletAddress, Math.floor(referralFee));
      inviter.referralEarnings += referralFee / 100000000 * btcPrice;
      await inviter.save();
    }
  }

  const tx = txb.buildIncomplete().toHex();
  // 注意：这里需要前端使用 OKX Wallet 签名并广播
  res.json({ psbt: tx });
});

app.listen(3000, () => console.log('服务器运行在端口 3000'));