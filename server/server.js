var express = require("express");
var bodyParser = require("body-parser");
var cookieParser = require("cookie-parser");
var ObjectID = require("mongodb").ObjectID;
var io = require("socket.io");
var http = require("http");


module.exports = function(port, db, githubAuthoriser) {
    var app = express();
    var server = http.createServer(app);
    io = io.listen(server);

    app.use(express.static("public"));
    app.use(cookieParser());
    app.use(bodyParser.json());

    var users = db.collection("users");
    var conversations = db.collection("conversations");
    var sessions = {};
    var userList = [];
    var userToSocket = [];

    var self = this;

    // Add user to all the rooms (conversations) they are participating in
    this.addUserToRooms = function(userId, socket) {
        conversations.find({
            participants: userId
        }).toArray(function(err, docs) {
            if (!err) {

                docs.forEach(function(conversation) {
                    socket.join(conversation._id);
                });

            } else {
                // Error
            }
        });
    };

    io.on('connection', function(client) {
        console.log('Client connected...');

        client.on('join', function(data) {
            console.log(data);
            console.log(client.id);
            userToSocket[data] = client.id;
            self.addUserToRooms(data, client);
        });

        client.on('disconnect', function(data) {
            console.log("disconnect");
            delete userToSocket[data];
        });

        client.on("sendMessage", function(data) {
            console.log(data);
        });

    });

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
                        }, function(err, result) {
                            if (!err) {
                                console.log("emitting");
                                io.sockets.emit("userUpdate");
                            } else {
                                res.sendStatus(500);
                            }
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

    // Get conversation. Return it if it exists, create one if it doesn't (and add participants to a new room).
    app.post("/api/conversation", function(req, res) {
        var conversation = {};
        var participants = req.body;

        conversations.findOne({

            $and: [
                {participants: { $all: participants}},
                {participants: { $size: participants.length}},
                {name: { $exists: false }}
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
                            participants.forEach(function(userId) {
                                if (io.sockets.connected[userToSocket[userId]]) {
                                    io.sockets.connected[userToSocket[userId]].join(result.ops[0]._id);
                                }
                            });

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
                //console.log(doc);
                res.sendStatus(201);
                // Message posted successfully. Now ensure participants are notified.
                var payload = {};
                payload.conversationId = req.params.id;
                payload.poster = req.session.user;

                io.sockets.in(req.params.id).emit("messagePosted", payload);

            } else {
                res.sendStatus(404);
            }
        });
    });

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

                    var payload = {};
                    payload.conversationId = req.params.id;
                    payload.clearer = req.session.user;

                    io.sockets.in(req.params.id).emit("conversationCleared", payload);
                }
            });

    });

    // Get the list of group conversations the user is a member of.
    app.get("/api/groupConversations", function(req, res) {
        conversations.find({
            $and : [
                {participants: req.session.user},
                {name: { $exists: true }}
            ]
        }).toArray(function(err, docs) {
            if (!err) {
                res.send(docs);
            } else {
                res.sendStatus(500);
            }
        });
    });

    // Create a group conversation
    app.post("/api/groupConversations", function(req, res) {
        var newConversation = {};
        newConversation.participants = req.body.participants;
        newConversation.name = req.body.name;

        conversations.insertOne(newConversation, function(err, result) {
            if (!err) {

                newConversation.participants.forEach(function(userId) {
                    // Add each member of the new group to a new room with the name of the conversation id
                    if (io.sockets.connected[userToSocket[userId]]) {
                        io.sockets.connected[userToSocket[userId]].join(result.ops[0]._id);
                    }
                });

                io.sockets.in(result.ops[0]._id).emit("groupConversationCreated");

                res.send(result.ops[0]);
            } else {
                res.sendStatus(500);
            }
        });
    });

    // Get a group conversation
    app.get("/api/groupConversations/:id", function(req, res) {
        var conversation = {};

        conversations.findOne({

            _id:  ObjectID(req.params.id)

        }, function(err, result) {
            if (!err) {
                if (result) {
                    res.send(result);
                } else {
                    res.sendStatus(404);
                }
            } else {
                res.sendStatus(500);
            }
        });
    });

    // Add a user to a group conversation
    app.post("/api/groupConversation/add/:id", function(req, res) {
        conversations.updateOne({
                $and : [
                    {participants: req.session.user},
                    {_id:  ObjectID(req.params.id)}
                ]
            },
            {$pushAll: {participants: req.body}},
            function(err, result) {
                if (err) {
                    res.sendStatus(500);
                    return;
                }

                if (result) {

                    req.body.forEach(function(newParticipantId) {
                        // Add each member of the new group to a new room with the name of the conversation id
                        if (io.sockets.connected[userToSocket[newParticipantId]]) {
                            io.sockets.connected[userToSocket[newParticipantId]].join(req.params.id);
                        }
                    });

                    res.sendStatus(200);

                    io.sockets.in(req.params.id).emit("groupConversationUpdated", req.params.id);

                } else {
                    res.sendStatus(404);
                }
            });
    });

    // Remove the user from a group conversation
    app.delete("/api/groupConversation/leave/:id", function(req, res) {
        conversations.updateOne({
                $and : [
                    {participants: req.session.user},
                    {_id:  ObjectID(req.params.id)}
                ]
            },
            {$pull: {participants: req.session.user}},
            function(err, result) {
                if (err) {
                    res.sendStatus(500);
                    return;
                }

                if (result) {
                    res.sendStatus(200);

                    io.sockets.connected[userToSocket[req.session.user]].leave(req.params.id);
                    io.sockets.in(req.params.id).emit("groupConversationUpdated", req.params.id);

                } else {
                    res.sendStatus(404);
                }
            });
    });

    return server.listen(8080);
};
