

# IoT Meds Data Service

This service provides a backend server that interacts with a Hyperledger Fabric blockchain network to manage data related to medical batches. It uses MQTT to communicate with IoT devices and provides RESTful API endpoints to query the ledger.

## Features

- **MQTT Integration**: Subscribes to the `iot/data` topic to receive IoT data.
- **Hyperledger Fabric Integration**: Interacts with a Fabric network to submit and query data related to medications.
- **Express Server**: Serves RESTful API endpoint to query all medications data.

## Prerequisites

- Node.js
- MQTT broker running on `localhost`
- Hyperledger Fabric network 2.5
- Properly configured wallet and connection profiles for the Fabric network

## Installation

1. Clone the repository.
2. Run `npm install` to install all dependencies.

## Usage

Start the server by running:

```bash
node <filename.js>
```

The server will be running at `http://localhost:3000`.

### API Endpoint

- `GET /getAllMedsData`: Returns all medications data.

### MQTT Topic

- `iot/data`: The service subscribes to this topic and expects JSON messages with information about medication batches.

## Configuration

The code assumes the presence of a connection profile and other configurations related to the Fabric network. Update the paths and configurations according to your setup.

The MQTT options, such as username and password, can be customized in the `options` constant.

### Example MQTT Message

The following is an example of the expected JSON message format for the `iot/data` topic:

```json
{
  "batchNo": "1234",
  "warehouseNo": "5678",
  "iotId": "abcd",
  "temperatureSensorId": "temp123",
  "humiditySensorId": "hum123",
  "timestamp": "2021-08-10T10:20:30Z",
  "temperature": 22.5,
  "humidity": 60
}
```


