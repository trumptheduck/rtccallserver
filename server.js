const express = require('express');
const app = express();
const https = require('https');
const fs = require('fs');
const path = require('path');

var privateKey  = fs.readFileSync('./sslcert/key.pem', 'utf8');
var certificate = fs.readFileSync('./sslcert/cert.pem', 'utf8');
var credentials = {key: privateKey, cert: certificate};

const server = https.createServer(credentials, app);
const { Server } = require("socket.io");
const io = new Server(server);
const CallServer = require("./public/js/core/classes/CallServer");

app.use(express.json());
app.use("/static", express.static(path.join(__dirname, "./public/")))

app.get('/', (req, res) => {
  return res.sendFile(path.join(__dirname, "./index.html"));
});


const callServer = CallServer.getInstance();
callServer.init(io);

app.post('/api/startAutomatedCall', callServer.startAutomatedCallEndpoint);

server.listen(443, () => {
  console.log('[EXPRESS] Listening on: 443');
});