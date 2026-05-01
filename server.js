const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const MAX_BODY_SIZE = 1024 * 1024;

const routes = {
  "POST /api/bookings": handleBooking,
  "GET /api/bookings": handleBookingList,
  "POST /api/feedback": handleFeedback,
  "GET /api/feedback": handleFeedbackList,
  "POST /api/auth": handleAuth,
  "POST /api/google-auth": handleGoogleAuth,
  "POST /api/signup": handleSignup,
  "POST /api/login": handleLogin,
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

ensureDataFiles();

const server = http.createServer(async (req, res) => {
  try {
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    const routeHandler = routes[`${req.method} ${url.pathname}`];

    if (routeHandler) {
      await routeHandler(req, res);
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      sendJson(res, 404, { error: "API route not found." });
      return;
    }

    serveStaticFile(url.pathname, res);
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      error: error.statusCode ? error.message : "Server error. Please try again later.",
    });
  }
});

server.listen(PORT, () => {
  console.log(`Lumina Beauty Studio backend running at http://localhost:${PORT}`);
});

function serveStaticFile(urlPath, res) {
  const requestedPath = urlPath === "/" ? "/index.html" : decodeURIComponent(urlPath);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT_DIR, safePath);

  if (!filePath.startsWith(ROOT_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendText(res, 404, "Page not found");
      return;
    }

    const contentType = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
}

async function handleBooking(req, res) {
  const body = await readJsonBody(req);
  const requiredFields = ["name", "service", "date"];

  validateRequired(body, requiredFields);

  const booking = {
    id: crypto.randomUUID(),
    name: cleanText(body.name),
    phone: cleanText(body.phone || ""),
    service: cleanText(body.service),
    date: cleanText(body.date),
    time: cleanText(body.time || ""),
    message: cleanText(body.message || ""),
    createdAt: new Date().toISOString(),
  };

  appendRecord("bookings.json", booking);
  sendJson(res, 201, {
    message: "Booking request received. We will contact you shortly.",
    bookingId: booking.id,
  });
}

async function handleBookingList(req, res) {
  sendJson(res, 200, { bookings: readRecords("bookings.json").reverse() });
}

async function handleFeedback(req, res) {
  const body = await readJsonBody(req);
  validateRequired(body, ["experience"]);

  const feedback = {
    id: crypto.randomUUID(),
    experience: cleanText(body.experience),
    createdAt: new Date().toISOString(),
  };

  appendRecord("feedback.json", feedback);
  sendJson(res, 201, { message: "Thank you for sharing your feedback." });
}

async function handleFeedbackList(req, res) {
  sendJson(res, 200, { feedback: readRecords("feedback.json").reverse() });
}

async function handleSignup(req, res) {
  const body = await readJsonBody(req);
  validateRequired(body, ["email", "password"]);

  const email = cleanText(body.email).toLowerCase();
  const password = String(body.password);

  if (!email.includes("@") || password.length < 6) {
    sendJson(res, 400, { error: "Use a valid email and a password with at least 6 characters." });
    return;
  }

  const users = readRecords("users.json");

  if (users.some((user) => user.email === email)) {
    sendJson(res, 409, { error: "An account with this email already exists." });
    return;
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const user = {
    id: crypto.randomUUID(),
    email,
    passwordHash: hashPassword(password, salt),
    salt,
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  writeRecords("users.json", users);
  sendJson(res, 201, { message: "Account created successfully.", userId: user.id });
}

async function handleAuth(req, res) {
  const body = await readJsonBody(req);
  validateRequired(body, ["email", "password"]);

  const email = cleanText(body.email).toLowerCase();
  const password = String(body.password);

  if (!email.includes("@") || password.length < 6) {
    sendJson(res, 400, { error: "Use a valid email and a password with at least 6 characters." });
    return;
  }

  const users = readRecords("users.json");
  const existingUser = users.find((user) => user.email === email);

  if (existingUser) {
    if (!existingUser.passwordHash || !existingUser.salt) {
      sendJson(res, 401, { error: "This account uses Google login. Please continue with Google." });
      return;
    }

    if (existingUser.passwordHash !== hashPassword(password, existingUser.salt)) {
      sendJson(res, 401, { error: "Invalid email or password." });
      return;
    }

    sendJson(res, 200, { message: "Login successful.", userId: existingUser.id });
    return;
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const user = {
    id: crypto.randomUUID(),
    email,
    passwordHash: hashPassword(password, salt),
    salt,
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  writeRecords("users.json", users);
  sendJson(res, 201, { message: "Account created successfully.", userId: user.id });
}

async function handleGoogleAuth(req, res) {
  const body = await readJsonBody(req);
  validateRequired(body, ["email"]);

  const email = cleanText(body.email).toLowerCase();

  if (!email.includes("@")) {
    sendJson(res, 400, { error: "Use a valid Google email address." });
    return;
  }

  const users = readRecords("users.json");
  const existingUser = users.find((user) => user.email === email);

  if (existingUser) {
    sendJson(res, 200, {
      message: "Google login successful.",
      userId: existingUser.id,
      email: existingUser.email,
      provider: "google",
    });
    return;
  }

  const user = {
    id: crypto.randomUUID(),
    email,
    provider: "google",
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  writeRecords("users.json", users);
  sendJson(res, 201, {
    message: "Google account connected successfully.",
    userId: user.id,
    email: user.email,
    provider: "google",
  });
}

async function handleLogin(req, res) {
  const body = await readJsonBody(req);
  validateRequired(body, ["email", "password"]);

  const email = cleanText(body.email).toLowerCase();
  const users = readRecords("users.json");
  const user = users.find((item) => item.email === email);

  if (!user) {
    sendJson(res, 401, { error: "Invalid email or password." });
    return;
  }

  if (!user.passwordHash || !user.salt) {
    sendJson(res, 401, { error: "This account uses Google login. Please continue with Google." });
    return;
  }

  if (user.passwordHash !== hashPassword(String(body.password), user.salt)) {
    sendJson(res, 401, { error: "Invalid email or password." });
    return;
  }

  sendJson(res, 200, {
    message: "Login successful.",
    user: {
      id: user.id,
      email: user.email,
    },
  });
}

function ensureDataFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  ["bookings.json", "feedback.json", "users.json"].forEach((fileName) => {
    const filePath = path.join(DATA_DIR, fileName);

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, "[]\n");
    }
  });
}

function readRecords(fileName) {
  const filePath = path.join(DATA_DIR, fileName);
  const content = fs.readFileSync(filePath, "utf8").trim();

  if (!content) {
    writeRecords(fileName, []);
    return [];
  }

  try {
    const records = JSON.parse(content);
    return Array.isArray(records) ? records : [];
  } catch (error) {
    const backupPath = path.join(DATA_DIR, `${fileName}.${Date.now()}.backup`);
    fs.copyFileSync(filePath, backupPath);
    writeRecords(fileName, []);
    return [];
  }
}

function writeRecords(fileName, records) {
  fs.writeFileSync(path.join(DATA_DIR, fileName), `${JSON.stringify(records, null, 2)}\n`);
}

function appendRecord(fileName, record) {
  const records = readRecords(fileName);
  records.push(record);
  writeRecords(fileName, records);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;

      if (body.length > MAX_BODY_SIZE) {
        const error = new Error("Request body too large.");
        error.statusCode = 413;
        reject(error);
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (parseError) {
        const invalidJsonError = new Error("Invalid JSON body.");
        invalidJsonError.statusCode = 400;
        reject(invalidJsonError);
      }
    });
  });
}

function validateRequired(body, fields) {
  const missingFields = fields.filter((field) => !String(body[field] || "").trim());

  if (missingFields.length) {
    const error = new Error(`Missing required fields: ${missingFields.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }
}

function cleanText(value) {
  return String(value).trim().replace(/\s+/g, " ");
}

function hashPassword(password, salt) {
  return crypto
    .pbkdf2Sync(password, salt, 120000, 64, "sha512")
    .toString("hex");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(text);
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
