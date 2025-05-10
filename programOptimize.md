# Withdrawal Money Flow Optimization

## Current Implementation

### Flow
1. User inputs wLQI amount to withdraw
2. Program calculates:
   - Fee amount based on dominance deviation
   - Burn amount (input amount - fee amount)
3. Program executes in sequence:
   - Burns calculated burn amount from user's ATA
   - Transfers calculated fee amount to fee vault

### Example from Logs
```
Input wLQI amount: 24.763832662
Calculated amounts:
- Fee: 0.024763824 wLQI
- Burn: 24.739060722 wLQI
```

### Issues
1. **Rounding Errors**: Due to separate calculations and operations, small rounding differences can occur
2. **Dust Remaining**: User may end up with tiny amounts of wLQI in their account
3. **Atomic Operations**: The burn and transfer are not atomic, which could lead to inconsistencies in edge cases
4. **Complex State Management**: Need to track multiple calculated amounts and ensure they sum correctly

## Proposed Optimization

### New Flow
1. User inputs wLQI amount to withdraw (unchanged user experience)
2. Program:
   - Transfers entire input amount to a temporary program-owned account in one operation
   - Calculates fee based on dominance deviation (same dynamic fee calculation)
   - Transfers fee amount to fee vault
   - Burns remaining amount

### Benefits
1. **Clean User Balance**: User's entire input amount is removed in one operation
2. **No Dust**: No possibility of dust remaining in user's account
3. **Atomic Operations**: Each step is atomic and verifiable
4. **Simpler State Management**: Only need to track the original input amount and calculate fee once
5. **Better Error Handling**: If any step fails, the entire transaction reverts
6. **Unchanged User Experience**: 
   - Same input process
   - Same fee calculation based on dominance deviation
   - Same final amounts received by user and fee vault
   - Only internal handling is optimized

### Implementation Considerations
1. **Temporary Account**:
   - Could use a PDA derived from the program
   - Needs to be an Associated Token Account for wLQI
   - Should be created during program initialization

2. **Error Handling**:
   - Add checks to ensure temporary account has sufficient balance
   - Verify all transfers complete successfully
   - Include proper error messages for each failure case

3. **Testing**:
   - Test with various input amounts
   - Verify no dust remains in user account
   - Ensure fee calculations remain accurate and match current behavior
   - Test edge cases (very small amounts, maximum amounts)
   - Verify user experience remains identical

## Code Changes Required

1. **Account Structure**:
   ```rust
   // Add to program state
   pub struct PoolState {
       // ... existing fields ...
       pub temp_wlqi_account: Pubkey,  // PDA for temporary wLQI storage
   }
   ```

2. **Withdrawal Logic**:
   ```rust
   // Pseudo-code for new flow
   pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
       // 1. Transfer entire amount to temp account
       transfer_from_user_to_temp(amount)?;
       
       // 2. Calculate fee (same calculation as before)
       let fee_amount = calculate_fee(amount)?;
       
       // 3. Transfer fee to vault
       transfer_from_temp_to_fee_vault(fee_amount)?;
       
       // 4. Burn remaining
       let burn_amount = amount - fee_amount;
       burn_from_temp(burn_amount)?;
       
       Ok(())
   }
   ```

## Migration Plan

1. **Phase 1**: Implement new withdrawal flow in development
2. **Phase 2**: Test thoroughly with various scenarios
   - Verify fee calculations match current behavior
   - Ensure user experience remains unchanged
   - Test with various dominance scenarios
3. **Phase 3**: Deploy to devnet for additional testing
4. **Phase 4**: Deploy to mainnet with proper upgrade process

## Security Considerations

1. **Access Control**:
   - Ensure only program can access temporary account
   - Verify all signers in each operation
   - Add proper checks for account ownership

2. **Amount Validation**:
   - Verify input amount is valid
   - Check for overflow in calculations
   - Ensure fee calculations remain accurate and match current behavior

3. **Error Recovery**:
   - Add ability to recover funds if operations fail
   - Implement proper error handling
   - Add logging for debugging

## Conclusion

The proposed optimization will provide a more robust and cleaner withdrawal process while maintaining the exact same user experience and fee calculations. By handling the entire amount in a single initial transfer and then managing the fee and burn operations from a program-controlled account, we eliminate the possibility of dust amounts and ensure atomic operations. This change improves the internal handling of withdrawals without affecting how users interact with the system or how fees are calculated.

---

# Adding Slippage Protection

This section details the implementation of slippage protection for `deposit` and `withdraw` instructions within the Solana program. This is a crucial feature to protect users from unfavorable price movements that might occur between transaction submission and on-chain confirmation.

## Objective

To enhance the `deposit` and `withdraw` instructions to allow users to specify their maximum tolerable slippage, preventing transactions from executing if the price moves against them beyond this limit.

## Mechanism

1.  **Client-Side Calculation**: The frontend calculates the minimum acceptable amount of tokens the user should receive (for deposits, this is LP tokens; for withdrawals, this is the underlying asset) based on their input and selected slippage tolerance.
2.  **Parameter Passing**: This calculated `minimum_tokens_out` value is passed as an argument to the corresponding Solana program instruction.
3.  **On-Chain Enforcement**: The Solana program, before finalizing the token exchange, compares the actual calculated output amount against the `minimum_tokens_out` parameter provided by the user. If the actual output is less than the user's specified minimum, the transaction is reverted.

## Program Changes (Conceptual Rust/Anchor)

The following changes would typically be made to the Solana program (e.g., in `lib.rs` and relevant instruction modules):

### 1. New Error Code for Slippage

A dedicated error code should be added to the program's custom errors (usually within an `#[error_code]` enum in `lib.rs`).

```rust
// In lib.rs
#[error_code]
pub enum ErrorCode {
    // ... your existing errors ...
    #[msg("Slippage tolerance exceeded.")]
    SlippageExceeded,
    // ...
}
```

### 2. `deposit` Instruction Modification

*   **Instruction Arguments**:
    The `deposit` instruction handler and its argument struct (if used) will need a new parameter.
    Currently (from IDL): `args: [{ "name": "amount", "type": "u64" }]`
    Add: `minimum_lp_tokens_out: u64`

    ```rust
    // Conceptual change in lib.rs or instruction handler
    pub fn deposit(
        ctx: Context<DepositAccounts>, // Your accounts struct for deposit
        amount_to_deposit: u64,        // Amount of underlying token to deposit
        minimum_lp_tokens_out: u64     // New: Minimum wLQI/LP tokens user expects
    ) -> Result<()> {
        // ... existing deposit logic to calculate actual LP tokens to mint ...
        let actual_lp_tokens_to_mint = calculate_lp_tokens_for_deposit(amount_to_deposit, &ctx.accounts.pool_config /*, other relevant accounts/data */)?;

        // --- SLIPPAGE CHECK ---
        if actual_lp_tokens_to_mint < minimum_lp_tokens_out {
            return err!(ErrorCode::SlippageExceeded);
        }
        // --- END SLIPPAGE CHECK ---

        // ... proceed with minting actual_lp_tokens_to_mint and other operations ...
        Ok(())
    }
    ```

### 3. `withdraw` Instruction Modification

*   **Instruction Arguments**:
    The `withdraw` instruction handler and its argument struct will also require a new parameter.
    Currently (from IDL): `args: [{ "name": "amount", "type": "u64" }, { "name": "withdraw_full_delisted_balance", "type": "bool" }]`
    Add: `minimum_underlying_tokens_out: u64`

    ```rust
    // Conceptual change in lib.rs or instruction handler
    pub fn withdraw(
        ctx: Context<WithdrawAccounts>,             // Your accounts struct for withdraw
        wLqi_amount_to_burn: u64,                   // Amount of wLQI/LP tokens to burn
        withdraw_full_delisted_balance: bool,       // Existing argument
        minimum_underlying_tokens_out: u64          // New: Minimum underlying tokens user expects
    ) -> Result<()> {
        // ... existing withdrawal logic to calculate actual underlying tokens to return ...
        let actual_underlying_tokens_to_return = calculate_underlying_for_withdrawal(wLqi_amount_to_burn, &ctx.accounts.pool_config /*, other relevant accounts/data */)?;

        // --- SLIPPAGE CHECK ---
        // This check might only apply for standard partial withdrawals.
        // The `withdraw_full_delisted_balance` case might have different semantics
        // and could potentially bypass this specific slippage check if it's intended to always clear the full balance regardless of minor price shifts.
        if !withdraw_full_delisted_balance && actual_underlying_tokens_to_return < minimum_underlying_tokens_out {
            return err!(ErrorCode::SlippageExceeded);
        }
        // --- END SLIPPAGE CHECK ---

        // ... proceed with transferring actual_underlying_tokens_to_return and burning wLQI ...
        Ok(())
    }
    ```

### 4. IDL Update and Regeneration

After modifying the Rust program:
*   The program must be rebuilt (e.g., `anchor build`).
*   The IDL JSON file (`w_liquify_pool.json`) must be regenerated and updated in the frontend project. This ensures the frontend's Anchor client is aware of the new instruction parameters.

## Frontend Responsibilities

The client-side application (Next.js frontend) will need to:

1.  **Calculate Slippage Parameters**:
    *   When a user initiates a deposit or withdrawal, and after they input their desired amount:
        *   Fetch the latest relevant on-chain data (pool reserves, token prices, total LP supply).
        *   Calculate the `expected_output_amount` (LP tokens for deposit, underlying tokens for withdrawal) based on the current state.
        *   Using the user's selected `slippageBps` (from settings), calculate the `minimum_tokens_out` parameter:
            `minimum_tokens_out = expected_output_amount * (1 - (slippageBps / 10000))`
            (Ensure precise integer arithmetic, e.g., using `BN.js` or `BigInt`).
2.  **Pass Parameters to Program**:
    *   Include the calculated `minimum_lp_tokens_out` or `minimum_underlying_tokens_out` (as a `u64` compatible type like `BN`) when constructing and sending the `deposit` or `withdraw` transaction.
3.  **Handle New Error**:
    *   Update the frontend's transaction error handling logic to recognize and appropriately display messages for the new `SlippageExceeded` error returned by the program.
4.  **UI Considerations**:
    *   Consider displaying both the "Estimated amount you will receive" and the "Minimum acceptable amount (after slippage)" to the user in the transaction confirmation UI for transparency.

By implementing these changes, the wLiquify pool will offer robust, on-chain slippage protection, significantly improving user safety and trust. 