require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const MongoStore = require('connect-mongo');
const Joi = require('joi');
const { MongoClient, ServerApiVersion } = require('mongodb');

const saltRounds = 12;
const app = express();
const port = process.env.PORT || 3000;
const expireSession = 1 * 0 * 0 * 0; // 1 hour

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

    const images = ['cat.PNG', 'dog.png'];

    const randomIndex = Math.floor(Math.random() * images.length);
    return `${images[randomIndex]}`;
};

app.get('/', (req, res) => {
    let buttons;
    let greeting = '<h1>sign up or login</h1>';

    if (req.session.isAuthenticated) {
        greeting = `<h1>Hello, ${req.session.name}!</h1>`;
        buttons = `
        <a href='/members'> <button>Members only</button> </a>
        <br><br>
        <a href='/logout'> <button>Logout</button> </a>
        `;
    } else {
        buttons = `
        <a href='/signup'> <button>Sign Up</button> </a>
        <br><br>
        <a href='/login'> <button>Log In</button> </a>
        `;
    }
    res.send(`
        ${greeting}
        ${buttons}
        `);
});

app.get('/signup', requireNoAuth, (req, res) => {
    const html = `
    <h1>sign up</h1>
    <form action='/signupSubmit' method='post'>
        <input name='name' type='text' placeholder='enter your name' required>
            <br>
        <input name='email' type='email' placeholder='enter your email' required>
            <br>
        <input name='password' type='password' placeholder='enter your password' required>
            <br>
        <button type='submit'>Submit</button>
    </form>
    `;
    res.send(html);
});

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

        const hashedPassword = await bcrypt.hash(password, saltRounds);


        const newUser = await userCollection.insertOne({
            name: name,
            email: email,
            password: hashedPassword
        });



        req.session.isAuthenticated = true;
        req.session.name = name;
        req.session.email = email;
        req.session.userId = newUser.insertedId;

        res.redirect('/members');

    } catch (err) {
        console.error("Signup error:", err);
        res.status(500).send("Internal Server Error during signup.");
    }
});

app.get('/login', requireNoAuth, (req, res) => {
    const html = `
    <h1>Log In</h1>
    <form action='/loginSubmit' method='post'>
        <input name='email' type='email' placeholder='email' required>
        <br>
        <input name='password' type='password' placeholder='password' required>
        <br>
        <button type='submit'>Submit</button>
    </form>
        `;
    res.send(html);
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

            res.redirect('/members');
        } else {
            console.log(`Login failed for email: ${email}`);
            res.status(401).send(`
                Invalid email/password combination.
                <br><br>
                <a href='/login'>Try again</a>
                `);
        }
    } catch (err) {
        console.error('Login database/bcrypt error: ', err);
    }
});

app.get('/members', requireAuth, (req, res) => {
    const randomImageUrl = getRandomImage();

    res.send(`
        <h1>Hello, ${req.session.name}!</h1>
            <p>this is the member area.</p>
            <br>
        <img src='${randomImageUrl}'>
            <br>
        
        <a href='/logout'> <button>Logout</button> </a>
        `);
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

app.use((req, res) => {
    res.status(404).send("Page not found - 404");
});

app.listen(port, () => {
    console.log(`Node application listening on port ${port}`);
});