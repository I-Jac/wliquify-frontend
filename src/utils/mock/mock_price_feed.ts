import { BN } from '@coral-xyz/anchor';
import { Buffer } from 'buffer';
import { deserialize, Schema } from 'borsh';

// --- MockPriceFeed Deserialization --- 

// Define as a class instead of an interface for Borsh
export class MockPriceFeedAccountData {
    price: BN;
    expo: number;
    symbol: string;
    status: number;
    lastUpdatedTimestamp: BN;
    bump: number;

    constructor(fields: { price: BN, expo: number, symbol: string, status: number, lastUpdatedTimestamp: BN, bump: number }) {
        this.price = fields.price;
        this.expo = fields.expo;
        this.symbol = fields.symbol;
        this.status = fields.status;
        this.lastUpdatedTimestamp = fields.lastUpdatedTimestamp;
        this.bump = fields.bump;
    }
}

// Borsh schema definition matching the Rust struct field order
// Use the class name as the key
export const MockPriceFeedSchema: Schema = new Map([
    [MockPriceFeedAccountData, { // Use class name
        kind: 'struct', 
        fields: [ 
            ['price', 'i64'],
            ['expo', 'i32'], 
            ['symbol', 'string'], 
            ['status', 'u8'], 
            ['lastUpdatedTimestamp', 'i64'],
            ['bump', 'u8'],
        ] 
    }]
]);

// Helper function to deserialize a MockPriceFeed buffer
// Assumes the buffer STARTS AFTER the 8-byte discriminator
export function deserializeMockPriceFeed(buffer: Buffer): MockPriceFeedAccountData {
    if (!Buffer.isBuffer(buffer)) {
        throw new Error("Input must be a Buffer");
    }
    if (buffer.length < 8) {
        throw new Error("Buffer too short to contain discriminator");
    }
    const dataBuffer = buffer.subarray(8);
    
    try {
        const deserialized = deserialize(MockPriceFeedSchema, MockPriceFeedAccountData, dataBuffer);
        
        // Borsh JS needs explicit BN conversion for i64/u64
        // Convert fields after deserialization
        const priceBN = new BN(deserialized.price.toString());
        const timestampBN = new BN(deserialized.lastUpdatedTimestamp.toString());

        // Return a new instance with BN types correctly constructed
        return new MockPriceFeedAccountData({
            ...deserialized,
            price: priceBN,
            lastUpdatedTimestamp: timestampBN,
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Borsh deserialization failed:", errorMessage);
        throw new Error(`Failed to deserialize MockPriceFeed buffer: ${errorMessage}`);
    }
} 