const { Wallets, Gateway } = require('fabric-network');
const path = require('path');
const fs = require('fs');

async function processTransaction(args, startTime) {
    const testNetworkRoot = path.resolve(require('os').homedir(), 'go/src/github.com/hyperledger2.5/fabric-samples/test-network');
    const identityLabel = 'user1@org1.example.com';
    const orgName = identityLabel.split('@')[1];
    const orgNameWithoutDomain = orgName.split('.')[0];
    const connectionProfilePath = path.join(testNetworkRoot, 'organizations/peerOrganizations', orgName, `/connection-${orgNameWithoutDomain}.json`);
    const connectionProfile = JSON.parse(fs.readFileSync(connectionProfilePath, 'utf8'));

    const connectionOptions = {
        identity: identityLabel,
        wallet: await Wallets.newFileSystemWallet('./wallet'),
        discovery: { enabled: true, asLocalhost: true }
    };

    const gateway = new Gateway();
    await gateway.connect(connectionProfile, connectionOptions);
    const network = await gateway.getNetwork('iotchannel1');
    const contract = network.getContract('iot');

    try {
        const response = await contract.submitTransaction('CreateMedsData', ...args);
        console.log(`Transaction submitted successfully: ${response}`);

        const endTime = new Date(); // Record end time after transaction completion
        const latencyMs = endTime.getTime() - new Date(startTime).getTime(); // Calculate latency

        return {
            latencyMs: latencyMs
        };
    } catch (error) {
        console.error('Error during the transaction process:', error);
        throw error;
    } finally {
        gateway.disconnect();
    }
}

module.exports = {
    processTransaction: processTransaction
};
