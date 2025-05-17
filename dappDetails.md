# wLiquify Frontend dApp User Guide

## 1. Introduction

Welcome to the wLiquify dApp! This guide will help you understand how to use our platform to interact with the wLiquify liquidity pool and swap tokens. Our goal is to provide a seamless and transparent experience for managing your digital assets.

This dApp allows you to:
- Swap various cryptocurrencies efficiently using an integrated Jupiter terminal.
- Provide liquidity to the wLiquify pool and earn potential rewards by holding wLQI tokens.
- Manage your wallet connection and transaction settings.

## 2. Getting Started: Connecting Your Wallet

Before you can use most features of the dApp, you'll need to connect a Solana wallet.

**Supported Wallets:**
The dApp supports a range of popular Solana wallets, including:
- Phantom
- Solflare
- Coinbase Wallet
- Trust Wallet
- Ledger

**How to Connect:**
1.  Locate the **"Select Wallet"** button, typically found in the header of the application.
2.  Clicking this button will open a modal displaying a list of supported wallets.
3.  Choose your preferred wallet from the list.
4.  Approve the connection request from within your wallet application.

**Wallet Not Detected?**
If you've selected a wallet but its browser extension is not installed or active, the button might indicate "(Not Detected)". In this case, a small dropdown menu may appear, offering options to:
- **Download the wallet extension**: This will direct you to the wallet's official download page.
- **Change Wallet**: Allows you to select a different wallet.

**Wallet Connected - Profile Panel:**
Once connected, the wallet button will display your truncated wallet address (e.g., `ABCD...WXYZ`) and the icon of your connected wallet. Clicking this button opens the **Wallet Profile Panel**, which provides:
- Your full wallet address and a button to copy it.
- An option to view your address on your preferred blockchain explorer.
- Your total portfolio value (USD estimate).
- A detailed breakdown of your token balances, including your wLQI tokens and other whitelisted tokens held in your wallet.
- Buttons to:
    - **Change Wallet**: Opens the wallet selection modal again.
    - **Disconnect**: Logs you out of the dApp.

## 3. Core Features

### 3.1. Swap Page (Powered by Jupiter)

The Swap page allows you to exchange one cryptocurrency for another. This feature is powered by Jupiter Aggregator, ensuring you get competitive rates across various Solana liquidity sources.

**Accessing the Swap Page:**
- Navigate to the "Swap" link, usually found in the application header.

**Performing a Swap:**
1.  The page will display an integrated Jupiter Terminal interface.
2.  **Select the token you want to sell** (Input) and the **token you want to buy** (Output).
3.  **Enter the amount** for either the input or output token. The other amount will be estimated automatically based on current market rates.
4.  Review the transaction details provided by Jupiter, which may include:
    - Exchange rate.
    - Price impact (the effect your trade has on the market price).
    - Minimum received amount (after accounting for slippage).
    - Route (how Jupiter is routing your trade through different liquidity pools).
5.  Adjust slippage tolerance if needed (usually accessible via Jupiter's settings icon within the terminal).
6.  Click the "Swap" button within the Jupiter terminal.
7.  Approve the transaction in your connected wallet.

**Fees for Swapping:**
- **Network Fees (Priority Fees)**: Standard Solana network fees apply to confirm your transaction. You can influence these via the app's Settings (see Section 5).
- **Jupiter Fees**: Jupiter itself may include a small fee in the transaction, which is transparently shown in their UI.
- **Platform Fees (wLiquify)**: Currently, the wLiquify dApp does **not** charge additional platform fees for swaps made through the integrated Jupiter terminal. This is subject to change.

**Network Configuration Note (Swap Page):**
The Swap page displays a "Network Configuration Note." It's important because:
- The dApp's RPC endpoint (set in Settings) determines which network's token lists and data Jupiter primarily uses.
- Your **wallet must be set to the same network** (e.g., Mainnet-beta, Devnet) for token lists and balances within Jupiter to align correctly.
- **Swaps will always be executed on the network your wallet is currently connected to.** Ensure this matches your intended network to avoid errors or unintended transactions on a different network.

### 3.2. Liquidity Pool Page

The Pool page is where you can interact with the wLiquify liquidity pool. By depositing assets, you receive wLQI tokens, representing your share in the pool.

**Accessing the Pool Page:**
- This is typically the main page of the application (e.g., when you navigate to the root URL).

**Understanding the Pool & wLQI Token:**
- **wLQI Token**: This is a liquidity provider (LP) token. When you deposit assets into the pool, you mint wLQI tokens. When you withdraw, you burn wLQI tokens to get back underlying assets.
- **Value of wLQI**: The value of a wLQI token is derived from the total value of all assets held within the liquidity pool, divided by the total supply of wLQI tokens. As the pool collects fees or the value of its underlying assets changes, the value of wLQI may also change.
- **Benefits**: By holding wLQI, you effectively own a share of the pool and may earn a portion of the fees generated by the pool's activities (e.g., from swap fees internal to the pool if applicable, or from deposit/withdrawal fees that benefit LPs).

**Pool Information Displayed:**
The Pool page shows key metrics:
- **wLQI Token Value**: The current estimated USD value of one wLQI token.
- **wLQI Total Supply**: The total amount of wLQI tokens currently in circulation.
- **Total Pool Value (TVL)**: The total USD value of all assets locked in the liquidity pool.
- **Token Table**: A list of tokens supported by the pool, showing:
    - Token Symbol & Name
    - Its current value (price)
    - Actual percentage this token represents in the pool.
    - Target percentage (the ideal weight this token should have).
    - **Deposit Fee/Bonus**: An estimated fee or bonus for depositing this specific token.
    - **Withdraw Fee/Bonus**: An estimated fee or bonus for withdrawing this specific token.
    - Your current balance of this token in your wallet.

**Dynamic Fees/Bonuses (for Deposits/Withdrawals):**
The "Deposit Fee/Bonus" and "Withdraw Fee/Bonus" columns are important. The wLiquify pool aims to maintain a target balance (weight) for each supported token.
- **Depositing an underweight token (below its target %)**: You might receive a **bonus**, meaning you get slightly more wLQI for your deposit, or pay a lower fee.
- **Depositing an overweight token (above its target %)**: You might incur a **fee**, meaning you get slightly less wLQI.
- **Withdrawing an underweight token**: You might incur a **fee**.
- **Withdrawing an overweight token**: You might receive a **bonus**.
These fees/bonuses incentivize users to help balance the pool composition. The exact percentage is calculated dynamically.

**Depositing Liquidity:**
1.  On the Pool page, find the **Token Table**.
2.  For the token you wish to deposit:
    - Enter the **amount** you want to deposit in its respective input field in the "Deposit" section/column.
    - You can often use "Max" buttons to auto-fill your entire wallet balance of that token.
3.  Click the **"Deposit"** button for that specific token.
4.  A transaction will be prepared. Review the details.
5.  Approve the transaction in your connected wallet.
6.  Upon success, you will receive wLQI tokens in your wallet.

**Fees for Depositing:**
- **Dynamic Pool Fee/Bonus**: As described above, based on the token's weight relative to its target. This is handled by the on-chain program.
- **Network Fees (Priority Fees)**: Standard Solana network fees apply.

**Viewing Your Pool Position:**
- Your **wLQI balance** is displayed in the Wallet Profile Panel and usually on the Pool page if you hold any wLQI.
- The total value of your wLQI holding can be estimated by `(Your wLQI Balance) * (Current wLQI Token Value)`.

**Withdrawing Liquidity:**
1.  On the Pool page, find the **Token Table**.
2.  For the token you wish to receive upon withdrawal:
    - Enter the **amount of wLQI tokens** you want to burn (spend) in its respective input field in the "Withdraw" section/column.
    - The interface will estimate how much of the chosen output token you will receive.
3.  Click the **"Withdraw"** button for that specific token.
4.  A transaction will be prepared. Review the details.
5.  Approve the transaction in your connected wallet.
6.  Upon success, your wLQI tokens will be burned, and you will receive the chosen output token in your wallet.

**Withdrawing Delisted Tokens:**
If a token has been delisted from the pool, there's usually a mechanism for a "full delisted withdraw" to recover your share of that specific asset by burning your wLQI.

**Fees for Withdrawing:**
- **Dynamic Pool Fee/Bonus**: As described above, based on the token's weight. This is handled by the on-chain program.
- **Network Fees (Priority Fees)**: Standard Solana network fees apply.

## 4. Application Settings

You can customize your dApp experience through the Settings modal.

**Accessing Settings:**
- Click the **gear icon (⚙️)**, usually located in the application header.

**Available Settings:**
- **RPC Endpoint**:
    - This is the Solana network node the dApp communicates with to fetch data and send transactions.
    - You can use the default, or input a custom RPC URL (e.g., for enhanced privacy or performance).
    - **Important**: Ensure this RPC endpoint corresponds to the network (Mainnet-beta, Devnet) you intend to use.
- **Transaction Priority (Fee Level)**:
    - Determines the additional priority fee paid for your transactions to encourage faster processing by the network. Options typically include:
        - **Normal, Fast, Turbo**: Predefined levels that use dynamically fetched market rates for priority fees.
        - **Custom**: May allow setting a specific max priority fee.
    - Higher priority generally means faster confirmation but higher cost.
- **Max Priority Fee Cap (SOL)**:
    - Sets a maximum limit in SOL that you're willing to pay for the priority portion of a transaction fee, overriding the dynamically fetched fee if it's too high.
- **Slippage Tolerance (BPS)**:
    - Relevant for swaps (via Jupiter). Defines the maximum percentage of price change you're willing to accept between the time you submit a swap and when it's confirmed on the blockchain. Entered in Basis Points (100 BPS = 1%).
- **Profile Settings**:
    - **Preferred Language**: Change the display language of the dApp.
    - **Preferred Currency**: Choose the currency (e.g., USD, EUR) for displaying monetary values.
    - **Number Format**: Customize decimal and thousand separators.
    - **Preferred Explorer**: Select your blockchain explorer of choice (e.g., Solscan, Solana Explorer) for viewing transaction details.

## 5. Network Information

- The dApp usually displays the **name of the network** it's currently configured to use (based on the RPC Endpoint setting) in the header or near relevant sections like the Swap page.
- **Crucial**: Always ensure your connected wallet is set to the **same network** as displayed by the dApp (e.g., both on Mainnet-beta, or both on Devnet). Mismatches can lead to:
    - Incorrect display of token balances or lists.
    - Transactions failing or being sent on an unintended network.

## 6. Security & Best Practices

- **Verify URLs**: Always ensure you are on the official wLiquify dApp website.
- **Approve Transactions Carefully**: Review all transaction details in your wallet before approving. Understand what actions you are authorizing.
- **Manage RPC Endpoints**: While custom RPCs can be useful, ensure they are trusted and reliable.
- **Token Approvals (if applicable)**: Be mindful of token approvals if the dApp were to use them (though typically Solana dApps use direct transfers or temporary authority).

*(Disclaimer: This documentation is for informational purposes. Cryptocurrency investments and DeFi interactions carry inherent risks. Always do your own research.)* 