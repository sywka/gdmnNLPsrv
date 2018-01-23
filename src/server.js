"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var config = require("config");
var http = require("http");
var https = require("https");
var path = require("path");
var fs = require("fs");
var app_1 = require("./app");
if (config.get('server.http.enabled')) {
    var server_1 = http.createServer(app_1.default);
    server_1.listen(config.get('server.http.port'), config.get('server.http.host'));
    server_1.on('error', errorHandler);
    server_1.on('listening', function () {
        console.log("Listening on http://" + server_1.address().address + ":" + server_1.address().port + "; env: " + app_1.default.get('env'));
    });
}
if (config.get('server.https.enabled')) {
    var key = fs.readFileSync(path.resolve(process.cwd(), config.get('server.https.keyPath')));
    var cert = fs.readFileSync(path.resolve(process.cwd(), config.get('server.https.certPath')));
    var server_2 = https.createServer({ key: key, cert: cert }, app_1.default);
    server_2.listen(config.get('server.https.port'), config.get('server.https.host'));
    server_2.on('error', errorHandler);
    server_2.on('listening', function () {
        console.log("Listening on https://" + server_2.address().address + ":" + server_2.address().port + "; env: " + app_1.default.get('env'));
    });
}
function errorHandler(error) {
    if (error.syscall !== 'listen') {
        throw error;
    }
    switch (error.code) {
        case 'EACCES':
            console.error('Port requires elevated privileges');
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error('Port is already in use');
            process.exit(1);
            break;
        default:
            throw error;
    }
}
//# sourceMappingURL=server.js.map