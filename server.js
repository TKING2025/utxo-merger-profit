const express = require('express');
const axios = require('axios');
const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    const message = req.query.message || '';
    const txId = req.query.txId || '';
    res.render('index', { message, txId });
});

// 获取 UTXO
app.post('/get-utxos', async (req, res) => {
    const { address } = req.body;
    try {
        const response = await axios.get(`https://mempool.space/api/address/${address}/utxo`);
        res.json({ utxos: response.data });
    } catch (error) {
        res.status(500).json({ error: '获取 UTXO 失败' });
    }
});

// 获取当前主网费率
app.get('/get-fee-rates', async (req, res) => {
    try {
        const response = await axios.get('https://mempool.space/api/v1/fees/recommended');
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: '获取费率失败' });
    }
});

// 广播交易
app.post('/broadcast', async (req, res) => {
    const { txHex } = req.body;
    try {
        const response = await axios.post('https://mempool.space/api/tx', txHex, {
            headers: { 'Content-Type': 'text/plain' }
        });
        res.json({ txId: response.data });
    } catch (error) {
        res.status(500).json({ error: '广播交易失败' });
    }
});

app.listen(3000, () => {
    console.log('服务器运行在 http://localhost:3000');
});