// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// Proof of a witnessed event by CENNZnet validators
struct CENNZnetEventProof {
    // The Id (nonce) of the event
    uint256 eventId;
    // The validator set Id which witnessed the event
    uint32 validatorSetId;
    // v,r,s are sparse arrays expected to align w public key in 'validators'
    // i.e. v[i], r[i], s[i] matches the i-th validator[i]
    // v part of validator signatures
    uint8[] v;
    // r part of validator signatures
    bytes32[] r;
    // s part of validator signatures
    bytes32[] s;
    // The validator addresses
    address[] validators;
}

contract MockBridge is Ownable {
    // Mock VerifyMessage for use with WCENNZ tests
    function verifyMessage(bytes calldata message, CENNZnetEventProof calldata proof) payable external {}

}
