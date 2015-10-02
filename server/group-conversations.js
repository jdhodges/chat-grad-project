
module.exports = function(app, conversations, userToSocket, io, ObjectID) {

    // Get the list of group conversations the user is a member of.
    app.get("/api/groupConversationsMdl", function(req, res) {
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
    app.post("/api/groupConversationsMdl", function(req, res) {
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
    app.get("/api/groupConversationsMdl/:id", function(req, res) {
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
};