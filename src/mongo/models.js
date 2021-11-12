const mongoose = require('mongoose');
const { Schema } = mongoose;


const BRIDGE_CLAIM = 'claims';

const EVENT_PROCESSED = 'events';

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

module.exports = {
    BridgeClaim: mongoose.model('BridgeClaim', BridgeClaimSchema),
    BRIDGE_CLAIM,
    EventProcessed: mongoose.model('EventProcessed', EventProcessedSchema),
    EVENT_PROCESSED
};
