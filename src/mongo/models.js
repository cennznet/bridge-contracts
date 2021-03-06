const mongoose = require('mongoose');
const { Schema } = mongoose;


const BRIDGE_CLAIM = 'claims';

const EVENT_PROCESSED = 'events';

const WITHDRAW_PROOF = 'withdraw_proof';

const EVENT_PROOF = 'event_proof';

const CLAIM_EVENTS = 'claim_events'

const ClaimEventsSchema = new Schema({
    _id: String, // tx hash (Ethereum)
    tokenAddress: String,
    amount: String,
    beneficiary: String,
    claimId: String,
    blockNumber: String // block number on cennznet when this claim was sent
}, { collection: CLAIM_EVENTS });


const BridgeClaimSchema = new Schema({
    _id: String,
    txHash: String, // txHash from ethereum bridge contract - deposit
    status: String,
    claimId: String,
    cennznetAddress: String,
}, { collection: BRIDGE_CLAIM });

const EventProcessedSchema = new Schema({
    _id: String,
    eventId: String, // txHash from ethereum bridge contract - deposit
    blockHash: String,
}, { collection: EVENT_PROCESSED });

const WithdrawProofSchema = new Schema({
    _id: String, // cennznetAddress
    withdrawals: [
        {
            proofId: String,
            amount: String,
            assetId: String,
            beneficiary: String,
            txHash: String,
            hasClaimed: Boolean,
            expiresAt: Number
        }
    ]
}, { collection: WITHDRAW_PROOF });

const proofsSchema = new Schema( {
    _id: String, // eventProofId
    validatorSetId: String,
    r: [],
    s: [],
    v: [],
    validators: []
}, { collection: EVENT_PROOF });

module.exports = {
    BridgeClaim: mongoose.model('BridgeClaim', BridgeClaimSchema),
    BRIDGE_CLAIM,
    EventProcessed: mongoose.model('EventProcessed', EventProcessedSchema),
    EVENT_PROCESSED,
    ClaimEvents: mongoose.model('ClaimEvents',ClaimEventsSchema),
    CLAIM_EVENTS,
    WithdrawProof: mongoose.model('WithdrawProof', WithdrawProofSchema),
    WITHDRAW_PROOF,
    EventProof: mongoose.model('EventProof', proofsSchema),
    EVENT_PROOF
};
