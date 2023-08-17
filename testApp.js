'use strict';

const cors = require('cors');
const fs = require('fs');
const path = require('path');
const FabricCAServices = require('fabric-ca-client');
const { Wallets, Gateway } = require('fabric-network');
const mqtt = require('mqtt');
const express = require('express');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;


async function initializeApp() {
    // Fields for throughput
    const throughputCsvWriter = createCsvWriter({
        path: 'transaction_throughput.csv',
        header: [
            { id: 'timestamp', title: 'TIMESTAMP' },
            { id: 'totalTransactions', title: 'TOTAL_TRANSACTIONS' },
            { id: 'successfulTransactions', title: 'SUCCESSFUL_TRANSACTIONS' },
            { id: 'failedTransactions', title: 'FAILED_TRANSACTIONS' },
            { id: 'tps', title: 'TPS' },
            { id: 'peakTps', title: 'PEAK_TPS' },
            { id: 'avgTps', title: 'AVERAGE_TPS' },
            { id: 'duration', title: 'DURATION' }
        ]
    });

// Fields for latency
    const latencyCsvWriter = createCsvWriter({
        path: 'transaction_latency.csv',
        header: [
            { id: 'timestamp', title: 'TIMESTAMP' },
            { id: 'transactionId', title: 'TRANSACTION_ID' },
            { id: 'startTime', title: 'START_TIME' },
            { id: 'endTime', title: 'END_TIME' },
            { id: 'latency', title: 'LATENCY_MS' },
            { id: 'avgLatency', title: 'AVERAGE_LATENCY_MS' },
            { id: 'peakLatency', title: 'PEAK_LATENCY_MS' },
            { id: 'lowestLatency', title: 'LOWEST_LATENCY_MS' }
        ]
    });

// Variables to track throughput
    let totalTransactions = 0;
    let successfulTransactions = 0;
    let failedTransactions = 0;
    let tpsList = [];

// Variables to track latency
    let latencyList = [];

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

    client.on('message', async function (topic, message) {
        // Parse the message into a JSON object
        let data = JSON.parse(message.toString());
        const args = [data.batchNo, data.warehouseNo, data.iotId, data.temperatureSensorId, data.humiditySensorId, data.timestamp, data.temperature.toString(), data.humidity.toString()];
        console.log('Starting the transaction process with arguments:', args);

        // Submit the transaction with the arguments
        try {
            await invokeTransaction(args);
        } catch (error) {
            console.error('Error during the transaction process:', error);
        }
    });

    async function init() {
        if (!contract) {
            const gateway = new Gateway();
            await gateway.connect(connectionProfile, connectionOptions);
            const network = await gateway.getNetwork('iotchannel1');
            contract = network.getContract('iot');
        }
    }

    function resetThroughputVariables() {
        totalTransactions = 0;
        successfulTransactions = 0;
        failedTransactions = 0;
        tpsList = [];
    }

    async function invokeTransaction(args) {
        try {
            const startTime = new Date().toISOString();

            const response = await contract.submitTransaction('CreateMedsData', ...args);

            // Mark the end time of the transaction
            const endTime = new Date().toISOString();

            console.log(`Transaction submitted successfully: ${response}`);

            // Calculate latency
            const latencyMs = new Date(endTime) - new Date(startTime);
            latencyList.push(latencyMs);

            // Update throughput variables
            totalTransactions++;
            if (response) {
                successfulTransactions++;
            } else {
                failedTransactions++;
            }
            const tps = totalTransactions / 1; // Assuming a 1-second interval for demonstration
            tpsList.push(tps);

            // Create throughput and latency records
            const throughputRecord = {
                timestamp: new Date().toISOString(),
                totalTransactions: totalTransactions,
                successfulTransactions: successfulTransactions,
                failedTransactions: failedTransactions,
                tps: tps,
                peakTps: Math.max(...tpsList),
                avgTps: tpsList.reduce((acc, curr) => acc + curr, 0) / tpsList.length,
                duration: 1 // Assuming a 1-second interval
            };

            const latencyRecord = {
                timestamp: new Date().toISOString(),
                transactionId: response ? response.toString() : "FAILED",
                startTime: startTime,
                endTime: endTime,
                latency: latencyMs,
                avgLatency: latencyList.reduce((acc, curr) => acc + curr, 0) / latencyList.length,
                peakLatency: Math.max(...latencyList),
                lowestLatency: Math.min(...latencyList)
            };

            // Write the records to CSV
            throughputCsvWriter.writeRecords([throughputRecord])
                .then(() => {
                    console.log('Throughput record written to CSV');
                });

            latencyCsvWriter.writeRecords([latencyRecord])
                .then(() => {
                    console.log('Latency record written to CSV');
                });

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

    setInterval(resetThroughputVariables, 1000);
}


initializeApp().catch(error => {
    console.error('Error initializing app:', error);
});
