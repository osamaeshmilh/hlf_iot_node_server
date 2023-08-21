'use strict';

const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Wallets, Gateway } = require('fabric-network');
const mqtt = require('mqtt');
const express = require('express');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const workerpool = require('workerpool');

// Create a worker pool using worker.js
const pool = workerpool.pool(__dirname + '/worker.js');

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

        const startTime = new Date(); // Record start time

        // Process the transaction in a worker thread
        pool.exec('processTransaction', [args, startTime])
            .then(result => {
                // Handle the result from the worker
                // For example, write to CSV or any other post-processing
                console.log('Transaction processed with latency:', result.latencyMs);
            })
            .catch(err => {
                console.error('Error during the transaction process:', err);
            });
    });

    async function queryAllMedsData() {
        try {
            // const result = await contract.evaluateTransaction('GetAllMedsData');
            // console.log(`Query result: ${result.toString()}`);
            return "result.toString()";
        } catch (error) {
            console.error(`Error querying chaincode: ${error}`);
            throw error;
        }
    }
}

initializeApp().catch(error => {
    console.error('Error initializing app:', error);
});
