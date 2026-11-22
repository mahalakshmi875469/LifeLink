
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const serviceAccount = require("./serviceAccountKey.json");

// Check environment variables
if (!process.env.NEXCONN_APP_KEY || !process.env.NEXCONN_APP_SECRET) {
  throw new Error("Nexconn App Key or App Secret is missing in .env");
}

// Initialize Firebase Admin
initializeApp({
  credential: cert(serviceAccount)
});

const auth = getAuth();

const app = express();

app.use(cors({
  origin: "http://localhost:5173"
}));

app.use(express.json());

// Generate Nexconn Access Token
app.post("/api/nexconn-token", async (req, res) => {
  try {
    // Verify Firebase login
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Login required"
      });
    }

    const idToken = authHeader.substring(7);

    const decodedToken = await auth.verifyIdToken(idToken);

    const userId = decodedToken.uid;

    const name =
      decodedToken.name ||
      decodedToken.email ||
      "LifeLink User";

    // Generate signature
    const nonce = crypto.randomBytes(8).toString("hex");

    const timestamp = Date.now().toString();

    const signature = crypto
      .createHash("sha1")
      .update(
        process.env.NEXCONN_APP_SECRET + nonce + timestamp
      )
      .digest("hex");

    // Request Nexconn Access Token
    const response = await fetch(
      "https://api.sg-light-api.com/v4/auth/access-token/issue",
      {
        method: "POST",

        headers: {
          "App-Key": process.env.NEXCONN_APP_KEY,
          "Nonce": nonce,
          "Timestamp": timestamp,
          "Signature": signature,
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          userId: userId,
          name: name
        })
      }
    );

    const responseText = await response.text();

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      data = {
        message: responseText
      };
    }

    if (!response.ok) {
      console.error("Nexconn API error:", response.status);

      return res.status(response.status).json({
        error: "Nexconn token request failed",
        details: data
      });
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error("Backend error:", error.message);

    return res.status(500).json({
      error: "Token generation failed"
    });
  }
});

// Start server
app.listen(3000, () => {
  console.log("LifeLink backend running on port 3000");
});
