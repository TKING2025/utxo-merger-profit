// 加载主网费率
async function loadFeeRates() {
    try {
        const response = await fetch('/get-fee-rates');
        if (!response.ok) {
            throw new Error(`HTTP 错误: ${response.status}`);
        }
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }
        document.getElementById('fee-rates').textContent = `快速: ${data.fastestFee}, 中等: ${data.halfHourFee}, 慢速: ${data.hourFee}`;
    } catch (error) {
        console.error('加载费率失败:', error);
        document.getElementById('fee-rates').textContent = '无法加载费率';
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
        let accounts;
        if (walletType === 'unisat' && window.unisat) {
            accounts = await window.unisat.requestAccounts();
        } else if (walletType === 'okxweb3' && window.okxwallet) {
            accounts = await window.okxwallet.bitcoin.requestAccounts();
        } else {
            throw new Error('钱包未安装');
        }
        document.getElementById('wallet-status').textContent = `已连接钱包: ${accounts[0]}`;
        document.getElementById('connect-wallet').style.display = 'none';
        document.getElementById('disconnect-wallet').style.display = 'block';
        document.getElementById('merge-utxo').disabled = false;
        document.getElementById('wallet-modal').remove();
    } catch (error) {
        console.error('连接钱包失败:', error);
        document.getElementById('wallet-status').textContent = '连接钱包失败';
        document.getElementById('wallet-modal').remove();
    }
}

// 断开钱包
function disconnectWallet() {
    document.getElementById('wallet-status').textContent = '未连接钱包';
    document.getElementById('connect-wallet').style.display = 'block';
    document.getElementById('disconnect-wallet').style.display = 'none';
    document.getElementById('merge-utxo').disabled = true;
}

// 合并 UTXO 并转账
document.getElementById('merge-utxo').addEventListener('click', async () => {
    const walletStatus = document.getElementById('wallet-status').textContent;
    if (walletStatus === '未连接钱包') {
        alert('请先链接钱包！');
        return;
    }

    const walletAddress = walletStatus.split(': ')[1];
    const targetAddress = document.getElementById('target-address').value || walletAddress;
    const customFeeRate = document.getElementById('custom-fee-rate').value || 3;

    try {
        const response = await fetch('/trade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress, targetAddress, feeRate: customFeeRate })
        });
        const data = await response.json();
        if (data.psbt) {
            alert('交易已生成，请在钱包中确认！');
        } else {
            throw new Error('交易失败');
        }
    } catch (error) {
        console.error('合并 UTXO 失败:', error);
        alert('合并 UTXO 失败: ' + error.message);
    }
});

// 邀请朋友
document.getElementById('invite-friends').addEventListener('click', () => {
    const walletStatus = document.getElementById('wallet-status').textContent;
    if (walletStatus === '未连接钱包') {
        alert('请先链接钱包！');
        return;
    }
    const walletAddress = walletStatus.split(': ')[1];
    const inviteUrl = `${window.location.origin}/?ref=${walletAddress}`;
    const inviteLinkDiv = document.getElementById('invite-link');
    const inviteUrlElement = document.getElementById('invite-url');
    inviteUrlElement.href = inviteUrl;
    inviteUrlElement.textContent = inviteUrl;
    inviteLinkDiv.style.display = 'block';
});

// 页面加载时加载费率
window.onload = loadFeeRates;