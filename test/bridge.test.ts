import { expect, use } from 'chai';
import { Contract, utils } from 'ethers';
import { deployContract, MockProvider, solidity } from 'ethereum-waffle';
import { suiteSetup } from 'mocha';
import CENNZnetBridge from '../artifacts/contracts/CENNZnetBridge.sol/CENNZnetBridge.json';

use(solidity);

// Receives [publicKey] as 0x-prefixed hex string
// Returns the Eth address as 0x-prefixed hex string
function publicKeyToEthAddress(publicKey: utils.BytesLike) {
  let decompressedPk = utils.computePublicKey(publicKey);
  console.log(decompressedPk);
  // https://github.com/ethers-io/ethers.js/issues/670#issuecomment-559596757
  let h = utils.keccak256('0x' + decompressedPk.slice(4));
  // gives: 0x58dad74c38e9c4738bf3471f6aac6124f862faf5
  // wanted: 0xA512963122bC366b0F2c98Baf243E74b9A3f51c0
  return '0x' + h.slice(26)
}

describe('CENNZnetBridge', () => {
  const [wallet, walletTo] = new MockProvider().getWallets();
  let bridge: Contract;

  beforeEach(async () => {
    bridge = await deployContract(wallet, CENNZnetBridge, []);
  });

  it('verifies a CENNZnet event', async () => {
    // The message signed on CENNZne
    let message = '0x000000000000000000000000000000000000000000000000000000000000007b00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001';
    let eventId = 1;
    let validatorSetId = 0;
    let digest = utils.keccak256(message);
    console.log('digest', digest);

    // Public Key from CENNZnet: 0x0204dad6fc9c291c68498de501c6d6d17bfe28aee69cfbf71b2cc849caafcb0159
    let validatorPublicKey = '0x0204dad6fc9c291c68498de501c6d6d17bfe28aee69cfbf71b2cc849caafcb0159';
    let validatorAddress = utils.computeAddress(validatorPublicKey);
    console.log('validator address', validatorAddress);

    // Setup the bridge contract's initial validator set
    await bridge.forceSetValidators(
        // 'Alice' default CENNZnet ECDSA public key converted to Eth address
        [validatorAddress, validatorAddress, validatorAddress, validatorAddress, validatorAddress],
        validatorSetId,
    );
    expect(await bridge.validators(validatorSetId, 0), validatorAddress);

    // A CENNZnet validator signature    
    let signature = utils.hexlify('0x391d9ea095cf8d41b64f30b51447e44766bc2b8042ba7721597279fac5c9ccf377a5c1ba02a770b50c0a97636579811bf8a1da8d9f126985a1290ddf559283a701');
    let sig = utils.splitSignature(signature);

    let verificationFee = await bridge.verificationFee();
    await expect(
        bridge.verifyMessage(
            message,
            {
                eventId,
                validatorSetId,
                v: [sig.v,sig.v,sig.v,sig.v,sig.v],
                r: [sig.r,sig.r,sig.r,sig.r,sig.r],
                s: [sig.s,sig.s,sig.s,sig.s,sig.s],
            },
            {
                // Prevents error: 'cannot estimate gas; transaction may fail or may require manual gas limit'
                gasLimit: 100000,
                // Must pay the verification fee
                value: verificationFee,
            }
        )
    );
    expect((await bridge.eventIds(eventId)) == true);
  });

  it('verifyMessage w bad signature reverts', async () => {
        let eventId = 0;
        let validatorSetId = 1;
        let validatorPublicKey = '0x0204dad6fc9c291c68498de501c6d6d17bfe28aee69cfbf71b2cc849caafcb0159';
        let validatorAddress = utils.computeAddress(validatorPublicKey);
  
        // Setup the bridge contract's initial validator set
        await bridge.forceSetValidators(
            // 'Alice' default CENNZnet ECDSA public key converted to Eth address
            [validatorAddress],
            validatorSetId,
        );
    
        // A CENNZnet validator signature    
        let signature = utils.hexlify('0x391d9ea095cf8d41b64f30b51447e44766bc2b8042ba7721597279fac5c9ccf377a5c1ba02a770b50c0a97636579811bf8a1da8d9f126985a1290ddf559283a701');
        let sig = utils.splitSignature(signature);

        let verificationFee = await bridge.verificationFee();
        await expect(
            bridge.verifyMessage(
                utils.hexlify("0x1234"),
                {
                    eventId,
                    validatorSetId,
                    v: [sig.v],
                    r: [sig.r],
                    s: [sig.s],
                },
                {
                    // Prevents error: 'cannot estimate gas; transaction may fail or may require manual gas limit'
                    gasLimit: 100000,
                    // Must pay the verification fee
                    value: verificationFee,
                }
            )
        ).to.be.revertedWith('signature invalid');
  })

  it('verifies message no consensus', async () => {
    // The message signed on CENNZnet
    let message = '0x000000000000000000000000000000000000000000000000000000000000007b00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001';
    let eventId = 1;
    let validatorSetId = 0;

    // Public Key from CENNZnet: 0x0204dad6fc9c291c68498de501c6d6d17bfe28aee69cfbf71b2cc849caafcb0159
    let validatorPublicKey = '0x0204dad6fc9c291c68498de501c6d6d17bfe28aee69cfbf71b2cc849caafcb0159';
    let validatorAddress = utils.computeAddress(validatorPublicKey);

    // Setup the bridge contract's initial validator set
    await bridge.forceSetValidators(
        // 'Alice' default CENNZnet ECDSA public key converted to Eth address
        [validatorAddress, validatorAddress, validatorAddress, validatorAddress, validatorAddress],
        validatorSetId,
    );

    // A CENNZnet validator signature    
    let signature = utils.hexlify('0x391d9ea095cf8d41b64f30b51447e44766bc2b8042ba7721597279fac5c9ccf377a5c1ba02a770b50c0a97636579811bf8a1da8d9f126985a1290ddf559283a701');
    let sig = utils.splitSignature(signature);

    let omitted = utils.formatBytes32String('');

    let verificationFee = await bridge.verificationFee();
    await expect(
      bridge.verifyMessage(
            message,
            {
                eventId,
                validatorSetId,
                // skip signatures from validators 1,2,5
                v: [sig.v, 0, 0, sig.v, 0],
                r: [sig.r, omitted, omitted, sig.r, omitted],
                s: [sig.s, omitted, omitted, sig.s, omitted],
            },
            {
                // Prevents error: 'cannot estimate gas; transaction may fail or may require manual gas limit'
                gasLimit: 100000,
                // Must pay the verification fee
                value: verificationFee,
            }
        )
    ).to.be.revertedWith('not enough signatures');
  });


  it('verifyMessage prevent replay', async () => {
    // The message signed on CENNZnet
    let message = '0x000000000000000000000000000000000000000000000000000000000000007b00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001';
    let eventId = 1;
    let validatorSetId = 0;

    // Public Key from CENNZnet: 0x0204dad6fc9c291c68498de501c6d6d17bfe28aee69cfbf71b2cc849caafcb0159
    let validatorPublicKey = '0x0204dad6fc9c291c68498de501c6d6d17bfe28aee69cfbf71b2cc849caafcb0159';
    let validatorAddress = utils.computeAddress(validatorPublicKey);

    // Setup the bridge contract's initial validator set
    await bridge.forceSetValidators(
        // 'Alice' default CENNZnet ECDSA public key converted to Eth address
        [validatorAddress],
        validatorSetId,
    );

    // A CENNZnet validator signature    
    let signature = utils.hexlify('0x391d9ea095cf8d41b64f30b51447e44766bc2b8042ba7721597279fac5c9ccf377a5c1ba02a770b50c0a97636579811bf8a1da8d9f126985a1290ddf559283a701');
    let sig = utils.splitSignature(signature);

    // We've sent this event in a previous tx
    let verificationFee = await bridge.verificationFee();
    await expect(
        bridge.verifyMessage(
            message,
            {
                eventId,
                validatorSetId,
                v: [sig.v],
                r: [sig.r],
                s: [sig.s],
            },
            {
                gasLimit: 100000,
                value: verificationFee,
            }
        )
    ).to.be.revertedWith("eventId replayed");
  });

  it('verifyMessage no fee', async () => {
    await expect(
        bridge.verifyMessage(
            "0x1234",
            { eventId: 0, validatorSetId: 1, v: [], r: [], s: [] },
            { gasLimit: 100000 }
        )
    ).to.be.revertedWith("must supply verification fee");
  });

  it('verifyMessage from historic validator set', async () => {
      // TODO
  });

})
