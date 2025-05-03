# Frontend Development Plan: wLiquify Pool

This document outlines the steps to build the Next.js frontend for interacting with the deployed `w-liquify-pool` and `oracle_program`.

**Goal:** Create a Next.js app that connects to a Solana wallet, reads data from the `oracle_program` and `w-liquify-pool` programs, displays it in a table, and allows users to deposit/withdraw whitelisted tokens.

**Assumptions:**

*   Next.js project setup (`w-liquify-pool/app`) with TypeScript and Tailwind CSS.
*   Dependencies installed (`@coral-xyz/anchor`, `@solana/web3.js`, `@solana/wallet-adapter-*`, etc.).
*   `w_liquify_pool.json` IDL correctly placed (`app/src/idl/`).
*   Programs deployed and initialized on the target network (e.g., localnet).
*   `PoolConfig` account exists and has `lookup_table_address` populated.
*   `AggregatedOracleData` account exists and is populated (with 30 tokens).
*   Pool Vaults and `HistoricalTokenData` accounts exist for the 30 tokens.

---

## Development Plan

### Phase 1: Setup & Wallet Connection

1.  **Constants & Configuration:**
    *   Create `app/src/config.ts` or `app/src/utils/constants.ts`.
    *   Store: `RPC_URL`, `W_LIQUIFY_POOL_PROGRAM_ID`, `ORACLE_PROGRAM_ID`, PDA Seeds (`POOL_CONFIG_SEED`, `POOL_AUTHORITY_SEED`, `WLI_MINT_SEED`, `TOKEN_HISTORY_SEED`, `ORACLE_AGGREGATOR_SEED`).
2.  **Wallet Adapter Setup:**
    *   In `app/src/app/layout.tsx` or a new `app/src/providers/SolanaProvider.tsx`.
    *   Import from `@solana/wallet-adapter-react`, `@solana/wallet-adapter-react-ui`, `@solana/wallet-adapter-wallets`.
    *   Define network endpoint.
    *   Choose supported wallets (e.g., Phantom, Solflare).
    *   Wrap `children` with `ConnectionProvider`, `WalletProvider`, `WalletModalProvider`.
    *   Import `@solana/wallet-adapter-react-ui/styles.css` globally.
3.  **Wallet Connect Button:**
    *   Add `<WalletMultiButton />` component to the UI (`page.tsx` or `layout.tsx`).

### Phase 2: Reading On-Chain Data

4.  **Anchor Provider & Program Instance:**
    *   Create custom hook `app/src/hooks/useAnchorProgram.ts`.
    *   Use `useConnection`, `useWallet`.
    *   Create `AnchorProvider` on wallet connection.
    *   Return `w-liquify-pool` `Program` instance.
5.  **Fetch Core Pool & Oracle Data:**
    *   In main component (`PoolInfoDisplay.tsx` or `page.tsx`).
    *   Use `useAnchorProgram` hook.
    *   Use `useEffect` to trigger fetch.
    *   Derive `poolConfigPda`.
    *   Fetch `PoolConfig`: `program.account.poolConfig.fetch(poolConfigPda)`. Store in state.
    *   Get `oracleAggregatorAccount` PublicKey from fetched `PoolConfig`.
    *   Fetch `oracleAggregatorAccount` info: `program.provider.connection.getAccountInfo(...)`.
    *   Decode Oracle Data: `program.coder.accounts.decode("AggregatedOracleData", oracleAccountInfo.data)`. Store in state. Ensure frontend type definition matches Rust struct/IDL.
    *   Manage loading and error states.
6.  **Fetch Dynamic Data (Balances, Supply, Prices):**
    *   Trigger after core data is fetched.
    *   Get token list from `oracleData.data`.
    *   **Vault Balances:** For each token, derive `poolVaultPda` (ATA with `poolAuthorityPda`), fetch balance (`connection.getTokenAccountBalance`).
    *   **wLQI Supply:** Fetch (`connection.getTokenSupply(poolConfig.wliMint)`).
    *   **Prices:** For each token, get `priceFeedId` from `oracleData.data`, fetch price feed account info (`connection.getAccountInfo`), decode price (Pyth SDK or mock logic).
    *   Store dynamic data (balances, prices, supply) in state, possibly combined per token.

### Phase 3: Calculations & UI Display

7.  **Implement Calculation Logic (TypeScript):**
    *   Create `app/src/utils/calculations.ts`.
    *   Mirror Rust utility functions using `BN.js`:
        *   `calculateTokenValueUsdScaled`
        *   `calculateTotalPoolValue`
        *   `calculateWLqiValue`
        *   `calculateActualDominance`
        *   `calculateRelativeDeviationScaledBps`
        *   `calculateFeeBps` (estimate based on current state)
8.  **Build the Token Table UI (`TokenTable.tsx`):**
    *   Create new component.
    *   Input: Array of processed token data (oracle info, balances, prices, calculated values).
    *   Map data to table rows (`<tr>`).
    *   **Columns:** Token Symbol/Icon, Target Dominance %, Actual Dominance %, Pool Balance (Tokens), Pool Value (USD), Est. Deposit Fee/Premium %, Est. Withdraw Fee %, Deposit Button, Withdraw Button.
    *   Format numbers nicely.
    *   Style with Tailwind CSS.
9.  **Integrate Table:**
    *   Render `TokenTable` in `page.tsx`.
    *   Pass processed data from parent or context.

### Phase 4: Implementing Actions (Deposit/Withdraw)

10. **Deposit Functionality:**
    *   Add `onClick` to Deposit button -> show modal/input for amount.
    *   Create async `handleDeposit(tokenMint: PublicKey, amountLamports: BN)`:
        *   Requires: connected provider, program instance, `poolConfig`, `lookupTableAccount`.
        *   Get necessary account PubKeys for `deposit` instruction.
        *   Build instruction: `program.methods.deposit(amountLamports).accounts(...)`. **Do not** provide `remainingAccounts`.
        *   Create `TransactionMessage` with compute budget & deposit instruction. Compile to v0: `.compileToV0Message([lookupTableAccount])`.
        *   Create `VersionedTransaction`.
        *   Sign and send: `wallet.sendTransaction(transaction, connection)`.
        *   Await confirmation.
        *   UI feedback & refresh data.
11. **Withdraw Functionality:**
    *   Similar flow for Withdraw button.
    *   Need inputs for wLQI amount and desired token mint.
    *   Create `handleWithdraw(wLqiAmount: BN, desiredTokenMint: PublicKey)`:
        *   Assemble accounts for `withdraw`.
        *   Build instruction: `program.methods.withdraw(wLqiAmount, desiredTokenMint).accounts(...)`.
        *   Build, sign, send `VersionedTransaction` using the LUT.
        *   Feedback & refresh data.

### Phase 5: Refinements

12. **Error Handling:** Improve UI messages.
13. **Loading States:** Add spinners/indicators.
14. **Input Validation:** Validate amounts.
15. **Styling:** Refine Tailwind CSS.
16. **Periodic Refresh:** Implement `setInterval` for dynamic data updates. 