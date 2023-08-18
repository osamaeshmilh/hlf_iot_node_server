'use strict';

const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Wallets, Gateway } = require('fabric-network');
const mqtt = require('mqtt');
const express = require('express');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

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

    setInterval(() => {
        // Prepare the record for this second
        const record = {
            timestamp: new Date().toISOString(),
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

initializeApp().catch(error => {
    console.error('Error initializing app:', error);
});
