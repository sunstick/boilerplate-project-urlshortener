'use strict';

var bodyParser = require('body-parser');
var crypto = require('crypto')
var dns = require('dns');
var express = require('express');
var mongo = require('mongodb');
var mongoose = require('mongoose');

var cors = require('cors');

var app = express();
app.use(function (req, res, next) {
    console.log(`${req.method} ${req.path} - ${req.ip}`)
    next()
})
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Basic Configuration 
var port = process.env.PORT || 3000;

app.use(cors());

/** this project needs to parse POST bodies **/
// you should mount the body-parser here

app.use('/public', express.static(process.cwd() + '/public'));

app.get('/', function (req, res) {
    res.sendFile(process.cwd() + '/views/index.html');
});


// your first API endpoint... 
app.get("/api/hello", function (req, res) {
    res.json({ greeting: 'hello API' });
});

/** this project needs a db !! **/
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

// process url shorten request
function processInvalidUrl(req, res, next) {
    if (!req.body.original_url) {
        return res.status(400).json({ "error": "EMPTY_URL" });
    }

    try {
        const url = new URL(req.body.original_url)
        dns.lookup(url.hostname, (err, _) => {
            if (err) {
                return res.status(400).json({ "error": "HOST_NOT_REACHABLE" });
            }
            next();
        })
    } catch (_) {
        return res.status(400).json({
            "error": "INVALID_URL",
            "original_url": req.body.original_url
        })
    }
}

const shortURLSchema = mongoose.Schema({
    "url": { type: String, index: { unique: true }, required: true },
    "original_url": { type: String, required: true },
    "modified_at": { type: Date, expires: '1d', default: Date.now }
})

// mongoose model
const ShortURL = mongoose.model('ShortURL', shortURLSchema)

function processValidUrl(req, res) {
    const originalUrl = req.body.original_url;
    const shortUrl = crypto.createHash('sha256').update(originalUrl).digest('hex').slice(0, 6);
    ShortURL.findOne({ url: shortUrl }).
        then(doc => {
            if (!doc) {
                return new ShortURL({ url: shortUrl, original_url: originalUrl }).save()
            }
        }).
        then(_ => res.json({ short_url: shortUrl, original_url: originalUrl })).
        catch(err => res.status(500).json(err))
}

app.post("/api/shorturl/new", processInvalidUrl, processValidUrl)

// process redirect
app.get("/r/:shorturl", (req, res) => {
    ShortURL.findOneAndUpdate({ url: req.params.shorturl }, { modified_at: Date.now() }).
        then(doc => {
            if (doc) res.status(301).redirect(doc.original_url);
            else res.status(400).json({ "error": "URL_NOT_FOUND" });
        }).
        catch(err => {
            res.status(500).json({ "error": err });
        })
})

app.listen(port, function () {
    console.log('Node.js listening ...');
});