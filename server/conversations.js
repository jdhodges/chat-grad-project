
module.exports = function(app, conversations, userToSocket, io, ObjectID) {
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
};