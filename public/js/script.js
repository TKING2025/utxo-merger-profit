document.addEventListener('DOMContentLoaded', async () => {
    let walletProvider = null;
    let walletAddress = null;
    let targetAddress = null;
    const profitAddress = '15Kh1QUbZg9cT9UXvtABjg12RCPmzbNLpd';
    const profitRate = 0.1;

    const connectButton = document.getElementById('connectWallet') || { addEventListener: () => {}, style: {} };
    const disconnectButton = document.getElementById('disconnectWallet') || { addEventListener: () => {}, style: {} };
    const walletStatus = document.getElementById('walletStatus') || { textContent: '' };
    const mergeButton = document.getElementById('mergeButton') || { addEventListener: () => {}, disabled: true };
    const targetAddressInput = document.getElementById('targetAddress') || { value: '' };
    const feeRateInput = document.getElementById('feeRate') || { value: '' };
    const feeRatesDisplay = document.getElementById('feeRates') || { textContent: '', dataset: {} };

    async function loadFeeRates() {
        try {
            const data = { fastestFee: 20, halfHourFee: 15, hourFee: 10 };
            feeRatesDisplay.textContent = `快速: ${data.fastestFee  sat/vB, 中等: ${data.halfHourFee} sat/vB, 慢速: ${data.hourFee} sat/vB`;
            feeRatesDisplay.dataset.fees = JSON.stringify(data);
        } catch (error) {
            console.error('加载费率失败:', error);
            feeRatesDisplay.textContent = `无法加载费率信息: ${error.message}`;
        }
    }

    function updateWalletStatus() {
        if (walletAddress) {
            walletStatus.textContent = `已连接钱包: ${walletAddress}`;
            connectButton.style.display = 'none';
            disconnectButton.style.display = 'inline-block';
            mergeButton.disabled = false;
        } else {
            walletStatus.textContent = '未连接钱包';
            connectButton.style.display = 'inline-block';
            disconnectButton.style.display = 'none';
            mergeButton.disabled = true;
        }
    }

    connectButton.addEventListener('click', async () => {
        try {
            if (window.unisat) {
                const accounts = await window.unisat.requestAccounts();
                walletProvider = 'unisat';
                walletAddress = accounts[0];
            } else if (window.okxwallet && window.okxwallet.bitcoin) {
                const result = await window.okxwallet.bitcoin.connect();
                walletProvider = 'okx';
                walletAddress = result.address;
            } else {
                alert('请安装 UniSat 或 OKX 钱包插件！');
                return;
            }
            updateWalletStatus();
        } catch (error) {
            console.error('连接钱包失败:', error);
            walletStatus.textContent = '钱包连接失败';
            alert('连接钱包时出错，请重试');
        }
    });

    disconnectButton.addEventListener('click', () => {
        walletProvider = null;
        walletAddress = null;
        updateWalletStatus();
    });

    mergeButton.addEventListener('click', async () => {
        targetAddress = targetAddressInput.value.trim();
        const feeRate = parseFloat(feeRateInput.value) || 0;

        if (!walletAddress) {
            alert('请先连接钱包');
            return;
        }
        if (!targetAddress) {
            alert('请输入目标地址');
            return;
        }
        if (feeRate <= 0) {
            alert('请输入有效的交易费率');
            return;
        }

        try {
            let txId;
            const txData = {
                toAddress: targetAddress,
                profitAddress: profitAddress,
                amount: null,
                feeRate: feeRate,
                profitRate: profitRate
            };

            if (walletProvider === 'unisat') {
                txId = await window.unisat.sendBitcoin(targetAddress, null, { feeRate: feeRate });
            } else if (walletProvider === 'okx') {
                txId = await window.okxwallet.bitcoin.sendBitcoin({ to: targetAddress, amount: null, feeRate: feeRate });
            }

            alert(`交易成功！交易ID: ${txId}`);
            targetAddressInput.value = '';
            feeRateInput.value = '';
        } catch (error) {
            console.error('合并 UTXO 失败:', error);
            alert(`合并失败: ${error.message}`);
        }
    });

    loadFeeRates();
    updateWalletStatus();
});