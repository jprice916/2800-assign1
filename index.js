require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const MongoStore = require('connect-mongo');
const Joi = require('joi');
const { MongoClient, ServerApiVersion } = require('mongodb');
const path = require("path");



const saltRounds = 12;
const app = express();
const port = process.env.PORT || 3000;
const expireSession = 60 * 60 * 1000; // 1 hour
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "app/views"));

const requireEnvVars = [
    'MONGODB_USER',
    'MONGODB_PASSWORD',
    'MONGODB_HOST',
    'MONGODB_DATABASE',
    'MONGODB_SESSION_SECRET',
    'NODE_SESSION_SECRET'
];

requireEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        console.error(`Environment variable ${varName} is not set.`);
        process.exit(1);
    }
});

const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;
const node_session_secret = process.env.NODE_SESSION_SECRET;

const mongoUri = `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/${mongodb_database}?retryWrites=true&w=majority`;

const client = new MongoClient(mongoUri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let db, userCollection;

client.connect().then(() => {
    db = client.db(mongodb_database);
    userCollection = db.collection('users');
    console.log("Successfully connected to MongoDB Atlas!");
}).catch(err => {
    console.error("Failed to connect to MongoDB Atlas", err);
    process.exit(1);
});


console.log("DEBUG: MongoStore mongoUrl:", mongoUri); //debug
const mongoStore = MongoStore.create({
    mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/${mongodb_database}?retryWrites=true&w=majority`,
    crypto: {
        secret: mongodb_session_secret
    }
});

app.use(session({
    secret: node_session_secret,
    store: mongoStore,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: expireSession }
}));

app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));

// Is the user authenticated?
const requireAuth = (req, res, next) => {
    if (!req.session.isAuthenticated) {
        console.log('User not authenticated');
        return res.redirect('/');
    }
    next();
};

// If so then....
const requireNoAuth = (req, res, next) => {
    if (req.session.isAuthenticated) {
        console.log('User already authenticated');
        return res.redirect('/members');
    }
    next();
};

const getRandomImage = () => {

    const images = ['./img/cat.PNG', './img/dog.png', './img/bear.PNG'];

    const randomIndex = Math.floor(Math.random() * images.length);
    return `${images[randomIndex]}`;
};

app.get('/', (req, res) => {
    const name  = req.session.name
    if (req.session.isAuthenticated) {
        
        res.render("indexIn", {name})
    } else {
    
        res.render("indexOut")
        
    }
   
});


app.get('/admin', async (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.render("login");
    }

    try {
        const user = await userCollection.findOne({ email: req.session.email });
        console.log("b")
        const users = await userCollection.find().project({ name: 1, email: 1, type: 1 }).toArray();
        console.log("a")
        if (user && user.type === "admin") {
            return res.render("admin", {users: users});
        } else {
            console.error("Improper permissions for user:", req.session.email);
            return res.status(403).send("You are not an admin.");
        }
    } catch (err) {
        console.error("Database error when checking admin:", err);
        return res.status(500).send("Internal server error.");
    }
});

app.get('/update', async (req, res) => {
    const username = req.query.username;
    const type = req.query.type;
    const result = await userCollection.updateOne({name: username}, 
        {$set: {type: type}});

    res.redirect('/admin')
})



app.post('/signupSubmit', requireNoAuth, async (req, res) => {
    const { name, email, password } = req.body;


    const schema = Joi.object({
        name: Joi.string().alphanum().max(20).required(),
        email: Joi.string().email().required(),
        password: Joi.string().max(20).required()
    });

    const validationResult = schema.validate({ name, email, password });

    if (validationResult.error) {

        console.log("Signup validation error:", validationResult.error.details[0].message);
        return res.status(400).send(`
            Error: ${validationResult.error.details[0].message}. <br>
            <a href="/signup">Try again</a>
        `);
    }

    try {

        const existingUser = await userCollection.findOne({ email: email });
        if (existingUser) {
            console.log("Signup failed: Email already exists.");
            return res.status(409).send(`
                Email already registered. <br>
                <a href="/signup">Try again</a> or <a href="/login">Log in</a>
            `);
        }


        const hashedPassword = await bcrypt.hash(password, saltRounds);


        const newUser = await userCollection.insertOne({
            name: name,
            email: email,
            password: hashedPassword,
            type: "reg"
        });
        console.log("User created:", newUser.insertedId);


        req.session.isAuthenticated = true;
        req.session.name = name;
        req.session.email = email;
        req.session.userId = newUser.insertedId;

        res.render('members');

    } catch (err) {
        console.error("Signup error:", err);
        res.status(500).send("Internal Server Error during signup.");
        console.log(err)
    }
});
app.get('/signup', requireNoAuth, (req, res) => {
    res.render('signup')
});


app.post('/loginSubmit', requireNoAuth, async (req, res) => {
    const { email, password } = req.body;

    const schema = Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().max(20).required()
    });

    const validationResult = schema.validate({ email, password });


    if (validationResult.error) {
        console.log('Login validation error');
        return res.status(400).send(`
            <a href='/login'>Try again</a>
            `);
    }

    try {
        const user = await userCollection.findOne({ email: email });

        if (user && await bcrypt.compare(password, user.password)) {
            console.log(`Login succesful for user: ${user.email}`);

            req.session.isAuthenticated = true;
            req.session.name = user.name;
            req.session.email = user.email;
            req.session.userId = user._id;

            res.redirect('/members')
        } else {
            console.log(`Login failed for email: ${email}`);
            res.redirect('/login')
        }
    } catch (err) {
        console.error('Login database/bcrypt error: ', err);
    }
});
app.get('/login', requireNoAuth, (req, res) => {
    res.render("login")
});
app.get('/members', requireAuth, (req, res) => {
    const randIMG = ['./img/cat.PNG', './img/dog.png', './img/bear.PNG'];
    const name = req.session.name
    res.render('members', {randIMG, name})
    
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error: ', err);
            return res.status(500).redirect('/');
        }
        console.log('User logged out');
        res.redirect('/');
    });
});

app.get('/404', (req, res) => {
    res.render('404')
})

app.use((req, res) => {
    res.status(404).redirect('/404')
});

app.listen(port, () => {
    console.log(`Node application listening on port ${port}`);
});