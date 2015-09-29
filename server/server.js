var express = require("express");
var bodyParser = require("body-parser");
var cookieParser = require("cookie-parser");
var ObjectID = require("mongodb").ObjectID;

module.exports = function(port, db, githubAuthoriser) {
    var app = express();

    app.use(express.static("public"));
    app.use(cookieParser());
    app.use(bodyParser.json());

    var users = db.collection("users");
    var conversations = db.collection("conversations");
    var groups = db.collection("groups");
    var sessions = {};
    var userList = [];
    var self = this;

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

                docs.forEach(function(user) {
                    userList[user._id] = [];
                });

                res.json(docs.map(function(user) {
                    return {
                        _id: user._id,
                        name: user.name,
                        avatarUrl: user.avatarUrl
                    };
                }));
            } else {
                res.sendStatus(500);
            }
        });
    });

    // Get conversation. Return it if it exists, create one if it doesn't.
    app.post("/api/conversation", function(req, res) {
        var conversation = {};
        var participants = req.body;

        conversations.findOne({

            $and: [
                {participants: { $all: participants}},
                {participants: { $size: participants.length}}
            ]

        }, function(err, result) {
            if (!err) {
                if (result) {
                    res.send(result);
                } else {
                    conversation.participants = participants;
                    conversation.messages = [];

                    conversations.insertOne(conversation, function(err, result) {
                        if (!err) {
                            res.send(result.ops[0]);
                        } else {
                            res.sendStatus(500);
                        }
                    });
                }
            } else {
                res.sendStatus(500);
            }
        });
    });

    // Check user is participating and get conversation with conversation id. Used when refreshing the conversation.
    app.get("/api/conversation/:id", function(req, res) {
        conversations.findOne({

            $and : [
                {participants: req.session.user},
                {_id:  ObjectID(req.params.id)}
            ]

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

    // Check user is participating and post message to conversation.
    app.post("/api/conversation/:id", function(req, res) {
        var message = req.body;
        message.userId = req.session.user;
        message.timestamp = Date.now();

        conversations.updateOne({
                $and : [
                    {participants: req.session.user},
                    {_id:  ObjectID(req.params.id)}
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
                // Message posted successfully. Now ensure participants are notified.
                self.notifyParticipants(req.session.user, req.params.id);
            } else {
                res.sendStatus(404);
            }
        });
    });

    // Notify all participants (excluding the current user) of the given conversation.
    this.notifyParticipants = function(userId, conversationId) {
        conversations.findOne({

                _id:  ObjectID(conversationId)

        }, function(err, result) {
            if (err) {

                return;
            }

            if (result) {
                var groupOrUserId = "";

                result.participants.forEach(function(participant) {
                    if (userId !== participant) {

                        if (result.groupId) {
                            groupOrUserId = result.groupId;
                        } else {
                            groupOrUserId = userId;
                        }
                        userList[participant].push({groupOrUserId: groupOrUserId, conversationId: conversationId});
                    }
                });
            } else {

            }
        });
    };

    // Return the conversation ids of any conversations that have changed.
    app.get("/api/notifications", function(req, res) {

        res.send(userList[req.session.user]);
        userList[req.session.user] = [];

    });

    // Clear the messages in the given conversation.
    app.delete("/api/conversation/:id", function(req, res) {

        conversations.updateOne({
                $and : [
                    {participants: req.session.user},
                    {_id:  ObjectID(req.params.id)}
                ]
            },
            {$set: {messages: []}},
            function(err, result) {
                if (err) {
                    res.sendStatus(500);
                    return;
                }

                if (result) {
                    res.sendStatus(200);
                    // Messages deleted successfully. Now ensure participants are notified.
                    self.notifyParticipants(req.session.user, req.params.id);
                } else {
                    res.sendStatus(404);
                }
            });

    });

    // Get the list of groups the user is a member of.
    app.get("/api/groups", function(req, res) {
        groups.find({

            members: req.session.user

        }).toArray(function(err, docs) {
            if (!err) {
                res.send(docs);
            } else {
                res.sendStatus(500);
            }
        });
    });

    // Create a group
    app.post("/api/groups", function(req, res) {
        var newGroup = {};
        newGroup.members = req.body.members;
        newGroup.name = req.body.groupNameText;

        groups.insertOne(newGroup, function(err, result) {
            if (!err) {
                res.send(result.ops[0]);
            } else {
                res.sendStatus(500);
            }
        });
    });

    // Get a group conversation
    app.post("/api/groupConversation/:id", function(req, res) {
        var conversation = {};

        conversations.findOne({

            groupId: req.params.id

        }, function(err, result) {
            if (!err) {
                if (result) {
                    res.send(result);
                } else {
                    conversation.groupId = req.params.id;
                    conversation.participants = req.body;
                    conversation.messages = [];

                    conversations.insertOne(conversation, function(err, result) {
                        if (!err) {
                            res.send(result.ops[0]);
                        } else {
                            res.sendStatus(500);
                        }
                    });
                }
            } else {
                res.sendStatus(500);
            }
        });
    });

    return app.listen(port);
};
