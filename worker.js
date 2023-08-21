const { Wallets, Gateway } = require('fabric-network');
const path = require('path');
const fs = require('fs');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const testNetworkRoot = path.resolve(require('os').homedir(), 'go/src/github.com/hyperledger2.5/fabric-samples/test-network');
const identityLabel = 'user1@org1.example.com';
const orgName = identityLabel.split('@')[1];
const orgNameWithoutDomain = orgName.split('.')[0];
const connectionProfilePath = path.join(testNetworkRoot, 'organizations/peerOrganizations', orgName, `/connection-${orgNameWithoutDomain}.json`);
const connectionProfile = JSON.parse(fs.readFileSync(connectionProfilePath, 'utf8'));

const connectionOptions = {
    identity: identityLabel,
    wallet: Wallets.newFileSystemWallet('./wallet'),
    discovery: { enabled: true, asLocalhost: true }
};

const latencyCsvWriter = createCsvWriter({
    path: 'transaction_latency.csv',
    header: [
        { id: 'timestamp', title: 'TIMESTAMP' },
        { id: 'humidity', title: 'HUMIDITY' },
        { id: 'temperature', title: 'TEMPERATURE' },
        { id: 'startTime', title: 'START_TIME' },
        { id: 'endTime', title: 'END_TIME' },
        { id: 'latencyMs', title: 'LATENCY_MS' },
        { id: 'tps', title: 'TPS' }
    ]
});

const throughputCsvWriter = createCsvWriter({
    path: 'transaction_throughput.csv',
    header: [
        { id: 'timestamp', title: 'TIMESTAMP' },
        { id: 'transactionsThisSecond', title: 'TRANSACTIONS_THIS_SECOND' },
        { id: 'totalTransactions', title: 'TOTAL_TRANSACTIONS' }
    ]
});

let totalTransactions = 0;
let transactionsThisSecond = 0;

setInterval(() => {
    const tps = transactionsThisSecond;

    const record = {
        timestamp: new Date().toISOString().split('T')[1].split('.')[0],
        transactionsThisSecond: transactionsThisSecond,
        totalTransactions: totalTransactions
    };

    throughputCsvWriter.writeRecords([record])
        .then(() => {
            console.log('Throughput record written to CSV');
        })
        .catch(error => {
            console.error('Error writing to CSV:', error);
        });

    transactionsThisSecond = 0;
}, 1000);

async function processTransaction(args, data, startTime) {
    const gateway = new Gateway();
    await gateway.connect(connectionProfile, connectionOptions);
    const network = await gateway.getNetwork('iotchannel1');
    const contract = network.getContract('iot');

    try {
        const response = await contract.submitTransaction('CreateMedsData', ...args);
        console.log(`Transaction submitted successfully: ${response}`);

        const endTime = new Date();
        const latencyMs = endTime.getTime() - new Date(startTime).getTime();

        totalTransactions++;
        transactionsThisSecond++;

        const latencyRecord = {
            timestamp: new Date().toISOString().split('T')[1].split('.')[0],
            humidity: data.humidity,
            temperature: data.temperature,
            startTime: startTime,
            endTime: endTime.toISOString(),
            latencyMs: latencyMs,
            tps: transactionsThisSecond
        };

        await latencyCsvWriter.writeRecords([latencyRecord]);

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
