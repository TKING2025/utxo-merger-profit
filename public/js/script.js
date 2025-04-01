// script.js - UTXO Merger Frontend
// Version: 2025-04-01-v7
console.log('Script.js version: 2025-04-01-v7');

// 确保 bitcoinjs-lib 已加载（通过 CDN 或本地文件）
const Bitcoin = window.bitcoinjs || {};
if (!Bitcoin.Psbt) {
    console.error('bitcoinjs-lib 未正确加载，请检查是否通过 <script> 引入');
}

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', async () => {
    const state = {
        walletProvider: null,
        walletAddress: null,
        targetAddress: null,
        profitAddress: '15Kh1QUbZg9cT9UXvtABjg12RCPmzbNLpd', // 你的收益地址
        profitRate: 0.1 // 10% 收益
    };
    Object.seal(state);

    const connectButton = document.getElementById('connect-wallet');
    const disconnectButton = document.getElementById('disconnect-wallet');
    const walletStatus = document.getElementById('wallet-status');
    const mergeButton = document.getElementById('merge-utxo');
    const targetAddressInput = document.getElementById('target-address');
    const feeRateInput = document.getElementById('custom-fee-rate');
    const feeRatesDisplay = document.getElementById('fee-rates');

    // 改进的 fetch 方法
    async function fetchWithErrorHandling(url, options) {
        try {
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
        } catch (error) {
            console.error('网络请求失败:', error.message);
            throw error;
        }
    }

    // 加载比特币网络费率
    async function loadFeeRates() {
        try {
            const data = await fetchWithErrorHandling('/get-fee-rates');
            feeRatesDisplay.textContent = `快速: ${data.fastestFee} sat/vB, 中等: ${data.halfHourFee} sat/vB, 慢速: ${data.hourFee} sat/vB`;
        } catch (error) {
            console.error('加载费率失败:', error);
            feeRatesDisplay.textContent = '无法加载费率';
        }
    }

    // 等待 UniSat 钱包加载
    async function waitForWallet(maxRetries = 5, delay = 1000) {
        for (let i = 0; i < maxRetries; i++) {
            if (window.unisat) return window.unisat;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        throw new Error('未检测到 UniSat 钱包，请确保已安装并启用扩展');
    }

    // 显示钱包选择弹窗
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

        document.getElementById('unisat-wallet').addEventListener('click', () => connectWallet());
        document.getElementById('cancel-wallet').addEventListener('click', () => {
            document.getElementById('wallet-modal').remove();
        });
    }

    // 连接 UniSat 钱包
    async function connectWallet() {
        try {
            const unisat = await waitForWallet();
            const accounts = await unisat.requestAccounts();
            state.walletProvider = 'unisat';
            state.walletAddress = accounts[0];
            walletStatus.textContent = `已连接钱包: ${state.walletAddress}`;
            connectButton.style.display = 'none';
            disconnectButton.style.display = 'inline';
            mergeButton.disabled = false;
            document.getElementById('wallet-modal').remove();
        } catch (error) {
            console.error('连接钱包失败:', error);
            walletStatus.textContent = `连接失败: ${error.message}`;
            document.getElementById('wallet-modal').remove();
        }
    }

    // 断开钱包连接
    if (disconnectButton) {
        disconnectButton.addEventListener('click', () => {
            state.walletProvider = null;
            state.walletAddress = null;
            walletStatus.textContent = '未连接钱包';
            connectButton.style.display = 'inline';
            disconnectButton.style.display = 'none';
            mergeButton.disabled = true;
        });
    }

    // 合并 UTXO
    if (mergeButton) {
        mergeButton.addEventListener('click', async () => {
            state.targetAddress = targetAddressInput.value.trim() || state.walletAddress;
            const feeRate = parseInt(feeRateInput.value) || undefined;

            try {
                if (!state.walletAddress) throw new Error('请先连接钱包');

                // 获取 UTXO
                const utxoData = await fetchWithErrorHandling('/get-utxos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ address: state.walletAddress })
                });
                const { utxos } = utxoData;
                if (!utxos || utxos.length < 1) throw new Error('没有可用的 UTXO');

                // 请求后端生成 PSBT
                const tradeData = await fetchWithErrorHandling('/trade', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        walletAddress: state.walletAddress,
                        targetAddress: state.targetAddress,
                        feeRate
                    })
                });
                const { psbt } = tradeData;

                // 使用 UniSat 签名 PSBT
                const unisat = await waitForWallet();
                const signedTxHex = await unisat.signPsbt(psbt);

                // 广播交易
                const broadcastData = await fetchWithErrorHandling('/broadcast', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ txHex: signedTxHex })
                });
                const { txId } = broadcastData;

                document.location.href = `/?message=UTXO合并成功！&txId=${txId}`;
            } catch (error) {
                console.error('合并 UTXO 失败:', error);
                alert(`合并失败: ${error.message}`);
            }
        });
    }

    // 邀请朋友
    const inviteFriendsButton = document.getElementById('invite-friends');
    if (inviteFriendsButton) {
        inviteFriendsButton.addEventListener('click', () => {
            if (!state.walletAddress) {
                alert('请先连接钱包！');
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

    // 页面加载时初始化
    if (connectButton) connectButton.addEventListener('click', showWalletOptions);
    loadFeeRates();
});