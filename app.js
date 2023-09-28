'use strict';

const cors = require('cors');
const fs = require('fs');
const path = require('path');
const FabricCAServices = require('fabric-ca-client');
const { Wallets, Gateway } = require('fabric-network');
const mqtt = require('mqtt');
const express = require('express');
const Fernet = require('fernet');

const testNetworkRoot = path.resolve(require('os').homedir(), 'go/src/github.com/hyperledger2.5/fabric-samples/test-network');
const identityLabel = 'user1@org1.example.com';

// Define the TLS options
// const tlsOptions = {
//   ca: [fs.readFileSync('/home/osama/ca.crt')],
//   key: fs.readFileSync('/home/osama/server.key'), 
//   cert: fs.readFileSync('/home/osama/server.crt') 
// };

const options = {
  username: 'iot',
  password: 'iot123456',
  // ...tlsOptions, 
};

const client = mqtt.connect('mqtt://localhost', options);

const app = express();
const port = 3000;

const secret_key = "ztdoy8Ej58Iq33oPUJFfXS__AHmRG_N2u5IPgwoVJM4=";

app.use(cors());

app.get('/getAllMedsData', async (req, res) => {
  try {
    const result = await queryAllMedsData();
    res.json(JSON.parse(result)); // assuming result is a JSON string
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
  client.subscribe('iot/data', function (err) {
    if (!err) {
      console.log('Subscribed to iot/data topic');
      main();
    } else {
      console.error('Error subscribing to iot/data topic', err);
    }
  })
})

client.on('message', async function (topic, message) {
    // Parse the message into a JSON object
    console.log("Received message:", message.toString());
    // Decrypt the message using the same secret key used for encryption

    let decryptedData = decrypt_data(message.toString(), secret_key);

    let data = JSON.parse(decryptedData);


    // Extract the values from the decrypted JSON object
    const args = [
        data.batchNo,
        data.warehouseNo,
        data.iotId,
        data.temperatureSensorId,
        data.humiditySensorId,
        data.timestamp,
        data.temperature.toString(),
        data.humidity.toString()
    ];

    // Log the arguments
    console.log('Starting the transaction process with arguments:', args);

    // Submit the transaction with the arguments
    try {
        await invokeTransaction(args);
    } catch (error) {
        console.error('Error during the transaction process:', error);
    }
});

async function main() {
  try {
    const orgName = identityLabel.split('@')[1];
    const orgNameWithoutDomain = orgName.split('.')[0];

    let connectionProfile = JSON.parse(fs.readFileSync(
        path.join(testNetworkRoot,
            'organizations/peerOrganizations',
            orgName,
            `/connection-${orgNameWithoutDomain}.json`), 'utf8')
    );

    const ca = new FabricCAServices(connectionProfile['certificateAuthorities'][`ca.${orgName}`].url);
    const wallet = await Wallets.newFileSystemWallet('./wallet');

    let identity = await wallet.get(identityLabel);
    if (identity) {
        console.log(`An identity for the ${identityLabel} user already exists in the wallet`);
        return;
    }

    const enrollmentID = 'user1';
    const enrollmentSecret = 'user1pw';

    let enrollmentRequest = {
        enrollmentID: enrollmentID,
        enrollmentSecret: enrollmentSecret
    };
    const enrollment = await ca.enroll(enrollmentRequest);

    const orgNameCapitalized = orgNameWithoutDomain.charAt(0).toUpperCase() + orgNameWithoutDomain.slice(1);
    identity = {
        credentials: {
            certificate: enrollment.certificate,
            privateKey: enrollment.key.toBytes(),
        },
        mspId: `${orgNameCapitalized}MSP`,
        type: 'X.509',
    };
    await wallet.put(identityLabel, identity);
    console.log(`Successfully enrolled ${identityLabel} user and imported it into the wallet`);

  } catch (error) {
    console.error(`Failed to enroll user: ${error}`);
    process.exit(1);
  }
}

async function invokeTransaction(args) {
  const gateway = new Gateway();

  try {
    console.log('Starting the transaction process with arguments:', args);
    const wallet = await Wallets.newFileSystemWallet('./wallet');
    const orgName = identityLabel.split('@')[1];
    const orgNameWithoutDomain = orgName.split('.')[0];
    const connectionProfilePath = path.join(testNetworkRoot, 'organizations/peerOrganizations', orgName, `/connection-${orgNameWithoutDomain}.json`);
    const connectionProfile = JSON.parse(fs.readFileSync(connectionProfilePath, 'utf8'));

    const connectionOptions = {
        identity: identityLabel,
        wallet: wallet,
        discovery: { enabled: true, asLocalhost: true }
    };

    await gateway.connect(connectionProfile, connectionOptions);

    const network = await gateway.getNetwork('iotchannel1');
    const contract = network.getContract('iot');

    const response = await contract.submitTransaction('CreateMedsData', ...args);
    console.log(`Transaction submitted successfully: ${response}`);

  } catch (error) {
    console.error('Error during the transaction process:', error);
  } finally {
    console.log('Disconnecting from the gateway...');
    gateway.disconnect();
  }
}

async function queryAllMedsData() {
  const gateway = new Gateway();

  try {
    const wallet = await Wallets.newFileSystemWallet('./wallet');
    const orgName = identityLabel.split('@')[1];
    const orgNameWithoutDomain = orgName.split('.')[0];
    const connectionProfilePath = path.join(testNetworkRoot, 'organizations/peerOrganizations', orgName, `/connection-${orgNameWithoutDomain}.json`);
    const connectionProfile = JSON.parse(fs.readFileSync(connectionProfilePath, 'utf8'));

    const connectionOptions = {
        identity: identityLabel,
        wallet: wallet,
        discovery: { enabled: true, asLocalhost: true }
    };

    await gateway.connect(connectionProfile, connectionOptions);

    const network = await gateway.getNetwork('iotchannel1');
    const contract = network.getContract('iot');

    // Query the chaincode
    const result = await contract.evaluateTransaction('GetAllMedsData');
    console.log(`Query result: ${result.toString()}`);

    return result.toString(); // or parse it as JSON depending on the chaincode response format
  } catch (error) {
    console.error(`Error querying chaincode: ${error}`);
    throw error;
  } finally {
    gateway.disconnect();
  }
}

// function to decrypt the data
function decrypt_data(data, key) {
    const cipher_suite = new Fernet(key);
    try {
        const decrypted_data = cipher_suite.decryptMessage(data, key);
        return JSON.parse(decrypted_data);
    } catch (error) {
        console.error('Error decrypting data:', error);
        return null;
    }
}
