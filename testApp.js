'use strict';

const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Wallets, Gateway } = require('fabric-network');
const mqtt = require('mqtt');
const express = require('express');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
// const workerpool = require('workerpool');
//
// const pool = workerpool.pool(__dirname + '/worker.js');

async function initializeApp() {
    const testNetworkRoot = path.resolve(require('os').homedir(), 'go/src/github.com/hyperledger2.5/fabric-samples/test-network');
    const identityLabel = 'user1@org1.example.com';
    const orgName = identityLabel.split('@')[1];
    const orgNameWithoutDomain = orgName.split('.')[0];
    const connectionProfilePath = path.join(testNetworkRoot, 'organizations/peerOrganizations', orgName, `/connection-${orgNameWithoutDomain}.json`);
    const connectionProfile = JSON.parse(fs.readFileSync(connectionProfilePath, 'utf8'));

    const options = {
        username: 'iot',
        password: 'iot123456',
    };

    const client = mqtt.connect('mqtt://localhost', options);
    const app = express();
    const port = 3000;
    const connectionOptions = {
        identity: identityLabel,
        wallet: await Wallets.newFileSystemWallet('./wallet'),
        discovery: { enabled: true, asLocalhost: true }
    };

    await checkAndEnrollUser();

    let contract = null;

    app.use(cors());

    app.get('/getAllMedsData', async (req, res) => {
        try {
            const result = await queryAllMedsData();
            res.json(JSON.parse(result));
        } catch (error) {
            console.error(error);
            res.status(500).send('An error occurred while querying the ledger');
        }
    });

    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });

    client.on('connect', function () {
        console.log('Connected to MQTT broker.');
        client.subscribe('iot/data', async function (err) {
            if (!err) {
                console.log('Subscribed to iot/data topic');
                await init();
            } else {
                console.error('Error subscribing to iot/data topic', err);
            }
        });
    });

    const latencyQueue = [];

    const latencyCsvWriter = createCsvWriter({
        path: 'transaction_latency.csv',
        header: [
            { id: 'timestamp', title: 'TIMESTAMP' },
            { id: 'humidity', title: 'HUMIDITY' },
            { id: 'temperature', title: 'TEMPERATURE' },
            { id: 'startTime', title: 'START_TIME' },
            { id: 'endTime', title: 'END_TIME' },
            { id: 'latencyMs', title: 'LATENCY_MS' },
            { id: 'tps', title: 'TPS' },  // Transactions per second
            { id: 'totalTransactions', title: 'TOTAL_TRANSACTIONS' }
        ]
    });

    client.on('message', async function (topic, message) {


        // Parse the message into a JSON object
        let data = JSON.parse(message.toString());
        const args = [data.batchNo, data.warehouseNo, data.iotId, data.temperatureSensorId, data.humiditySensorId, data.timestamp, data.temperature.toString(), data.humidity.toString()];
        console.log('Starting the transaction process with arguments:', args);

        const startTime = new Date(); // Record start time

        // Submit the transaction with the arguments
        try {
            await invokeTransaction(args);

            const endTime = new Date(); // Record end time after transaction completion

            const latencyMs = endTime.getTime() - startTime.getTime(); // Calculate latency


            const latencyMsRounded = Math.round(latencyMs / 100) * 100; // Round to the nearest hundred

            // Add the new latency value to the queue
            latencyQueue.push(latencyMsRounded);

            // If the queue size exceeds 5, remove the oldest value
            if (latencyQueue.length > 5) {
                latencyQueue.shift();
            }

            // Compute the moving average of the latency values in the queue
            const movingAverageLatency = Math.round(latencyQueue.reduce((a, b) => a + b) / latencyQueue.length);


            // Prepare the latency record
            const latencyRecord = {
                timestamp: new Date().toISOString().split('T')[1].split('.')[0], // Format to HH:MM:SS
                humidity: data.humidity,
                temperature: data.temperature,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                latencyMs: movingAverageLatency, // Use the moving average latency
                tps: tps,
                totalTransactions: totalTransactions
            };

            // Write the latency record to the CSV
            await latencyCsvWriter.writeRecords([latencyRecord]);

        } catch (error) {
            console.error('Error during the transaction process:', error);
        }
    });


    // Throughput tracking
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
    let tps = 0;  // New variable to store the computed TPS


    setInterval(() => {
        // Compute the TPS for the current second
        tps = transactionsThisSecond;  // Since the duration is 1 second, TPS is equal to transactionsThisSecond

        // Prepare the record for this second
        const record = {
            timestamp: new Date().toISOString().split('T')[1].split('.')[0], // Format to HH:MM:SS
            transactionsThisSecond: transactionsThisSecond,
            totalTransactions: totalTransactions
        };

        // Write the record to CSV
        throughputCsvWriter.writeRecords([record])
            .then(() => {
                console.log('Throughput record written to CSV');
            })
            .catch(error => {
                console.error('Error writing to CSV:', error);
            });

        // Reset the count for the next second
        transactionsThisSecond = 0;
    }, 1000);

    async function init() {
        if (!contract) {
            const gateway = new Gateway();
            await gateway.connect(connectionProfile, connectionOptions);
            const network = await gateway.getNetwork('iotchannel1');
            contract = network.getContract('iot');
        }
    }

    async function invokeTransaction(args) {
        try {
            const response = await contract.submitTransaction('CreateMedsData', ...args);
            console.log(`Transaction submitted successfully: ${response}`);

            // Increment the counters for tracking
            totalTransactions++;
            transactionsThisSecond++;

        } catch (error) {
            console.error('Error during the transaction process:', error);
        }
    }

    async function queryAllMedsData() {
        try {
            const result = await contract.evaluateTransaction('GetAllMedsData');
            console.log(`Query result: ${result.toString()}`);
            return result.toString();
        } catch (error) {
            console.error(`Error querying chaincode: ${error}`);
            throw error;
        }
    }

}

async function checkAndEnrollUser() {
    const wallet = await Wallets.newFileSystemWallet('./wallet');
    let identity = await wallet.get(identityLabel);
    if (!identity) {
        console.log(`An identity for the user ${identityLabel} does not exist in the wallet`);
        console.log('Enrolling user and importing identity into the wallet...');

        const caInfo = connectionProfile.certificateAuthorities[`ca.${orgName}`];
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

        const enrollment = await ca.enroll({ enrollmentID: 'user1', enrollmentSecret: 'user1pw' });
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: `${orgNameWithoutDomain}MSP`,
            type: 'X.509',
        };
        await wallet.put(identityLabel, x509Identity);
        console.log(`Successfully enrolled user "${identityLabel}" and imported it into the wallet`);
    }
}

initializeApp().catch(error => {
    console.error('Error initializing app:', error);
});
