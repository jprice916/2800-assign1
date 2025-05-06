const express = require('express');
const path = require('path');
const app = express();


const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = "mongodb+srv://jacob:<buddyz123>@cluster0.pwvgobf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

const session = require("express-session");
const { Console } = require('console');


const port = process.env.PORT || 8000;
const path = require('path');

const node_session_secret = "8063e70e-0355-402d-bfac-94dd23d12cf1";

// Serve static files from the current directory
app.use(express.static(path.join(__dirname, '/'))); // Serve files from the root

// Route to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Start the server on port 3000 (or whatever port you set)
app.listen(process.env.PORT || 3000, () => {
  console.log('Server running...');
});

app.use(session({

    secret: node_session_secret,
    saveUninitialized: false,
    resave: true
}));

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("users").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}
run().catch(console.dir);

