var express = require("express");
var bodyParser = require("body-parser");
var cookieParser = require("cookie-parser");

module.exports = function(port, db, githubAuthoriser) {
    var app = express();

    app.use(express.static("public"));
    app.use(cookieParser());
    app.use(bodyParser.json());

    var users = db.collection("users");
    var conversations = db.collection("conversations");
    var sessions = {};

    app.get("/oauth", function(req, res) {
        githubAuthoriser.authorise(req, function(githubUser, token) {
            if (githubUser) {
                users.findOne({
                    _id: githubUser.login
                }, function(err, user) {
                    if (!user) {
                        // TODO: Wait for this operation to complete
                        users.insertOne({
                            _id: githubUser.login,
                            name: githubUser.name,
                            avatarUrl: githubUser.avatar_url
                        });
                    }
                    sessions[token] = {
                        user: githubUser.login
                    };
                    res.cookie("sessionToken", token);
                    res.header("Location", "/");
                    res.sendStatus(302);
                });
            }
            else {
                res.sendStatus(400);
            }
        });
    });

    app.get("/api/oauth/uri", function(req, res) {
        res.json({
            uri: githubAuthoriser.oAuthUri
        });
    });

    app.use(function(req, res, next) {
        if (req.cookies.sessionToken) {
            req.session = sessions[req.cookies.sessionToken];
            if (req.session) {
                next();
            } else {
                res.sendStatus(401);
            }
        } else {
            res.sendStatus(401);
        }
    });

    app.get("/api/user", function(req, res) {
        users.findOne({
            _id: req.session.user
        }, function(err, user) {
            if (!err) {
                res.json(user);
            } else {
                res.sendStatus(500);
            }
        });
    });

    app.get("/api/users", function(req, res) {
        users.find().toArray(function(err, docs) {
            if (!err) {
                res.json(docs.map(function(user) {
                    return {
                        id: user._id,
                        name: user.name,
                        avatarUrl: user.avatarUrl
                    };
                }));
            } else {
                res.sendStatus(500);
            }
        });
    });

    app.get("/api/conversation/:to", function(req, res) {
        conversations.findOne({

            participants: { $all: [req.session.user, req.params.to]}

        }, function(err, result) {
            if (err) {
                res.sendStatus(500);
                return;
            }

            if (result) {
                res.send(result);
            } else {
                res.sendStatus(404);
            }
        });
    });

    app.post("/api/conversation/:to", function(req, res) {
        var conversation = {};

        var participants = [];
        participants.push(req.session.user);
        participants.push(req.params.to);
        conversation.participants = participants;

        conversations.insertOne(conversation, function(err, result) {
            if (!err) {
                res.sendStatus(201);
            } else {
                res.sendStatus(500);
            }
        });
    });

    app.post("/api/conversation/:to/msg", function(req, res) {
        var message = req.body;
        message.userId = req.session.user;
        message.timestamp = Date.now();

        conversations.updateOne({
            $and : [
                {participants: req.session.user},
                {participants: req.params.to}
            ]
        },
        {$push: {messages: message}},
        function(err, result) {
            if (err) {
                res.sendStatus(500);
                return;
            }

            if (result) {
                res.sendStatus(201);
            } else {
                res.sendStatus(404);
            }
        });
    });

    return app.listen(port);
};
