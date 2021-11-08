const mongoose = require('mongoose');
const { Schema } = mongoose;


const BRIDGE_CLAIM = 'bridgeClaim';

const BridgeClaimSchema = new Schema({
    _id: String,
    txHash: String, // txHash from ethereum bridge contract - deposit
    status: String,
    claimId: String
}, { collection: BRIDGE_CLAIM });

module.exports = {
    BridgeClaim: mongoose.model('BridgeClaim', BridgeClaimSchema),
    BRIDGE_CLAIM,
};
