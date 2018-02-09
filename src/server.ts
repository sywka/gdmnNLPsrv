import config from "config";
import http from "http";
import https from "https";
import path from "path";
import fs from "fs";
import app from "./app";

if (config.get("server.http.enabled")) {
    const server = http.createServer(app);
    const port = <number>config.get("server.http.port");
    const host = <string>config.get("server.http.host");

    server.listen(port, host);
    server.on("error", (error: NodeJS.ErrnoException) => errorHandler(error, port));
    server.on("listening", () => {
        console.log(`Listening on http://${server.address().address}:${server.address().port}; env: ${app.get("env")}`);
    });
}

if (config.get("server.https.enabled")) {
    const key = fs.readFileSync(path.resolve(process.cwd(), config.get("server.https.keyPath")));
    const cert = fs.readFileSync(path.resolve(process.cwd(), config.get("server.https.certPath")));

    const server = https.createServer({key, cert}, app);
    const port = <number>config.get("server.http.port");
    const host = <string>config.get("server.http.host");

    server.listen(port, host);
    server.on("error", (error: NodeJS.ErrnoException) => errorHandler(error, port));
    server.on("listening", () => {
        console.log(`Listening on https://${server.address().address}:${server.address().port}; env: ${app.get("env")}`);
    });
}

function errorHandler(error: NodeJS.ErrnoException, port: number): void {
    if (error.syscall !== "listen") {
        throw error;
    }
    switch (error.code) {
        case "EACCES":
            console.error(`Port :${port} requires elevated privileges`);
            process.exit(1);
            break;
        case "EADDRINUSE":
            console.error(`Port :${port} is already in use`);
            process.exit(1);
            break;
        default:
            throw error;
    }
}