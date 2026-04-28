const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const publicDir = __dirname;

let latestPhoneData = {
  lat: null,
  lng: null,
  speedKmph: 0,
  accuracy: 0,
  alpha: 0,
  beta: 0,
  gamma: 0,
  motion: 0,
  sos: false,
  sosAt: 0,
  timestamp: 0
};

const contentTypes = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json"
};

function send(res, status, type, body) {
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

function serveFile(req, res) {
  const cleanUrl = req.url.split("?")[0] === "/" ? "/index.html" : req.url.split("?")[0];
  const filePath = path.join(publicDir, path.normalize(cleanUrl));

  if (!filePath.startsWith(publicDir)) {
    send(res, 403, "text/plain", "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(res, 404, "text/plain", "Not found");
      return;
    }

    send(res, 200, contentTypes[path.extname(filePath)] || "text/plain", data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    send(res, 204, "text/plain", "");
    return;
  }

  if (req.url === "/phone-data" && req.method === "POST") {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20000) {
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        latestPhoneData = { ...latestPhoneData, ...JSON.parse(body), timestamp: Date.now() };
        send(res, 200, "application/json", JSON.stringify({ ok: true }));
      } catch (error) {
        send(res, 400, "application/json", JSON.stringify({ ok: false }));
      }
    });
    return;
  }

  if (req.url === "/phone-data" && req.method === "GET") {
    const online = Date.now() - latestPhoneData.timestamp < 5000;
    send(res, 200, "application/json", JSON.stringify({ ...latestPhoneData, online }));
    return;
  }

  serveFile(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`Phone sender: http://YOUR_LAPTOP_IP:${PORT}/phone.html`);
});
