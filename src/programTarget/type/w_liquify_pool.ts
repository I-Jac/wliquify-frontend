/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/w_liquify_pool.json`.
 */
export type WLiquifyPool = {
  "address": "Xr85wU8YxexXhkomBRu729Yti3b23PwFMyFUEoP6NdZ",
  "metadata": {
    "name": "wLiquifyPool",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "addSupportedToken",
      "discriminator": [
        109,
        142,
        133,
        205,
        240,
        28,
        197,
        245
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "poolConfig"
          ]
        },
        {
          "name": "poolConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "poolAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "poolVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "poolAuthority"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenHistoryAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  104,
                  105,
                  115,
                  116,
                  111,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ]
          }
        },
        {
          "name": "oracleAggregatorAccount",
          "relations": [
            "poolConfig"
          ]
        },
        {
          "name": "priceFeedAccountToValidate"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "cleanupHistoricalData",
      "discriminator": [
        235,
        212,
        210,
        216,
        57,
        79,
        109,
        244
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "poolConfig"
          ]
        },
        {
          "name": "poolConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "poolAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "feeRecipient",
          "writable": true,
          "relations": [
            "poolConfig"
          ]
        },
        {
          "name": "oracleAggregatorAccount",
          "relations": [
            "poolConfig"
          ]
        },
        {
          "name": "historicalTokenData",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  104,
                  105,
                  115,
                  116,
                  111,
                  114,
                  121
                ]
              },
              {
                "kind": "arg",
                "path": "tokenMintArg"
              }
            ]
          }
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "poolVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "poolAuthority"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "tokenMintArg",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "userSourceAta",
          "writable": true
        },
        {
          "name": "feeRecipient",
          "relations": [
            "poolConfig"
          ]
        },
        {
          "name": "poolConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "poolAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "wliMint",
          "writable": true,
          "relations": [
            "poolConfig"
          ]
        },
        {
          "name": "userWliAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "user"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "wliMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "ownerFeeAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "feeRecipient"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "wliMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "depositMint"
        },
        {
          "name": "targetTokenVaultAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "poolAuthority"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "depositMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "oracleAggregatorAccount",
          "relations": [
            "poolConfig"
          ]
        },
        {
          "name": "depositPriceFeed"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "minimumLpTokensOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "poolConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "poolAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "wliMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  108,
                  105,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "tempWliqAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "poolAuthority"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "wliMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": [
        {
          "name": "admin",
          "type": "pubkey"
        },
        {
          "name": "feeRecipient",
          "type": "pubkey"
        },
        {
          "name": "oracleProgramId",
          "type": "pubkey"
        },
        {
          "name": "trustedPriceFeedOwnerProgramId",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setLookupTable",
      "discriminator": [
        235,
        249,
        109,
        59,
        171,
        208,
        117,
        65
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "poolConfig"
          ]
        },
        {
          "name": "poolConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "lookupTableAccount"
        }
      ],
      "args": []
    },
    {
      "name": "setLpTokenMetadata",
      "discriminator": [
        71,
        73,
        56,
        155,
        202,
        142,
        100,
        150
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "poolConfig"
          ]
        },
        {
          "name": "poolConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "poolAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "wliMint",
          "writable": true,
          "relations": [
            "poolConfig"
          ]
        },
        {
          "name": "metadataAccount",
          "docs": [
            "PDA derived with seeds: ['metadata', token_metadata_program.key().as_ref(), mint.key().as_ref()]"
          ],
          "writable": true
        },
        {
          "name": "tokenMetadataProgram",
          "address": "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "symbol",
          "type": "string"
        },
        {
          "name": "uri",
          "type": "string"
        }
      ]
    },
    {
      "name": "updateTotalValue",
      "discriminator": [
        238,
        51,
        15,
        154,
        26,
        150,
        144,
        10
      ],
      "accounts": [
        {
          "name": "poolConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "addressLookupTable",
          "docs": [
            "Further validation (owner, initialization) could be added if desired, similar to set_lookup_table."
          ]
        }
      ],
      "args": []
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "userWliAta",
          "writable": true
        },
        {
          "name": "userDestinationAta",
          "docs": [
            "The ATA owned by the user where they will receive the withdrawn tokens."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "user"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "withdrawMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "feeRecipient",
          "relations": [
            "poolConfig"
          ]
        },
        {
          "name": "poolConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "poolAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "wliMint",
          "writable": true,
          "relations": [
            "poolConfig"
          ]
        },
        {
          "name": "tempWliqAta",
          "writable": true,
          "relations": [
            "poolConfig"
          ]
        },
        {
          "name": "ownerFeeAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "feeRecipient"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "wliMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "withdrawMint"
        },
        {
          "name": "sourceTokenVaultAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "poolAuthority"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "withdrawMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "oracleAggregatorAccount",
          "relations": [
            "poolConfig"
          ]
        },
        {
          "name": "withdrawPriceFeed"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "minimumUnderlyingTokensOut",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "historicalTokenData",
      "discriminator": [
        83,
        161,
        198,
        218,
        51,
        207,
        25,
        223
      ]
    },
    {
      "name": "poolConfig",
      "discriminator": [
        26,
        108,
        14,
        123,
        116,
        230,
        129,
        43
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "calculationOverflow",
      "msg": "Generic calculation error or overflow."
    },
    {
      "code": 6001,
      "name": "feeCalculationError",
      "msg": "Fee calculation resulted in an error or overflow."
    },
    {
      "code": 6002,
      "name": "invalidOwner",
      "msg": "Invalid owner for the provided token account."
    },
    {
      "code": 6003,
      "name": "unauthorizedAdmin",
      "msg": "Signer is not the authorized pool admin."
    },
    {
      "code": 6004,
      "name": "invalidWliMint",
      "msg": "Invalid WLI mint provided."
    },
    {
      "code": 6005,
      "name": "invalidMint",
      "msg": "Invalid mint account provided or mismatch."
    },
    {
      "code": 6006,
      "name": "invalidFeeRecipient",
      "msg": "Invalid fee recipient address."
    },
    {
      "code": 6007,
      "name": "oracleAccountMismatch",
      "msg": "The provided oracle aggregator account does not match the one in config."
    },
    {
      "code": 6008,
      "name": "oracleDeserializationFailed",
      "msg": "Failed to deserialize oracle data."
    },
    {
      "code": 6009,
      "name": "oracleDataTooShortForDiscriminator",
      "msg": "Oracle data is too short to contain the discriminator."
    },
    {
      "code": 6010,
      "name": "oracleDataTooShortForAuthority",
      "msg": "Oracle data is too short to read the authority."
    },
    {
      "code": 6011,
      "name": "oracleDataTooShortForTotalTokens",
      "msg": "Oracle data is too short to read the total_tokens field."
    },
    {
      "code": 6012,
      "name": "oracleDataTooShortForVectorLength",
      "msg": "Oracle data is too short to read the token vector length."
    },
    {
      "code": 6013,
      "name": "oracleTokenInfoBufferOverflow",
      "msg": "Buffer overflow when deserializing TokenInfo from oracle data."
    },
    {
      "code": 6014,
      "name": "oracleTokenInfoDeserializationFailed",
      "msg": "Failed to deserialize a TokenInfo entry from oracle data."
    },
    {
      "code": 6015,
      "name": "tokenNotFoundInOracle",
      "msg": "Required token info not found in oracle data."
    },
    {
      "code": 6016,
      "name": "failedToParsePublicKey",
      "msg": "Failed to parse public key from string."
    },
    {
      "code": 6017,
      "name": "incorrectAccountCount",
      "msg": "Incorrect number of remaining accounts provided."
    },
    {
      "code": 6018,
      "name": "zeroAmount",
      "msg": "Deposit or withdraw amount cannot be zero."
    },
    {
      "code": 6019,
      "name": "depositNotAllowed",
      "msg": "Deposits are not allowed for this token (not whitelisted or target is zero)."
    },
    {
      "code": 6020,
      "name": "withdrawalTargetZero",
      "msg": "Withdrawals target amount is zero."
    },
    {
      "code": 6021,
      "name": "invalidPrice",
      "msg": "Price is invalid (e.g., negative)."
    },
    {
      "code": 6022,
      "name": "insufficientWliBalance",
      "msg": "Withdrawal amount exceeds user's WLI balance."
    },
    {
      "code": 6023,
      "name": "insufficientVaultBalance",
      "msg": "Calculated withdrawal amount exceeds vault balance."
    },
    {
      "code": 6024,
      "name": "insufficientLiquidity",
      "msg": "Insufficient liquidity in the target token vault."
    },
    {
      "code": 6025,
      "name": "maxPoolTokensReached",
      "msg": "Pool has reached its maximum token capacity."
    },
    {
      "code": 6026,
      "name": "tokenAlreadyExists",
      "msg": "Token already exists in the pool configuration."
    },
    {
      "code": 6027,
      "name": "tokenNotFoundInPool",
      "msg": "Token not found in pool configuration for removal/update."
    },
    {
      "code": 6028,
      "name": "zeroWliAmount",
      "msg": "Operation resulted in zero WLI amount."
    },
    {
      "code": 6029,
      "name": "zeroTokenAmount",
      "msg": "Operation resulted in zero token amount."
    },
    {
      "code": 6030,
      "name": "delistedWithdrawalAmountExceedsLimit",
      "msg": "Delisted token withdrawal amount exceeds limit."
    },
    {
      "code": 6031,
      "name": "invalidFeedId",
      "msg": "The provided price feed ID is invalid or zero."
    },
    {
      "code": 6032,
      "name": "historicalDataNotFound",
      "msg": "Historical token data account not found for the specified mint."
    },
    {
      "code": 6033,
      "name": "arithmeticError",
      "msg": "Arithmetic overflow/underflow during calculation."
    },
    {
      "code": 6034,
      "name": "incorrectPriceFeedAccount",
      "msg": "Provided mock price feed account PDA does not match expected."
    },
    {
      "code": 6035,
      "name": "priceFeedDeserializationFailed",
      "msg": "Failed to deserialize mock price feed account data."
    },
    {
      "code": 6036,
      "name": "priceFeedTooShortForSymbolLength",
      "msg": "Price feed data too short to read symbol length."
    },
    {
      "code": 6037,
      "name": "priceFeedTooShortForFields",
      "msg": "Price feed data too short for all fields after accounting for symbol length."
    },
    {
      "code": 6038,
      "name": "priceFeedInvalidSymbolString",
      "msg": "Failed to convert price feed symbol bytes to string."
    },
    {
      "code": 6039,
      "name": "priceFeedNotTrading",
      "msg": "Mock price feed status is not Trading."
    },
    {
      "code": 6040,
      "name": "priceFeedStale",
      "msg": "Mock price feed price data is stale."
    },
    {
      "code": 6041,
      "name": "invalidLutOwner",
      "msg": "Provided address lookup table account has invalid owner."
    },
    {
      "code": 6042,
      "name": "lutNotInitialized",
      "msg": "Provided address lookup table account is not initialized."
    },
    {
      "code": 6043,
      "name": "lutAuthorityNotSet",
      "msg": "Address lookup table account authority is not set."
    },
    {
      "code": 6044,
      "name": "lutAlreadySet",
      "msg": "Address lookup table account is already set in pool configuration."
    },
    {
      "code": 6045,
      "name": "lutNotProvided",
      "msg": "Address Lookup Table account not found in instruction accounts when it should have been."
    },
    {
      "code": 6046,
      "name": "lutNotSetInPoolConfig",
      "msg": "Address Lookup Table account is not set in PoolConfig. Must be set by admin first using set_lookup_table."
    },
    {
      "code": 6047,
      "name": "lutCannotBeDefaultPubkey",
      "msg": "The Address Lookup Table cannot be the default pubkey."
    },
    {
      "code": 6048,
      "name": "mintNotInitialized",
      "msg": "The provided token mint account is not initialized."
    },
    {
      "code": 6049,
      "name": "failedToDeserialize",
      "msg": "Failed to deserialize account data."
    },
    {
      "code": 6050,
      "name": "tokenStillWhitelisted",
      "msg": "Token cannot be cleaned up as it is still whitelisted (or has non-zero dominance)."
    },
    {
      "code": 6051,
      "name": "vaultNotEmpty",
      "msg": "Token cannot be cleaned up as its pool vault is not empty."
    },
    {
      "code": 6052,
      "name": "historicalDataSizeMismatch",
      "msg": "Historical data size mismatch."
    },
    {
      "code": 6053,
      "name": "zeroOutputTokens",
      "msg": "Calculated withdrawal amount is zero, nothing to transfer."
    },
    {
      "code": 6054,
      "name": "invalidInput",
      "msg": "Invalid input provided for the instruction."
    },
    {
      "code": 6055,
      "name": "slippageExceeded",
      "msg": "Slippage tolerance exceeded."
    },
    {
      "code": 6056,
      "name": "whitelistFull",
      "msg": "Whitelist is full."
    },
    {
      "code": 6057,
      "name": "historicalDataTooShortForDiscriminator",
      "msg": "Historical data account is too short to contain discriminator."
    },
    {
      "code": 6058,
      "name": "lutMissingRequiredAccounts",
      "msg": "The provided LUT is missing required accounts for currently supported tokens."
    },
    {
      "code": 6059,
      "name": "insufficientOracleTokens",
      "msg": "Oracle reports fewer tokens than the minimum required threshold."
    },
    {
      "code": 6060,
      "name": "invalidPriceFeedOwner",
      "msg": "Price feed account has an unrecognized or invalid owner."
    },
    {
      "code": 6061,
      "name": "zeroTvlCalculatedWithSupportedTokens",
      "msg": "Calculated TVL is zero but there are supported tokens in the pool; indicates stale prices."
    }
  ],
  "types": [
    {
      "name": "historicalTokenData",
      "docs": [
        "Historical Token Data",
        "Stores persistent info about a token that has been deposited.",
        "Seeds: [b\"token_history\", token_mint.key().as_ref()]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "feedId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "decimals",
            "type": "u8"
          },
          {
            "name": "symbol",
            "type": {
              "array": [
                "u8",
                10
              ]
            }
          }
        ]
      }
    },
    {
      "name": "poolConfig",
      "docs": [
        "Pool Configuration",
        "Stores global settings for the pool.",
        "Seeds: [POOL_CONFIG_SEED]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "feeRecipient",
            "type": "pubkey"
          },
          {
            "name": "wliMint",
            "type": "pubkey"
          },
          {
            "name": "poolAuthorityBump",
            "type": "u8"
          },
          {
            "name": "oracleProgramId",
            "type": "pubkey"
          },
          {
            "name": "oracleAggregatorAccount",
            "type": "pubkey"
          },
          {
            "name": "trustedPriceFeedOwnerProgramId",
            "type": "pubkey"
          },
          {
            "name": "addressLookupTable",
            "type": "pubkey"
          },
          {
            "name": "currentTotalPoolValueScaled",
            "type": "u128"
          },
          {
            "name": "tempWliqAta",
            "type": "pubkey"
          },
          {
            "name": "supportedTokens",
            "type": {
              "vec": {
                "defined": {
                  "name": "supportedToken"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "supportedToken",
      "docs": [
        "Holds the necessary PDAs and mint address for a supported token."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "tokenHistory",
            "type": "pubkey"
          },
          {
            "name": "priceFeed",
            "type": "pubkey"
          }
        ]
      }
    }
  ]
};
